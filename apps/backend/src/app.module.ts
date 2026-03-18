import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { validate } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { VideoModule } from './video/video.module';
import { StreamModule } from './stream/stream.module';
import { Video } from './video/entities/video.entity';
import { VideoChunk } from './video/entities/video-chunk.entity';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    // Config — global, reads .env
    ConfigModule.forRoot({ isGlobal: true, validate }),

    // Database — Neon Postgres via TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        ssl: { rejectUnauthorized: false },
        entities: [Video, VideoChunk],
        //synchronize: config.get<string>('NODE_ENV') !== 'production',
        synchronize: true,
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
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
})
export class AppModule {}
