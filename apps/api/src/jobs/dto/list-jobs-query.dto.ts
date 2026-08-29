import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/** Vocabulário real de `SyncJob.status` (Fase 3) — nunca WAITING/ACTIVE/DELAYED inventados, o
 * painel de jobs reaproveita o modelo existente sem mudança de schema (seção 49 da Fase 4). */
const JOB_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'];

export class ListJobsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
