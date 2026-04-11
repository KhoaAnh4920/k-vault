import ffmpeg from 'fluent-ffmpeg';

export function extractThumbnail(
  inputPath: string,
  outputPath: string,
  atSeconds: number,
): Promise<void> {
  const ts = Math.max(0.5, atSeconds);
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(['-ss', String(ts)])
      .outputOptions(['-vframes', '1', '-q:v', '2', '-vf', 'scale=854:-2'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}
