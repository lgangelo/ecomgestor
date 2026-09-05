import { IsBoolean } from 'class-validator';

export class SetTikTokAutoSyncDto {
  @IsBoolean()
  enabled!: boolean;
}
