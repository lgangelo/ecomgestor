import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SettlementStatus } from '@ecommerce-manager/database';
import { normalizeTransactionType } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TikTokConnectorFactory } from './tiktok-connector.factory';
import { TikTokCredentialsService } from './tiktok-credentials.service';

const MAX_PAGES = 10;

interface SyncCheckpoints {
  ordersSyncAt?: string;
  productsSyncAt?: string;
  financeSyncAt?: string;
}

/**
 * Best-effort — o status bruto de statement da TikTok não foi confirmado com certeza total
 * na pesquisa (docs/integrations/tiktok.md); nunca inventa uma categoria fora do enum, cai em
 * PENDING quando o texto não é reconhecido (seção 32: "adequar ao que a API realmente fornecer").
 */
function mapSettlementStatus(raw: string): SettlementStatus {
  const lower = raw.toLowerCase();
  if (lower.includes('paid')) return SettlementStatus.PAID;
  if (lower.includes('adjust')) return SettlementStatus.ADJUSTED;
  if (lower.includes('partial')) return SettlementStatus.PARTIALLY_SETTLED;
  if (lower.includes('settl')) return SettlementStatus.SETTLED;
  return SettlementStatus.PENDING;
}

/** Categorias de `SettlementTransaction` que representam taxa/comissão cobrada pela plataforma —
 * as únicas que também alimentam `marketplace_fees` (ver `syncTransactionsForStatement`). */
const FEE_TRANSACTION_TYPES = new Set(['PLATFORM_FEE', 'AFFILIATE_COMMISSION']);

/**
 * Ingestão financeira (seção 29-30-31 da Fase 3): Get Statements -> Get Transactions by
 * Statement, alimentando `settlements`/`settlement_transactions` já existentes. Nunca inventa
 * categoria financeira — usa `normalizeTransactionType` (mesma função do mapper) e sempre
 * preserva o valor bruto em `rawType`.
 */
@Injectable()
export class TikTokFinanceSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: TikTokCredentialsService,
    private readonly connectorFactory: TikTokConnectorFactory,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext('TikTokFinanceSync');
  }

  async syncStatements(companyId: string): Promise<{ statementsSynced: number; transactionsSynced: number }> {
    const integration = await this.credentialsService.requireIntegration(companyId);
    if (!integration.channelId) throw new BadRequestException('Canal TikTok Shop ainda não conectado.');

    const { connector } = await this.connectorFactory.forCompany(companyId);
    const checkpoints = (integration.syncCheckpoints as SyncCheckpoints | null) ?? {};

    let statementsSynced = 0;
    let transactionsSynced = 0;
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const statementPage = await connector.getStatements(companyId, { pageSize: 50, pageToken });

      for (const stmt of statementPage.items) {
        const settlement = await this.prisma.client.settlement.upsert({
          where: { channelId_externalStatementId: { channelId: integration.channelId, externalStatementId: stmt.externalStatementId } },
          create: {
            companyId,
            channelId: integration.channelId,
            externalStatementId: stmt.externalStatementId,
            periodStart: stmt.periodStart,
            periodEnd: stmt.periodEnd,
            totalAmount: stmt.totalAmount,
            status: mapSettlementStatus(stmt.status),
          },
          update: { totalAmount: stmt.totalAmount, status: mapSettlementStatus(stmt.status) },
        });
        statementsSynced++;

        transactionsSynced += await this.syncTransactionsForStatement(companyId, integration.channelId, settlement.id, stmt.externalStatementId);
      }

      if (!statementPage.nextPageToken) break;
      pageToken = statementPage.nextPageToken;
    }

    await this.prisma.client.integration.update({
      where: { id: integration.id },
      data: { syncCheckpoints: { ...checkpoints, financeSyncAt: new Date().toISOString() } },
    });

    this.logger.log('tiktok_finance_synced', { operation: 'sync_finance', statementsSynced, transactionsSynced });
    return { statementsSynced, transactionsSynced };
  }

  private async syncTransactionsForStatement(
    companyId: string,
    channelId: string,
    settlementId: string,
    externalStatementId: string,
  ): Promise<number> {
    const { connector } = await this.connectorFactory.forCompany(companyId);
    let synced = 0;
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const txPage = await connector.getTransactions(companyId, { statementId: externalStatementId, pageSize: 100, pageToken });

      for (const tx of txPage.items) {
        const order = tx.externalOrderId
          ? await this.prisma.client.order.findUnique({
              where: { companyId_channelId_externalOrderId: { companyId, channelId, externalOrderId: tx.externalOrderId } },
            })
          : null;

        const data = {
          settlementId,
          orderId: order?.id ?? null,
          orderExternalId: order ? null : (tx.externalOrderId ?? null),
          type: normalizeTransactionType(tx.type),
          rawType: tx.type,
          amount: tx.amount,
        };

        if (tx.externalTransactionId) {
          await this.prisma.client.settlementTransaction.upsert({
            where: { externalTransactionId: tx.externalTransactionId },
            create: { ...data, externalTransactionId: tx.externalTransactionId },
            update: data,
          });
        } else {
          await this.prisma.client.settlementTransaction.create({ data });
        }

        // `marketplace_fees` é a tabela que o resto do sistema já lê para lucro/margem (pedido,
        // dashboard financeiro, fechamento mensal) — sem isto, essas telas nunca descontavam a
        // taxa/comissão da TikTok (tabela sempre vazia, nenhum código em nenhum lugar escrevia
        // nela). O valor bruto da TikTok vem negativo (é um débito no saldo do repasse); aqui
        // grava-se a magnitude positiva, que é o que as leituras existentes esperam subtrair.
        if (order && FEE_TRANSACTION_TYPES.has(data.type) && tx.externalTransactionId) {
          await this.prisma.client.marketplaceFee.upsert({
            where: { externalTransactionId: tx.externalTransactionId },
            create: {
              channelId,
              orderId: order.id,
              feeType: data.type,
              amount: Math.abs(Number(tx.amount)),
              externalTransactionId: tx.externalTransactionId,
            },
            update: { amount: Math.abs(Number(tx.amount)) },
          });
        }
        synced++;
      }

      if (!txPage.nextPageToken) break;
      pageToken = txPage.nextPageToken;
    }

    return synced;
  }

  /**
   * Conciliação por pedido (seção 31 da Fase 3) — nunca considera valor zero silenciosamente
   * quando não há liquidação ainda: retorna `settled: false` e o frontend mostra
   * "Pendente de liquidação" em vez de R$ 0,00.
   */
  async getOrderReconciliation(companyId: string, orderId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId, companyId },
      include: { settlementTx: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    if (order.settlementTx.length === 0) {
      return { settled: false, grossSale: null, discounts: null, fees: null, netRevenue: null, settlement: null };
    }

    const sum = (type: string) =>
      order.settlementTx.filter((t) => t.type === type).reduce((s, t) => s + Number(t.amount), 0);

    return {
      settled: true,
      grossSale: sum('GROSS_SALE'),
      sellerDiscount: sum('SELLER_DISCOUNT'),
      platformDiscount: sum('PLATFORM_DISCOUNT'),
      fees: sum('PLATFORM_FEE'),
      shippingAdjustment: sum('SHIPPING_ADJUSTMENT'),
      affiliateCommission: sum('AFFILIATE_COMMISSION'),
      settlementPayout: sum('SETTLEMENT_PAYOUT'),
      other: sum('OTHER'),
      netRevenue: order.settlementTx.reduce((s, t) => s + Number(t.amount), 0),
    };
  }
}
