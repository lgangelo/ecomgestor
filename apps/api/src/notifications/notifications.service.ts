import { Injectable } from '@nestjs/common';
import { NotificationCategory } from '@ecommerce-manager/database';
import { PrismaService } from '../common/prisma/prisma.service';
import { FiscalService } from '../fiscal/fiscal.service';
import { getCurrentMonthRange } from '../common/date/month-range.util';
import { buildMonthlyClosingChecklist } from '../finance/monthly-closing-checklist.util';

interface Condition {
  key: string;
  category: NotificationCategory;
  title: string;
  message: string;
  link: string;
  active: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscalService: FiscalService,
  ) {}

  async list(companyId: string, unreadOnly: boolean) {
    return this.prisma.client.notification.findMany({
      where: { companyId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getUnreadCount(companyId: string): Promise<number> {
    return this.prisma.client.notification.count({ where: { companyId, readAt: null } });
  }

  async markAsRead(companyId: string, id: string) {
    const existing = await this.prisma.client.notification.findFirst({ where: { id, companyId } });
    if (!existing) return null;
    if (existing.readAt) return existing;
    return this.prisma.client.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllAsRead(companyId: string): Promise<number> {
    const result = await this.prisma.client.notification.updateMany({
      where: { companyId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /** Reconciliação periódica (seção 41-43 da Fase 4) — roda para todas as empresas. */
  async reconcileAll(): Promise<number> {
    const companies = await this.prisma.client.company.findMany({ select: { id: true } });
    let total = 0;
    for (const company of companies) {
      total += await this.reconcileCompany(company.id);
    }
    return total;
  }

  /**
   * Avalia as condições conhecidas (seção 42) para UMA empresa: cria/atualiza a notificação
   * enquanto a condição for verdadeira (nunca duplica — chave de dedup, seção 43) e marca como
   * resolvida automaticamente quando ela deixar de ser verdadeira. Reaproveita os mesmos sinais
   * já usados no dashboard (`ReportsService.computeAttention`, seção 63) e no checklist do
   * fechamento (`buildMonthlyClosingChecklist`, item B) — nunca duas fontes de verdade diferentes
   * para "estoque baixo" ou "pendência fiscal".
   */
  async reconcileCompany(companyId: string): Promise<number> {
    const conditions = await this.evaluateConditions(companyId);

    const active = conditions.filter((c) => c.active);
    const inactive = conditions.filter((c) => !c.active);

    for (const condition of active) {
      await this.prisma.client.notification.upsert({
        where: { companyId_dedupeKey: { companyId, dedupeKey: condition.key } },
        create: {
          companyId,
          category: condition.category,
          title: condition.title,
          message: condition.message,
          link: condition.link,
          dedupeKey: condition.key,
        },
        // Se a condição já tinha sumido e voltou, resolvedAt some de novo — mas nunca cria uma
        // segunda notificação para a mesma condição (seção 43).
        update: { title: condition.title, message: condition.message, link: condition.link, resolvedAt: null },
      });
    }

    if (inactive.length > 0) {
      await this.prisma.client.notification.updateMany({
        where: { companyId, dedupeKey: { in: inactive.map((c) => c.key) }, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
    }

    return active.length;
  }

  private async evaluateConditions(companyId: string): Promise<Condition[]> {
    const { start, end } = getCurrentMonthRange();
    const referenceMonth = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;

    const [inventories, fiscalPending, tiktokSyncFailedCount, unmappedOrdersCount, existingClosing] = await Promise.all([
      this.prisma.client.inventory.findMany({
        where: { companyId },
        select: { onHand: true, reserved: true, variant: { select: { minStock: true } } },
      }),
      this.fiscalService.getPending(companyId),
      this.prisma.client.syncJob.count({ where: { status: 'FAILED', integration: { companyId } } }),
      this.prisma.client.order.count({ where: { companyId, integrationSyncStatus: 'REQUIRES_MAPPING' } }),
      this.prisma.client.monthlyClosing.findUnique({
        where: { companyId_referenceMonth: { companyId, referenceMonth: start } },
        select: { status: true },
      }),
    ]);

    const belowMinimumCount = inventories.filter((inv) => inv.onHand - inv.reserved < inv.variant.minStock).length;
    const salesWithoutInvoiceCount = fiscalPending.salesWithoutInvoice.length;

    const conditions: Condition[] = [
      {
        key: 'low_stock',
        category: NotificationCategory.ESTOQUE,
        title: 'Produtos com estoque baixo',
        message: `${belowMinimumCount} ${belowMinimumCount === 1 ? 'produto está' : 'produtos estão'} abaixo do estoque mínimo`,
        link: '/produtos/estoque',
        active: belowMinimumCount > 0,
      },
      {
        key: 'fiscal_pending_sales',
        category: NotificationCategory.FISCAL,
        title: 'Vendas sem referência fiscal',
        message: `${salesWithoutInvoiceCount} ${salesWithoutInvoiceCount === 1 ? 'venda' : 'vendas'} sem NF-e associada`,
        link: '/fiscal',
        active: salesWithoutInvoiceCount > 0,
      },
      {
        key: 'tiktok_sync_failed',
        category: NotificationCategory.INTEGRACAO,
        title: 'Sincronização TikTok falhou',
        message: `${tiktokSyncFailedCount} ${tiktokSyncFailedCount === 1 ? 'job falhou' : 'jobs falharam'} na integração TikTok`,
        link: '/integracoes/tiktok',
        active: tiktokSyncFailedCount > 0,
      },
      {
        key: 'tiktok_unmapped',
        category: NotificationCategory.INTEGRACAO,
        title: 'Produtos TikTok sem vínculo',
        message: `${unmappedOrdersCount} ${unmappedOrdersCount === 1 ? 'pedido precisa' : 'pedidos precisam'} de vínculo de produto`,
        link: '/vendas/pedidos?syncStatus=REQUIRES_MAPPING',
        active: unmappedOrdersCount > 0,
      },
    ];

    // Fechamento do mês corrente (seção 42) — sempre avaliado (mesmo já fechado), para que uma
    // notificação anterior seja resolvida automaticamente assim que o mês for fechado (seção 43).
    // Só enquanto o período está aberto é que os avisos ainda importam; depois de fechado eles já
    // ficam registrados no snapshot (item B), não precisa mais de notificação.
    const monthlyClosingKey = `monthly_closing_pending:${referenceMonth}`;
    if (existingClosing?.status === 'CLOSED') {
      conditions.push({
        key: monthlyClosingKey,
        category: NotificationCategory.FINANCEIRO,
        title: 'Fechamento do mês possui pendências',
        message: '',
        link: '/financeiro/fechamento',
        active: false,
      });
    } else {
      const checklist = await buildMonthlyClosingChecklist(this.prisma, this.fiscalService, companyId, referenceMonth, start, end);
      conditions.push({
        key: monthlyClosingKey,
        category: NotificationCategory.FINANCEIRO,
        title: 'Fechamento do mês possui pendências',
        message: `Fechamento de ${referenceMonth} possui ${checklist.warnings.length} ${checklist.warnings.length === 1 ? 'pendência' : 'pendências'}`,
        link: '/financeiro/fechamento',
        active: checklist.warnings.length > 0,
      });
    }

    return conditions;
  }
}
