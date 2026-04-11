import * as path from 'path';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { CodecDetector } from './codec-detector';
import { QualityPreset } from './quality';
import { logStructured } from '../structured-log';

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

// Codec-specific FFmpeg option set
function buildCodecProfile(codec: string): CodecProfile {
  switch (codec) {
    case 'h264_videotoolbox':
      return {
        inputOptions: [],
        scaleFilter: (h) => `scale=-2:${h}`,
        outputOptions: [],
      };
    case 'h264_qsv':
      return {
        inputOptions: [],
        // vpp_qsv does not accept scale's -2 auto-width sentinel on some Linux builds.
        // Use software scale to keep aspect ratio and force even width, then encode via QSV.
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
    default: // libx264
      return {
        inputOptions: [],
        scaleFilter: (h) => `scale=-2:${h}`,
        outputOptions: ['-preset', 'veryfast', '-threads', '2'],
      };
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
  onProgress?: (percent: number) => void,
): Promise<number> {
  const playlistPath = path.join(outputDir, 'playlist.m3u8');
  const profile = buildCodecProfile(codec);
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
  onProgress?: (percent: number) => void,
  logContext?: TranscodeLogContext,
): Promise<number> {
  try {
    return await transcodeQualityWithCodec(
      inputPath, outputDir, quality, codec, segmentTime, onProgress,
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
        inputPath, outputDir, quality, 'libx264', segmentTime, onProgress,
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

  logStructured({
    stage: 'transcode_plan',
    codec,
    segmentTime,
    parallelQualityTiers: qualities.length,
    qualityNames: qualities.map((q) => q.name),
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

  const results = await Promise.all(
    qualities.map(async (quality) => {
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
        (p) => {
          progressMap.set(quality.name, p);
          notifyProgress();
        },
        logContext,
      );
    }),
  );

  const durationSeconds = Math.max(0, ...results);
  logStructured({
    stage: 'transcode_hls_done',
    codec,
    durationSeconds,
    ...logContext,
  });

  return {
    hlsBaseDir: outputBaseDir,
    durationSeconds,
    qualities,
  };
}
