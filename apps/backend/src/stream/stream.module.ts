import { Module } from '@nestjs/common';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { StorageModule } from '../storage/storage.module';
import { VideoModule } from '../video/video.module';

@Module({
  imports: [StorageModule, VideoModule],
  controllers: [StreamController],
  providers: [StreamService],
})
export class StreamModule {}
