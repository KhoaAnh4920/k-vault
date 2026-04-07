import * as path from 'path';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

export interface VideoInfo {
  width: number;
  height: number;
  durationSeconds: number;
}

function runProbe(filePath: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.codec_type === 'video');
      if (!stream) return reject(new Error('No video stream found'));
      resolve({
        width: stream.width ?? 0,
        height: stream.height ?? 0,
        durationSeconds: parseFloat(String(data.format.duration ?? 0)),
      });
    });
  });
}

// Remux MP4 to place moov atom at file start (faststart).
// Some uploads lack this; ffprobe cannot parse them without seeking to EOF.
function remuxFastStart(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(['-c', 'copy', '-movflags', '+faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

export async function getVideoInfo(inputPath: string): Promise<VideoInfo> {
  try {
    return await runProbe(inputPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // moov atom at EOF means the file needs remuxing before it can be probed
    const needsRemux =
      message.includes('moov atom not found') ||
      message.includes('Invalid data found');

    if (!needsRemux) throw err;

    const ext = path.extname(inputPath);
    const remuxed = inputPath.replace(ext, `_remuxed${ext}`);

    await remuxFastStart(inputPath, remuxed);
    const info = await runProbe(remuxed);

    // Replace original so subsequent steps use the corrected file
    fs.renameSync(remuxed, inputPath);
    return info;
  }
}
