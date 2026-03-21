import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { IStorageService } from '../storage/storage.interface';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { Video, VideoStatus, VideoVisibility } from './entities/video.entity';
import { VideoChunk } from './entities/video-chunk.entity';
import { CreateVideoDto, InitUploadDto, UpdateVideoMetadataDto } from './dto/video.dto';
import { TRANSCODE_QUEUE } from '../queue/queue.constants';

export interface TranscodeJobData {
  videoId: string;
  rawDriveFileId: string;
  thumbnailDriveFileId?: string | null;
}

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

  async create(dto: CreateVideoDto, ownerId: string): Promise<Video> {
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
          `Failed to upload provided thumbnail: ${(err as Error).message}`,
        );
      }
    }

    const video = this.videoRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      rawDriveFileId: dto.rawDriveFileId,
      category: dto.category ?? null,
      status: VideoStatus.PROCESSING,
      ownerId,
      visibility: dto.visibility ?? VideoVisibility.PUBLIC,
      thumbnailDriveFileId,
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

    this.logger.log(`Video ${saved.id} created and queued for transcoding`);
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

  async updateMetadata(
    id: string,
    ownerId: string,
    dto: UpdateVideoMetadataDto,
    isAdmin = false,
  ): Promise<Video> {
    const video = await this.videoRepo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Video ${id} not found`);

    if (!isAdmin && video.ownerId !== ownerId) {
      throw new ForbiddenException(
        'You do not have permission to edit this video',
      );
    }

    // Process new thumbnail
    if (dto.thumbnailBase64) {
      try {
        const newFileId = await this.uploadThumbnailFromBase64(
          dto.thumbnailBase64,
          video.hlsFolderDriveId || undefined,
        );

        // Delete old thumbnail if exists
        if (video.thumbnailDriveFileId) {
          try {
            await this.storage.deleteFile(video.thumbnailDriveFileId);
          } catch (delErr) {
            this.logger.warn(`Failed to delete old thumbnail: ${(delErr as Error).message}`);
          }
        }

        video.thumbnailDriveFileId = newFileId;
        this.logger.log(`Thumbnail updated for video ${id}`);
      } catch (err) {
        this.logger.error(`Failed to update thumbnail: ${(err as Error).message}`);
      }
    }

    // Update other fields
    if (dto.title !== undefined) video.title = dto.title;
    if (dto.description !== undefined) video.description = dto.description;
    if (dto.category !== undefined) video.category = dto.category;
    if (dto.visibility !== undefined) video.visibility = dto.visibility;

    return this.videoRepo.save(video);
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

  async remove(id: string): Promise<void> {
    const video = await this.videoRepo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Video ${id} not found`);

    const folderId = video.hlsFolderDriveId;
    if (folderId !== null) {
      try {
        await this.storage.deleteFile(folderId);
        this.logger.log(`Deleted Drive folder ${folderId} for video ${id}`);
      } catch (err) {
        this.logger.warn(
          `Failed to delete Drive folder ${folderId}: ${(err as Error).message}`,
        );
      }
    }

    // If processing, attempt to remove from BullMQ
    if (video.status === VideoStatus.PROCESSING) {
      try {
        const job = await this.transcodeQueue.getJob(id);
        if (job) {
          await job.remove();
          this.logger.log(`Removed active transcode job for video ${id}`);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to remove job for video ${id}: ${(err as Error).message}`,
        );
      }
    }

    await this.chunkRepo.delete({ videoId: id });
    await this.videoRepo.delete(id);
    this.logger.log(`Video ${id} fully deleted`);
  }
}
