import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/jwt.strategy';
import type { AuthUser } from '../auth/jwt.strategy';
import { WatchHistoryService } from './watch-history.service';
import { UpdateProgressDto } from './dto/update-progress.dto';

@ApiTags('Watch History')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('watch-history')
export class WatchHistoryController {
  constructor(private readonly watchHistoryService: WatchHistoryService) {}

  /**
   * UPSERT progress for a video.
   * Called by GlobalPlayer on a 30-second debounce and on unmount (keepalive fetch).
   */
  @ApiOperation({ summary: 'Save or update watch progress for a video' })
  @Put(':videoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  upsertProgress(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.watchHistoryService.upsertProgress(user.userId, videoId, dto);
  }

  /**
   * Get the "Continue Watching" list, sorted by recency.
   * Excludes completed (≥95%) and non-ready videos.
   */
  @ApiOperation({ summary: 'Get Continue Watching list for the current user' })
  @ApiQuery({ name: 'limit', required: false })
  @Get()
  getContinueWatching(
    @CurrentUser() user: AuthUser,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.watchHistoryService.getContinueWatching(user.userId, limit);
  }

  /**
   * Get saved progress for a single video (for auto-resume on the watch page).
   * Returns null if no history exists.
   */
  @ApiOperation({ summary: 'Get saved progress for a specific video' })
  @Get(':videoId')
  getProgress(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.watchHistoryService.getProgress(user.userId, videoId);
  }

  /**
   * Remove a history entry so it no longer appears in Continue Watching.
   */
  @ApiOperation({ summary: 'Remove a video from watch history' })
  @Delete(':videoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEntry(
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.watchHistoryService.deleteEntry(user.userId, videoId);
  }
}
