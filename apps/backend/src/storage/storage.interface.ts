import { Readable } from 'stream';

export interface UploadFileOptions {
  name: string;
  mimeType: string;
  parentFolderId?: string;
}

export interface ResumableUploadConfig {
  uploadUrl: string;
  driveFileId: string;
}

export interface IReadableStorage {
  /**
   * Stream download a file from storage.
   * Returns a Readable stream — never buffers into RAM.
   */
  downloadFileAsStream(fileId: string): Promise<Readable>;
}

export interface IWritableStorage {
  /**
   * Initiate a resumable upload session for large files.
   * Returns the resumable upload URL and the pre-allocated Drive file ID.
   */
  initiateResumableUpload(
    fileName: string,
    mimeType: string,
    parentFolderId?: string,
  ): Promise<ResumableUploadConfig>;

  /**
   * Upload a file from a Readable stream.
   * Used by the Worker to upload HLS segments.
   */
  uploadFromStream(
    stream: Readable,
    options: UploadFileOptions,
  ): Promise<string>;

  /**
   * Delete a file from storage.
   */
  deleteFile(fileId: string): Promise<void>;
}

export interface IStorageService extends IReadableStorage, IWritableStorage {}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
