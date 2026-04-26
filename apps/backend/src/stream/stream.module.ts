import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { StorageModule } from '../storage/storage.module';
import { VideoModule } from '../video/video.module';
import { RedisProvider } from '../config/redis.provider';

@Module({
  imports: [ConfigModule, StorageModule, VideoModule],
  controllers: [StreamController],
  providers: [StreamService, RedisProvider],
})
export class StreamModule {}

