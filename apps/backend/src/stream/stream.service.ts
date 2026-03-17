import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import type { IStorageService } from '../storage/storage.interface';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { VideoService } from '../video/video.service';
import { VideoStatus } from '../video/entities/video.entity';

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor(
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
    private readonly videoService: VideoService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Fetch the .m3u8 playlist from Drive, rewrite each .ts filename to
   * /stream/chunk/:driveFileId by looking up the DB chunk mapping.
   */
  async getRewrittenPlaylist(videoId: string): Promise<string> {
    const video = await this.videoService.findOne(videoId);

    if (video.status !== VideoStatus.READY) {
      throw new NotFoundException(
        `Video ${videoId} is not ready for streaming`,
      );
    }
    if (!video.playlistDriveFileId) {
      throw new NotFoundException(`Playlist not found for video ${videoId}`);
    }

    const stream = await this.storage.downloadFileAsStream(
      video.playlistDriveFileId,
    );
    const rawPlaylist = await this.streamToString(stream);

    const apiBase = this.config.get<string>(
      'API_BASE_URL',
      'http://localhost:3001',
    );

    const rewritten = await this.rewritePlaylistUrls(
      rawPlaylist,
      videoId,
      apiBase,
    );

    this.logger.log(`Playlist rewritten for video ${videoId}`);
    return rewritten;
  }

  /**
   * Pipe a .ts chunk by its Drive fileId directly to the response.
   * NestJS StreamableFile handles the piping — zero RAM buffering.
   */
  async getChunkStream(fileId: string): Promise<Readable> {
    return this.storage.downloadFileAsStream(fileId);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * For each .ts segment line in the playlist, look up the corresponding
   * driveFileId in the database and replace the URL.
   */
  private async rewritePlaylistUrls(
    playlist: string,
    videoId: string,
    apiBase: string,
  ): Promise<string> {
    const lines = playlist.split('\n');
    const result: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.endsWith('.ts')) {
        const filename = trimmed.split('/').pop()!;
        try {
          const chunk = await this.videoService.findChunkByFilename(
            videoId,
            filename,
          );
          result.push(`${apiBase}/api/stream/chunk/${chunk.driveFileId}`);
        } catch {
          // Keep original line if chunk not found (graceful degradation)
          result.push(line);
        }
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  private streamToString(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
  }
}
