import { IsString, MinLength } from 'class-validator';

/** Mínimo de 2 caracteres (seção 39 da Fase 4) — evita varrer a base a cada tecla isolada. */
export class SearchQueryDto {
  @IsString()
  @MinLength(2)
  q!: string;
}
