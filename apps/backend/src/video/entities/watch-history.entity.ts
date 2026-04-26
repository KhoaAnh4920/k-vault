import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Video } from './video.entity';

/**
 * Persists per-user watch progress for resume playback and the
 * "Continue Watching" feature. One row per (userId, videoId) pair —
 * enforced by the composite unique constraint which also powers the
 * single-roundtrip INSERT … ON CONFLICT DO UPDATE upsert.
 */
@Entity('watch_history')
@Unique(['userId', 'videoId'])
@Index(['userId', 'lastWatchedAt'])
export class WatchHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Auth0 `sub` claim of the viewer. */
  @Column({ type: 'varchar', name: 'user_id' })
  userId: string;

  @Column({ type: 'uuid', name: 'video_id' })
  videoId: string;

  @ManyToOne(() => Video, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'video_id' })
  video: Video;

  /** Current playback position in seconds. */
  @Column({ type: 'float', default: 0 })
  progress: number;

  /** Total video duration in seconds as reported by Vidstack. */
  @Column({ type: 'float', default: 0 })
  duration: number;

  /**
   * Auto-updated by TypeORM on every upsert — no application code needed.
   * Used to sort the "Continue Watching" list by recency.
   */
  @UpdateDateColumn({ name: 'last_watched_at' })
  lastWatchedAt: Date;
}
