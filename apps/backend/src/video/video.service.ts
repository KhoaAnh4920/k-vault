import { Injectable } from '@nestjs/common';
import { VideoQueryService } from './video.query.service';
import { VideoCommandService } from './video.command.service';
import { Video, VideoStatus } from './entities/video.entity';
import { VideoChunk } from './entities/video-chunk.entity';
import {
  CreateVideoDto,
  InitUploadDto,
  UpdateVideoMetadataDto,
} from './dto/video.dto';
import type { AuthUser } from '../auth/jwt.strategy';

/** Facade that delegates to VideoQueryService / VideoCommandService */
@Injectable()
export class VideoService {
  constructor(
    private readonly queryService: VideoQueryService,
    private readonly commandService: VideoCommandService,
  ) {}

  initiateUpload(dto: InitUploadDto, ownerId: string) {
    return this.commandService.initiateUpload(dto, ownerId);
  }

  create(
    dto: CreateVideoDto,
    ownerId: string,
    roles: string[],
  ): Promise<Video> {
    return this.commandService.create(dto, ownerId, roles);
  }

  findAll(
    category?: string,
    user?: AuthUser | null,
    page?: number,
    limit?: number,
    search?: string,
    sortBy?: string,
    sortOrder?: 'ASC' | 'DESC',
    ownerOnly?: boolean,
  ): Promise<{ data: Video[]; hasMore: boolean; total: number }> {
    return this.queryService.findAll(
      category,
      user,
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      ownerOnly,
    );
  }

  findOne(
    id: string,
    user?: AuthUser | null,
    shareToken?: string,
  ): Promise<Video> {
    return this.queryService.findOne(id, user, shareToken);
  }

  findByShareToken(shareToken: string): Promise<Video> {
    return this.queryService.findByShareToken(shareToken);
  }

  findVideoByChunkFileId(driveFileId: string): Promise<Video | null> {
    return this.queryService.findVideoByChunkFileId(driveFileId);
  }

  updateStatus(
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

  saveChunks(
    videoId: string,
    chunks: Array<{ filename: string; driveFileId: string; sequence: number }>,
  ): Promise<void> {
    return this.commandService.saveChunks(videoId, chunks);
  }

  getVideoQualities(videoId: string): Promise<string[]> {
    return this.queryService.getVideoQualities(videoId);
  }

  getChunksByQuality(videoId: string, quality: string): Promise<VideoChunk[]> {
    return this.queryService.getChunksByQuality(videoId, quality);
  }

  updateMetadata(
    id: string,
    requesterId: string,
    dto: UpdateVideoMetadataDto,
    roles: string[],
  ): Promise<Video> {
    return this.commandService.updateMetadata(id, requesterId, dto, roles);
  }

  getRelated(
    videoId: string,
    limit: number = 12,
    excludeIds: string[] = [],
    user?: AuthUser | null,
  ): Promise<{ data: Video[]; hasMore: boolean }> {
    return this.queryService.getRelated(videoId, limit, excludeIds, user);
  }

  remove(id: string, requesterId: string, roles: string[]): Promise<void> {
    return this.commandService.remove(id, requesterId, roles);
  }

  generateShareToken(
    videoId: string,
    requesterId: string,
  ): Promise<{ shareToken: string }> {
    return this.commandService.generateShareToken(videoId, requesterId);
  }

  revokeShareToken(videoId: string, requesterId: string): Promise<void> {
    return this.commandService.revokeShareToken(videoId, requesterId);
  }
}
