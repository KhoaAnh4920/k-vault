import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { Worker, Job } from "bullmq";
import { Pool } from "pg";
import { downloadFile, uploadHlsDirectory, deleteFile } from "./drive";
import {
  getVideoInfo,
  selectQualities,
  transcodeToHls,
  extractThumbnail,
} from "./ffmpeg";
import { createPool, updateVideoStatus, saveVideoChunks } from "./db";

const TRANSCODE_QUEUE_LOCAL = "transcode-local";
const TRANSCODE_QUEUE_PROD = "transcode-prod";
const TEMP_BASE = path.join(os.tmpdir(), "k-vault");

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

interface EnvContext {
  queueName: string;
  pool: Pool;
  driveFolderId: string;
}

const contexts: EnvContext[] = [
  {
    queueName: TRANSCODE_QUEUE_LOCAL,
    pool: createPool(process.env.DATABASE_URL_LOCAL ?? ""),
    driveFolderId: process.env.DRIVE_FOLDER_ID_LOCAL ?? "",
  },
  {
    queueName: TRANSCODE_QUEUE_PROD,
    pool: createPool(process.env.DATABASE_URL_PROD ?? ""),
    driveFolderId: process.env.DRIVE_FOLDER_ID_PROD ?? "",
  },
];

async function processJob(
  job: Job<TranscodeJobData>,
  pool: Pool,
  driveFolderId: string,
): Promise<void> {
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
      return acc + fs.readdirSync(qDir).filter((f) => f.endsWith(".ts")).length;
    }, 0);
    console.log(
      `   ✓ Transcoded: ${totalSegments} total segments across ${qualities.length} qualities`,
    );

    // 6. Upload everything to Google Drive
    console.log("☁️  Uploading...");
    const { videoFolderId, thumbnailFileId, chunks } = await uploadHlsDirectory(
      hlsDir,
      videoId,
      rawDriveFileId,
      fs.existsSync(thumbnailPath) ? thumbnailPath : null,
      qualities,
      driveFolderId,
    );
    console.log(
      `   ✓ Uploaded ${chunks.length} segments${thumbnailFileId ? " + thumbnail" : ""}`,
    );

    // 7. Save to DB
    await saveVideoChunks(pool, videoId, chunks);
    await updateVideoStatus(pool, videoId, "ready", {
      hlsFolderDriveId: videoFolderId,
      durationSeconds: Math.round(durationSeconds || videoInfo.durationSeconds),
      thumbnailDriveFileId: thumbnailFileId ?? undefined,
      sourceHeight: videoInfo.height,
    });

    // 8. Delete raw source file from Drive — no longer needed after HLS upload
    console.log("🗑  Deleting raw source file from Drive...");
    try {
      await deleteFile(rawDriveFileId);
      console.log(`   ✓ Raw file ${rawDriveFileId} deleted`);
    } catch (err) {
      console.warn(
        `   ⚠  Could not delete raw file: ${(err as Error).message}`,
      );
    }

    console.log(`✅ [Job ${job.id}] Video ${videoId} is READY\n`);
  } catch (err) {
    console.error(`❌ [Job ${job.id}] Failed:`, err);
    await updateVideoStatus(pool, videoId, "error").catch(console.error);
    throw err;
  } finally {
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
      console.log(`🗑  Cleaned up temp dir: ${jobDir}`);
    }
  }
}

const workers = contexts.map(
  (ctx) =>
    new Worker<TranscodeJobData>(
      ctx.queueName,
      (job) => processJob(job, ctx.pool, ctx.driveFolderId),
      { connection: redisConnection, concurrency: 1 },
    ),
);

workers.forEach((w, i) => {
  const queueName = contexts[i].queueName;
  w.on("error", (err) =>
    console.error(`Redis connection error [${queueName}]:`, err.message),
  );
  w.on("completed", (job) =>
    console.log(`✅ Job ${job.id} completed [${queueName}]`),
  );
  w.on("failed", (job, err) =>
    console.error(`❌ Job ${job?.id} failed [${queueName}]:`, err.message),
  );
});

contexts.forEach((ctx) => {
  console.log(
    `🚀 k-vault Worker started — listening on queue: "${ctx.queueName}"`,
  );
});
console.log(`   Temp dir: ${TEMP_BASE}`);

// Graceful shutdown
const shutdown = async () => {
  console.log("\n🛑 Shutting down worker...");
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(contexts.map((ctx) => ctx.pool.end()));
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
