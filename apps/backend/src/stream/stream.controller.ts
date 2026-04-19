import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { StreamService } from './stream.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/jwt.strategy';

@ApiTags('Stream')
@ApiBearerAuth()
@Controller('stream')
@UseGuards(OptionalJwtAuthGuard)
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  /**
   * GET /stream/:videoId/playlist
   * Returns the master HLS playlist.
   * shareToken required for UNLISTED videos accessed by non-owners.
   */
  @ApiOperation({ summary: 'Get Master HLS Playlist for video playback' })
  @ApiQuery({ name: 'shareToken', required: false })
  @Get(':videoId/playlist')
  async getPlaylist(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser | null,
    @Query('shareToken') shareToken?: string,
  ): Promise<StreamableFile> {
    const playlist = await this.streamService.getRewrittenPlaylist(
      videoId,
      user,
      shareToken,
    );
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    });
    return new StreamableFile(Buffer.from(playlist, 'utf-8'));
  }

  /**
   * GET /stream/:videoId/:quality/playlist
   * Returns the variant playlist for a specific quality.
   */
  @ApiOperation({ summary: 'Get quality-specific variant playlist' })
  @ApiQuery({ name: 'shareToken', required: false })
  @Get(':videoId/:quality/playlist')
  async getQualityPlaylist(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Param('quality') quality: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser | null,
    @Query('shareToken') shareToken?: string,
  ): Promise<StreamableFile> {
    const playlist = await this.streamService.getQualityPlaylist(
      videoId,
      quality,
      user,
      shareToken,
    );
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    });
    return new StreamableFile(Buffer.from(playlist, 'utf-8'));
  }

  /**
   * GET /stream/:videoId/thumbnail
   * Proxies the video thumbnail image.
   */
  @ApiOperation({ summary: 'Stream video thumbnail image' })
  @ApiQuery({ name: 'shareToken', required: false })
  @Get(':videoId/thumbnail')
  @HttpCode(HttpStatus.OK)
  async getThumbnail(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser | null,
    @Query('shareToken') shareToken?: string,
  ): Promise<StreamableFile | void> {
    try {
      const stream = await this.streamService.getThumbnailStream(
        videoId,
        user,
        shareToken,
      );
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
   * Returns the list of available quality levels.
   */
  @ApiOperation({ summary: 'Get available video quality tiers' })
  @ApiQuery({ name: 'shareToken', required: false })
  @Get(':videoId/qualities')
  getQualities(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @CurrentUser() user: AuthUser | null,
    @Query('shareToken') shareToken?: string,
  ): Promise<string[]> {
    return this.streamService.getQualities(videoId, user, shareToken);
  }

  /**
   * GET /stream/chunk/:fileId
   * Pipes a .ts chunk from storage.
   * No shareToken needed — chunk fileIds are unguessable; gate is at playlist level.
   */
  @ApiOperation({ summary: 'Stream a raw .ts video chunk' })
  @Get('chunk/:fileId')
  async getChunk(
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser | null,
  ): Promise<StreamableFile> {
    const stream = await this.streamService.getChunkStream(fileId, user);
    res.set({
      'Content-Type': 'video/MP2T',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    return new StreamableFile(stream);
  }
}
