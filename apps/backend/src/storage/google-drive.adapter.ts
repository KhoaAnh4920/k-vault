import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Readable } from 'stream';
import axios from 'axios';
import {
  IStorageService,
  ResumableUploadConfig,
  UploadFileOptions,
} from './storage.interface';

@Injectable()
export class GoogleDriveAdapter implements IStorageService {
  private readonly logger = new Logger(GoogleDriveAdapter.name);
  private readonly oauth2Client: OAuth2Client;
  private readonly drive: ReturnType<typeof google.drive>;

  constructor(private readonly config: ConfigService) {
    this.oauth2Client = new google.auth.OAuth2(
      config.get<string>('GOOGLE_CLIENT_ID'),
      config.get<string>('GOOGLE_CLIENT_SECRET'),
    );

    this.oauth2Client.setCredentials({
      refresh_token: config.get<string>('GOOGLE_REFRESH_TOKEN'),
    });

    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  async initiateResumableUpload(
    fileName: string,
    mimeType: string,
    parentFolderId?: string,
  ): Promise<ResumableUploadConfig> {
    const folderId =
      parentFolderId ?? this.config.get<string>('GOOGLE_DRIVE_FOLDER_ID');

    // Pre-allocate a file ID so we can reference it before the upload completes
    const idRes = await this.drive.files.generateIds({
      count: 1,
      space: 'drive',
    });
    const driveFileId = idRes.data.ids![0];

    // Get a fresh access token
    const { token: accessToken } = await this.oauth2Client.getAccessToken();

    // Make a raw HTTP request to initiate the resumable session.
    // The googleapis SDK completes the upload internally and does not expose
    // the Location header, so we bypass it here.
    const initRes = await axios.post<void>(
      'https://www.googleapis.com/upload/drive/v3/files',
      {
        id: driveFileId,
        name: fileName,
        parents: folderId ? [folderId] : undefined,
      },
      {
        params: { uploadType: 'resumable' },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType,
          // Required for browser CORS: Google ties the allowed origin to the
          // session URI when Origin is present at session initiation time.
          Origin: this.config.get<string>(
            'CORS_ORIGIN',
            'http://localhost:3000',
          ),
        },
      },
    );

    const uploadUrl = initRes.headers['location'] as string;

    this.logger.log(
      `Initiated resumable upload for "${fileName}" (id: ${driveFileId})`,
    );

    return { uploadUrl, driveFileId };
  }

  async downloadFileAsStream(fileId: string): Promise<Readable> {
    const response = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
    );

    return response.data as Readable;
  }

  async uploadFromStream(
    stream: Readable,
    options: UploadFileOptions,
  ): Promise<string> {
    const folderId =
      options.parentFolderId ??
      this.config.get<string>('GOOGLE_DRIVE_FOLDER_ID');

    const res = await this.drive.files.create({
      requestBody: {
        name: options.name,
        parents: folderId ? [folderId] : undefined,
      },
      media: {
        mimeType: options.mimeType,
        body: stream,
      },
      fields: 'id',
    });

    const driveFileId = res.data.id!;
    this.logger.log(`Uploaded "${options.name}" → Drive ID: ${driveFileId}`);
    return driveFileId;
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId });
    this.logger.log(`Deleted Drive file: ${fileId}`);
  }
}
