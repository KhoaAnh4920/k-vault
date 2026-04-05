import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { Worker, Job } from "bullmq";
import { Pool } from "pg";
import storage from "./storage";
import {
  getVideoInfo,
  selectQualities,
  transcodeToHls,
  extractThumbnail,
  parsePlaylistDurations,
} from "./ffmpeg";
import {
  createPool,
  updateVideoStatus,
  saveVideoChunks,
  checkVideoExists,
} from "./db";

class JobCancelledError extends Error {
  constructor(videoId: string) {
    super(`Job for video ${videoId} was cancelled (deleted from DB)`);
    this.name = "JobCancelledError";
  }
}

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

import { Redis } from "ioredis";

const redisConnection = parseRedisUrl(
  process.env.REDIS_URL ?? "redis://localhost:6379",
);

const pubClient = new Redis(redisConnection);

interface TranscodeJobData {
  videoId: string;
  rawDriveFileId: string;
  thumbnailDriveFileId?: string | null;
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
  const {
    videoId,
    rawDriveFileId,
    thumbnailDriveFileId: preselectedThumbnailId,
  } = job.data;
  const jobDir = path.join(TEMP_BASE, videoId);
  const rawPath = path.join(jobDir, "raw.mp4");
  const hlsDir = path.join(jobDir, "hls");
  const thumbnailPath = path.join(jobDir, "thumbnail.jpg");

  console.log(`\n🎬 [Job ${job.id}] Processing video: ${videoId}`);

