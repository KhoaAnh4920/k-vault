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

/** Permanently deletes a file from Google Drive. Silently ignores 404 (already gone). */
export async function deleteFile(fileId: string): Promise<void> {
  try {
    await drive.files.delete({ fileId });
  } catch (err: unknown) {
    const status = (err as { code?: number }).code;
    if (status !== 404) throw err;
  }
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

/** Upload all HLS segments for each quality into a single flat Drive folder,
 *  moves the raw source file in, and uploads the thumbnail if provided.
 *
 *  Segment filenames in Drive: `{quality}_segment000.ts`
 *  Quality playlists are NOT uploaded — they are built dynamically by the backend.
 */
export async function uploadHlsDirectory(
  hlsBaseDir: string,
  videoId: string,
  rawDriveFileId: string,
  thumbnailLocalPath: string | null,
  qualities: Array<{ name: string }>,
  parentFolderId?: string,
): Promise<{
  videoFolderId: string;
  thumbnailFileId: string | null;
  chunks: Array<{
    filename: string;
    driveFileId: string;
    sequence: number;
    quality: string;
  }>;
}> {
  // Create a dedicated subfolder for this video
  const videoFolderId = await createFolder(videoId, parentFolderId);
  console.log(
    `  📁 Created Drive folder for video ${videoId}: ${videoFolderId}`,
  );

  // Move the raw source file into the video folder
  await moveFile(rawDriveFileId, videoFolderId);
  console.log(`  📦 Moved raw file ${rawDriveFileId} into video folder`);

  const allChunks: Array<{
    filename: string;
    driveFileId: string;
    sequence: number;
    quality: string;
  }> = [];

  for (const quality of qualities) {
    const qualityDir = path.join(hlsBaseDir, quality.name);
    const tsFiles = fs
      .readdirSync(qualityDir)
      .filter((f) => f.endsWith(".ts"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    console.log(
      `  ☁️  Uploading ${tsFiles.length} segments for ${quality.name}...`,
    );

    const batchSize = 5;
    for (let i = 0; i < tsFiles.length; i += batchSize) {
      const batch = tsFiles.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (originalFilename, idx) => {
          // Prefix with quality name so all qualities can coexist in the same folder
          const driveName = `${quality.name}_${originalFilename}`;
          const fileId = await uploadFile(
            path.join(qualityDir, originalFilename),
            driveName,
            "video/MP2T",
            videoFolderId,
          );
          const sequence = i + idx;
          console.log(`    ✓ ${driveName} (${sequence + 1}/${tsFiles.length})`);
          return {
            filename: driveName,
            driveFileId: fileId,
            sequence,
            quality: quality.name,
          };
        }),
      );
      allChunks.push(...results);
    }
  }

  // Upload thumbnail if available
  let thumbnailFileId: string | null = null;
  if (thumbnailLocalPath && fs.existsSync(thumbnailLocalPath)) {
    thumbnailFileId = await uploadFile(
      thumbnailLocalPath,
      "thumbnail.jpg",
      "image/jpeg",
      videoFolderId,
    );
    console.log(`  🖼  Uploaded thumbnail → ${thumbnailFileId}`);
  }

  return { videoFolderId, thumbnailFileId, chunks: allChunks };
}
