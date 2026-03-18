import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Video } from '../video/entities/video.entity';
import { VideoChunk } from '../video/entities/video-chunk.entity';

config(); // loads .env

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  entities: [Video, VideoChunk],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
