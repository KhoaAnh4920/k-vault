import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

export interface TranscodeResult {
  hlsDir: string;
  durationSeconds: number;
}

/**
 * Transcodes a raw MP4 file to HLS format using Apple Silicon hardware acceleration.
 * Output: playlist.m3u8 + segment000.ts, segment001.ts, ...
 *
 * Falls back to software encoding (libx264) if videotoolbox is not available.
 */
export async function transcodeToHls(
  inputPath: string,
  outputDir: string,
): Promise<TranscodeResult> {
  fs.mkdirSync(outputDir, { recursive: true });

  const playlistPath = path.join(outputDir, 'playlist.m3u8');
  let durationSeconds = 0;

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('h264_videotoolbox') // Apple Silicon hwaccel
      .audioCodec('aac')
      .addOptions([
        '-hls_time', '6',             // 6-second segments
        '-hls_list_size', '0',        // include all segments in playlist
        '-hls_segment_filename', path.join(outputDir, 'segment%03d.ts'),
        '-hls_flags', 'independent_segments',
        '-f', 'hls',
      ])
      .output(playlistPath)
      .on('start', (cmd: string) => {
        console.log(`▶  FFmpeg started:\n   ${cmd}`);
      })
      .on('progress', (progress: { percent?: number; timemark?: string }) => {
        if (progress.percent !== undefined) {
          process.stdout.write(`\r   Progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('codecData', (data: { duration?: string }) => {
        if (data.duration) {
          durationSeconds = parseDuration(data.duration);
        }
      })
      .on('end', () => {
        process.stdout.write('\n');
        resolve();
      })
      .on('error', (err: Error, _stdout: unknown, stderr: unknown) => {
        // If videotoolbox fails (not on Apple Silicon), fall back to software
        if (String(stderr).includes('videotoolbox')) {
          console.warn('⚠  videotoolbox not available, retrying with libx264...');
          transcodeWithSoftware(inputPath, outputDir, playlistPath)
            .then(resolve)
            .catch(reject);
        } else {
          reject(err);
        }
      })
      .run();
  });

  return { hlsDir: outputDir, durationSeconds };
}

/** Software-only fallback (libx264) */
async function transcodeWithSoftware(
  inputPath: string,
  outputDir: string,
  playlistPath: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .addOptions([
        '-preset', 'fast',
        '-crf', '23',
        '-hls_time', '6',
        '-hls_list_size', '0',
        '-hls_segment_filename', path.join(outputDir, 'segment%03d.ts'),
        '-hls_flags', 'independent_segments',
        '-f', 'hls',
      ])
      .output(playlistPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

/** Parses FFmpeg duration string "HH:MM:SS.ms" to seconds */
function parseDuration(duration: string): number {
  const parts = duration.split(':').map(parseFloat);
  if (parts.length === 3) {
    return (parts[0]! * 3600) + (parts[1]! * 60) + parts[2]!;
  }
  return 0;
}
