import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Video } from '../video/entities/video.entity';
import { VideoChunk } from '../video/entities/video-chunk.entity';

config(); // loads .env

const dbUrl = process.env.DATABASE_URL || '';
const isLocal = dbUrl.includes('localhost') || dbUrl.includes('100.70.') || dbUrl.includes('127.0.0.1') || dbUrl.includes('postgres-db');
const isProduction = process.env.NODE_ENV === 'production';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: dbUrl,
  ssl: isProduction && !isLocal ? { rejectUnauthorized: false } : false,
  entities: [Video, VideoChunk],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
