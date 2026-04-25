import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { CodecDetector } from './codec-detector';
import { DeviceDetector, DeviceInfo } from './device-detector';
import { QualityPreset } from './quality';
import { logStructured } from '../structured-log';

// ─── W-1: Hardware-Aware Transcoding Strategy ────────────────────────────────
//
// On constrained hardware (Intel N100 / 8 GB RAM), running multiple FFmpeg
// instances concurrently can exhaust available RAM or cause thermal throttling.
// Thresholds below match the N100 profile; powerful workstations exceed both.
//
// Override at deploy time via env var (no code change needed):
//   TRANSCODE_STRATEGY=parallel    → always parallel (high-end workstation)
//   TRANSCODE_STRATEGY=sequential  → always sequential (force safe mode)

const CONSTRAINED_CPU_THRESHOLD = 8;                      // cores
const CONSTRAINED_RAM_THRESHOLD = 16 * 1024 * 1024 * 1024; // 16 GB in bytes

export type TranscodeStrategy = 'sequential' | 'parallel';

export function getTranscodeStrategy(): TranscodeStrategy {
  // 1. Respect explicit environment override first
  const envOverride = process.env.TRANSCODE_STRATEGY?.toLowerCase();
  if (envOverride === 'parallel')   return 'parallel';
  if (envOverride === 'sequential') return 'sequential';

  // 2. Detect hardware capabilities safely
  let cores    = 4; // conservative fallback — treated as constrained
  let totalMem = 0; // unknown → treated as constrained

  try {
    cores    = os.cpus().length;
    totalMem = os.totalmem();
  } catch {
    // os module failure is extremely unlikely, but we guard defensively
    console.warn('⚠  Could not read system hardware info; defaulting to sequential transcode.');
    return 'sequential';
  }

  const isConstrained =
    cores < CONSTRAINED_CPU_THRESHOLD || totalMem < CONSTRAINED_RAM_THRESHOLD;

  return isConstrained ? 'sequential' : 'parallel';
}

export interface TranscodeLogContext {
  videoId?: string;
  jobId?: string | number;
  queueName?: string;
}

export interface TranscodeResult {
  hlsBaseDir: string;
  durationSeconds: number;
  qualities: QualityPreset[];
}

interface CodecProfile {
  inputOptions: string[];
  scaleFilter: (height: number) => string;
  outputOptions: string[];
}

const VAAPI_RENDER_NODE = process.env.VAAPI_DEVICE ?? '/dev/dri/renderD128';

// Codec-specific FFmpeg option set tuned for the specific hardware
function buildCodecProfile(codec: string, device: DeviceInfo): CodecProfile {
  switch (codec) {
    case 'h264_videotoolbox':
      return {
        // Essential: use the M1/M2/M3/M4 Media Engine for decoding too!
        inputOptions: ['-hwaccel', 'videotoolbox'],
        scaleFilter: (h) => `scale=-2:${h}`,
        // allow_sw 1: Fallback to software if needed. realtime 0: maximize speed
        outputOptions: ['-allow_sw', '1', '-realtime', '0'],
      };
    case 'h264_qsv':
      return {
        inputOptions: [],
        // vpp_qsv does not accept scale's -2 auto-width sentinel on some Linux builds.
        scaleFilter: (h) => `scale=-2:${h}`,
        outputOptions: ['-preset', 'veryfast', '-global_quality', '25'],
      };
    case 'h264_vaapi':
      return {
        inputOptions: [
          '-hwaccel', 'vaapi',
          '-hwaccel_device', VAAPI_RENDER_NODE,
          '-hwaccel_output_format', 'vaapi',
        ],
        scaleFilter: (h) => `scale_vaapi=w=-2:h=${h}`,
        outputOptions: [],
      };
    case 'h264_nvenc':
      return {
        inputOptions: [],
        scaleFilter: (h) => `scale=-2:${h}`,
        outputOptions: ['-preset', 'p4', '-rc', 'vbr'],
      };
    default: { // libx264
      // Smart scaling for libx264 Fallback
      let threads = '2'; // safe default for tiny VPS
      if (device.isAppleSilicon && device.cores > 4) {
        threads = '0'; // Unlimited threads for M-series Macs to completely dominate decoding
      } else if (device.cores > 2) {
        threads = String(device.cores - 1); // Save 1 core for OS if it's a weak Mini PC
      }
      
      const preset = device.isAppleSilicon && device.cores > 4 ? 'fast' : 'veryfast';

      return {
        inputOptions: [],
        scaleFilter: (h) => `scale=-2:${h}`,
        outputOptions: ['-preset', preset, '-threads', threads],
      };
    }
  }
}

function parseDuration(duration: string): number {
  const parts = duration.split(':').map(parseFloat);
  return parts.length === 3 ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]! : 0;
}

function isHardwareFailure(codec: string, stderr: string): boolean {
  if (codec === 'libx264') return false;
  const lower = stderr.toLowerCase();
  return (
    lower.includes('unknown encoder') ||
    lower.includes('device failed') ||
    lower.includes('error initializing') ||
    lower.includes(codec.replace('h264_', ''))
  );
}

