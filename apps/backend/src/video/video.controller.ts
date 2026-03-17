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
} from '@nestjs/common';
import { VideoService } from './video.service';
import { CreateVideoDto, InitUploadDto } from './dto/video.dto';

@Controller('videos')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  /** Step 1: Client requests a resumable upload URL from Google Drive */
  @Post('upload-init')
  @HttpCode(HttpStatus.OK)
  initiateUpload(@Body() dto: InitUploadDto) {
    return this.videoService.initiateUpload(dto);
  }

  /** Step 2: After upload completes, register the video and enqueue transcoding */
  @Post()
  create(@Body() dto: CreateVideoDto) {
    return this.videoService.create(dto);
  }

  @Get()
  findAll() {
    return this.videoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.videoService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.videoService.remove(id);
  }
}
