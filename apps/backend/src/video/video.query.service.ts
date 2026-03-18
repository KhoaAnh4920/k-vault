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

  async findAll(category?: string, user?: AuthUser): Promise<Video[]> {
    const isAdmin = user?.roles.includes(Role.ADMIN) ?? false;
    return this.videoRepo.find({
      where: {
        ...(category ? { category } : {}),
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
        'views',
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
