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
import { VideoStatus } from '../video/entities/video.entity';
import type { AuthUser } from '../auth/jwt.strategy';
import { Role } from '../auth/roles.decorator';

const QUALITY_META: Record<string, { bandwidth: number; resolution: string }> =
  {
    '1080p': { bandwidth: 5200000, resolution: '1920x1080' },
    '720p': { bandwidth: 2928000, resolution: '1280x720' },
    '480p': { bandwidth: 1528000, resolution: '854x480' },
    '360p': { bandwidth: 896000, resolution: '640x360' },
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

  /** Returns the master HLS playlist for a video. */
  async getRewrittenPlaylist(videoId: string, user: AuthUser): Promise<string> {
    const video = await this.videoService.findOne(videoId, user);

    if (video.status !== VideoStatus.READY) {
      throw new NotFoundException(
        `Video ${videoId} is not ready for streaming`,
      );
    }

    // Emit an event that the video is being viewed.
    // This allows decoupled view count incrementing.
    this.eventEmitter.emit('video.viewed', { videoId });

    return this.buildMasterPlaylist(videoId);
  }

  /**
   * Returns the per-quality variant playlist built dynamically from DB chunks.
   * Called by hls.js after parsing the master playlist.
   */
  async getQualityPlaylist(
    videoId: string,
    quality: string,
    user: AuthUser,
  ): Promise<string> {
    const video = await this.videoService.findOne(videoId, user);
    if (video.status !== VideoStatus.READY) {
      throw new NotFoundException(`Video ${videoId} is not ready`);
    }

    const chunks = await this.videoService.getChunksByQuality(videoId, quality);
    if (chunks.length === 0) {
      throw new NotFoundException(
        `No chunks found for video ${videoId} quality ${quality}`,
      );
    }

    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:7',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-INDEPENDENT-SEGMENTS',
    ];

    for (const chunk of chunks) {
      lines.push('#EXTINF:6.0,');
      lines.push(`/api/stream/chunk/${chunk.driveFileId}`);
    }

    lines.push('#EXT-X-ENDLIST');
    return lines.join('\n');
  }

  /** Returns the sorted list of available quality levels for a video. */
  async getQualities(videoId: string, user: AuthUser): Promise<string[]> {
    await this.videoService.findOne(videoId, user); // privacy check
    return this.videoService.getVideoQualities(videoId);
  }

  /** Pipe a .ts chunk by its Drive fileId — verifies privacy via chunk→video lookup. */
  async getChunkStream(fileId: string, user: AuthUser): Promise<Readable> {
    const video = await this.videoService.findVideoByChunkFileId(fileId);
    if (video?.isPrivate) {
      const isAdmin = user.roles.includes(Role.ADMIN);
      if (!isAdmin && video.ownerId !== user.userId) {
        throw new ForbiddenException('Access denied');
      }
    }
    return this.storage.downloadFileAsStream(fileId);
  }

  /** Proxy the video thumbnail from Drive. Throws NotFoundException if absent. */
  async getThumbnailStream(videoId: string, user: AuthUser): Promise<Readable> {
    const video = await this.videoService.findOne(videoId, user);
    const thumbnailId = video.thumbnailDriveFileId;
    if (!thumbnailId) {
      throw new NotFoundException(`No thumbnail for video ${videoId}`);
    }
    return this.storage.downloadFileAsStream(thumbnailId);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async buildMasterPlaylist(videoId: string): Promise<string> {
    const qualities = await this.videoService.getVideoQualities(videoId);
    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-INDEPENDENT-SEGMENTS',
    ];

    for (const quality of qualities) {
      const meta = QUALITY_META[quality];
      if (meta) {
        lines.push(
          `#EXT-X-STREAM-INF:BANDWIDTH=${meta.bandwidth},RESOLUTION=${meta.resolution},NAME="${quality}"`,
        );
      } else {
        lines.push('#EXT-X-STREAM-INF:BANDWIDTH=1000000');
      }
      // Relative URL — resolves to /api/stream/:videoId/:quality/playlist
      lines.push(`${quality}/playlist`);
    }

    return lines.join('\n');
  }
}
