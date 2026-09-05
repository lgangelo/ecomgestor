import { IsUUID } from 'class-validator';

export class PushMercadoLivreInventoryDto {
  @IsUUID()
  variantId!: string;
}
