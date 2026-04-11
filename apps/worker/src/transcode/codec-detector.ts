import * as os from 'os';
import * as fs from 'fs';
import { spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import { logStructured } from '../structured-log';

// Ordered by preference per platform
const PLATFORM_CODEC_PRIORITY: Record<string, string[]> = {
  darwin: ['h264_videotoolbox', 'libx264'],
  // Prefer VAAPI on Linux when iHD is present: self-test is reliable; QSV/MFX can fail (-9) without render perms.
  linux:  ['h264_vaapi', 'h264_qsv', 'h264_nvenc', 'libx264'],
  win32:  ['h264_qsv', 'h264_nvenc', 'libx264'],
};

function queryAvailableEncoders(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ffmpeg.getAvailableEncoders((err, encoders) =>
      resolve(err ? {} : (encoders ?? {})),
    );
  });
}

function getFfmpegPath(): string {
  const fromEnv = process.env.FFMPEG_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  return 'ffmpeg';
}

function isHardwareCodec(codec: string): boolean {
  return codec !== 'libx264';
}

/** Minimal encode to null muxer — must match what each encoder expects (VAAPI needs hw surfaces). */
function buildHardwareSelfTestArgs(codec: string): string[] | null {
  const frames = 30;

  switch (codec) {
    case 'h264_vaapi': {
      const dev = process.env.VAAPI_DEVICE ?? '/dev/dri/renderD128';
      if (!fs.existsSync(dev)) return null;
      return [
        '-hide_banner',
        '-v',
        'error',
        '-vaapi_device',
        dev,
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=128x72:r=30',
        '-vf',
        'format=nv12,hwupload',
        '-frames:v',
        String(frames),
        '-an',
        '-c:v',
        'h264_vaapi',
        '-f',
        'null',
        '-',
      ];
    }
    case 'h264_qsv':
      return [
        '-hide_banner',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=128x72:r=30',
        '-vf',
        'format=nv12',
        '-frames:v',
        String(frames),
        '-an',
        '-c:v',
        'h264_qsv',
        '-f',
        'null',
        '-',
      ];
    case 'h264_nvenc':
      return [
        '-hide_banner',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=128x72:r=30',
        '-vf',
        'format=yuv420p',
        '-frames:v',
        String(frames),
        '-an',
        '-c:v',
        'h264_nvenc',
        '-f',
        'null',
        '-',
      ];
    default:
      return [
        '-hide_banner',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=128x72:r=30',
        '-frames:v',
        String(frames),
        '-an',
        '-c:v',
        codec,
        '-f',
        'null',
        '-',
      ];
  }
}

const SELFTEST_TIMEOUT_MS = 15_000;

function verifyHardwareCodec(codec: string): Promise<boolean> {
  const ffmpegPath = getFfmpegPath();
  const args = buildHardwareSelfTestArgs(codec);
  if (args === null) {
    logStructured({
      stage: 'codec_selftest',
      codec,
      ok: false,
      reason: 'vaapi_device_missing',
      device: process.env.VAAPI_DEVICE ?? '/dev/dri/renderD128',
    });
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      logStructured({ stage: 'codec_selftest', codec, ok: false, reason: 'timeout' });
      finish(false);
    }, SELFTEST_TIMEOUT_MS);

    proc.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      logStructured({
        stage: 'codec_selftest',
        codec,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      finish(false);
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) return finish(true);
      const shortErr = stderr.trim().split('\n').slice(-1)[0] ?? 'unknown error';
      logStructured({
        stage: 'codec_selftest',
        codec,
        ok: false,
        error: shortErr,
      });
      finish(false);
    });
  });
}

export class CodecDetector {
  private cached: string | null = null;

  async detect(): Promise<string> {
    if (this.cached) return this.cached;

    if (process.env.FORCE_CODEC) {
      this.cached = process.env.FORCE_CODEC;
      logStructured({
        stage: 'codec_detected',
        codec: this.cached,
        platform: os.platform(),
        source: 'FORCE_CODEC',
        ffmpegPath: getFfmpegPath(),
      });
      return this.cached;
    }

    const platform = os.platform();
    const priority = PLATFORM_CODEC_PRIORITY[platform] ?? ['libx264'];
    const available = await queryAvailableEncoders();

    for (const codec of priority) {
      if (!(codec in available)) continue;
      if (!isHardwareCodec(codec)) {
        this.cached = codec;
        break;
      }
      const ok = await verifyHardwareCodec(codec);
      if (ok) {
        this.cached = codec;
        break;
      }
    }

    this.cached = this.cached ?? 'libx264';
    logStructured({
      stage: 'codec_detected',
      codec: this.cached,
      platform,
      source: 'auto',
      ffmpegPath: getFfmpegPath(),
    });
    return this.cached;
  }

  reset(): void {
    this.cached = null;
  }
}
