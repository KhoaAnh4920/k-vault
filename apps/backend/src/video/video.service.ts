import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

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

  async initiateUpload(dto: InitUploadDto) {
    const mimeType = dto.mimeType ?? 'video/mp4';
    const result = await this.storage.initiateResumableUpload(
      dto.fileName,
      mimeType,
    );
    this.logger.log(`Resumable upload initiated: ${result.driveFileId}`);
    return result;
  }

  async create(dto: CreateVideoDto): Promise<Video> {
    const video = this.videoRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      rawDriveFileId: dto.rawDriveFileId,
      status: VideoStatus.PROCESSING,
    });

    const saved = await this.videoRepo.save(video);

    await this.transcodeQueue.add(
      'transcode',
      { videoId: saved.id, rawDriveFileId: saved.rawDriveFileId! },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    this.logger.log(`Video ${saved.id} created and queued for transcoding`);
    return saved;
  }

  async findAll(): Promise<Video[]> {
    return this.videoRepo.find({
      order: { createdAt: 'DESC' },
      select: [
        'id',
        'title',
        'description',
        'status',
        'createdAt',
        'updatedAt',
      ],
    });
  }

  async findOne(id: string): Promise<Video> {
    const video = await this.videoRepo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Video ${id} not found`);
    return video;
  }

  async updateStatus(
    id: string,
    status: VideoStatus,
    extra?: Partial<
      Pick<
        Video,
        'playlistDriveFileId' | 'hlsFolderDriveId' | 'durationSeconds'
      >
    >,
  ): Promise<void> {
    await this.videoRepo.update(id, { status, ...extra });
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

  async findChunkByFilename(
    videoId: string,
    filename: string,
  ): Promise<VideoChunk> {
    const chunk = await this.chunkRepo.findOne({
      where: { videoId, filename },
    });
    if (!chunk) {
      throw new BadRequestException(
        `Chunk "${filename}" not found for video ${videoId}`,
      );
    }
    return chunk;
  }

  async remove(id: string): Promise<void> {
    const video = await this.videoRepo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Video ${id} not found`);

    // Delete the per-video Drive folder — this removes all files inside
    // (raw source, playlist.m3u8, and every segment .ts) in one API call.
    // Fall back to deleting individual known files if the folder ID is absent
    // (videos processed before this column was added).
    const folderId = video.hlsFolderDriveId as string | null;
    if (folderId !== null) {
      try {
        await this.storage.deleteFile(folderId);
        this.logger.log(`Deleted Drive folder ${folderId} for video ${id}`);
      } catch (err) {
        this.logger.warn(
          `Failed to delete Drive folder ${folderId}: ${(err as Error).message}`,
        );
      }
    } else {
      // Legacy path: delete individual files (videos before folder grouping)
      const fileIds: string[] = [];
      if (video.rawDriveFileId) fileIds.push(video.rawDriveFileId);
      if (video.playlistDriveFileId) fileIds.push(video.playlistDriveFileId);
      const chunks = await this.chunkRepo.find({ where: { videoId: id } });
      fileIds.push(...chunks.map((c) => c.driveFileId));

      const results = await Promise.allSettled(
        fileIds.map((fileId) => this.storage.deleteFile(fileId)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        this.logger.warn(
          `${failed}/${fileIds.length} Drive file deletions failed for video ${id}`,
        );
      }
    }

    // Explicitly delete chunks first (guards against missing DB-level CASCADE)
    await this.chunkRepo.delete({ videoId: id });

    // Delete the video record
    await this.videoRepo.delete(id);
    this.logger.log(`Video ${id} fully deleted`);
  }
}
