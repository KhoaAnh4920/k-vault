import * as os from 'os';
import ffmpeg from 'fluent-ffmpeg';

// Ordered by preference per platform
const PLATFORM_CODEC_PRIORITY: Record<string, string[]> = {
  darwin: ['h264_videotoolbox', 'libx264'],
  linux:  ['h264_qsv', 'h264_vaapi', 'h264_nvenc', 'libx264'],
  win32:  ['h264_qsv', 'h264_nvenc', 'libx264'],
};

function queryAvailableEncoders(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ffmpeg.getAvailableEncoders((err, encoders) =>
      resolve(err ? {} : (encoders ?? {})),
    );
  });
}

export class CodecDetector {
  private cached: string | null = null;

  async detect(): Promise<string> {
    if (this.cached) return this.cached;

    if (process.env.FORCE_CODEC) {
      this.cached = process.env.FORCE_CODEC;
      return this.cached;
    }

    const platform = os.platform();
    const priority = PLATFORM_CODEC_PRIORITY[platform] ?? ['libx264'];
    const available = await queryAvailableEncoders();

    this.cached = priority.find((codec) => codec in available) ?? 'libx264';
    console.log(`Detected codec: ${this.cached} (${platform})`);
    return this.cached;
  }

  reset(): void {
    this.cached = null;
  }
}
