import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}
