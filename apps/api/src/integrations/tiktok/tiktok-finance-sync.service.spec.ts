import { TikTokFinanceSyncService } from './tiktok-finance-sync.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { TikTokCredentialsService } from './tiktok-credentials.service';
import type { TikTokConnectorFactory } from './tiktok-connector.factory';
import type { AppLoggerService } from '../../common/logger/app-logger.service';

const COMPANY_ID = 'company-1';
const CHANNEL_ID = 'channel-1';

function statement(id: string, periodEnd: Date) {
  return { externalStatementId: id, periodStart: periodEnd, periodEnd, totalAmount: '10.00', status: 'SETTLED' };
}

function makeService(opts: { lastSyncAt?: string; pages: ReturnType<typeof statement>[][] }) {
  const settlementUpsert = jest.fn().mockResolvedValue({ id: 'settlement-1', periodEnd: new Date() });
  const getTransactions = jest.fn().mockResolvedValue({ items: [], nextPageToken: undefined });

  const prisma = {
    client: {
      settlement: { upsert: settlementUpsert },
      settlementTransaction: { upsert: jest.fn(), create: jest.fn() },
      marketplaceFee: { upsert: jest.fn() },
      integration: { update: jest.fn() },
    },
  };

  const credentialsService = {
    requireIntegration: jest.fn().mockResolvedValue({
      id: 'integration-1',
      channelId: CHANNEL_ID,
      syncCheckpoints: opts.lastSyncAt ? { financeSyncAt: opts.lastSyncAt } : {},
    }),
  };

  let pageIndex = 0;
  const getStatements = jest.fn().mockImplementation(async () => {
    const items = opts.pages[pageIndex] ?? [];
    const isLast = pageIndex >= opts.pages.length - 1;
    pageIndex++;
    return { items, nextPageToken: isLast ? undefined : `page-${pageIndex}` };
  });

  const connectorFactory = { forCompany: jest.fn().mockResolvedValue({ connector: { getStatements, getTransactions } }) };
  const logger = { setContext: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const service = new TikTokFinanceSyncService(
    prisma as unknown as PrismaService,
    credentialsService as unknown as TikTokCredentialsService,
    connectorFactory as unknown as TikTokConnectorFactory,
    logger as unknown as AppLoggerService,
  );

  return { service, getStatements, settlementUpsert };
}

describe('TikTokFinanceSyncService.syncStatements — para de paginar ao alcancar o checkpoint', () => {
  it('nao busca mais paginas depois de encontrar um extrato mais antigo que o checkpoint (com margem)', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 dia atrás
    // 10 dias atrás — além da margem de 7 dias da FINANCE_RESCAN_OVERLAP_MS.
    const old = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const { service, getStatements, settlementUpsert } = makeService({
      lastSyncAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // sincronizou há 2 dias
      pages: [
        [statement('s1', recent)],
        [statement('s2', old)], // deveria parar aqui, nunca processar nem buscar mais
        [statement('s3', old)],
      ],
    });

    await service.syncStatements(COMPANY_ID);

    // Só buscou 2 páginas (a que tem o extrato recente + a que revela o antigo) — nunca a 3ª.
    expect(getStatements).toHaveBeenCalledTimes(2);
    // Só processou o extrato recente, nunca o antigo que estourou a margem.
    expect(settlementUpsert).toHaveBeenCalledTimes(1);
  });

  it('sem checkpoint anterior (primeira sincronização), busca tudo normalmente', async () => {
    const now = new Date();
    const { service, getStatements, settlementUpsert } = makeService({
      pages: [[statement('s1', now)], [statement('s2', new Date(0))]],
    });

    await service.syncStatements(COMPANY_ID);

    expect(getStatements).toHaveBeenCalledTimes(2);
    expect(settlementUpsert).toHaveBeenCalledTimes(2);
  });
});