  try {
    const reportProgress = async (progress: number, detail?: string) => {
      await pubClient.publish(
        "video.status_changed",
        JSON.stringify({ videoId, status: "processing", progress, detail }),
      );
      const barLength = 20;
      const filledLength = Math.floor((progress / 100) * barLength);
      const filledChar = "█";
      const emptyChar = "░";
      const bar =
        filledChar.repeat(filledLength) +
        emptyChar.repeat(barLength - filledLength);

      // Use \r to update the current line, padEnd to clear old characters
      const line = `\r🎞  Progress: [${bar}] ${progress}% | ${detail || "Processing..."}`;
      process.stdout.write(line.padEnd(100));
    };

    const checkExists = async (stage: string) => {
      const exists = await checkVideoExists(pool, videoId);
      if (!exists) {
        console.log(
          `\n🛑 [Job ${job.id}] Video ${videoId} deleted during ${stage}. Stopping...`,
        );
        throw new JobCancelledError(videoId);
      }
    };

    // 1. Mark as processing in DB
    await updateVideoStatus(pool, videoId, "processing");
    await checkExists("initial check");
    await reportProgress(5, "Preparing...");

    // 2. Prepare temp directory
    fs.mkdirSync(jobDir, { recursive: true });

    // 3. Download raw file from Google Drive
    await storage.downloadFile(rawDriveFileId, rawPath);
    await checkExists("downloading");

    await reportProgress(15, "Analyzing source...");

    // 4. Probe source to get resolution and duration
    const videoInfo = await getVideoInfo(rawPath);
    const qualities = selectQualities(videoInfo);
    // 4b. Intelligent Segment Timing (to control file count for long videos)
    let segmentTime = 6; // Default for < 5m
    if (videoInfo.durationSeconds > 1800)
      segmentTime = 30; // > 30m
    else if (videoInfo.durationSeconds > 300) segmentTime = 10; // 5m - 30m

    await checkExists("probing");
    await reportProgress(25, "Transcoding to HLS...");

    // 5. Extract thumbnail at ~10% of duration (ONLY if not pre-selected by user)
    if (!preselectedThumbnailId) {
      const thumbnailAt = Math.min(videoInfo.durationSeconds * 0.1, 30);
      try {
        await extractThumbnail(rawPath, thumbnailPath, thumbnailAt);
      } catch (err) {}
    }
    await checkExists("thumbnailing");

    // 5b. Prepare Drive Folder (create folder and move raw file before transcoding)
    const videoFolderId = await storage.prepareVideoFolder(
      videoId,
      rawDriveFileId,
      driveFolderId,
    );

    // 6. Transcode & Streaming Upload
    const qualitiesSummary = qualities.map((q) => q.name).join(", ");
    await reportProgress(25, `Transcoding all tiers: ${qualitiesSummary}...`);

    const allChunks: Array<{
      filename: string;
      driveFileId: string;
      sequence: number;
      quality: string;
    }> = [];
    const uploadedFiles = new Set<string>();
    let transcodeFinished = false;

    const MAX_CONCURRENT_UPLOADS = 8;
    const activeUploads = new Set<Promise<void>>();

    // A background helper to poll for finished segments and upload them in parallel
    const pollAndUpload = async () => {
      while (true) {
        let foundNewSegment = false;
        for (const q of qualities) {
          const qDir = path.join(hlsDir, q.name);
          if (!fs.existsSync(qDir)) continue;

          let tsFiles = fs
            .readdirSync(qDir)
            .filter((f) => f.endsWith(".ts"))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

          if (!transcodeFinished && tsFiles.length > 0) {
            tsFiles.pop(); // Remove the last item from being uploaded yet
          }

          for (const f of tsFiles) {
            const fKey = `${q.name}/${f}`;
            if (uploadedFiles.has(fKey)) continue;

            uploadedFiles.add(fKey);

            // Wait if we hit the concurrency limit
            while (activeUploads.size >= MAX_CONCURRENT_UPLOADS) {
              await Promise.race(activeUploads);
            }

            const fullPath = path.join(qDir, f);

            // Launch parallel upload task
            const uploadTask = (async () => {
              try {
                const res = await storage.uploadSingleSegment(
                  fullPath,
                  q.name,
                  f,
                  videoFolderId,
                );

                // Extract sequence number from segmentXXX.ts
                const seqMatch = f.match(/segment(\d+)\.ts/);
                const sequence = seqMatch ? parseInt(seqMatch[1]) : 0;

                allChunks.push({
                  ...res,
                  quality: q.name,
                  sequence,
                });
              } catch (err) {
                uploadedFiles.delete(fKey);
                console.warn(
                  `    ⚠️  Failed parallel upload for ${fKey}:`,
                  (err as Error).message,
                );
              }
            })();

            // Track the task and cleanup when done
            activeUploads.add(uploadTask);
            void uploadTask.finally(() => activeUploads.delete(uploadTask));

            foundNewSegment = true;
          }
        }

        if (transcodeFinished && !foundNewSegment && activeUploads.size === 0)
          break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Final flush: ensure everything is finished
      await Promise.all(activeUploads);
    };

    const transcodeTask = transcodeToHls(
      rawPath,
      hlsDir,
      qualities,
      async (q) => {
        await checkExists(`transcoding ${q}`);
      },
      async (percent) => {
        const mappedProgress = Math.floor(25 + percent * 0.25);
        await reportProgress(
          mappedProgress,
          `Transcoding all tiers: ${qualitiesSummary}...`,
        );
      },
      segmentTime,
    ).then((res) => {
      transcodeFinished = true;
      return res;
    });

    // Run transcoding and streaming upload concurrently
    const [{ durationSeconds }] = await Promise.all([
      transcodeTask,
      pollAndUpload(),
    ]);

    await checkExists("uploading");
    await reportProgress(95, "Finalizing...");

    for (const q of qualities) {
      const playlistPath = path.join(hlsDir, q.name, "playlist.m3u8");
      if (fs.existsSync(playlistPath)) {
        const durationsMap = parsePlaylistDurations(playlistPath);

        for (const chunk of allChunks) {
          if (chunk.quality === q.name && chunk.filename.endsWith(".ts")) {
            const actualDuration = durationsMap.get(chunk.filename);
            if (actualDuration !== undefined) {
              (chunk as any).durationSeconds = actualDuration;
            }
          }
        }
      }
    }

    // 7. Upload Thumbnail (if generated)
    let thumbnailFileId: string | null = null;
    if (fs.existsSync(thumbnailPath)) {
      thumbnailFileId = await storage
        .uploadSingleSegment(
          thumbnailPath,
          "system",
          "thumbnail.jpg",
          videoFolderId,
        )
        .then((r) => r.driveFileId);
    }

    // 8. Save to DB
    await saveVideoChunks(pool, videoId, allChunks);
    await updateVideoStatus(pool, videoId, "ready", {
      hlsFolderDriveId: videoFolderId,
      durationSeconds: Math.round(durationSeconds || videoInfo.durationSeconds),
      thumbnailDriveFileId:
        preselectedThumbnailId || thumbnailFileId || undefined,
      sourceHeight: videoInfo.height,
    });

    // 9. Delete raw source file from Drive — no longer needed after HLS upload
    try {
      await storage.deleteFile(rawDriveFileId);
    } catch (err) {
      console.warn(
        `   ⚠  Could not delete raw file: ${(err as Error).message}`,
      );
    }

    process.stdout.write("\n"); // Move to next line when fully finished
    console.log(`✅ [Job ${job.id}] Video ${videoId} is READY\n`);
    await pubClient.publish(
      "video.status_changed",
      JSON.stringify({ videoId, status: "ready" }),
    );
  } catch (err) {
    if (err instanceof JobCancelledError) {
      console.log(`🛑 [Job ${job.id}] Finalizing cancelled job (no retry)...`);
      return; // Exit normally to prevent BullMQ retries
    }

    console.error(`❌ [Job ${job.id}] Failed:`, err);
    // Only set error status if not already deleted
    const exists = await checkVideoExists(pool, videoId).catch(() => false);
    if (exists) {
      await updateVideoStatus(pool, videoId, "error").catch(console.error);
      await pubClient
        .publish(
          "video.status_changed",
          JSON.stringify({ videoId, status: "error" }),
        )
        .catch(console.error);
    }
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
      { connection: redisConnection, concurrency: 1, lockDuration: 600 * 1000 }, // 10 minutes
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
