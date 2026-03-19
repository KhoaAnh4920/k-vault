import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Video } from './entities/video.entity';
import { VideoChunk } from './entities/video-chunk.entity';
import type { AuthUser } from '../auth/jwt.strategy';
import { Role } from '../auth/roles.decorator';

@Injectable()
export class VideoQueryService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,

    @InjectRepository(VideoChunk)
    private readonly chunkRepo: Repository<VideoChunk>,
  ) {}

  async findAll(
    category?: string,
    user?: AuthUser,
    page: number = 1,
    limit: number = 12,
    search?: string,
    sortBy: string = 'createdAt',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<{ data: Video[]; hasMore: boolean; total: number }> {
    const isAdmin = user?.roles.includes(Role.ADMIN) ?? false;
    const qb = this.videoRepo.createQueryBuilder('v');

    if (category) {
      qb.andWhere('v.category = :category', { category });
    }
    if (!isAdmin) {
      qb.andWhere('v.isPrivate = :isPrivate', { isPrivate: false });
    }
    if (search) {
      qb.andWhere('v.title ILIKE :search', { search: `%${search}%` });
    }

    const orderColumn = sortBy === 'views' ? 'v.views' : 'v.createdAt';
    qb.orderBy(orderColumn, sortOrder);

    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    qb.select([
      'v.id',
      'v.title',
      'v.description',
      'v.status',
      'v.category',
      'v.durationSeconds',
      'v.views',
      'v.createdAt',
      'v.updatedAt',
      'v.isPrivate',
      'v.thumbnailDriveFileId'
    ]);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      hasMore: skip + data.length < total,
    };
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

  async findVideoByChunkFileId(driveFileId: string): Promise<Video | null> {
    const chunk = await this.chunkRepo.findOne({ where: { driveFileId } });
    if (!chunk) return null;
    return this.videoRepo.findOne({ where: { id: chunk.videoId } });
  }

  async getVideoQualities(videoId: string): Promise<string[]> {
    const rows = await this.chunkRepo
      .createQueryBuilder('c')
      .select('DISTINCT c.quality', 'quality')
      .where('c.videoId = :videoId AND c.quality IS NOT NULL', { videoId })
      .getRawMany<{ quality: string }>();
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
}
