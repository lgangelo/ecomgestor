import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TikTokCredentialsService } from './tiktok-credentials.service';
import { TikTokInventorySyncService, type InventoryComparisonRow } from './tiktok-inventory-sync.service';

export type StockSyncStatus = 'OK' | 'PENDENTE' | 'DIVERGENTE' | 'ERRO';

export interface StockSyncStatusRow extends InventoryComparisonRow {
  status: StockSyncStatus;
  lastSyncAt: Date | null;
  /** Mensagem real do último erro (`StockSyncOutboxEntry.lastError`) — antes só o badge "Erro"
   * chegava na tela, sem nenhum detalhe do motivo (achado real em produção). */
  lastError: string | null;
}

/**
 * Outbox de sincronização de estoque (seção 51 da Fase 4). Em vez de instrumentar
 * `InventoryLedgerService`/`OrdersService`/`ReturnsService` diretamente — o que acoplaria a
 * integração TikTok ao núcleo de estoque, o oposto do que a Fase 3 e esta fase querem preservar
 * — um job periódico reaproveita `TikTokInventorySyncService.compare()` (já usado pela tela de
 * comparação manual) para detectar divergência e alimentar o outbox. A venda nunca espera isso:
 * o commit interno já aconteceu antes; isto só roda depois, de forma assíncrona (seção 52).
 * Decisão de design completa em docs/phase4-review.md.
 */
@Injectable()
export class TikTokStockOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly inventorySync: TikTokInventorySyncService,
  ) {}

  /**
   * Só detecta e enfileira — nunca envia nada para a TikTok aqui. Uma nova divergência para o
   * mesmo (variantId, channelId) atualiza a entrada `PENDING` existente em vez de criar uma
   * segunda linha (seção 53 — coalescing: evita reenviar 10→9→8→7, só o valor final importa).
   */
  async reconcile(companyId: string): Promise<number> {
    const integration = await this.credentialsService.requireIntegration(companyId).catch(() => null);
    if (!integration?.channelId) return 0;
    const channelId = integration.channelId;

    const comparison = await this.inventorySync.compare(companyId);
    const divergent = comparison.filter((row) => row.divergent);
    const resolved = comparison.filter((row) => !row.divergent);

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

    // A divergência sumiu (ex.: alguém já enviou manualmente) — nunca deixa uma entrada pendente
    // enviar um valor que já não reflete mais a realidade.
    if (resolved.length > 0) {
      await this.prisma.client.stockSyncOutboxEntry.updateMany({
        where: { companyId, channelId, status: 'PENDING', variantId: { in: resolved.map((r) => r.variantId) } },
        data: { status: 'SYNCED', processedAt: new Date() },
      });
    }

    return divergent.length;
  }

  /**
   * Só envia de fato se a flag global (`TIKTOK_INVENTORY_PUSH_ENABLED`) E o toggle POR
   * INTEGRAÇÃO (`Integration.autoInventorySyncEnabled`) estiverem ligados — os dois continuam
   * desligados por padrão; sem nenhum dos dois, o outbox só acumula (visível na tela de
   * divergência), nunca envia sozinho.
   *
   * Até 2026-09 este toggle era `Company.inventoryAutoSyncEnabled` (uma chave só, pra empresa
   * inteira — ligar afetava TikTok e Mercado Livre juntos, sem como testar um sem o outro). O
   * campo `Integration.autoInventorySyncEnabled` já existia no schema desde a Fase 4 mas nunca
   * tinha sido ligado a nada; a migração de dado (`backfill-integration-auto-sync-flag.ts`) copiou
   * o valor de cada empresa pra dentro da integração TikTok correspondente antes desta troca, pra
   * ninguém perder o auto-sync já habilitado em produção.
   */
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
        // `push()` relê o estoque central na hora de enviar — nunca confia cegamente no
        // `targetAvailable` capturado no momento em que a divergência foi detectada.
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

  /**
   * Seção 54 — status separado do documento fiscal/estoque: `divergent` (verdade ao vivo, via
   * `compare()`) vira `PENDENTE`/`ERRO` quando o outbox já sabe de uma tentativa em andamento ou
   * que falhou; nunca inventa um estado que o outbox não registrou. Pega a entrada mais recente
   * por variante (ordenado por criação desc) — uma entrada nova `PENDING` criada depois de uma
   * `FAILED` antiga naturalmente "substitui" o status exibido, sem precisar limpar a antiga.
   */
  async getStatusReport(companyId: string): Promise<StockSyncStatusRow[]> {
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
      // vivo — um push manual bem-sucedido (que nunca escreve no outbox, ver
      // `TikTokInventorySyncService.push`) deixava a linha presa em "Erro" pra sempre, mesmo com
      // o estoque já batendo de verdade na TikTok. A comparação ao vivo é a fonte de verdade:
      // se bate agora, é OK, não importa o que uma tentativa automática antiga registrou.
      let status: StockSyncStatus;
      if (!row.divergent) status = 'OK';
      else if (outboxEntry?.status === 'PENDING') status = 'PENDENTE';
      else if (outboxEntry?.status === 'FAILED') status = 'ERRO';
      else status = 'DIVERGENTE';

      return { ...row, status, lastSyncAt: outboxEntry?.processedAt ?? null, lastError: outboxEntry?.lastError ?? null };
    });
  }
}