// Builds HLS segments for a single quality tier using the specified codec.
// Resolves with the video duration in seconds.
async function transcodeQualityWithCodec(
  inputPath: string,
  outputDir: string,
  quality: QualityPreset,
  codec: string,
  segmentTime: number,
  device: DeviceInfo,
  onProgress?: (percent: number) => void,
): Promise<number> {
  const playlistPath = path.join(outputDir, 'playlist.m3u8');
  const profile = buildCodecProfile(codec, device);
  let durationSeconds = 0;

  const options = [
    '-vf',                   profile.scaleFilter(quality.height),
    '-b:v',                  quality.videoBitrate,
    '-b:a',                  quality.audioBitrate,
    '-g',                    String(segmentTime * 30),
    '-keyint_min',           String(segmentTime * 30),
    '-hls_time',             String(segmentTime),
    '-hls_list_size',        '0',
    '-hls_segment_filename', path.join(outputDir, 'segment%03d.ts'),
    '-hls_flags',            'independent_segments',
    '-f',                    'hls',
    ...profile.outputOptions,
  ];

  return new Promise<number>((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(profile.inputOptions)
      .videoCodec(codec)
      .audioCodec('aac')
      .addOptions(options)
      .output(playlistPath)
      .on('codecData', (data: { duration?: string }) => {
        if (data.duration) durationSeconds = parseDuration(data.duration);
      })
      .on('progress', (p: { percent?: number }) => {
        if (p.percent !== undefined && onProgress) onProgress(p.percent);
      })
      .on('end', () => resolve(durationSeconds))
      .on('error', (err: Error, _: unknown, stderr: unknown) => {
        const stderrStr = String(stderr);
        console.error(`FFmpeg stderr [${codec} / ${quality.name}]:`, stderrStr);
        reject(
          Object.assign(err, { isHardwareFail: isHardwareFailure(codec, stderrStr) }),
        );
      })
      .run();
  });
}

// Transcodes a single quality tier with automatic CPU fallback on hardware failure.
async function transcodeQuality(
  inputPath: string,
  outputDir: string,
  quality: QualityPreset,
  codec: string,
  segmentTime: number,
  device: DeviceInfo,
  onProgress?: (percent: number) => void,
  logContext?: TranscodeLogContext,
): Promise<number> {
  try {
    return await transcodeQualityWithCodec(
      inputPath, outputDir, quality, codec, segmentTime, device, onProgress,
    );
  } catch (err: any) {
    if (err.isHardwareFail) {
      logStructured({
        stage: 'transcode_hw_fallback',
        codec,
        quality: quality.name,
        message: 'Hardware encoder failed; retrying with libx264',
        ...logContext,
      });
      console.warn(`Hardware encoder ${codec} failed for ${quality.name}; falling back to libx264`);
      return transcodeQualityWithCodec(
        inputPath, outputDir, quality, 'libx264', segmentTime, device, onProgress,
      );
    }
    throw err;
  }
}

const codecDetector = new CodecDetector();

export async function transcodeToHls(
  inputPath: string,
  outputBaseDir: string,
  qualities: QualityPreset[],
  onQualityStart?: (name: string) => Promise<void>,
  onProgress?: (percent: number) => void | Promise<void>,
  segmentTime = 6,
  logContext?: TranscodeLogContext,
): Promise<TranscodeResult> {
  const codec = await codecDetector.detect();
  const device = DeviceDetector.getInfo();
  const strategy = getTranscodeStrategy();

  // Safely read totalMem for the structured log (mirrors what getTranscodeStrategy already read)
  let totalMemBytes: number | null = null;
  try { totalMemBytes = os.totalmem(); } catch { /* ignore */ }

  logStructured({
    stage: 'transcode_plan',
    codec,
    segmentTime,
    strategy,
    qualityNames: qualities.map((q) => q.name),
    cpuCoresUsed: device.cores,
    totalMemBytes,
    ...logContext,
  });

  if (onQualityStart) await onQualityStart('Initializing transcoding...');

  const progressMap = new Map<string, number>(qualities.map((q) => [q.name, 0]));

  const notifyProgress = () => {
    if (!onProgress) return;
    const avg =
      Array.from(progressMap.values()).reduce((a, b) => a + b, 0) / qualities.length;
    onProgress(avg);
  };

  // Shared per-quality work unit — used by both the sequential and parallel paths.
  // Extracting into a named function guarantees both strategies run identical logic.
  const processQuality = async (quality: QualityPreset): Promise<number> => {
    logStructured({
      stage: 'transcode_tier_start',
      codec,
      quality: quality.name,
      height: quality.height,
      videoBitrate: quality.videoBitrate,
      ...logContext,
    });
    if (onQualityStart) await onQualityStart(quality.name);
    const qualityDir = path.join(outputBaseDir, quality.name);
    fs.mkdirSync(qualityDir, { recursive: true });

    return transcodeQuality(
      inputPath,
      qualityDir,
      quality,
      codec,
      segmentTime,
      device,
      (p) => {
        progressMap.set(quality.name, p);
        notifyProgress();
      },
      logContext,
    );
  };

  let results: number[];

  if (strategy === 'sequential') {
    // ─── Sequential path ─────────────────────────────────────────────────────
    // Safe for constrained hardware (N100 / 8 GB). FFmpeg gets the full CPU
    // budget for each quality tier before the next one starts.
    results = [];
    for (const quality of qualities) {
      results.push(await processQuality(quality));
    }
  } else {
    // ─── Parallel path ───────────────────────────────────────────────────────
    // For powerful workstations (≥ 8 cores, ≥ 16 GB RAM). All quality tiers
    // transcode concurrently for maximum throughput.
    results = await Promise.all(qualities.map(processQuality));
  }

  const durationSeconds = Math.max(0, ...results);
  logStructured({
    stage: 'transcode_hls_done',
    codec,
    strategy,
    durationSeconds,
    ...logContext,
  });

  return {
    hlsBaseDir: outputBaseDir,
    durationSeconds,
    qualities,
  };
}
