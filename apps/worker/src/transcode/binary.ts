import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

export function setupBinaries(): void {
  const customFfmpeg = process.env.FFMPEG_PATH;
  if (customFfmpeg && fs.existsSync(customFfmpeg)) {
    ffmpeg.setFfmpegPath(customFfmpeg);
  } else {
    if (customFfmpeg) {
      console.warn(`[ffmpeg] Custom FFMPEG_PATH '${customFfmpeg}' not found, falling back to installer binary.`);
    }
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  }

  const customFfprobe = process.env.FFPROBE_PATH;
  if (customFfprobe && fs.existsSync(customFfprobe)) {
    ffmpeg.setFfprobePath(customFfprobe);
  } else {
    if (customFfprobe) {
      console.warn(`[ffmpeg] Custom FFPROBE_PATH '${customFfprobe}' not found, falling back to installer binary.`);
    }
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
  }
}
