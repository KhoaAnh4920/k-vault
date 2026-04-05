import ffmpeg from "fluent-ffmpeg";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// Auto-inject binaries
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}
if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
}

export interface QualityPreset {
  name: string;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
}

export const ALL_QUALITY_PRESETS: QualityPreset[] = [
  { name: "HD", height: 1080, videoBitrate: "5000k", audioBitrate: "192k" },
  { name: "SD", height: 480, videoBitrate: "1400k", audioBitrate: "128k" },
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
 * Returns the quality tiers to transcode for the given source.
 * - SD (480p) is always included.
 * - HD is included only if the source is at least 720p tall (or wide).
 *   HD height adapts: 1080p when source ≥ 1080p, otherwise 720p.
 */
export function selectQualities(info: VideoInfo): QualityPreset[] {
  const maxDim = Math.max(info.width, info.height);
  const tiers: QualityPreset[] = [
    ALL_QUALITY_PRESETS.find((q) => q.name === "SD")!,
  ];

  if (maxDim >= 720) {
    const hdHeight = maxDim >= 1080 ? 1080 : 720;
    const hdBitrate = hdHeight === 1080 ? "5000k" : "2800k";
    tiers.unshift({
      name: "HD",
      height: hdHeight,
      videoBitrate: hdBitrate,
      audioBitrate: "192k",
    });
  }

  return tiers;
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
  onQualityStart?: (qualityName: string) => Promise<void>,
  onProgress?: (percent: number) => void | Promise<void>,
  segmentTime: number = 6,
): Promise<TranscodeResult> {
  if (onQualityStart)
    await onQualityStart("Initializing parallel transcoding...");

  // Track progress of each tier to calculate aggregate percentage
  const progressMap = new Map<string, number>();
  qualities.forEach((q) => progressMap.set(q.name, 0));

  const updateAggregateProgress = () => {
    if (!onProgress) return;
    const sum = Array.from(progressMap.values()).reduce((a, b) => a + b, 0);
    const average = sum / qualities.length;

    onProgress(average);
  };

  const results = await Promise.all(
    qualities.map(async (quality) => {
      // Each parallel branch checks if the video still exists
      if (onQualityStart) await onQualityStart(quality.name);

      const qualityDir = path.join(outputBaseDir, quality.name);
      fs.mkdirSync(qualityDir, { recursive: true });

      const dur = await transcodeQuality(
        inputPath,
        qualityDir,
        quality,
        segmentTime,
        (p) => {
          progressMap.set(quality.name, p);
          updateAggregateProgress();
        },
      );
      return dur;
    }),
  );

  const durationSeconds = Math.max(0, ...results);
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

let cachedVideoCodec: string | null = null;

async function getBestVideoCodec(): Promise<string> {
  if (cachedVideoCodec) return cachedVideoCodec;

  return new Promise((resolve) => {
    ffmpeg.getAvailableEncoders((err, encoders) => {
      if (err || !encoders) {
        cachedVideoCodec = "libx264";
        return resolve("libx264");
      }

      const platform = os.platform();
      if (platform === "darwin" && encoders["h264_videotoolbox"]) {
        cachedVideoCodec = "h264_videotoolbox";
      } else if (encoders["h264_qsv"]) {
        cachedVideoCodec = "h264_qsv";
      } else if (encoders["h264_vaapi"]) {
        cachedVideoCodec = "h264_vaapi";
      } else if (encoders["h264_nvenc"]) {
        cachedVideoCodec = "h264_nvenc";
      } else {
        cachedVideoCodec = "libx264";
      }

      console.log(`🤖 Auto-detected Video Codec: ${cachedVideoCodec}`);
      resolve(cachedVideoCodec);
    });
  });
}

async function transcodeQuality(
  inputPath: string,
  outputDir: string,
  quality: QualityPreset,
  segmentTime: number,
  onProgress?: (percent: number) => void | Promise<void>,
): Promise<number> {
  const playlistPath = path.join(outputDir, "playlist.m3u8");
  let durationSeconds = 0;

  const videoCodec = await getBestVideoCodec();
  const scaleFilter =
    videoCodec === "h264_qsv"
      ? `vpp_qsv=h=${quality.height}:w=-2`
      : `scale=-2:${quality.height}`;

  const options = [
    "-vf",
    scaleFilter,
    "-b:v",
    quality.videoBitrate,
    "-b:a",
    quality.audioBitrate,
    "-g",
    (segmentTime * 30).toString(),
    "-keyint_min",
    (segmentTime * 30).toString(),
    "-hls_time",
    segmentTime.toString(),
    "-hls_list_size",
    "0",
    "-hls_segment_filename",
    path.join(outputDir, "segment%03d.ts"),
    "-hls_flags",
    "independent_segments",
    "-f",
    "hls",
  ];

  if (videoCodec === "h264_qsv") {
    options.push("-preset", "veryfast");
    options.push("-global_quality", "25");
  } else if (videoCodec === "libx264") {
    options.push("-preset", "veryfast", "-threads", "2");
  }

  // const options = [
  //   "-vf",
  //   `scale=-2:${quality.height}`,
  //   "-b:v",
  //   quality.videoBitrate,
  //   "-b:a",
  //   quality.audioBitrate,
  //   "-g",
  //   (segmentTime * 30).toString(),
  //   "-keyint_min",
  //   (segmentTime * 30).toString(),
  //   "-hls_time",
  //   segmentTime.toString(),
  //   "-hls_list_size",
  //   "0",
  //   "-hls_segment_filename",
  //   path.join(outputDir, "segment%03d.ts"),
  //   "-hls_flags",
  //   "independent_segments",
  //   "-f",
  //   "hls",
  // ];

  if (videoCodec === "libx264") {
    // Add libx264 CPU optimizations
    options.push("-preset", "veryfast", "-threads", "2");
  }

  if (videoCodec !== "libx264") {
    options.splice(6, 0, "-allow_sw", "1");
  }

  await new Promise<number>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec(videoCodec)
      .audioCodec("aac")
      .addOptions(options)
      .output(playlistPath)
      .on("codecData", (data: { duration?: string }) => {
        if (data.duration) durationSeconds = parseDuration(data.duration);
      })
      .on("progress", (p: { percent?: number }) => {
        if (p.percent !== undefined) {
          if (onProgress) onProgress(p.percent);
        }
      })
      .on("end", () => {
        resolve(durationSeconds);
      })
      .on("error", (err: Error, _: unknown, stderr: unknown) => {
        const errStr = String(stderr).toLowerCase();
        console.error("FFmpeg Stderr:", stderr);
        if (
          errStr.includes("videotoolbox") ||
          errStr.includes("qsv") ||
          errStr.includes("nvenc") ||
          errStr.includes("unknown encoder") ||
          errStr.includes("device failed")
        ) {
          transcodeQualitySoftware(
            inputPath,
            outputDir,
            quality,
            playlistPath,
            segmentTime,
            onProgress,
          )
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
  segmentTime: number,
  onProgress?: (percent: number) => void,
): Promise<number> {
  console.warn(
    `  ⚠  Hardware acceleration unavailable for ${quality.name}, falling back to libx264`,
  );
  return new Promise<number>((resolve, reject) => {
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
        "-force_key_frames",
        `expr:gte(t,n_forced*${segmentTime})`,
        "-sc_threshold",
        "0",
        "-hls_time",
        segmentTime.toString(),
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
      .on("progress", (p: { percent?: number }) => {
        if (p.percent !== undefined) {
          if (onProgress) onProgress(p.percent);
          // process.stdout.write(
          //   `\r     ${quality.name} (SW): ${p.percent.toFixed(1)}%`,
          // );
        }
      })
      .on("end", () => resolve(0))
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

/**
 * Parses the FFmpeg-generated per-quality playlist.m3u8 and returns
 * a map of segment filename → actual EXTINF duration in seconds.
 * This is the ground truth that must be used in the backend playlist.
 */
export function parsePlaylistDurations(
  playlistPath: string,
): Map<string, number> {
  const content = fs.readFileSync(playlistPath, "utf-8");
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const durations = new Map<string, number>();

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!;
    if (line.startsWith("#EXTINF:")) {
      const commaIdx = line.indexOf(",");
      const duration = parseFloat(line.slice("#EXTINF:".length, commaIdx));
      const filename = path.basename(lines[i + 1]!);
      if (!filename.startsWith("#") && filename.endsWith(".ts")) {
        durations.set(filename, duration);
      }
    }
  }

  return durations;
}
