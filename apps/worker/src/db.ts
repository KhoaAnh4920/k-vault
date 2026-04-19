import { Pool } from "pg";

export function createPool(connectionString: string): Pool {
  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("100.70.");

  return new Pool({
    connectionString,
    ssl:
      process.env.NODE_ENV === "production" && !isLocal
        ? { rejectUnauthorized: false }
        : false,
    max: 5,
  });
}

export interface VideoChunkRow {
  filename: string;
  drive_file_id: string;
  sequence: number;
  quality: string;
}

export async function updateVideoStatus(
  pool: Pool,
  videoId: string,
  status: "waiting" | "processing" | "ready" | "error",
  extra?: {
    playlistDriveFileId?: string;
    durationSeconds?: number;
    hlsFolderDriveId?: string;
    thumbnailDriveFileId?: string;
    sourceHeight?: number;
  },
): Promise<void> {
  const updates: string[] = ["status = $2", "updated_at = NOW()"];
  const values: unknown[] = [videoId, status];

  if (extra?.playlistDriveFileId) {
    updates.push(`playlist_drive_file_id = $${values.length + 1}`);
    values.push(extra.playlistDriveFileId);
  }
  if (extra?.durationSeconds !== undefined) {
    updates.push(`duration_seconds = $${values.length + 1}`);
    values.push(extra.durationSeconds);
  }
  if (extra?.hlsFolderDriveId) {
    updates.push(`hls_folder_drive_id = $${values.length + 1}`);
    values.push(extra.hlsFolderDriveId);
  }
  if (extra?.thumbnailDriveFileId) {
    updates.push(`thumbnail_drive_file_id = $${values.length + 1}`);
    values.push(extra.thumbnailDriveFileId);
  }
  if (extra?.sourceHeight !== undefined) {
    updates.push(`source_height = $${values.length + 1}`);
    values.push(extra.sourceHeight);
  }

  await pool.query(
    `UPDATE videos SET ${updates.join(", ")} WHERE id = $1`,
    values,
  );
}

export async function saveVideoChunks(
  pool: Pool,
  videoId: string,
  chunks: Array<{
    filename: string;
    driveFileId: string;
    sequence: number;
    quality: string;
    durationSeconds?: number | null;
  }>,
): Promise<void> {
  if (chunks.length === 0) return;

  const values: unknown[] = [];
  const placeholders = chunks.map((c, i) => {
    const base = i * 6;
    values.push(
      videoId,
      c.filename,
      c.driveFileId,
      c.sequence,
      c.quality,
      c.durationSeconds ?? null,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });

  await pool.query(
    `INSERT INTO video_chunks (video_id, filename, drive_file_id, sequence, quality, duration_seconds) VALUES ${placeholders.join(", ")}`,
    values,
  );
}

export async function checkVideoExists(
  pool: Pool,
  videoId: string,
): Promise<boolean> {
  const { rows } = await pool.query("SELECT id FROM videos WHERE id = $1", [
    videoId,
  ]);
  return rows.length > 0;
}
