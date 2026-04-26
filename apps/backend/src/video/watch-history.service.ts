import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WatchHistory } from './entities/watch-history.entity';
import { UpdateProgressDto } from './dto/update-progress.dto';

/** Threshold above which a video is considered "completed" and excluded from Continue Watching. */
const COMPLETION_THRESHOLD = 0.95;

@Injectable()
export class WatchHistoryService {
  private readonly logger = new Logger(WatchHistoryService.name);

  constructor(
    @InjectRepository(WatchHistory)
    private readonly historyRepo: Repository<WatchHistory>,
  ) {}

  /**
   * UPSERT watch progress for a (userId, videoId) pair.
   * Uses a single INSERT … ON CONFLICT DO UPDATE — no read-before-write.
   */
  async upsertProgress(
    userId: string,
    videoId: string,
    dto: UpdateProgressDto,
  ): Promise<void> {
    await this.historyRepo
      .createQueryBuilder()
      .insert()
      .into(WatchHistory)
      .values({
        userId,
        videoId,
        progress: dto.progress,
        duration: dto.duration,
      })
      .orUpdate(['progress', 'duration', 'last_watched_at'], ['user_id', 'video_id'])
      .execute();

    this.logger.debug(
      `Upserted progress for user=${userId} video=${videoId} @ ${dto.progress}s`,
    );
  }

  /**
   * Returns the "Continue Watching" list for a user — sorted by recency,
   * excluding completed (≥95%) and non-ready videos.
   */
  async getContinueWatching(userId: string, limit: number): Promise<WatchHistory[]> {
    const rows = await this.historyRepo.find({
      where: { userId },
      relations: ['video'],
      order: { lastWatchedAt: 'DESC' },
      // Fetch more than needed so we can filter completed ones client-side
      take: limit * 2,
    });

    return rows
      .filter((r) => {
        // Exclude completed videos
        if (r.duration > 0 && r.progress / r.duration >= COMPLETION_THRESHOLD) {
          return false;
        }
        // Exclude non-ready videos (e.g. still processing or error)
        if (r.video?.status !== 'ready') return false;
        return true;
      })
      .slice(0, limit);
  }

  /**
   * Returns the saved progress for a single (userId, videoId) pair.
   * Returns null if no history exists (fresh play).
   */
  async getProgress(
    userId: string,
    videoId: string,
  ): Promise<{ progress: number; duration: number } | null> {
    const entry = await this.historyRepo.findOne({
      where: { userId, videoId },
      select: ['progress', 'duration'],
    });
    return entry ? { progress: entry.progress, duration: entry.duration } : null;
  }

  /** Hard-deletes a history entry so it no longer appears in Continue Watching. */
  async deleteEntry(userId: string, videoId: string): Promise<void> {
    const result = await this.historyRepo.delete({ userId, videoId });
    if (result.affected === 0) {
      throw new NotFoundException(`No history entry for video ${videoId}`);
    }
  }
}
