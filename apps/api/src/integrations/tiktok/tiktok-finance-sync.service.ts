import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SettlementStatus } from '@ecommerce-manager/database';
import { normalizeTransactionType } from '@ecommerce-manager/integrations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { TikTokConnectorFactory } from './tiktok-connector.factory';
import { TikTokCredentialsService } from './tiktok-credentials.service';

const MAX_PAGES = 10;

// Debug temporário: marketplace_fees continua vazia mesmo com transactionsSynced > 0 — loga só a
// primeira transação processada no processo para ver exatamente onde a condição de gravação
// falha (pedido não encontrado? amount zero? id da transação ausente?), sem inundar o log.
let loggedFirstTxDiagnostic = false;

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
        // Confirmado em produção: um extrato sem `id` nem `statement_id` grava com chave vazia —
        // como a chave de upsert é (channelId, externalStatementId), TODO extrato sem id colide
        // na MESMA linha (nunca duas linhas distintas), sobrescrevendo silenciosamente o extrato
        // anterior sem id. Melhor pular esse extrato (loga um aviso) do que corromper a tabela.
        if (!stmt.externalStatementId) {
          this.logger.warn('tiktok_statement_missing_id', { operation: 'sync_statements', periodStart: stmt.periodStart.toISOString() });
          continue;
        }

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

        transactionsSynced += await this.syncTransactionsForStatement(
          companyId,
          integration.channelId,
          settlement.id,
          settlement.periodEnd,
          stmt.externalStatementId,
        );
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

  /**
   * Sincronização manual de UM pedido específico (botão "Sincronizar com TikTok" na tela do
   * pedido) — usa "Get Transactions by Order" em vez de paginar Statements -> Transactions by
   * Statement. Existe porque a varredura em lote (`syncStatements`) depende de encontrar, entre
   * os ~500 extratos mais recentes, o extrato certo que cobre este pedido — e às vezes um
   * extrato vem da TikTok sem `id` (bug documentado em `normalizeStatement`), deixando o pedido
   * que caiu nele sem chance nenhuma de ser alcançado pela varredura em lote, por mais vezes que
   * ela rode. A busca por pedido não depende de achar o extrato certo, então contorna isso.
   *
   * Escreve só em `marketplace_fees` (nunca em `settlement_transactions`, que exige um
   * Settlement válido pra existir) — `settlementId` fica nulo de propósito aqui, exatamente como
   * o schema já documenta pra lançamentos manuais/fora do fluxo de extrato.
   */
  async syncOrderFee(companyId: string, orderId: string): Promise<{ feesFound: number }> {
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId, companyId },
      select: { id: true, channelId: true, externalOrderId: true },
    });
    if (!order?.externalOrderId) return { feesFound: 0 };

    const { connector } = await this.connectorFactory.forCompany(companyId);
    let feesFound = 0;
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const txPage = await connector.getTransactions(companyId, {
        orderId: order.externalOrderId,
        pageSize: 50,
        pageToken,
      });

      for (const tx of txPage.items) {
        if (Number(tx.amount) !== 0 && tx.externalTransactionId) {
          await this.prisma.client.marketplaceFee.upsert({
            where: { externalTransactionId: tx.externalTransactionId },
            create: {
              channelId: order.channelId,
              orderId: order.id,
              feeType: 'PLATFORM_FEE',
              amount: Math.abs(Number(tx.amount)),
              externalTransactionId: tx.externalTransactionId,
              feeDate: tx.occurredAt,
            },
            update: { amount: Math.abs(Number(tx.amount)), feeDate: tx.occurredAt },
          });
          feesFound++;
        }
      }

      if (!txPage.nextPageToken) break;
      pageToken = txPage.nextPageToken;
    }

    return { feesFound };
  }

  private async syncTransactionsForStatement(
    companyId: string,
    channelId: string,
    settlementId: string,
    settlementPeriodEnd: Date,
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

        if (!loggedFirstTxDiagnostic) {
          loggedFirstTxDiagnostic = true;
          // eslint-disable-next-line no-console -- debug temporário: marketplace_fees continua vazia mesmo com transactionsSynced > 0
          console.log(
            '[tiktok-fee-write-debug]',
            JSON.stringify({
              externalTransactionId: tx.externalTransactionId,
              externalOrderId: tx.externalOrderId,
              amount: tx.amount,
              orderFound: Boolean(order),
              orderId: order?.id ?? null,
              willWriteFee: Boolean(order) && Number(tx.amount) !== 0 && Boolean(tx.externalTransactionId),
            }),
          );
        }

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
        // nela). Confirmado em produção: cada transação é o resumo financeiro do PEDIDO INTEIRO
        // (tipo sempre "ORDER"), não uma categoria isolada — por isso nunca bate com
        // PLATFORM_FEE/AFFILIATE_COMMISSION do mapeamento genérico; a condição real é só "tem
        // taxa diferente de zero e o pedido foi resolvido". `tx.amount` já é `fee_amount` (a taxa
        // total, negativa — débito no repasse); aqui grava-se a magnitude positiva.
        if (order && Number(tx.amount) !== 0 && tx.externalTransactionId) {
          await this.prisma.client.marketplaceFee.upsert({
            where: { externalTransactionId: tx.externalTransactionId },
            create: {
              channelId,
              orderId: order.id,
              feeType: 'PLATFORM_FEE',
              amount: Math.abs(Number(tx.amount)),
              externalTransactionId: tx.externalTransactionId,
              settlementId,
              feeDate: settlementPeriodEnd,
            },
            update: { amount: Math.abs(Number(tx.amount)), settlementId, feeDate: settlementPeriodEnd },
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
   *
   * Confirmado em produção: cada `settlementTx` já é o resumo financeiro do PEDIDO INTEIRO, não
   * uma categoria isolada (venda/desconto/taxa cada uma numa linha, como o desenho original
   * assumia) — por isso não há mais "somar por categoria" aqui. `grossSale`/`fees` vêm de campos
   * já corretos e confiáveis: `order.subtotal` (preço de tabela, já calculado certo na
   * importação) e a soma das taxas reais sincronizadas (`settlementTx.amount`, sempre negativo).
   */
  async getOrderReconciliation(companyId: string, orderId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId, companyId },
      include: { settlementTx: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');

    if (order.settlementTx.length === 0) {
      return { settled: false, grossSale: null, fees: null, netRevenue: null, paidAt: null };
    }

    const fees = order.settlementTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const grossSale = Number(order.subtotal);
    const netRevenue = Number(order.total) - fees;

    // A TikTok só deposita dias depois da entrega — `feeDate` (fim do período do extrato de
    // liquidação) é a melhor data disponível para "quando isso foi pago", já que a API de
    // transações não devolve uma data de pagamento por transação, só por extrato.
    const fee = await this.prisma.client.marketplaceFee.findFirst({
      where: { orderId },
      orderBy: { feeDate: 'desc' },
      select: { feeDate: true },
    });

    return { settled: true, grossSale, fees, netRevenue, paidAt: fee?.feeDate ?? null };
  }
}
