import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { VideoCommandService } from './video.command.service';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../config/redis.provider';

@Injectable()
export class VideoEventListener implements OnModuleInit {
  private readonly logger = new Logger(VideoEventListener.name);

  constructor(
    private readonly commandService: VideoCommandService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  onModuleInit() {
    // Subscribe to the Redis Pub/Sub channel for cross-process status change events
    // (worker → backend). We need a dedicated subscriber connection for this —
    // a subscribed client cannot be used for regular commands.
    this.redis.duplicate().subscribe('video.status_changed', (err, count) => {
      if (err) {
        this.logger.error('Failed to subscribe: ' + err.message);
      } else {
        this.logger.log(`Subscribed to Redis channel video.status_changed (${count} channels)`);
      }
    });

    this.redis.duplicate().on('message', (channel, message) => {
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

