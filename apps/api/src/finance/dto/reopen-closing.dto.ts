import { IsString, MinLength } from 'class-validator';

export class ReopenClosingDto {
  @IsString()
  @MinLength(3, { message: 'Informe o motivo da reabertura do período' })
  reason!: string;
}
