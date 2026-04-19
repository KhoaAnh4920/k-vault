import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VideoStatus {
  /** Job is queued but another job is currently being processed (BR3). */
  WAITING = 'waiting',
  PROCESSING = 'processing',
  READY = 'ready',
  ERROR = 'error',
}

export enum VideoVisibility {
  /** Visible to all users including unauthenticated guests. */
  PUBLIC = 'public',
  /** Visible only to the owner. Admin cannot view (BR2). */
  PRIVATE = 'private',
  /** Visible to anyone who has the secret shareToken link (US3). */
  UNLISTED = 'unlisted',
  /** Visible only to Admin role — for system/admin-only content (US1). */
  ROLE_RESTRICTED = 'role_restricted',
}

@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: VideoStatus, default: VideoStatus.WAITING })
  status: VideoStatus;

  @Column({ type: 'varchar', nullable: true, name: 'raw_drive_file_id' })
  rawDriveFileId: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'hls_folder_drive_id' })
  hlsFolderDriveId: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'thumbnail_drive_file_id' })
  thumbnailDriveFileId: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'category' })
  category: string | null;

  @Column({ type: 'int', nullable: true, name: 'source_height' })
  sourceHeight: number | null;

  @Column({ type: 'bigint', nullable: true, name: 'duration_seconds' })
  durationSeconds: number | null;

  @Column({ type: 'int', default: 0 })
  views: number;

  /** Auth0 `sub` claim of the user who uploaded the video. */
  @Column({ type: 'varchar', nullable: true, name: 'owner_id' })
  ownerId: string | null;

  @Column({
    type: 'enum',
    enum: VideoVisibility,
    default: VideoVisibility.PUBLIC,
    name: 'visibility',
  })
  visibility: VideoVisibility;

  /**
   * Cryptographic token for Unlisted share links (US3).
   * Only populated when visibility = UNLISTED.
   * Format: 64-char hex string from crypto.randomBytes(32).
   */
  @Index({ unique: true, sparse: true })
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'share_token' })
  shareToken: string | null;

  @OneToMany('VideoChunk', 'video', { cascade: false })
  chunks: unknown[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
