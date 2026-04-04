import { google } from "googleapis";
import { Readable } from "stream";
import * as fs from "fs";
import { StorageProvider } from "./storage.interface";

export class GoogleDriveProvider implements StorageProvider {
  private drive: ReturnType<typeof google.drive>;

  constructor() {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    this.drive = google.drive({ version: "v3", auth: oauth2Client });
  }

  async downloadFile(fileId: string, destPath: string): Promise<void> {
    const res = await this.drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    await new Promise<void>((resolve, reject) => {
      const dest = fs.createWriteStream(destPath);
      (res.data as Readable)
        .pipe(dest)
        .on("finish", resolve)
        .on("error", reject);
    });
  }

  async uploadFile(
    localPath: string,
    fileName: string,
    mimeType: string,
    parentFolderId?: string,
    retries = 5
  ): Promise<string> {
    const folder = parentFolderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.drive.files.create({
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
      } catch (err: any) {
        const isRateLimit =
          err?.errors?.some?.(
            (e: any) => e.reason === "userRateLimitExceeded"
          ) ||
          err?.code === 403 ||
          err?.status === 403;

        if (attempt < retries && isRateLimit) {
          const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
          console.warn(
            `  ⚠️ Rate limit hit for ${fileName}. Retrying in ${Math.round(
              delay
            )}ms...`
          );
          await new Promise((res) => setTimeout(res, delay));
        } else {
          throw err;
        }
      }
    }
    throw new Error(`Exhausted retries for ${fileName}`);
  }

  private async moveFile(fileId: string, newParentId: string): Promise<void> {
    const meta = await this.drive.files.get({ fileId, fields: "parents" });
    const oldParents = (meta.data.parents ?? []).join(",");

    await this.drive.files.update({
      fileId,
      addParents: newParentId,
      removeParents: oldParents || undefined,
      fields: "id, parents",
    });
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.drive.files.delete({ fileId });
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if (status !== 404) throw err;
    }
  }

  private async createFolder(
    name: string,
    parentFolderId?: string
  ): Promise<string> {
    const folder = parentFolderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID;
    const res = await this.drive.files.create({
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

  async prepareVideoFolder(
    videoId: string,
    rawDriveFileId: string,
    parentFolderId?: string
  ): Promise<string> {
    const videoFolderId = await this.createFolder(videoId, parentFolderId);
    await this.moveFile(rawDriveFileId, videoFolderId);
    return videoFolderId;
  }

  async uploadSingleSegment(
    localPath: string,
    qualityName: string,
    originalFilename: string,
    videoFolderId: string
  ): Promise<{ filename: string; driveFileId: string }> {
    const driveName = `${qualityName}_${originalFilename}`;
    const fileId = await this.uploadFile(
      localPath,
      driveName,
      "video/MP2T",
      videoFolderId
    );
    return { filename: driveName, driveFileId: fileId };
  }
}
