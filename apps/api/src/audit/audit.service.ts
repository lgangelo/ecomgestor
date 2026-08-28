import { Injectable } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
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
  }
}
