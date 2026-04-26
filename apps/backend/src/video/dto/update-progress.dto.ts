import { IsNumber, Min } from 'class-validator';

export class UpdateProgressDto {
  /** Current playback position in seconds. */
  @IsNumber()
  @Min(0)
  progress: number;

  /** Total video duration in seconds (from Vidstack state). */
  @IsNumber()
  @Min(0)
  duration: number;
}
