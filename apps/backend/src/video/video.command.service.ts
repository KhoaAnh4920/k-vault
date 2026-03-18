import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { IStorageService } from '../storage/storage.interface';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { Video, VideoStatus } from './entities/video.entity';
import { VideoChunk } from './entities/video-chunk.entity';
import { CreateVideoDto, InitUploadDto } from './dto/video.dto';
import { TRANSCODE_QUEUE } from '../queue/queue.constants';

export interface TranscodeJobData {
  videoId: string;
  rawDriveFileId: string;
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

  async create(dto: CreateVideoDto, ownerId: string): Promise<Video> {
    const video = this.videoRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      rawDriveFileId: dto.rawDriveFileId,
      category: dto.category ?? null,
      status: VideoStatus.PROCESSING,
      ownerId,
      isPrivate: dto.isPrivate ?? true,
    });

    const saved = await this.videoRepo.save(video);

    await this.transcodeQueue.add(
      'transcode',
      { videoId: saved.id, rawDriveFileId: saved.rawDriveFileId ?? '' },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
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

    await this.chunkRepo.delete({ videoId: id });
    await this.videoRepo.delete(id);
    this.logger.log(`Video ${id} fully deleted`);
  }
}
