import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { Video } from './entities/video.entity';
import { VideoChunk } from './entities/video-chunk.entity';
import { StorageModule } from '../storage/storage.module';
import {
  TRANSCODE_QUEUE_LOCAL,
  TRANSCODE_QUEUE_PROD,
} from '../queue/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, VideoChunk]),
    // Register both queues so the module is aware of them regardless of env;
    // VideoService injects the correct one via TRANSCODE_QUEUE at runtime.
    BullModule.registerQueue(
      { name: TRANSCODE_QUEUE_LOCAL },
      { name: TRANSCODE_QUEUE_PROD },
    ),
    StorageModule,
  ],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
