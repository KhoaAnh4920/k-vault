import {
  Controller,
  Get,
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
   * Returns the HLS .m3u8 playlist with chunk URLs rewritten to point to this proxy.
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
   * GET /stream/chunk/:fileId
   * Pipes a .ts chunk stream from Google Drive to the client.
   * No RAM buffering — pure piping.
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
