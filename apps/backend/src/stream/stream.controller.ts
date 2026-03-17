import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { StreamService } from './stream.service';

@Controller('stream')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  /**
   * GET /stream/:videoId/playlist
   * Returns the master HLS playlist for a video.
   */
  @Get(':videoId/playlist')
  async getPlaylist(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const playlist = await this.streamService.getRewrittenPlaylist(videoId);
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    });
    return new StreamableFile(Buffer.from(playlist, 'utf-8'));
  }

  /**
   * GET /stream/:videoId/:quality/playlist
   * Returns the variant playlist for a specific quality (e.g. 1080p, 480p, 320p).
   * Called by hls.js after parsing the master playlist.
   */
  @Get(':videoId/:quality/playlist')
  async getQualityPlaylist(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Param('quality') quality: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const playlist = await this.streamService.getQualityPlaylist(
      videoId,
      quality,
    );
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    });
    return new StreamableFile(Buffer.from(playlist, 'utf-8'));
  }

  /**
   * GET /stream/:videoId/thumbnail
   * Proxies the video thumbnail image from Google Drive.
   */
  @Get(':videoId/thumbnail')
  @HttpCode(HttpStatus.OK)
  async getThumbnail(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    try {
      const stream = await this.streamService.getThumbnailStream(videoId);
      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      });
      return new StreamableFile(stream);
    } catch (err) {
      if (err instanceof NotFoundException) {
        res.status(404).end();
        return;
      }
      throw err;
    }
  }

  /**
   * GET /stream/:videoId/qualities
   * Returns the list of available quality levels for a video (e.g. ['1080p','480p','320p']).
   */
  @Get(':videoId/qualities')
  getQualities(
    @Param('videoId', ParseUUIDPipe) videoId: string,
  ): Promise<string[]> {
    return this.streamService.getQualities(videoId);
  }

  /**
   * GET /stream/chunk/:fileId
   * Pipes a .ts chunk stream from Google Drive — zero RAM buffering.
   */
  @Get('chunk/:fileId')
  async getChunk(
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const stream = await this.streamService.getChunkStream(fileId);
    res.set({
      'Content-Type': 'video/MP2T',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    return new StreamableFile(stream);
  }
}
