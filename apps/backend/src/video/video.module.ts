import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { Video } from './entities/video.entity';
import { VideoChunk } from './entities/video-chunk.entity';
import { StorageModule } from '../storage/storage.module';
import { TRANSCODE_QUEUE } from '../queue/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, VideoChunk]),
    BullModule.registerQueue({ name: TRANSCODE_QUEUE }),
    StorageModule,
  ],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
