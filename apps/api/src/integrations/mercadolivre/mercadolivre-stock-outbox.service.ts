import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';
import {
  MercadoLivreInventorySyncService,
  type MercadoLivreInventoryComparisonRow,
} from './mercadolivre-inventory-sync.service';

export type MercadoLivreStockSyncStatus = 'OK' | 'PENDENTE' | 'DIVERGENTE' | 'ERRO';

export interface MercadoLivreStockSyncStatusRow extends MercadoLivreInventoryComparisonRow {
  status: MercadoLivreStockSyncStatus;
  lastSyncAt: Date | null;
  /** Mensagem real do último erro — antes só o badge "Erro" chegava na tela (achado real, mesmo
   * gap encontrado no lado da TikTok). */
  lastError: string | null;
}

/**
 * Outbox de sincronização de estoque com o Mercado Livre — mesmo papel de
 * `TikTokStockOutboxService`, mesma tabela genérica `StockSyncOutboxEntry` (já reusável por
 * `channelId`, nenhuma mudança de schema).
 */
@Injectable()
export class MercadoLivreStockOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: MercadoLivreCredentialsService,
    private readonly inventorySync: MercadoLivreInventorySyncService,
  ) {}

  async reconcile(companyId: string): Promise<number> {
    const integration = await this.credentialsService.requireIntegration(companyId).catch(() => null);
    if (!integration?.channelId) return 0;
    const channelId = integration.channelId;

    const comparison = await this.inventorySync.compare(companyId);
    const divergent = comparison.filter((row) => row.divergent);
    // ACHADO REAL corrigido: `checkFailed` (consulta ao Mercado Livre falhou — rate limit, erro
    // transitório, item pausado/excluído) também produz `divergent: false`, mas isso NÃO é o
    // mesmo que "confirmado igual". Sem excluir `checkFailed` daqui, uma divergência real
    // PENDING no outbox seria marcada como `SYNCED` só porque a última consulta falhou — o
    // estoque real do Mercado Livre ficaria desatualizado para sempre, sem nenhum alerta visível
    // (a tela de status mostraria "OK").
    const resolved = comparison.filter((row) => !row.divergent && !row.checkFailed);

    for (const row of divergent) {
      const existing = await this.prisma.client.stockSyncOutboxEntry.findFirst({
        where: { companyId, variantId: row.variantId, channelId, status: 'PENDING' },
      });
      if (existing) {
        if (existing.targetAvailable !== row.central) {
          await this.prisma.client.stockSyncOutboxEntry.update({
            where: { id: existing.id },
            data: { targetAvailable: row.central },
          });
        }
      } else {
        await this.prisma.client.stockSyncOutboxEntry.create({
          data: { companyId, variantId: row.variantId, channelId, targetAvailable: row.central },
        });
      }
    }

    if (resolved.length > 0) {
      await this.prisma.client.stockSyncOutboxEntry.updateMany({
        where: { companyId, channelId, status: 'PENDING', variantId: { in: resolved.map((r) => r.variantId) } },
        data: { status: 'SYNCED', processedAt: new Date() },
      });
    }

    return divergent.length;
  }

  /** Só envia de fato se a flag global (`MERCADOLIVRE_INVENTORY_PUSH_ENABLED`) E o toggle por
   * integração (`Integration.autoInventorySyncEnabled`) estiverem ligados — mesma dupla trava da
   * TikTok, nunca ligado por padrão. */
  async processPending(companyId: string): Promise<{ processed: number; failed: number }> {
    if (!this.inventorySync.isPushEnabled()) return { processed: 0, failed: 0 };

    const integration = await this.credentialsService.requireIntegration(companyId).catch(() => null);
    if (!integration?.autoInventorySyncEnabled) return { processed: 0, failed: 0 };

    const pending = await this.prisma.client.stockSyncOutboxEntry.findMany({
      where: { companyId, status: 'PENDING' },
      take: 50,
    });

    let processed = 0;
    let failed = 0;
    for (const entry of pending) {
      try {
        await this.inventorySync.push(companyId, null, entry.variantId);
        await this.prisma.client.stockSyncOutboxEntry.update({
          where: { id: entry.id },
          data: { status: 'SYNCED', processedAt: new Date(), lastError: null },
        });
        processed += 1;
      } catch (error) {
        await this.prisma.client.stockSyncOutboxEntry.update({
          where: { id: entry.id },
          data: {
            status: 'FAILED',
            attempts: { increment: 1 },
            lastError: (error as Error).message,
            processedAt: new Date(),
          },
        });
        failed += 1;
      }
    }

    return { processed, failed };
  }

  async getStatusReport(companyId: string): Promise<MercadoLivreStockSyncStatusRow[]> {
    const integration = await this.credentialsService.requireIntegration(companyId).catch(() => null);
    if (!integration?.channelId) return [];

    const [comparison, outboxEntries] = await Promise.all([
      this.inventorySync.compare(companyId),
      this.prisma.client.stockSyncOutboxEntry.findMany({
        where: { companyId, channelId: integration.channelId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const latestByVariant = new Map<string, (typeof outboxEntries)[number]>();
    for (const entry of outboxEntries) {
      if (!latestByVariant.has(entry.variantId)) latestByVariant.set(entry.variantId, entry);
    }

    return comparison.map((row) => {
      const outboxEntry = latestByVariant.get(row.variantId);
      // ACHADO REAL corrigido: a ordem antiga checava o status do outbox ANTES da comparação ao
      // vivo — um push manual bem-sucedido (que nunca escreve no outbox) deixava a linha presa em
      // "Erro" pra sempre, mesmo com o estoque já batendo de verdade no Mercado Livre. A
      // comparação ao vivo é a fonte de verdade — mas `checkFailed` continua vindo antes de tudo:
      // se a própria consulta falhou, `divergent` pode estar errado (nunca visto o valor real),
      // então nunca mostrar "OK" nesse caso (mesmo motivo do fix em `reconcile`, ver lá).
      let status: MercadoLivreStockSyncStatus;
      if (row.checkFailed) status = 'ERRO';
      else if (!row.divergent) status = 'OK';
      else if (outboxEntry?.status === 'PENDING') status = 'PENDENTE';
      else if (outboxEntry?.status === 'FAILED') status = 'ERRO';
      else status = 'DIVERGENTE';

      return { ...row, status, lastSyncAt: outboxEntry?.processedAt ?? null, lastError: outboxEntry?.lastError ?? null };
    });
  }
}
