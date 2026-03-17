import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { Worker, Job } from "bullmq";
import { downloadFile, uploadHlsDirectory } from "./drive";
import { transcodeToHls } from "./ffmpeg";
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

    console.log(`\n🎬 [Job ${job.id}] Processing video: ${videoId}`);

    try {
      // 1. Prepare temp directory
      fs.mkdirSync(jobDir, { recursive: true });

      // 2. Download raw MP4 from Google Drive
      console.log(`📥 Downloading raw file: ${rawDriveFileId}`);
      await downloadFile(rawDriveFileId, rawPath);
      const sizeMb = (fs.statSync(rawPath).size / 1024 / 1024).toFixed(1);
      console.log(`   ✓ Downloaded ${sizeMb} MB`);

      // 3. Transcode to HLS using Apple Silicon hwaccel
      console.log("🎞  Transcoding to HLS...");
      const { durationSeconds } = await transcodeToHls(rawPath, hlsDir);
      const segmentCount = fs
        .readdirSync(hlsDir)
        .filter((f) => f.endsWith(".ts")).length;
      console.log(
        `   ✓ Transcoded: ${segmentCount} segments, ${durationSeconds.toFixed(0)}s duration`,
      );

      // 4. Upload HLS files to Google Drive (into a per-video subfolder)
      console.log("☁️  Uploading HLS files to Google Drive...");
      const { playlistFileId, videoFolderId, chunks } =
        await uploadHlsDirectory(hlsDir, videoId, rawDriveFileId);
      console.log(`   ✓ Uploaded ${chunks.length} segments + playlist`);

      // 5. Update DB: save chunks + mark video as ready
      await saveVideoChunks(videoId, chunks);
      await updateVideoStatus(videoId, "ready", {
        playlistDriveFileId: playlistFileId,
        hlsFolderDriveId: videoFolderId,
        durationSeconds: Math.round(durationSeconds),
      });

      console.log(`✅ [Job ${job.id}] Video ${videoId} is READY\n`);
    } catch (err) {
      console.error(`❌ [Job ${job.id}] Failed:`, err);
      await updateVideoStatus(videoId, "error").catch(console.error);
      throw err; // BullMQ will retry per job options
    } finally {
      // 6. Cleanup temp files
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
