import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { validate } from './config/env.validation';
import { RedisProvider } from './config/redis.provider';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { VideoModule } from './video/video.module';
import { StreamModule } from './stream/stream.module';
import { Video } from './video/entities/video.entity';
import { VideoChunk } from './video/entities/video-chunk.entity';
import { WatchHistory } from './video/entities/watch-history.entity';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    // Config — global, reads .env
    ConfigModule.forRoot({ isGlobal: true, validate }),

    // Database — Neon Postgres via TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const dbUrl = config.get<string>('DATABASE_URL') || '';
        const isLocal =
          dbUrl.includes('localhost') || dbUrl.includes('100.70.');

        return {
          type: 'postgres',
          url: dbUrl,
          ssl:
            config.get<string>('NODE_ENV') === 'production' && !isLocal
              ? { rejectUnauthorized: false }
              : false,
          entities: [Video, VideoChunk, WatchHistory],
          synchronize: true,
          logging: config.get<string>('NODE_ENV') === 'development',
        };
      },
      inject: [ConfigService],
    }),

    // Message Queue — Upstash Redis via BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const redisUrl =
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        return {
          connection: {
            url: redisUrl,
          },
        };
      },
      inject: [ConfigService],
    }),

    // Events
    EventEmitterModule.forRoot(),

    // Feature Modules
    AuthModule,
    StorageModule,
    VideoModule,
    StreamModule,
  ],
  providers: [RedisProvider],
})
export class AppModule {}
