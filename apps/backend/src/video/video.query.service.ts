import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Video, VideoVisibility } from './entities/video.entity';
import { VideoChunk } from './entities/video-chunk.entity';
import type { AuthUser } from '../auth/jwt.strategy';
import { Role } from '../auth/roles.decorator';

@Injectable()
export class VideoQueryService {
  private readonly logger = new Logger(VideoQueryService.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
    @InjectRepository(VideoChunk)
    private readonly chunkRepo: Repository<VideoChunk>,
  ) {}

  async findAll(
    category?: string,
    user?: AuthUser | null,
    page: number = 1,
    limit: number = 12,
    search?: string,
    sortBy: string = 'createdAt',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    ownerOnly?: boolean,
  ): Promise<{ data: Video[]; hasMore: boolean; total: number }> {
    const isAdmin = user?.roles.includes(Role.ADMIN) ?? false;
    const isMember = user?.roles.includes(Role.MEMBER) ?? false;
    const currentUserId = user?.userId ?? 'none';

    const qb = this.videoRepo.createQueryBuilder('v');

    if (category) {
      qb.andWhere('v.category = :category', { category });
    }

    /**
     * ownerOnly mode — "My Videos" tab.
     * When true and user is authenticated, skip the visibility matrix entirely
     * and show ONLY the caller's own uploads (all visibilities).
     * Guests cannot use ownerOnly (no userId to filter on).
     */
    if (ownerOnly && user) {
      qb.andWhere('v.ownerId = :userId', { userId: currentUserId });
    } else if (isAdmin) {
      // Admin sees: PUBLIC + ROLE_RESTRICTED + own uploads (any visibility)
      // Admin does NOT see other users' PRIVATE or UNLISTED in the library
      qb.andWhere(
        new Brackets((hb) => {
          hb.where('v.visibility IN (:...adminVisible)', {
            adminVisible: [
              VideoVisibility.PUBLIC,
              VideoVisibility.ROLE_RESTRICTED,
            ],
          }).orWhere('v.ownerId = :userId', { userId: currentUserId });
        }),
      );
    } else if (isMember) {
      // Member sees: PUBLIC + own uploads (any visibility incl. PRIVATE/UNLISTED)
      qb.andWhere(
        new Brackets((hb) => {
          hb.where('v.visibility = :public', {
            public: VideoVisibility.PUBLIC,
          }).orWhere('v.ownerId = :userId', { userId: currentUserId });
        }),
      );
    } else {
      // Guest: PUBLIC only
      qb.andWhere('v.visibility = :public', { public: VideoVisibility.PUBLIC });
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
      'v.ownerId',
      'v.createdAt',
      'v.updatedAt',
      'v.visibility',
      'v.thumbnailDriveFileId',
    ]);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, hasMore: skip + data.length < total };
  }

  /**
   * Find a single video and enforce the full visibility access matrix.
   *
   * Access Matrix:
   * - PUBLIC:          anyone
   * - PRIVATE:         owner ONLY — Admin is explicitly FORBIDDEN (BR2)
   * - UNLISTED:        owner + Admin OR caller provides the correct shareToken
   * - ROLE_RESTRICTED: Admin only
   */
  async findOne(
    id: string,
    user?: AuthUser | null,
    shareToken?: string,
  ): Promise<Video> {
    const video = await this.videoRepo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Video ${id} not found`);

    const isAdmin = user?.roles.includes(Role.ADMIN) ?? false;
    const isOwner = !!user?.userId && video.ownerId === user.userId;

    switch (video.visibility) {
      case VideoVisibility.PUBLIC:
        // Anyone may access
        break;

      case VideoVisibility.PRIVATE:
        // STRICTLY owner only — Admin cannot access (BR2 — absolute prohibition)
        if (!isOwner) {
          throw new ForbiddenException(`Access denied to video ${id}`);
        }
        break;

      case VideoVisibility.UNLISTED:
        // Owner and Admin can access directly.
        // Everyone else needs the correct shareToken.
        if (!isOwner && !isAdmin) {
          if (!shareToken || shareToken !== video.shareToken) {
            throw new ForbiddenException(`Access denied to video ${id}`);
          }
        }
        break;

      case VideoVisibility.ROLE_RESTRICTED:
        // Admin only
        if (!isAdmin) {
          throw new ForbiddenException(`Access denied to video ${id}`);
        }
        break;
    }

    return video;
  }

  /** Find a video by its share token. Only works for UNLISTED videos. */
  async findByShareToken(shareToken: string): Promise<Video> {
    const video = await this.videoRepo.findOne({
      where: { shareToken, visibility: VideoVisibility.UNLISTED },
    });
    if (!video) {
      throw new NotFoundException('Share link is invalid or has been revoked');
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

    const priority: Record<string, number> = { HD: 2, SD: 1 };
    return rows
      .map((r) => r.quality)
      .sort((a, b) => (priority[b] || 0) - (priority[a] || 0));
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

  async getRelated(
    videoId: string,
    limit: number = 12,
    excludeIds: string[] = [],
    user?: AuthUser | null,
  ): Promise<{ data: Video[]; hasMore: boolean }> {
    const baseVideo = await this.findOne(videoId, user);

    const isAdmin = user?.roles.includes(Role.ADMIN) ?? false;
    const isMember = user?.roles.includes(Role.MEMBER) ?? false;
    const currentUserId = user?.userId ?? 'none';

    const qb = this.videoRepo.createQueryBuilder('v');
    qb.where('v.id != :videoId', { videoId });
    qb.andWhere("v.status = 'ready'");

    if (excludeIds.length > 0) {
      qb.andWhere('v.id NOT IN (:...excludeIds)', { excludeIds });
    }

    // Same access matrix as findAll
    if (isAdmin) {
      qb.andWhere(
        new Brackets((hb) => {
          hb.where('v.visibility IN (:...adminVisible)', {
            adminVisible: [
              VideoVisibility.PUBLIC,
              VideoVisibility.ROLE_RESTRICTED,
            ],
          }).orWhere('v.ownerId = :userId', { userId: currentUserId });
        }),
      );
    } else if (isMember) {
      qb.andWhere(
        new Brackets((hb) => {
          hb.where('v.visibility = :public', {
            public: VideoVisibility.PUBLIC,
          }).orWhere('v.ownerId = :userId', { userId: currentUserId });
        }),
      );
    } else {
      qb.andWhere('v.visibility = :public', { public: VideoVisibility.PUBLIC });
    }

    if (baseVideo.category) {
      qb.addSelect(
        `CASE WHEN v.category = :category THEN 1 ELSE 0 END`,
        'category_score',
      );
      qb.setParameter('category', baseVideo.category);
      qb.orderBy('category_score', 'DESC');
    }

    qb.addOrderBy('RANDOM()');
    qb.take(limit + 1);

    const result = await qb.getMany();
    return { data: result.slice(0, limit), hasMore: result.length > limit };
  }
}
