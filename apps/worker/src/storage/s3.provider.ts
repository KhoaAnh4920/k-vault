import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { StorageProvider } from "./storage.interface";

export class S3Provider implements StorageProvider {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      // Force path style for MinIO compatibility
      forcePathStyle: true,
    });
    this.bucket = process.env.S3_BUCKET!;
  }

  async downloadFile(fileKey: string, destPath: string): Promise<void> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });
    const res = await this.s3.send(cmd);
    if (!res.Body) throw new Error("Empty body from S3");

    const dest = fs.createWriteStream(destPath);
    await pipeline(res.Body as Readable, dest);
  }

  async uploadFile(
    localPath: string,
    fileName: string,
    mimeType: string,
    parentPrefix?: string,
    retries = 5
  ): Promise<string> {
    let key = fileName;
    if (parentPrefix) {
      key = parentPrefix.endsWith("/")
        ? `${parentPrefix}${fileName}`
        : `${parentPrefix}/${fileName}`;
    }

    const fileStream = fs.createReadStream(localPath);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const cmd = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: fileStream,
          ContentType: mimeType,
        });

        await this.s3.send(cmd);
        return key;
      } catch (err: any) {
        if (attempt < retries) {
          const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
          console.warn(
            `  ⚠️ S3 Upload error for ${fileName}. Retrying in ${Math.round(
              delay
            )}ms...`
          );
          await new Promise((res) => setTimeout(res, delay));
          // Reset stream position for retry
          fileStream.destroy();
          return this.uploadFile(localPath, fileName, mimeType, parentPrefix, retries - 1);
        } else {
          throw err;
        }
      }
    }
    throw new Error(`Exhausted retries for ${fileName}`);
  }

  async prepareVideoFolder(
    videoId: string,
    rawFileKey: string,
    parentPrefix?: string // This maps to the root prefix, eg "hls"
  ): Promise<string> {
    // S3 doesn't have folders, so we just construct the new prefix
    const base = parentPrefix ? `${parentPrefix}/${videoId}` : videoId;
    const newPrefix = base.endsWith("/") ? base : `${base}/`;
    
    // We move the raw file into this "folder" (prefix)
    const rawFileName = path.basename(rawFileKey);
    const newRawKey = `${newPrefix}${rawFileName}`;

    // CopySource must be URL-encoded, otherwise non-ASCII chars crash the HTTP request headers
    const encodedRawFileKey = rawFileKey.split('/').map(encodeURIComponent).join('/');

    await this.s3.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodedRawFileKey}`, // format: bucket/key
        Key: newRawKey,
      })
    );

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: rawFileKey,
      })
    );

    return newPrefix;
  }

  async deleteFile(fileKey: string): Promise<void> {
    const cmd = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });
    try {
      await this.s3.send(cmd);
    } catch (err: any) {
      if (err.name !== "NoSuchKey" && err.name !== "NotFound") {
        throw err;
      }
    }
  }

  async uploadSingleSegment(
    localPath: string,
    qualityName: string,
    originalFilename: string,
    videoPrefix: string
  ): Promise<{ filename: string; driveFileId: string }> {
    const driveName = `${qualityName}_${originalFilename}`;
    const fileId = await this.uploadFile(
      localPath,
      driveName,
      "video/MP2T",
      videoPrefix
    );
    // for S3, driveFileId is just the Key.
    return { filename: driveName, driveFileId: fileId };
  }
}
