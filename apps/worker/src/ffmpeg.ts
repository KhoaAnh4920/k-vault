import ffmpeg from "fluent-ffmpeg";
import * as path from "path";
import * as fs from "fs";

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

export interface QualityPreset {
  name: string;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
}

export const ALL_QUALITY_PRESETS: QualityPreset[] = [
  { name: "1080p", height: 1080, videoBitrate: "5000k", audioBitrate: "192k" },
  { name: "720p", height: 720, videoBitrate: "2800k", audioBitrate: "128k" },
  { name: "480p", height: 480, videoBitrate: "1400k", audioBitrate: "128k" },
  { name: "360p", height: 360, videoBitrate: "800k", audioBitrate: "96k" },
];

export interface VideoInfo {
  width: number;
  height: number;
  durationSeconds: number;
}

/** Uses ffprobe to get source video dimensions and duration. */
export function getVideoInfo(inputPath: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err: Error | null, data: ffmpeg.FfprobeData) => {
      if (err) return reject(err);
      const videoStream = data.streams.find((s) => s.codec_type === "video");
      if (!videoStream) return reject(new Error("No video stream found"));
      resolve({
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        durationSeconds: parseFloat(String(data.format.duration ?? 0)),
      });
    });
  });
}

/**
 * Returns the quality presets applicable to the given source height.
 * Only presets whose height ≤ source height are included.
 * Always returns at least the lowest preset.
 */
export function selectQualities(sourceHeight: number): QualityPreset[] {
  const applicable = ALL_QUALITY_PRESETS.filter(
    (q) => q.height <= sourceHeight,
  );
  return applicable.length > 0
    ? applicable
    : [ALL_QUALITY_PRESETS[ALL_QUALITY_PRESETS.length - 1]!];
}

export interface TranscodeResult {
  hlsBaseDir: string;
  durationSeconds: number;
  qualities: QualityPreset[];
}

/**
 * Transcodes the input to HLS for each quality preset.
 * Output layout:
 *   {outputBaseDir}/{quality.name}/playlist.m3u8
 *   {outputBaseDir}/{quality.name}/segment000.ts ...
 */
export async function transcodeToHls(
  inputPath: string,
  outputBaseDir: string,
  qualities: QualityPreset[],
): Promise<TranscodeResult> {
  let durationSeconds = 0;

  for (const quality of qualities) {
    const qualityDir = path.join(outputBaseDir, quality.name);
    fs.mkdirSync(qualityDir, { recursive: true });

    console.log(`  ⚙️  Transcoding ${quality.name}...`);
    const dur = await transcodeQuality(inputPath, qualityDir, quality);
    if (dur > 0) durationSeconds = dur;
    console.log(`  ✓ ${quality.name} done`);
  }

  return { hlsBaseDir: outputBaseDir, durationSeconds, qualities };
}

/**
 * Extracts a single JPEG thumbnail frame from the video.
 * @param atSeconds  Position to extract from (clamped to valid range)
 */
export async function extractThumbnail(
  inputPath: string,
  outputPath: string,
  atSeconds: number,
): Promise<void> {
  const ts = Math.max(0.5, atSeconds); // at least 0.5s to skip black frames
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-ss", String(ts)])
      .outputOptions(["-vframes", "1", "-q:v", "2", "-vf", "scale=854:-2"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function transcodeQuality(
  inputPath: string,
  outputDir: string,
  quality: QualityPreset,
): Promise<number> {
  const playlistPath = path.join(outputDir, "playlist.m3u8");
  let durationSeconds = 0;

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec("h264_videotoolbox")
      .audioCodec("aac")
      .addOptions([
        "-vf",
        `scale=-2:${quality.height}`,
        "-b:v",
        quality.videoBitrate,
        "-b:a",
        quality.audioBitrate,
        "-hls_time",
        "6",
        "-hls_list_size",
        "0",
        "-hls_segment_filename",
        path.join(outputDir, "segment%03d.ts"),
        "-hls_flags",
        "independent_segments",
        "-f",
        "hls",
      ])
      .output(playlistPath)
      .on("codecData", (data: { duration?: string }) => {
        if (data.duration) durationSeconds = parseDuration(data.duration);
      })
      .on("progress", (p: { percent?: number }) => {
        if (p.percent !== undefined)
          process.stdout.write(
            `\r     ${quality.name}: ${p.percent.toFixed(1)}%`,
          );
      })
      .on("end", () => {
        process.stdout.write("\n");
        resolve();
      })
      .on("error", (err: Error, _: unknown, stderr: unknown) => {
        if (String(stderr).includes("videotoolbox")) {
          transcodeQualitySoftware(inputPath, outputDir, quality, playlistPath)
            .then(resolve)
            .catch(reject);
        } else {
          reject(err);
        }
      })
      .run();
  });

  return durationSeconds;
}

async function transcodeQualitySoftware(
  inputPath: string,
  outputDir: string,
  quality: QualityPreset,
  playlistPath: string,
): Promise<void> {
  console.warn(
    `  ⚠  videotoolbox unavailable for ${quality.name}, using libx264`,
  );
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .addOptions([
        "-preset",
        "fast",
        "-vf",
        `scale=-2:${quality.height}`,
        "-b:v",
        quality.videoBitrate,
        "-b:a",
        quality.audioBitrate,
        "-hls_time",
        "6",
        "-hls_list_size",
        "0",
        "-hls_segment_filename",
        path.join(outputDir, "segment%03d.ts"),
        "-hls_flags",
        "independent_segments",
        "-f",
        "hls",
      ])
      .output(playlistPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });
}

function parseDuration(duration: string): number {
  const parts = duration.split(":").map(parseFloat);
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  return 0;
}
