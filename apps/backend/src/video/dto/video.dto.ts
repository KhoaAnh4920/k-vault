import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { VideoVisibility } from '../entities/video.entity';

export class CreateVideoDto {
  @ApiProperty({ description: 'The title of the video', example: 'My Awesome Video' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'A description of the video', example: 'This video shows how to...' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'The raw file ID stored in S3/Drive', example: 'raw/12345_video.mp4' })
  @IsString()
  @IsNotEmpty()
  rawDriveFileId: string;

  @ApiPropertyOptional({ description: 'Category of the video', example: 'Education' })
  @IsString()
  @IsOptional()
  category?: string;

  /** Whether the video is public or private. Defaults to 'public'. */
  @ApiPropertyOptional({ enum: VideoVisibility, description: 'Visibility of the video', default: VideoVisibility.PUBLIC })
  @IsEnum(VideoVisibility)
  @IsOptional()
  visibility?: VideoVisibility;

  /** Base64 string of the selected thumbnail (optional) */
  @ApiPropertyOptional({ description: 'Base64 encoded thumbnail image' })
  @IsString()
  @IsOptional()
  thumbnailBase64?: string;
}

export class UpdateVideoMetadataDto {
  @ApiPropertyOptional({ description: 'Update the title of the video', example: 'Updated Title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Update the description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Update the category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: VideoVisibility })
  @IsEnum(VideoVisibility)
  @IsOptional()
  visibility?: VideoVisibility;

  @ApiPropertyOptional({ description: 'Update the thumbnail Drive/S3 file ID' })
  @IsString()
  @IsOptional()
  thumbnailDriveFileId?: string;

  @ApiPropertyOptional({ description: 'Upload a new base64 thumbnail' })
  @IsString()
  @IsOptional()
  thumbnailBase64?: string;
}

export class InitUploadDto {
  @ApiProperty({ description: 'The original name of the file being uploaded', example: 'vacation.mp4' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiPropertyOptional({ description: 'MIME type of the video', example: 'video/mp4' })
  @IsString()
  @IsOptional()
  mimeType?: string;
}
