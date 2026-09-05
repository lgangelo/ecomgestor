import type { PrismaService } from '../../common/prisma/prisma.service';
import type { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';
import type { MercadoLivreInventoryComparisonRow, MercadoLivreInventorySyncService } from './mercadolivre-inventory-sync.service';
import { MercadoLivreStockOutboxService } from './mercadolivre-stock-outbox.service';

interface FakeOutboxEntry {
  id: string;
  companyId: string;
  variantId: string;
  channelId: string;
  targetAvailable: number;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  attempts: number;
  lastError: string | null;
  processedAt: Date | null;
}

function makeFakePrisma(entries: FakeOutboxEntry[]) {
  const createCalls: Array<Partial<FakeOutboxEntry>> = [];
  const updateCalls: Array<{ id: string; data: Partial<FakeOutboxEntry> }> = [];
  const updateManyCalls: Array<{ variantIds: string[]; data: Partial<FakeOutboxEntry> }> = [];
  let counter = 0;

  const prisma = {
    client: {
      stockSyncOutboxEntry: {
        findFirst: async ({ where }: { where: { companyId: string; variantId: string; channelId: string; status: string } }) =>
          entries.find(
            (e) =>
              e.companyId === where.companyId &&
              e.variantId === where.variantId &&
              e.channelId === where.channelId &&
              e.status === where.status,
          ) ?? null,
        create: async ({ data }: { data: Partial<FakeOutboxEntry> }) => {
          createCalls.push(data);
          const entry: FakeOutboxEntry = {
            id: `entry-${++counter}`,
            companyId: data.companyId!,
            variantId: data.variantId!,
            channelId: data.channelId!,
            targetAvailable: data.targetAvailable!,
            status: 'PENDING',
            attempts: 0,
            lastError: null,
            processedAt: null,
          };
          entries.push(entry);
          return entry;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Omit<Partial<FakeOutboxEntry>, 'attempts'> & { attempts?: number | { increment: number } };
        }) => {
          const entry = entries.find((e) => e.id === where.id)!;
          const { attempts, ...rest } = data;
          if (attempts && typeof attempts === 'object' && 'increment' in attempts) {
            entry.attempts += attempts.increment;
          }
          Object.assign(entry, rest);
          updateCalls.push({ id: where.id, data: data as Partial<FakeOutboxEntry> });
          return entry;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { companyId: string; channelId: string; status: string; variantId: { in: string[] } };
          data: Partial<FakeOutboxEntry>;
        }) => {
          const affected = entries.filter(
            (e) => e.companyId === where.companyId && e.channelId === where.channelId && e.status === where.status && where.variantId.in.includes(e.variantId),
          );
          affected.forEach((e) => Object.assign(e, data));
          updateManyCalls.push({ variantIds: where.variantId.in, data });
          return { count: affected.length };
        },
        findMany: async ({ where }: { where: { companyId: string; status: string } }) =>
          entries.filter((e) => e.companyId === where.companyId && e.status === where.status),
      },
    },
  } as unknown as PrismaService;

  return { prisma, createCalls, updateCalls, updateManyCalls, entries };
}

function makeFakeCredentials(channelId: string | null, autoInventorySyncEnabled = false): MercadoLivreCredentialsService {
  return {
    requireIntegration: async () => {
      if (!channelId) throw new Error('not connected');
      return { channelId, autoInventorySyncEnabled };
    },
  } as unknown as MercadoLivreCredentialsService;
}

function makeFakeInventorySync(
  comparison: MercadoLivreInventoryComparisonRow[],
  options: { pushEnabled?: boolean; push?: jest.Mock } = {},
): MercadoLivreInventorySyncService {
  return {
    compare: async () => comparison,
    isPushEnabled: () => options.pushEnabled ?? true,
    push: options.push ?? jest.fn().mockResolvedValue({ pushed: 0 }),
  } as unknown as MercadoLivreInventorySyncService;
}

