import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Readable } from 'stream';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { IStorageService } from '../storage/storage.interface';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { Video, VideoStatus, VideoVisibility } from './entities/video.entity';
import { VideoChunk } from './entities/video-chunk.entity';
import {
  CreateVideoDto,
  InitUploadDto,
  UpdateVideoMetadataDto,
} from './dto/video.dto';
import { TRANSCODE_QUEUE } from '../queue/queue.constants';
import { Role } from '../auth/roles.decorator';

export interface TranscodeJobData {
  videoId: string;
  rawDriveFileId: string;
  thumbnailDriveFileId?: string | null;
}

/** Visibility states a Member is permitted to set on their own videos. */
const MEMBER_ALLOWED_VISIBILITIES: VideoVisibility[] = [
  VideoVisibility.PRIVATE,
  VideoVisibility.UNLISTED,
];

@Injectable()
export class VideoCommandService {
  private readonly logger = new Logger(VideoCommandService.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,

    @InjectRepository(VideoChunk)
    private readonly chunkRepo: Repository<VideoChunk>,

    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,

    @InjectQueue(TRANSCODE_QUEUE)
    private readonly transcodeQueue: Queue<TranscodeJobData>,
  ) {}

  async initiateUpload(dto: InitUploadDto, ownerId: string) {
    const mimeType = dto.mimeType ?? 'video/mp4';
    const result = await this.storage.initiateResumableUpload(
      dto.fileName,
      mimeType,
    );
    this.logger.log(
      `Resumable upload initiated by ${ownerId}: ${result.driveFileId}`,
    );
    return result;
  }

