import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { Worker, Job } from "bullmq";
import { downloadFile, uploadHlsDirectory } from "./drive";
import {
  getVideoInfo,
  selectQualities,
  transcodeToHls,
  extractThumbnail,
} from "./ffmpeg";
import { updateVideoStatus, saveVideoChunks, closeDb } from "./db";

const TRANSCODE_QUEUE = "transcode";
const TEMP_BASE = path.join(os.tmpdir(), "k-vault");

/**
 * Parse a Redis URL into BullMQ-compatible plain options.
 *
 * Why not `new URL()`?  Passwords from Upstash can contain special chars
 * (e.g. '@', '+') that confuse the URL parser into splitting the host wrong.
 * We split on the LAST '@' to be safe.
 *
 * Why no `username`?  Upstash Free uses legacy Redis AUTH (password-only).
 * Passing a username triggers ACL AUTH (Redis 6+) which Upstash rejects with
 * WRONGPASS even when credentials are correct.
 */
function parseRedisUrl(rawUrl: string): {
  host: string;
  port: number;
  password?: string;
  tls?: object;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
} {
  // Strip protocol
  const withoutProtocol = rawUrl.replace(/^rediss?:\/\//, "");
  const isTls = rawUrl.startsWith("rediss://");

  // Split credentials from host:port on the LAST '@'
  const lastAt = withoutProtocol.lastIndexOf("@");
  let credentials = "";
  let hostPart = withoutProtocol;

  if (lastAt !== -1) {
    credentials = withoutProtocol.slice(0, lastAt);
    hostPart = withoutProtocol.slice(lastAt + 1);
  }

  // Extract password (ignore username — Upstash uses password-only auth)
  const colonIdx = credentials.indexOf(":");
  const password =
    colonIdx !== -1
      ? decodeURIComponent(credentials.slice(colonIdx + 1))
      : credentials || undefined;

  // Parse host and port
  const portSep = hostPart.lastIndexOf(":");
  const host = portSep !== -1 ? hostPart.slice(0, portSep) : hostPart;
  const port =
    portSep !== -1 ? parseInt(hostPart.slice(portSep + 1), 10) : 6379;

  return {
    host,
    port,
    password: password || undefined,
    tls: isTls ? {} : undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  };
}

const redisConnection = parseRedisUrl(
  process.env.REDIS_URL ?? "redis://localhost:6379",
);

interface TranscodeJobData {
  videoId: string;
  rawDriveFileId: string;
}

const worker = new Worker<TranscodeJobData>(
  TRANSCODE_QUEUE,
  async (job: Job<TranscodeJobData>) => {
    const { videoId, rawDriveFileId } = job.data;
    const jobDir = path.join(TEMP_BASE, videoId);
    const rawPath = path.join(jobDir, "raw.mp4");
    const hlsDir = path.join(jobDir, "hls");
    const thumbnailPath = path.join(jobDir, "thumbnail.jpg");

    console.log(`\n🎬 [Job ${job.id}] Processing video: ${videoId}`);

    try {
      // 1. Prepare temp directory
      fs.mkdirSync(jobDir, { recursive: true });

      // 2. Download raw file from Google Drive
      console.log(`📥 Downloading raw file: ${rawDriveFileId}`);
      await downloadFile(rawDriveFileId, rawPath);
      const sizeMb = (fs.statSync(rawPath).size / 1024 / 1024).toFixed(1);
      console.log(`   ✓ Downloaded ${sizeMb} MB`);

      // 3. Probe source to get resolution and duration
      console.log("🔍 Probing source video...");
      const videoInfo = await getVideoInfo(rawPath);
      const qualities = selectQualities(videoInfo.height);
      console.log(
        `   ✓ Source: ${videoInfo.width}x${videoInfo.height}, ${videoInfo.durationSeconds.toFixed(1)}s`,
      );
      console.log(
        `   ✓ Selected qualities: ${qualities.map((q) => q.name).join(", ")}`,
      );

      // 4. Extract thumbnail at ~10% of duration
      console.log("🖼  Extracting thumbnail...");
      const thumbnailAt = Math.min(videoInfo.durationSeconds * 0.1, 30);
      try {
        await extractThumbnail(rawPath, thumbnailPath, thumbnailAt);
        console.log(`   ✓ Thumbnail extracted at ${thumbnailAt.toFixed(1)}s`);
      } catch (err) {
        console.warn(
          `   ⚠  Thumbnail extraction failed: ${(err as Error).message}`,
        );
      }

      // 5. Transcode to multi-quality HLS
      console.log("🎞  Transcoding to HLS...");
      const { durationSeconds } = await transcodeToHls(
        rawPath,
        hlsDir,
        qualities,
      );
      const totalSegments = qualities.reduce((acc, q) => {
        const qDir = path.join(hlsDir, q.name);
        return (
          acc + fs.readdirSync(qDir).filter((f) => f.endsWith(".ts")).length
        );
      }, 0);
      console.log(
        `   ✓ Transcoded: ${totalSegments} total segments across ${qualities.length} qualities`,
      );

      // 6. Upload everything to Google Drive
      console.log("☁️  Uploading...");
      const { videoFolderId, thumbnailFileId, chunks } =
        await uploadHlsDirectory(
          hlsDir,
          videoId,
          rawDriveFileId,
          fs.existsSync(thumbnailPath) ? thumbnailPath : null,
          qualities,
        );
      console.log(
        `   ✓ Uploaded ${chunks.length} segments${thumbnailFileId ? " + thumbnail" : ""}`,
      );

      // 7. Save to DB
      await saveVideoChunks(videoId, chunks);
      await updateVideoStatus(videoId, "ready", {
        hlsFolderDriveId: videoFolderId,
        durationSeconds: Math.round(
          durationSeconds || videoInfo.durationSeconds,
        ),
        thumbnailDriveFileId: thumbnailFileId ?? undefined,
        sourceHeight: videoInfo.height,
      });

      console.log(`✅ [Job ${job.id}] Video ${videoId} is READY\n`);
    } catch (err) {
      console.error(`❌ [Job ${job.id}] Failed:`, err);
      await updateVideoStatus(videoId, "error").catch(console.error);
      throw err;
    } finally {
      // 8. Cleanup temp files
      if (fs.existsSync(jobDir)) {
        fs.rmSync(jobDir, { recursive: true, force: true });
        console.log(`🗑  Cleaned up temp dir: ${jobDir}`);
      }
    }
  },
  {
    connection: {
      url: process.env.REDIS_URL,
    },
    concurrency: 1, // Process one video at a time to maximize M4 performance
  },
);

worker.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

console.log(
  `🚀 k-vault Worker started — listening on queue: "${TRANSCODE_QUEUE}"`,
);
console.log(`   Temp dir: ${TEMP_BASE}`);

// Graceful shutdown
const shutdown = async () => {
  console.log("\n🛑 Shutting down worker...");
  await worker.close();
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
