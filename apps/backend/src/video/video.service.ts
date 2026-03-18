import {
  ForbiddenException,
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
import type { AuthUser } from '../auth/jwt.strategy';
import { Role } from '../auth/roles.decorator';

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
    // Queue name is resolved from NODE_ENV — see queue.constants.ts
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
      category: (dto.category ?? null) as string | null,
      status: VideoStatus.PROCESSING,
      ownerId,
      isPrivate: dto.isPrivate ?? true,
    });

    const saved = await this.videoRepo.save(video);

    await this.transcodeQueue.add(
      'transcode',
      {
        videoId: saved.id,
        rawDriveFileId: saved.rawDriveFileId ?? '',
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    this.logger.log(`Video ${saved.id} created and queued for transcoding`);
    return saved;
  }

  async findAll(category?: string, user?: AuthUser): Promise<Video[]> {
    const isAdmin = user?.roles.includes(Role.ADMIN) ?? false;
    return this.videoRepo.find({
      where: {
        ...(category ? { category } : {}),
        // Viewers only see public videos; admins see everything
        ...(!isAdmin ? { isPrivate: false } : {}),
      },
      order: { createdAt: 'DESC' },
      select: [
        'id',
        'title',
        'description',
        'status',
        'category',
        'durationSeconds',
        'createdAt',
        'updatedAt',
        'isPrivate',
      ],
    });
  }

  async findOne(id: string, user?: AuthUser): Promise<Video> {
    const video = await this.videoRepo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Video ${id} not found`);

    const isAdmin = user?.roles.includes(Role.ADMIN) ?? false;
    if (video.isPrivate && !isAdmin && video.ownerId !== user?.userId) {
      throw new ForbiddenException(`Access denied to video ${id}`);
    }
    return video;
  }

  /** Find the parent video for a given Drive chunk file ID. Used for privacy checks. */
  async findVideoByChunkFileId(driveFileId: string): Promise<Video | null> {
    const chunk = await this.chunkRepo.findOne({ where: { driveFileId } });
    if (!chunk) return null;
    return this.videoRepo.findOne({ where: { id: chunk.videoId } });
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

  async saveChunks(
    videoId: string,
    chunks: Array<{ filename: string; driveFileId: string; sequence: number }>,
  ): Promise<void> {
    const entities = chunks.map((c) =>
      this.chunkRepo.create({ videoId, ...c }),
    );
    await this.chunkRepo.save(entities);
  }

  async getVideoQualities(videoId: string): Promise<string[]> {
    const rows = await this.chunkRepo
      .createQueryBuilder('c')
      .select('DISTINCT c.quality', 'quality')
      .where('c.videoId = :videoId AND c.quality IS NOT NULL', { videoId })
      .getRawMany<{ quality: string }>();
    // Sort descending by numeric value (1080 > 480 > 320)
    return rows.map((r) => r.quality).sort((a, b) => parseInt(b) - parseInt(a));
  }

  async getChunksByQuality(
    videoId: string,
    quality: string,
  ): Promise<VideoChunk[]> {
    return this.chunkRepo.find({
      where: { videoId, quality },
      order: { sequence: 'ASC' },
    });
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

    // Explicitly delete chunks first (guards against missing DB-level CASCADE)
    await this.chunkRepo.delete({ videoId: id });

    // Delete the video record
    await this.videoRepo.delete(id);
    this.logger.log(`Video ${id} fully deleted`);
  }
}
