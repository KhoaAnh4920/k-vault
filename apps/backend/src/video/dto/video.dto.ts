import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

  /** Whether the video is private (only owner can stream). Defaults to true. */
  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean;

  /** Base64 string of the selected thumbnail (optional) */
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
