import { IsDefined, IsOptional, IsUUID, ValidateIf } from 'class-validator';

/** Exatamente um dos dois deve ser informado — associar a um pedido OU a uma devolução. */
export class AssociateFiscalDocumentDto {
  @ValidateIf((dto) => !dto.returnId)
  @IsDefined({ message: 'Informe orderId ou returnId' })
  @IsUUID()
  orderId?: string;

  @ValidateIf((dto) => !dto.orderId)
  @IsOptional()
  @IsUUID()
  returnId?: string;
}
