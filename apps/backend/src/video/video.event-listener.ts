import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { VideoCommandService } from './video.command.service';
import Redis from 'ioredis';

@Injectable()
export class VideoEventListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoEventListener.name);
  private subscriber: Redis;

  constructor(
    private readonly commandService: VideoCommandService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.subscriber = new Redis(redisUrl, {
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    });

    this.subscriber.subscribe('video.status_changed', (err, count) => {
      if (err) {
        this.logger.error('Failed to subscribe: ' + err.message);
      } else {
        this.logger.log(`Subscribed to Redis channel video.status_changed`);
      }
    });

    this.subscriber.on('message', (channel, message) => {
      if (channel === 'video.status_changed') {
        try {
          const payload = JSON.parse(message);
          this.eventEmitter.emit('video.status_changed', payload);
        } catch (e) {
          this.logger.error('Failed to parse SSE payload', e);
        }
      }
    });
  }

  onModuleDestroy() {
    this.subscriber?.disconnect();
  }

  @OnEvent('video.viewed', { async: true })
  async handleVideoViewed(payload: { videoId: string }) {
    try {
      await this.commandService.incrementViews(payload.videoId);
      this.logger.debug(`Incremented views for video ${payload.videoId}`);
    } catch (err) {
      this.logger.error(`Failed to increment views: ${(err as Error).message}`);
    }
  }
}
