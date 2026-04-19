import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable, fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VideoService } from './video.service';
import {
  CreateVideoDto,
  InitUploadDto,
  UpdateVideoMetadataDto,
} from './dto/video.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/jwt.strategy';

@ApiTags('Videos')
@ApiBearerAuth()
@Controller('videos')
export class VideoController {
  constructor(
    private readonly videoService: VideoService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Public / Guest-accessible endpoints (OptionalJwtAuthGuard) ─────────────

  /** SSE stream for real-time video status updates (WAITING → PROCESSING → READY) */
  @ApiOperation({ summary: 'Subscribe to video transcoding events (SSE)' })
  @UseGuards(OptionalJwtAuthGuard)
  @Sse('events')
  sse(): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'video.status_changed').pipe(
      map((payload) => ({ data: payload }) as MessageEvent),
    );
  }

  /**
   * List videos — filtered by the caller's role.
   * Guests receive PUBLIC only. Members receive PUBLIC + own. Admins receive PUBLIC + ROLE_RESTRICTED + own.
   */
  @ApiOperation({ summary: 'List videos with pagination and filters' })
  @ApiQuery({ name: 'shareToken', required: false })
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('ownerOnly') ownerOnly?: string,
    @CurrentUser() user?: AuthUser | null,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 12;
    let sortBy = 'createdAt';
    let sortOrder: 'ASC' | 'DESC' = 'DESC';
    if (sort === 'oldest') sortOrder = 'ASC';
    else if (sort === 'views') sortBy = 'views';

    return this.videoService.findAll(
      category,
      user,
      pageNum,
      limitNum,
      search,
      sortBy,
      sortOrder,
      ownerOnly === 'true',
    );
  }

  /** Get related videos for a specific video */
  @ApiOperation({ summary: 'Get related videos for a specific video' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'excludeIds', required: false })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/related')
  getRelated(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('excludeIds') excludeIds?: string,
    @CurrentUser() user?: AuthUser | null,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 12;
    const excludeIdsArr = excludeIds
      ? excludeIds.split(',').filter(Boolean)
      : [];
    return this.videoService.getRelated(id, limitNum, excludeIdsArr, user);
  }

  /** Get video details. UNLISTED videos require shareToken query param for non-owners. */
  @ApiOperation({ summary: 'Get details of a specific video' })
  @ApiQuery({
    name: 'shareToken',
    required: false,
    description: 'Required for UNLISTED videos',
  })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthUser | null,
    @Query('shareToken') shareToken?: string,
  ) {
    return this.videoService.findOne(id, user, shareToken);
  }

  // ─── Share link endpoints (owner only, no admin bypass) ─────────────────────

  /** Access a video by its share token (for UNLISTED videos) */
  @ApiOperation({ summary: 'Access an unlisted video via share link' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get('shared/:shareToken')
  getByShareToken(@Param('shareToken') shareToken: string) {
    return this.videoService.findByShareToken(shareToken);
  }

  /** Generate a shareable link for a PRIVATE video (converts it to UNLISTED) */
  @ApiOperation({ summary: 'Generate a share token (sets video to Unlisted)' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/share')
  @HttpCode(HttpStatus.OK)
  generateShareToken(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.videoService.generateShareToken(id, user.userId);
  }

  /** Revoke the shareable link (reverts video back to PRIVATE) */
  @ApiOperation({ summary: 'Revoke share token (resets video to Private)' })
  @UseGuards(JwtAuthGuard)
  @Delete(':id/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeShareToken(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.videoService.revokeShareToken(id, user.userId);
  }

  // ─── Authenticated endpoints (JwtAuthGuard required) ────────────────────────

  /**
   * Step 1: Initiate a resumable upload.
   * Allowed for Admin and Member roles.
   */
  @ApiOperation({ summary: 'Initiate a new video upload' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MEMBER)
  @Post('upload-init')
  @HttpCode(HttpStatus.OK)
  initiateUpload(@Body() dto: InitUploadDto, @CurrentUser() user: AuthUser) {
    return this.videoService.initiateUpload(dto, user.userId);
  }

  /**
   * Step 2: Register the uploaded video and enqueue transcoding.
   * Member uploads are forced to PRIVATE by the command service (US2).
   */
  @ApiOperation({ summary: 'Register the uploaded video and start processing' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MEMBER)
  @Post()
  create(@Body() dto: CreateVideoDto, @CurrentUser() user: AuthUser) {
    return this.videoService.create(dto, user.userId, user.roles);
  }

  /**
   * Update video metadata.
   * Members may only set visibility to PRIVATE or UNLISTED.
   */
  @ApiOperation({ summary: 'Update video metadata' })
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVideoMetadataDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.videoService.updateMetadata(id, user.userId, dto, user.roles);
  }

  /**
   * Delete a video.
   * Admin can delete non-private videos. Members can only delete their own.
   * Admin CANNOT delete another user's PRIVATE video (BR2).
   */
  @ApiOperation({ summary: 'Delete a video and all its files' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MEMBER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.videoService.remove(id, user.userId, user.roles);
  }
}
