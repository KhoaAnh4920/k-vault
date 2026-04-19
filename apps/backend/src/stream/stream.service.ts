import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IStorageService } from '../storage/storage.interface';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { VideoService } from '../video/video.service';
import { VideoStatus, VideoVisibility } from '../video/entities/video.entity';
import type { AuthUser } from '../auth/jwt.strategy';
import { Role } from '../auth/roles.decorator';

const QUALITY_META: Record<string, { bandwidth: number; resolution: string }> = {
  HD: { bandwidth: 5200000, resolution: '1920x1080' },
  SD: { bandwidth: 1528000, resolution: '854x480' },
};

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor(
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
    private readonly videoService: VideoService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Returns the master HLS playlist. Validates visibility access first. */
  async getRewrittenPlaylist(
    videoId: string,
    user: AuthUser | null,
    shareToken?: string,
  ): Promise<string> {
    const video = await this.videoService.findOne(videoId, user, shareToken);
    if (video.status !== VideoStatus.READY) {
      throw new NotFoundException(`Video ${videoId} is not ready for streaming`);
    }
    this.eventEmitter.emit('video.viewed', { videoId });
    return this.buildMasterPlaylist(videoId);
  }

  /** Returns the per-quality variant playlist. */
  async getQualityPlaylist(
    videoId: string,
    quality: string,
    user: AuthUser | null,
    shareToken?: string,
  ): Promise<string> {
    const video = await this.videoService.findOne(videoId, user, shareToken);
    if (video.status !== VideoStatus.READY) {
      throw new NotFoundException(`Video ${videoId} is not ready`);
    }

    const chunks = await this.videoService.getChunksByQuality(videoId, quality);
    if (chunks.length === 0) {
      throw new NotFoundException(`No chunks found for video ${videoId} quality ${quality}`);
    }

    const maxDuration = chunks.reduce((max, c) => Math.max(max, c.durationSeconds ?? 6), 0);
    const targetDuration = Math.max(1, Math.ceil(maxDuration));

    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      `#EXT-X-TARGETDURATION:${targetDuration}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-INDEPENDENT-SEGMENTS',
    ];

    for (const chunk of chunks) {
      const dur = (chunk.durationSeconds ?? 6.0).toFixed(6);
      lines.push(`#EXTINF:${dur},`);
      lines.push(`/api/stream/chunk/${encodeURIComponent(chunk.driveFileId)}`);
    }

    lines.push('#EXT-X-ENDLIST');
    return lines.join('\n');
  }

  /** Returns the sorted list of available quality levels. */
  async getQualities(
    videoId: string,
    user: AuthUser | null,
    shareToken?: string,
  ): Promise<string[]> {
    await this.videoService.findOne(videoId, user, shareToken); // privacy check
    return this.videoService.getVideoQualities(videoId);
  }

  /**
   * Pipe a .ts chunk by its Drive fileId.
   *
   * Access matrix for chunks (mirrors video-level rules):
   * - PUBLIC:          anyone
   * - PRIVATE:         owner only (BR2: Admin is forbidden)
   * - UNLISTED:        anyone (security-through-obscurity — chunk fileIds are unguessable)
   * - ROLE_RESTRICTED: Admin only
   */
  async getChunkStream(fileId: string, user: AuthUser | null): Promise<Readable> {
    const video = await this.videoService.findVideoByChunkFileId(fileId);

    if (video) {
      const isAdmin = user?.roles.includes(Role.ADMIN) ?? false;
      const isOwner = !!user?.userId && video.ownerId === user.userId;

      switch (video.visibility) {
        case VideoVisibility.PUBLIC:
          // No restriction
          break;

        case VideoVisibility.PRIVATE:
          // BR2: Owner only — Admin is explicitly denied
          if (!isOwner) {
            throw new ForbiddenException('Access denied');
          }
          break;

        case VideoVisibility.UNLISTED:
          // Chunk-level access: anyone who knows the fileId may stream
          // (the share token gate is at playlist level)
          break;

        case VideoVisibility.ROLE_RESTRICTED:
          if (!isAdmin) {
            throw new ForbiddenException('Access denied');
          }
          break;
      }
    }

    return this.storage.downloadFileAsStream(fileId);
  }

  /** Proxy the video thumbnail. Validates visibility access first. */
  async getThumbnailStream(
    videoId: string,
    user: AuthUser | null,
    shareToken?: string,
  ): Promise<Readable> {
    const video = await this.videoService.findOne(videoId, user, shareToken);
    const thumbnailId = video.thumbnailDriveFileId;
    if (!thumbnailId) {
      throw new NotFoundException(`No thumbnail for video ${videoId}`);
    }
    return this.storage.downloadFileAsStream(thumbnailId);
  }

  private async buildMasterPlaylist(videoId: string): Promise<string> {
    const qualities = await this.videoService.getVideoQualities(videoId);
    const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];

    for (const quality of qualities) {
      const meta = QUALITY_META[quality];
      if (meta) {
        lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${meta.bandwidth},RESOLUTION=${meta.resolution},NAME="${quality}"`);
      } else {
        lines.push('#EXT-X-STREAM-INF:BANDWIDTH=1000000');
      }
      lines.push(`${quality}/playlist`);
    }

    return lines.join('\n');
  }
}
