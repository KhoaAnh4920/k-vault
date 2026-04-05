import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import {
  IStorageService,
  ResumableUploadConfig,
  UploadFileOptions,
} from './storage.interface';

@Injectable()
export class S3StorageAdapter implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(S3StorageAdapter.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({
      region: this.config.get<string>('S3_REGION'),
      endpoint: this.config.get<string>('S3_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY')!,
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY')!,
      },
      forcePathStyle: true,
    });
    this.bucket = this.config.get<string>('S3_BUCKET')!;
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`S3 Bucket "${this.bucket}" exists.`);
    } catch (e: unknown) {
      const error = e as any;
      if (
        error.$metadata?.httpStatusCode === 404 ||
        error.name === 'NotFound'
      ) {
        this.logger.log(`S3 Bucket "${this.bucket}" not found. Creating...`);
        try {
          await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(`Created S3 Bucket "${this.bucket}".`);
        } catch (err: unknown) {
          const createError = err as any;
          this.logger.error(
            `Failed to create S3 Bucket "${this.bucket}"`,
            createError,
          );
        }
      } else {
        this.logger.error(`Error checking S3 Bucket "${this.bucket}"`, error);
      }
    }
  }

  async initiateResumableUpload(
    fileName: string,
    mimeType: string,
    parentPrefix?: string,
  ): Promise<ResumableUploadConfig> {
    const rawId = crypto.randomUUID();
    const prefix = parentPrefix ?? 'raw';
    // Format: raw/uuid_filename
    const s3Key = `${prefix}/${rawId}_${fileName.replace(/\s+/g, '_')}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: mimeType,
    });

    // Provide a presigned URL valid for 24 hours. The frontend can use a simple PUT request
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: 86400,
    });

    this.logger.log(
      `Generated Presigned PUT URL for "${fileName}" (Key: ${s3Key})`,
    );

    return { uploadUrl, driveFileId: s3Key };
  }

  async downloadFileAsStream(fileId: string): Promise<Readable> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fileId,
    });
    const res = await this.s3.send(cmd);
    return res.Body as Readable;
  }

  async uploadFromStream(
    stream: Readable,
    options: UploadFileOptions,
  ): Promise<string> {
    const prefix = options.parentFolderId ?? 'public';
    const s3Key = `${prefix}/${options.name}`;

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as ArrayBuffer));
    }
    const buffer = Buffer.concat(chunks);

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: options.mimeType,
    });

    await this.s3.send(cmd);
    this.logger.log(`Uploaded "${options.name}" → S3 Key: ${s3Key}`);
    return s3Key;
  }

  async deleteFile(fileId: string): Promise<void> {
    const cmd = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: fileId,
    });
    try {
      await this.s3.send(cmd);
      this.logger.log(`Deleted S3 object: ${fileId}`);
    } catch (err) {
      this.logger.warn(
        `Failed to delete S3 object: ${fileId}. ${(err as Error).message}`,
      );
    }
  }
}
