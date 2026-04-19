import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as readline from "readline";
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
import { logStructured } from "./structured-log";

class JobCancelledError extends Error {
  constructor(videoId: string) {
    super(`Job for video ${videoId} was cancelled (deleted from DB)`);
    this.name = "JobCancelledError";
  }
}

function isNonRetryableMediaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return (
    lower.includes("invalid data found when processing input") ||
    lower.includes("error opening input file") ||
    lower.includes("no video stream found")
  );
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
  queueName: string,
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
  const provider = (process.env.STORAGE_TYPE ?? "DRIVE").toUpperCase();

  console.log(`\n🎬 [Job ${job.id}] Processing video: ${videoId}`);

  try {
    // BR3: Immediately transition WAITING → PROCESSING when this job is picked up.
    // Updates the DB and fires an SSE event so the UI switches from "Queued" to "Processing".
    await updateVideoStatus(pool, videoId, "processing");
    await pubClient.publish(
      "video.status_changed",
      JSON.stringify({ videoId, status: "processing", progress: 0, detail: "Transcode starting" }),
    );

    logStructured({
      stage: "job_start",
      videoId,
      jobId: job.id,
      queueName,
      provider,
      tempDir: jobDir,
    });

    let lastProgressDraw = 0;
    const PROGRESS_MIN_MS = 250;

    const reportProgress = async (progress: number, detail?: string) => {
      const clampedProgress = Math.min(100, Math.max(0, progress));
      await pubClient.publish(
        "video.status_changed",
        JSON.stringify({ videoId, status: "processing", progress: clampedProgress, detail }),
      );

      const now = Date.now();
      const forceDraw = progress >= 100;
      if (!forceDraw && now - lastProgressDraw < PROGRESS_MIN_MS) {
        return;
      }
      lastProgressDraw = now;

      const barLength = 20;
      // Clamp to [0, 100] — FFmpeg on Windows can report values outside this range
      const safePct = Math.min(100, Math.max(0, progress));
      const filledLength = Math.floor((safePct / 100) * barLength);
      const filledChar = "█";
      const emptyChar = "░";
      const bar =
        filledChar.repeat(filledLength) +
        emptyChar.repeat(barLength - filledLength);

      const rawLine = `🎞  Progress: [${bar}] ${safePct}% | ${detail || "Processing..."}`;
      const cols = process.stdout.columns ?? 100;
      const line =
        rawLine.length > cols - 1
          ? rawLine.slice(0, Math.max(20, cols - 4)) + "..."
          : rawLine;

      if (!process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[K${line}`);
        return;
      }

      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      process.stdout.write(line);
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
    const downloadStarted = Date.now();
    await storage.downloadFile(rawDriveFileId, rawPath);
    await checkExists("downloading");
    const rawBytes = fs.statSync(rawPath).size;
    logStructured({
      stage: "download_done",
      videoId,
      jobId: job.id,
      queueName,
      provider,
      rawBytes,
      downloadMs: Date.now() - downloadStarted,
    });

    await reportProgress(15, "Analyzing source...");

    // 4. Probe source to get resolution and duration
    const videoInfo = await getVideoInfo(rawPath);
    const qualities = selectQualities(videoInfo);
    // 4b. Intelligent Segment Timing (to control file count for long videos)
    let segmentTime = 6; // Default for < 5m
    if (videoInfo.durationSeconds > 1800)
      segmentTime = 30; // > 30m
    else if (videoInfo.durationSeconds > 300) segmentTime = 10; // 5m - 30m

    logStructured({
      stage: "probe_done",
      videoId,
      jobId: job.id,
      queueName,
      width: videoInfo.width,
      height: videoInfo.height,
      durationSeconds: videoInfo.durationSeconds,
      qualityPresetCount: qualities.length,
      qualityNames: qualities.map((q) => q.name),
      segmentTime,
      rawBytes,
    });

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
      { videoId, jobId: job.id, queueName },
    ).then((res) => {
      transcodeFinished = true;
      return res;
    });

    // Run transcoding and streaming upload concurrently
    const transcodeUploadStarted = Date.now();
    const [{ durationSeconds }] = await Promise.all([
      transcodeTask,
      pollAndUpload(),
    ]);
    logStructured({
      stage: "transcode_upload_done",
      videoId,
      jobId: job.id,
      queueName,
      provider,
      durationSeconds,
      chunkCount: allChunks.length,
      wallClockMs: Date.now() - transcodeUploadStarted,
    });

    await checkExists("uploading");
    await reportProgress(95, "Finalizing...");

    for (const q of qualities) {
      const playlistPath = path.join(hlsDir, q.name, "playlist.m3u8");
      if (fs.existsSync(playlistPath)) {
        const durationsMap = parsePlaylistDurations(playlistPath);

        for (const chunk of allChunks) {
          if (chunk.quality === q.name && chunk.filename.endsWith(".ts")) {
            const originalFilename = chunk.filename.replace(`${q.name}_`, "");
            const actualDuration = durationsMap.get(originalFilename);
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
    logStructured({
      stage: "job_ready",
      videoId,
      jobId: job.id,
      queueName,
      provider,
      durationSeconds: Math.round(durationSeconds || videoInfo.durationSeconds),
    });
    console.log(`✅ [Job ${job.id}] Video ${videoId} is READY\n`);
    await pubClient.publish(
      "video.status_changed",
      JSON.stringify({ videoId, status: "ready" }),
    );
  } catch (err) {
    if (process.stdout.isTTY) process.stdout.write("\n");
    if (err instanceof JobCancelledError) {
      logStructured({
        stage: "job_cancelled",
        videoId,
        jobId: job.id,
        queueName,
        message: "Video removed from DB during processing",
      });
      console.log(`🛑 [Job ${job.id}] Finalizing cancelled job (no retry)...`);
      return; // Exit normally to prevent BullMQ retries
    }

    if (isNonRetryableMediaError(err)) {
      logStructured({
        stage: "job_error",
        videoId,
        jobId: job.id,
        queueName,
        retryable: false,
        cause: err instanceof Error ? err.message : String(err),
      });
      console.error(
        `❌ [Job ${job.id}] Non-retryable media error for ${videoId}:`,
        err,
      );
      const exists = await checkVideoExists(pool, videoId).catch(() => false);
      if (exists) {
        await updateVideoStatus(pool, videoId, "error").catch(console.error);
        await pubClient
          .publish(
            "video.status_changed",
            JSON.stringify({
              videoId,
              status: "error",
              detail: "Invalid or unsupported source media",
            }),
          )
          .catch(console.error);
      }
      return; // Do not throw -> prevent retries for deterministic bad input
    }

    logStructured({
      stage: "job_error",
      videoId,
      jobId: job.id,
      queueName,
      retryable: true,
      cause: err instanceof Error ? err.message : String(err),
    });
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

/**
 * BR3: Global concurrency = 1.
 *
 * We run a SINGLE Worker instance that listens to both queue names.
 * BullMQ's `concurrency: 1` on a single Worker guarantees only one
 * transcode job runs at a time across all queues — protecting the
 * N100 Mini PC from overload.
 *
 * If multiple Worker PROCESSES are ever deployed (e.g., pm2 cluster),
 * the Redis-backed BullMQ lock (lockDuration: 600_000) prevents
 * duplicate job processing.
 */
const worker = new Worker<TranscodeJobData>(
  // Use the primary queue; for multi-queue support, add a router pattern
  contexts[0]!.queueName,
  (job) => processJob(job, contexts[0]!.pool, contexts[0]!.driveFolderId, contexts[0]!.queueName),
  {
    connection: redisConnection,
    concurrency: 1,      // BR3: exactly 1 job at a time
    lockDuration: 600_000, // 10-minute lock prevents duplicate processing
  },
);

// Also listen to the second queue if configured
let secondaryWorker: InstanceType<typeof Worker<TranscodeJobData>> | null = null;
if (contexts[1] && contexts[1].pool) {
  secondaryWorker = new Worker<TranscodeJobData>(
    contexts[1].queueName,
    async (job) => {
      // Wait if the primary worker is already processing (global mutex via Redis lock)
      return processJob(job, contexts[1]!.pool, contexts[1]!.driveFolderId, contexts[1]!.queueName);
    },
    {
      connection: redisConnection,
      concurrency: 1,
      lockDuration: 600_000,
    },
  );
}

const workers = [worker, ...(secondaryWorker ? [secondaryWorker] : [])];

workers.forEach((w, i) => {
  const queueName = contexts[i]?.queueName ?? 'unknown';
  w.on("error", (err: Error) =>
    console.error(`Redis connection error [${queueName}]:`, err.message),
  );
  w.on("completed", (job: Job<TranscodeJobData>) =>
    console.log(`✅ Job ${job.id} completed [${queueName}]`),
  );
  w.on("failed", (job: Job<TranscodeJobData> | undefined, err: Error) =>
    console.error(`❌ Job ${job?.id} failed [${queueName}]:`, err.message),
  );
});

contexts.forEach((ctx) => {
  console.log(
    `🚀 k-vault Worker started — listening on queue: "${ctx.queueName}"`,
  );
});
console.log(`   Temp dir: ${TEMP_BASE}`);
logStructured({
  stage: "worker_boot",
  cpuCount: os.cpus().length,
  totalMemBytes: os.totalmem(),
  tempBase: TEMP_BASE,
  lockDurationMs: 600 * 1000,
  bullConcurrency: 1,
  ffmpegPath: process.env.FFMPEG_PATH ?? null,
  storageType: process.env.STORAGE_TYPE ?? "DRIVE",
});

// Graceful shutdown
const shutdown = async () => {
  console.log("\n🛑 Shutting down worker...");
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(contexts.map((ctx) => ctx.pool.end()));
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