  private async uploadThumbnailFromBase64(
    base64: string,
    parentFolderId?: string,
  ): Promise<string> {
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return this.storage.uploadFromStream(stream, {
      name: `thumb_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      parentFolderId,
    });
  }

  /**
   * Create a video record and enqueue it for transcoding.
   *
   * Business rules enforced here:
   * - US2: If uploader is a Member (not Admin), visibility is FORCED to PRIVATE.
   * - BR3: Initial status is WAITING (not PROCESSING) — the worker sets it to
   *   PROCESSING when it actually begins. This enables the "Queued" UI state.
   */
  async create(
    dto: CreateVideoDto,
    ownerId: string,
    roles: string[],
  ): Promise<Video> {
    const isAdmin = roles.includes(Role.ADMIN);

    // US2: Member uploads are always PRIVATE regardless of DTO input
    const visibility = isAdmin
      ? (dto.visibility ?? VideoVisibility.PUBLIC)
      : VideoVisibility.PRIVATE;

    let thumbnailDriveFileId: string | null = null;
    if (dto.thumbnailBase64) {
      try {
        thumbnailDriveFileId = await this.uploadThumbnailFromBase64(
          dto.thumbnailBase64,
        );
        this.logger.log(
          `Thumbnail uploaded for new video: ${thumbnailDriveFileId}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to upload thumbnail: ${(err as Error).message}`,
        );
      }
    }

    const video = this.videoRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      rawDriveFileId: dto.rawDriveFileId,
      category: dto.category ?? null,
      status: VideoStatus.WAITING, // BR3: starts as WAITING until worker picks it up
      ownerId,
      visibility,
      thumbnailDriveFileId,
      shareToken: null,
    });

    const saved = await this.videoRepo.save(video);

    await this.transcodeQueue.add(
      'transcode',
      {
        videoId: saved.id,
        rawDriveFileId: saved.rawDriveFileId ?? '',
        thumbnailDriveFileId: saved.thumbnailDriveFileId,
      },
      {
        jobId: saved.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.logger.log(
      `Video ${saved.id} created (status=waiting) and queued for transcoding`,
    );
    return saved;
  }

  async updateStatus(
    id: string,
    status: VideoStatus,
    extra?: Partial<
      Pick<
        Video,
        | 'hlsFolderDriveId'
        | 'durationSeconds'
        | 'thumbnailDriveFileId'
        | 'sourceHeight'
      >
    >,
  ): Promise<void> {
    await this.videoRepo.update(id, { status, ...extra });
  }

  /**
   * Update video metadata.
   *
   * Visibility restrictions:
   * - Admin: any visibility value
   * - Member: only PRIVATE or UNLISTED (cannot set PUBLIC or ROLE_RESTRICTED)
   */
  async updateMetadata(
    id: string,
    requesterId: string,
    dto: UpdateVideoMetadataDto,
    roles: string[],
  ): Promise<Video> {
    const isAdmin = roles.includes(Role.ADMIN);
    const video = await this.videoRepo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Video ${id} not found`);

    // Ownership check: only owner OR admin (who is owner) can edit
    // Note: per BR2, Admin cannot access PRIVATE videos owned by others.
    // For non-private, Admins cannot edit other users' metadata here either —
    // only the owner can edit their own video metadata.
    if (video.ownerId !== requesterId) {
      throw new ForbiddenException(
        'You do not have permission to edit this video',
      );
    }

    // Visibility enforcement for Members
    if (dto.visibility !== undefined && !isAdmin) {
      if (!MEMBER_ALLOWED_VISIBILITIES.includes(dto.visibility)) {
        throw new ForbiddenException(
          'Members may only set visibility to Private or Unlisted',
        );
      }
    }

    // If changing away from UNLISTED, clear the share token
    if (
      dto.visibility !== undefined &&
      dto.visibility !== VideoVisibility.UNLISTED &&
      video.shareToken !== null
    ) {
      video.shareToken = null;
    }

    // Process new thumbnail
    if (dto.thumbnailBase64) {
      try {
        const newFileId = await this.uploadThumbnailFromBase64(
          dto.thumbnailBase64,
          video.hlsFolderDriveId || undefined,
        );
        if (video.thumbnailDriveFileId) {
          try {
            await this.storage.deleteFile(video.thumbnailDriveFileId);
          } catch (delErr) {
            this.logger.warn(
              `Failed to delete old thumbnail: ${(delErr as Error).message}`,
            );
          }
        }
        video.thumbnailDriveFileId = newFileId;
      } catch (err) {
        this.logger.error(
          `Failed to update thumbnail: ${(err as Error).message}`,
        );
      }
    }

    if (dto.title !== undefined) video.title = dto.title;
    if (dto.description !== undefined) video.description = dto.description;
    if (dto.category !== undefined) video.category = dto.category;
    if (dto.visibility !== undefined) video.visibility = dto.visibility;

    return this.videoRepo.save(video);
  }

  /**
   * Generate a secret share token for an UNLISTED video (US3).
   * Sets visibility to UNLISTED and generates a cryptographic token.
   * Only the video owner can call this.
   */
  async generateShareToken(
    videoId: string,
    requesterId: string,
  ): Promise<{ shareToken: string }> {
    const video = await this.videoRepo.findOne({ where: { id: videoId } });
    if (!video) throw new NotFoundException(`Video ${videoId} not found`);
    if (video.ownerId !== requesterId) {
      throw new ForbiddenException(
        'Only the video owner can generate a share link',
      );
    }

    const shareToken = randomBytes(32).toString('hex');
    await this.videoRepo.update(videoId, {
      shareToken,
      visibility: VideoVisibility.UNLISTED,
    });

    this.logger.log(
      `Share token generated for video ${videoId} by ${requesterId}`,
    );
    return { shareToken };
  }

  /**
   * Revoke the share token for a video (US3).
   * Resets visibility back to PRIVATE and clears the token.
   * Only the video owner can call this.
   */
  async revokeShareToken(videoId: string, requesterId: string): Promise<void> {
    const video = await this.videoRepo.findOne({ where: { id: videoId } });
    if (!video) throw new NotFoundException(`Video ${videoId} not found`);
    if (video.ownerId !== requesterId) {
      throw new ForbiddenException(
        'Only the video owner can revoke a share link',
      );
    }

    await this.videoRepo.update(videoId, {
      shareToken: null,
      visibility: VideoVisibility.PRIVATE,
    });

    this.logger.log(
      `Share token revoked for video ${videoId} by ${requesterId}`,
    );
  }

  async incrementViews(id: string): Promise<void> {
    await this.videoRepo.increment({ id }, 'views', 1);
  }

  async saveChunks(
    videoId: string,
    chunks: Array<{ filename: string; driveFileId: string; sequence: number }>,
  ): Promise<void> {
    const entities = chunks.map((c) =>
      this.chunkRepo.create({ videoId, ...c }),
    );
    await this.chunkRepo.save(entities);
  }

  async remove(
    id: string,
    requesterId: string,
    roles: string[],
  ): Promise<void> {
    const isAdmin = roles.includes(Role.ADMIN);
    const video = await this.videoRepo.findOne({
      where: { id },
      relations: ['chunks'],
    });
    if (!video) throw new NotFoundException(`Video ${id} not found`);

    // Ownership / permission check
    // Admin can delete PUBLIC, ROLE_RESTRICTED, UNLISTED (not other users' PRIVATE — BR2)
    // Member can only delete their own videos
    const isOwner = video.ownerId === requesterId;
    if (!isOwner) {
      if (!isAdmin) {
        throw new ForbiddenException(
          'You do not have permission to delete this video',
        );
      }
      // Admin trying to delete someone else's PRIVATE video — BR2 prohibition
      if (video.visibility === VideoVisibility.PRIVATE) {
        throw new ForbiddenException(
          "Admins cannot delete another user's private video",
        );
      }
    }

    // Delete storage files
    if (video.hlsFolderDriveId !== null) {
      try {
        const folderPrefix = video.hlsFolderDriveId.endsWith('/')
          ? video.hlsFolderDriveId
          : `${video.hlsFolderDriveId}/`;
        await this.storage.deleteFile(folderPrefix);
      } catch (err) {
        this.logger.warn(
          `Failed to delete storage folder: ${(err as Error).message}`,
        );
      }
    }

    if (video.thumbnailDriveFileId) {
      const isInsideFolder =
        video.hlsFolderDriveId !== null &&
        video.thumbnailDriveFileId.startsWith(video.hlsFolderDriveId);
      if (!isInsideFolder) {
        try {
          await this.storage.deleteFile(video.thumbnailDriveFileId);
        } catch (err) {
          this.logger.warn(
            `Failed to delete thumbnail: ${(err as Error).message}`,
          );
        }
      }
    }

    if (video.rawDriveFileId) {
      try {
        await this.storage.deleteFile(video.rawDriveFileId);
      } catch (err) {
        this.logger.warn(
          `Failed to delete raw file: ${(err as Error).message}`,
        );
      }
    }

    if (
      video.status === VideoStatus.PROCESSING ||
      video.status === VideoStatus.WAITING
    ) {
      try {
        const job = await this.transcodeQueue.getJob(id);
        if (job) {
          await job.remove();
          this.logger.log(`Removed transcode job for video ${id}`);
        }
      } catch (err) {
        this.logger.warn(`Failed to remove job: ${(err as Error).message}`);
      }
    }

    await this.chunkRepo.delete({ videoId: id });
    await this.videoRepo.delete(id);
    this.logger.log(`Video ${id} fully deleted by ${requesterId}`);
  }
}
