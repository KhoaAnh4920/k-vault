import { google } from "googleapis";
import { Readable } from "stream";
import * as fs from "fs";
import * as path from "path";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: "v3", auth: oauth2Client });

/** Stream a file from Google Drive to a local path. Returns file size in bytes. */
export async function downloadFile(
  fileId: string,
  destPath: string,
): Promise<void> {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" },
  );

  await new Promise<void>((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    (res.data as Readable).pipe(dest).on("finish", resolve).on("error", reject);
  });
}

/** Upload a local file to Google Drive and return the fileId. */
export async function uploadFile(
  localPath: string,
  fileName: string,
  mimeType: string,
  parentFolderId?: string,
): Promise<string> {
  const folder = parentFolderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID;

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: folder ? [folder] : undefined,
    },
    media: {
      mimeType,
      body: fs.createReadStream(localPath),
    },
    fields: "id",
  });

  if (!res.data.id) throw new Error(`Upload failed for ${fileName}`);
  return res.data.id;
}

/**
 * Move a file to a new parent folder (removes from old parent).
 * Used to move the raw upload into the per-video subfolder.
 */
export async function moveFile(
  fileId: string,
  newParentId: string,
): Promise<void> {
  // Fetch current parents first so we can remove them
  const meta = await drive.files.get({ fileId, fields: "parents" });
  const oldParents = (meta.data.parents ?? []).join(",");

  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: oldParents || undefined,
    fields: "id, parents",
  });
}

/** Create a subfolder in Google Drive and return its ID. */
export async function createFolder(
  name: string,
  parentFolderId?: string,
): Promise<string> {
  const folder = parentFolderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID;
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: folder ? [folder] : undefined,
    },
    fields: "id",
  });
  if (!res.data.id) throw new Error(`Failed to create folder "${name}"`);
  return res.data.id;
}

/** Upload all .ts segments and the .m3u8 from a directory into a per-video subfolder.
 *  Also moves the raw source file into the same subfolder. */
export async function uploadHlsDirectory(
  hlsDir: string,
  videoId: string,
  rawDriveFileId: string,
  parentFolderId?: string,
): Promise<{
  playlistFileId: string;
  videoFolderId: string;
  chunks: Array<{ filename: string; driveFileId: string; sequence: number }>;
}> {
  const files = fs.readdirSync(hlsDir).sort();
  const tsFiles = files
    .filter((f) => f.endsWith(".ts"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const m3u8File = files.find((f) => f.endsWith(".m3u8"));

  if (!m3u8File) throw new Error("No .m3u8 file found in HLS directory");

  // Create a dedicated subfolder for this video's HLS files
  const videoFolderId = await createFolder(videoId, parentFolderId);
  console.log(
    `  📁 Created Drive folder for video ${videoId}: ${videoFolderId}`,
  );

  // Move the raw source file into the same subfolder
  await moveFile(rawDriveFileId, videoFolderId);
  console.log(`  📦 Moved raw file ${rawDriveFileId} into video folder`);

  const chunks: Array<{
    filename: string;
    driveFileId: string;
    sequence: number;
  }> = [];

  // Upload .ts segments in parallel batches of 5
  const batchSize = 5;
  for (let i = 0; i < tsFiles.length; i += batchSize) {
    const batch = tsFiles.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (filename, idx) => {
        const fileId = await uploadFile(
          path.join(hlsDir, filename),
          filename,
          "video/MP2T",
          videoFolderId,
        );
        console.log(
          `  ✓ Uploaded segment ${i + idx + 1}/${tsFiles.length}: ${filename}`,
        );
        return { filename, driveFileId: fileId, sequence: i + idx };
      }),
    );
    chunks.push(...results);
  }

  // Upload playlist last (after all chunks are uploaded)
  const playlistFileId = await uploadFile(
    path.join(hlsDir, m3u8File),
    m3u8File,
    "application/vnd.apple.mpegurl",
    videoFolderId,
  );
  console.log(`  ✓ Uploaded playlist: ${m3u8File} → ${playlistFileId}`);

  return { playlistFileId, videoFolderId, chunks };
}
