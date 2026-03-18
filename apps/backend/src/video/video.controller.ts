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
} from '@nestjs/common';
import { VideoService } from './video.service';
import { CreateVideoDto, InitUploadDto } from './dto/video.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/jwt.strategy';

@Controller('videos')
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

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
    @CurrentUser() user?: AuthUser,
  ) {
    return this.videoService.findAll(category, user);
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
