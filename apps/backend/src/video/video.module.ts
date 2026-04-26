import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { VideoQueryService } from './video.query.service';
import { VideoCommandService } from './video.command.service';
import { VideoEventListener } from './video.event-listener';
import { WatchHistoryService } from './watch-history.service';
import { WatchHistoryController } from './watch-history.controller';
import { Video } from './entities/video.entity';
import { VideoChunk } from './entities/video-chunk.entity';
import { WatchHistory } from './entities/watch-history.entity';
import { StorageModule } from '../storage/storage.module';
import { RedisProvider } from '../config/redis.provider';
import {
  TRANSCODE_QUEUE_LOCAL,
  TRANSCODE_QUEUE_PROD,
} from '../queue/queue.constants';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Video, VideoChunk, WatchHistory]),
    // Register both queues so the module is aware of them regardless of env;
    // VideoService injects the correct one via TRANSCODE_QUEUE at runtime.
    BullModule.registerQueue(
      { name: TRANSCODE_QUEUE_LOCAL },
      { name: TRANSCODE_QUEUE_PROD },
    ),
    StorageModule,
  ],
  controllers: [VideoController, WatchHistoryController],
  providers: [
    VideoService,
    VideoQueryService,
    VideoCommandService,
    VideoEventListener,
    WatchHistoryService,
    RedisProvider,
  ],
  exports: [VideoService, WatchHistoryService],
})
export class VideoModule {}
