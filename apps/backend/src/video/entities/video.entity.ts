import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VideoStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  ERROR = 'error',
}

export enum VideoVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: VideoStatus, default: VideoStatus.PROCESSING })
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

  /** Public videos are visible to all; Private videos only to owner/admin. */
  @Column({
    type: 'enum',
    enum: VideoVisibility,
    default: VideoVisibility.PUBLIC,
    name: 'visibility',
  })
  visibility: VideoVisibility;

  @OneToMany('VideoChunk', 'video', { cascade: false })
  chunks: unknown[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
