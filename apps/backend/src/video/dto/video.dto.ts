import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { VideoVisibility } from '../entities/video.entity';

export class CreateVideoDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  rawDriveFileId: string;

  @IsString()
  @IsOptional()
  category?: string;

  /** Whether the video is public or private. Defaults to 'public'. */
  @IsEnum(VideoVisibility)
  @IsOptional()
  visibility?: VideoVisibility;

  /** Base64 string of the selected thumbnail (optional) */
  @IsString()
  @IsOptional()
  thumbnailBase64?: string;
}

export class UpdateVideoMetadataDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(VideoVisibility)
  @IsOptional()
  visibility?: VideoVisibility;

  @IsString()
  @IsOptional()
  thumbnailDriveFileId?: string;

  @IsString()
  @IsOptional()
  thumbnailBase64?: string;
}

export class InitUploadDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsOptional()
  mimeType?: string;
}
