import { Injectable } from '@nestjs/common';
import { VideoQueryService } from './video.query.service';
import { VideoCommandService } from './video.command.service';
import { Video, VideoStatus } from './entities/video.entity';
import { VideoChunk } from './entities/video-chunk.entity';
import { CreateVideoDto, InitUploadDto } from './dto/video.dto';
import type { AuthUser } from '../auth/jwt.strategy';

/** Facade service retaining the old interface for controllers */
@Injectable()
export class VideoService {
  constructor(
    private readonly queryService: VideoQueryService,
    private readonly commandService: VideoCommandService,
  ) {}

  async initiateUpload(dto: InitUploadDto, ownerId: string) {
    return this.commandService.initiateUpload(dto, ownerId);
  }

  async create(dto: CreateVideoDto, ownerId: string): Promise<Video> {
    return this.commandService.create(dto, ownerId);
  }

  async findAll(
    category?: string,
    user?: AuthUser,
    page?: number,
    limit?: number,
    search?: string,
    sortBy?: string,
    sortOrder?: 'ASC' | 'DESC',
  ): Promise<{ data: Video[]; hasMore: boolean; total: number }> {
    return this.queryService.findAll(category, user, page, limit, search, sortBy, sortOrder);
  }

  async findOne(id: string, user?: AuthUser): Promise<Video> {
    return this.queryService.findOne(id, user);
  }

  async findVideoByChunkFileId(driveFileId: string): Promise<Video | null> {
    return this.queryService.findVideoByChunkFileId(driveFileId);
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
    return this.commandService.updateStatus(id, status, extra);
  }

  async saveChunks(
    videoId: string,
    chunks: Array<{ filename: string; driveFileId: string; sequence: number }>,
  ): Promise<void> {
    return this.commandService.saveChunks(videoId, chunks);
  }

  async getVideoQualities(videoId: string): Promise<string[]> {
    return this.queryService.getVideoQualities(videoId);
  }

  async getChunksByQuality(
    videoId: string,
    quality: string,
  ): Promise<VideoChunk[]> {
    return this.queryService.getChunksByQuality(videoId, quality);
  }

  async remove(id: string): Promise<void> {
    return this.commandService.remove(id);
  }
}
