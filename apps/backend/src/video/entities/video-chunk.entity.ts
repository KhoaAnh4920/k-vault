import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('video_chunks')
@Index(['videoId', 'sequence'])
export class VideoChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'video_id' })
  videoId: string;

  @ManyToOne('Video', 'chunks', { onDelete: 'CASCADE' })
  video: unknown;

  /** e.g. "segment000.ts" */
  @Column({ type: 'varchar', length: 255 })
  filename: string;

  /** Google Drive file ID for this .ts chunk */
  @Column({ type: 'varchar', length: 255, name: 'drive_file_id' })
  driveFileId: string;

  /** Order of the chunk in the playlist (0-based) */
  @Column({ type: 'int' })
  sequence: number;

  /** Quality level e.g. 'HD', 'SD' */
  @Column({ type: 'varchar', length: 10, nullable: true, name: 'quality' })
  quality: string | null;

  /** Actual segment duration in seconds as declared by FFmpeg (#EXTINF value) */
  @Column({ type: 'float', nullable: true, name: 'duration_seconds' })
  durationSeconds: number | null;
}
