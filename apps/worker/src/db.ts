import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

export interface VideoChunkRow {
  filename: string;
  drive_file_id: string;
  sequence: number;
  quality: string;
}

export async function updateVideoStatus(
  videoId: string,
  status: "processing" | "ready" | "error",
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
  videoId: string,
  chunks: Array<{
    filename: string;
    driveFileId: string;
    sequence: number;
    quality: string;
  }>,
): Promise<void> {
  if (chunks.length === 0) return;

  const values: unknown[] = [];
  const placeholders = chunks.map((c, i) => {
    const base = i * 5;
    values.push(videoId, c.filename, c.driveFileId, c.sequence, c.quality);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  await pool.query(
    `INSERT INTO video_chunks (video_id, filename, drive_file_id, sequence, quality) VALUES ${placeholders.join(", ")}`,
    values,
  );
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
