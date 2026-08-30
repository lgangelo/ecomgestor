import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { paginate } from '../common/dto/pagination.dto';
import { endOfDayExclusive } from '../common/date/day-range.util';
import type { Prisma } from '@ecommerce-manager/database';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditLogQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      companyId: user.companyId,
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lt: endOfDayExclusive(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    return paginate(items, total, query.page, query.pageSize);
  }
}
