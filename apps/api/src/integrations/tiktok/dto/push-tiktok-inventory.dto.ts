import { IsUUID } from 'class-validator';

export class PushTikTokInventoryDto {
  @IsUUID()
  variantId!: string;
}