describe('MercadoLivreStockOutboxService.reconcile', () => {
  it('sem integração Mercado Livre conectada, não faz nada e retorna 0', async () => {
    const { prisma, createCalls } = makeFakePrisma([]);
    const service = new MercadoLivreStockOutboxService(prisma, makeFakeCredentials(null), makeFakeInventorySync([]));

    const queued = await service.reconcile('company-1');

    expect(queued).toBe(0);
    expect(createCalls).toHaveLength(0);
  });

  it('divergência nova sem entrada pendente existente: cria uma entrada no outbox', async () => {
    const { prisma, createCalls } = makeFakePrisma([]);
    const comparison: MercadoLivreInventoryComparisonRow[] = [
      { variantId: 'v-1', sku: 'SKU-1', externalSku: 'ext-1', central: 7, mercadoLivre: 10, divergent: true, checkFailed: false },
    ];
    const service = new MercadoLivreStockOutboxService(prisma, makeFakeCredentials('channel-1'), makeFakeInventorySync(comparison));

    const queued = await service.reconcile('company-1');

    expect(queued).toBe(1);
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({ variantId: 'v-1', channelId: 'channel-1', targetAvailable: 7 });
  });

  it('coalescing: nova divergência para o mesmo variantId/channelId atualiza o alvo em vez de criar uma segunda linha', async () => {
    const existing: FakeOutboxEntry = {
      id: 'entry-existing',
      companyId: 'company-1',
      variantId: 'v-1',
      channelId: 'channel-1',
      targetAvailable: 9,
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      processedAt: null,
    };
    const { prisma, createCalls, updateCalls } = makeFakePrisma([existing]);
    const comparison: MercadoLivreInventoryComparisonRow[] = [
      { variantId: 'v-1', sku: 'SKU-1', externalSku: 'ext-1', central: 7, mercadoLivre: 10, divergent: true, checkFailed: false },
    ];
    const service = new MercadoLivreStockOutboxService(prisma, makeFakeCredentials('channel-1'), makeFakeInventorySync(comparison));

    await service.reconcile('company-1');

    expect(createCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(1);
    expect(existing.targetAvailable).toBe(7);
  });

  it('divergência que sumiu resolve a entrada pendente', async () => {
    const existing: FakeOutboxEntry = {
      id: 'entry-existing',
      companyId: 'company-1',
      variantId: 'v-1',
      channelId: 'channel-1',
      targetAvailable: 7,
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      processedAt: null,
    };
    const { prisma } = makeFakePrisma([existing]);
    const comparison: MercadoLivreInventoryComparisonRow[] = [
      { variantId: 'v-1', sku: 'SKU-1', externalSku: 'ext-1', central: 10, mercadoLivre: 10, divergent: false, checkFailed: false },
    ];
    const service = new MercadoLivreStockOutboxService(prisma, makeFakeCredentials('channel-1'), makeFakeInventorySync(comparison));

    await service.reconcile('company-1');

    expect(existing.status).toBe('SYNCED');
    expect(existing.processedAt).not.toBeNull();
  });

  it('ACHADO REAL corrigido: uma linha checkFailed (erro de consulta) NUNCA resolve uma divergência pendente, mesmo vindo com divergent:false', async () => {
    const existing: FakeOutboxEntry = {
      id: 'entry-existing',
      companyId: 'company-1',
      variantId: 'v-1',
      channelId: 'channel-1',
      targetAvailable: 7,
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      processedAt: null,
    };
    const { prisma } = makeFakePrisma([existing]);
    // Consulta ao Mercado Livre falhou nesta rodada (rate limit/item pausado) — vem com
    // `mercadoLivre: null`/`divergent: false`, mas `checkFailed: true` PRECISA impedir que isto
    // seja tratado como "confirmado igual".
    const comparison: MercadoLivreInventoryComparisonRow[] = [
      { variantId: 'v-1', sku: 'SKU-1', externalSku: 'ext-1', central: 10, mercadoLivre: null, divergent: false, checkFailed: true },
    ];
    const service = new MercadoLivreStockOutboxService(prisma, makeFakeCredentials('channel-1'), makeFakeInventorySync(comparison));

    await service.reconcile('company-1');

    expect(existing.status).toBe('PENDING');
    expect(existing.processedAt).toBeNull();
  });
});

describe('MercadoLivreStockOutboxService.processPending', () => {
  it('nunca envia quando a flag global está desligada, mesmo com o toggle da integração ligado', async () => {
    const { prisma } = makeFakePrisma([]);
    const push = jest.fn();
    const service = new MercadoLivreStockOutboxService(
      prisma,
      makeFakeCredentials('channel-1', true),
      makeFakeInventorySync([], { pushEnabled: false, push }),
    );

    const result = await service.processPending('company-1');

    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(push).not.toHaveBeenCalled();
  });

  it('nunca envia quando o toggle da integração está desligado, mesmo com a flag global ligada', async () => {
    const { prisma } = makeFakePrisma([]);
    const push = jest.fn();
    const service = new MercadoLivreStockOutboxService(
      prisma,
      makeFakeCredentials('channel-1', false),
      makeFakeInventorySync([], { pushEnabled: true, push }),
    );

    const result = await service.processPending('company-1');

    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(push).not.toHaveBeenCalled();
  });

  it('com os dois gates ligados: envia cada entrada pendente e marca sucesso/falha corretamente', async () => {
    const entries: FakeOutboxEntry[] = [
      {
        id: 'entry-ok',
        companyId: 'company-1',
        variantId: 'v-ok',
        channelId: 'channel-1',
        targetAvailable: 5,
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        processedAt: null,
      },
      {
        id: 'entry-fail',
        companyId: 'company-1',
        variantId: 'v-fail',
        channelId: 'channel-1',
        targetAvailable: 3,
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        processedAt: null,
      },
    ];
    const { prisma } = makeFakePrisma(entries);
    const push = jest.fn(async (_companyId: string, _userId: string | null, variantId: string) => {
      if (variantId === 'v-fail') throw new Error('conector indisponível');
      return { pushed: 5 };
    });
    const service = new MercadoLivreStockOutboxService(
      prisma,
      makeFakeCredentials('channel-1', true),
      makeFakeInventorySync([], { pushEnabled: true, push }),
    );

    const result = await service.processPending('company-1');

    expect(result).toEqual({ processed: 1, failed: 1 });
    expect(push).toHaveBeenCalledWith('company-1', null, 'v-ok');
    expect(entries.find((e) => e.id === 'entry-ok')?.status).toBe('SYNCED');
    const failedEntry = entries.find((e) => e.id === 'entry-fail')!;
    expect(failedEntry.status).toBe('FAILED');
    expect(failedEntry.attempts).toBe(1);
    expect(failedEntry.lastError).toContain('conector indisponível');
  });
});
