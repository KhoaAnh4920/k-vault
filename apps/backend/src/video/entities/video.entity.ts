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

  @Column({ type: 'varchar', nullable: true, name: 'playlist_drive_file_id' })
  playlistDriveFileId: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'hls_folder_drive_id' })
  hlsFolderDriveId: string | null;

  @Column({ type: 'bigint', nullable: true, name: 'duration_seconds' })
  durationSeconds: number | null;

  @OneToMany('VideoChunk', 'video', { cascade: false })
  chunks: unknown[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
