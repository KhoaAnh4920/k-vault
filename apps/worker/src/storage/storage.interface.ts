export interface StorageProvider {
  /** Download a file and save to destPath */
  downloadFile(fileIdOrKey: string, destPath: string): Promise<void>;

  /** Upload a local file and return the unique identifier (fileId or S3 key) */
  uploadFile(
    localPath: string,
    fileName: string,
    mimeType: string,
    parentFolderOrPrefix?: string,
    retries?: number
  ): Promise<string>;

  /** 
   * Prepare a sub-folder/prefix for the video and move the raw file if needed.
   * Returns the new folderId or s3 prefix.
   */
  prepareVideoFolder(
    videoId: string,
    rawFileIdOrKey: string,
    parentFolderOrPrefix?: string
  ): Promise<string>;

  /** Delete a file permanently */
  deleteFile(fileIdOrKey: string): Promise<void>;

  /** Specific Helper for HLS Segments uploading */
  uploadSingleSegment(
    localPath: string,
    qualityName: string,
    originalFilename: string,
    videoFolderOrPrefix: string
  ): Promise<{ filename: string; driveFileId: string }>;
}
