import { IsBoolean } from 'class-validator';

export class SetMercadoLivreAutoSyncDto {
  @IsBoolean()
  enabled!: boolean;
}
