import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CreateVideoDto, InitUploadDto } from './dto/video.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/jwt.strategy';

@Controller('videos')
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(
    private readonly videoService: VideoService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Sse('events')
  sse(): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'video.status_changed').pipe(
      map((payload) => {
        return { data: payload } as MessageEvent;
      }),
    );
  }

  /** Step 1: Admin requests a resumable upload URL from Google Drive */
  @Post('upload-init')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  initiateUpload(@Body() dto: InitUploadDto, @CurrentUser() user: AuthUser) {
    return this.videoService.initiateUpload(dto, user.userId);
  }

  /** Step 2: After upload completes, register the video and enqueue transcoding */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateVideoDto, @CurrentUser() user: AuthUser) {
    return this.videoService.create(dto, user.userId);
  }

  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 12;
    
    let sortBy = 'createdAt';
    let sortOrder: 'ASC' | 'DESC' = 'DESC';
    if (sort === 'oldest') {
      sortBy = 'createdAt';
      sortOrder = 'ASC';
    } else if (sort === 'views') {
      sortBy = 'views';
      sortOrder = 'DESC';
    }

    return this.videoService.findAll(
      category,
      user,
      pageNum,
      limitNum,
      search,
      sortBy,
      sortOrder
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.videoService.findOne(id, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.videoService.remove(id);
  }
}
