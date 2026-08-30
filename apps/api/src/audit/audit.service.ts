import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { sanitizeForLog } from '../common/logger/sanitize';
import type { Prisma } from '@ecommerce-manager/database';

export interface AuditLogInput {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Auditoria é sempre um efeito COLATERAL de uma ação principal (criar produto, registrar
   * despesa, etc.) — nunca o inverso. Confirmado em produção: uma falha aqui (ex.: um valor não
   * serializável em `oldValue`/`newValue`) propagava como "Erro interno do servidor" para o
   * usuário mesmo com a ação principal já commitada no banco (dava a falsa impressão de que
   * nada tinha sido salvo). Por isso nunca lança — falha aqui vira só um log de aviso.
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.client.auditLog.create({
        data: {
          companyId: input.companyId ?? null,
          userId: input.userId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          oldValue: (sanitizeForLog(input.oldValue) ?? undefined) as Prisma.InputJsonValue | undefined,
          newValue: (sanitizeForLog(input.newValue) ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: input.ip ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(`audit_log_failed action=${input.action} entity=${input.entity}: ${(error as Error).message}`);
    }
  }
}
