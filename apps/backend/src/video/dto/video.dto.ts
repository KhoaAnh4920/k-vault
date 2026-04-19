import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { VideoVisibility } from '../entities/video.entity';

export class CreateVideoDto {
  @ApiProperty({ example: 'My Awesome Video' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'This video shows how to...' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'raw/12345_video.mp4' })
  @IsString()
  @IsNotEmpty()
  rawDriveFileId: string;

  @ApiPropertyOptional({ example: 'Education' })
  @IsString()
  @IsOptional()
  category?: string;

  /**
   * Admins may set any visibility. Members are always forced to PRIVATE server-side
   * regardless of what is sent here (business rule US2).
   */
  @ApiPropertyOptional({
    enum: VideoVisibility,
    default: VideoVisibility.PUBLIC,
  })
  @IsEnum(VideoVisibility)
  @IsOptional()
  visibility?: VideoVisibility;

  @ApiPropertyOptional({ description: 'Base64 encoded thumbnail image' })
  @IsString()
  @IsOptional()
  thumbnailBase64?: string;
}

export class UpdateVideoMetadataDto {
  @ApiPropertyOptional({ example: 'Updated Title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;

  /**
   * Members may only set PRIVATE or UNLISTED.
   * Admins may set any value. Enforced server-side in VideoCommandService.
   */
  @ApiPropertyOptional({ enum: VideoVisibility })
  @IsEnum(VideoVisibility)
  @IsOptional()
  visibility?: VideoVisibility;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  thumbnailDriveFileId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  thumbnailBase64?: string;
}

export class InitUploadDto {
  @ApiProperty({ example: 'vacation.mp4' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiPropertyOptional({ example: 'video/mp4' })
  @IsString()
  @IsOptional()
  mimeType?: string;
}
