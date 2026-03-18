import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { VideoCommandService } from './video.command.service';

@Injectable()
export class VideoEventListener {
  private readonly logger = new Logger(VideoEventListener.name);

  constructor(private readonly commandService: VideoCommandService) {}

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
