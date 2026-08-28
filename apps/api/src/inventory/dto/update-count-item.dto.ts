import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateCountItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQuantity!: number;
}
