import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MercadoLivreInventorySyncService } from './mercadolivre-inventory-sync.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { MercadoLivreCredentialsService } from './mercadolivre-credentials.service';
import type { MercadoLivreConnectorFactory } from './mercadolivre-connector.factory';
import type { AuditService } from '../../audit/audit.service';

const CHANNEL_ID = 'channel-1';

function makeMapping(overrides: Partial<{ variantId: string; sku: string; externalProductId: string; onHand: number; reserved: number }> = {}) {
  return {
    variantId: overrides.variantId ?? 'variant-1',
    externalSku: 'ext-sku-1',
    externalProductId: overrides.externalProductId ?? 'MLB123',
    variant: {
      id: overrides.variantId ?? 'variant-1',
      sku: overrides.sku ?? 'SKU-1',
      inventory: { onHand: overrides.onHand ?? 10, reserved: overrides.reserved ?? 2 },
    },
  };
}

function makeService(opts: {
  pushEnabled?: boolean;
  mappings?: ReturnType<typeof makeMapping>[];
  getItem?: jest.Mock;
  updateItem?: jest.Mock;
}) {
  const findManyMappings = jest.fn().mockResolvedValue(opts.mappings ?? []);
  const findFirstMapping = jest.fn().mockResolvedValue(opts.mappings?.[0] ?? null);
  const prisma = {
    client: {
      channelProductMapping: { findMany: findManyMappings, findFirst: findFirstMapping },
    },
  };

  const configService = { get: jest.fn().mockReturnValue(opts.pushEnabled ?? false) };
  const credentialsService = {
    requireIntegration: jest.fn().mockResolvedValue({ id: 'integration-1', channelId: CHANNEL_ID }),
  };
  const getItem = opts.getItem ?? jest.fn().mockResolvedValue({ available_quantity: 8 });
  const updateItem = opts.updateItem ?? jest.fn().mockResolvedValue({});
  const connectorFactory = { forCompany: jest.fn().mockResolvedValue({ client: { getItem, updateItem } }) };
  const auditLog = jest.fn();
  const audit = { log: auditLog };

  const service = new MercadoLivreInventorySyncService(
    configService as unknown as ConfigService,
    prisma as unknown as PrismaService,
    credentialsService as unknown as MercadoLivreCredentialsService,
    connectorFactory as unknown as MercadoLivreConnectorFactory,
    audit as unknown as AuditService,
  );

  return { service, getItem, updateItem, auditLog };
}

describe('MercadoLivreInventorySyncService.compare', () => {
  it('calcula central como onHand - reserved e detecta divergência', async () => {
    const { service } = makeService({
      mappings: [makeMapping({ onHand: 10, reserved: 2 })],
      getItem: jest.fn().mockResolvedValue({ available_quantity: 5 }),
    });

    const rows = await service.compare('company-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ central: 8, mercadoLivre: 5, divergent: true });
  });

  it('sem divergência quando os valores batem', async () => {
    const { service } = makeService({
      mappings: [makeMapping({ onHand: 10, reserved: 2 })],
      getItem: jest.fn().mockResolvedValue({ available_quantity: 8 }),
    });

    const rows = await service.compare('company-1');

    expect(rows[0].divergent).toBe(false);
  });

  it('nunca trata erro/item não encontrado como divergência real — mercadoLivre fica null', async () => {
    const { service } = makeService({
      mappings: [makeMapping()],
      getItem: jest.fn().mockRejectedValue(new Error('not found')),
    });

    const rows = await service.compare('company-1');

    expect(rows[0].mercadoLivre).toBeNull();
    expect(rows[0].divergent).toBe(false);
    // ACHADO REAL corrigido: `checkFailed: true` é o que impede o outbox de confundir "erro de
    // consulta" com "confirmado igual" (ver mercadolivre-stock-outbox.service.spec.ts).
    expect(rows[0].checkFailed).toBe(true);
  });
});

describe('MercadoLivreInventorySyncService.push', () => {
  it('lança ForbiddenException quando a flag global está desligada', async () => {
    const { service } = makeService({ pushEnabled: false, mappings: [makeMapping()] });

    await expect(service.push('company-1', 'user-1', 'variant-1')).rejects.toThrow(ForbiddenException);
  });

  it('envia o estoque central (onHand - reserved) e audita', async () => {
    const { service, updateItem, auditLog } = makeService({
      pushEnabled: true,
      mappings: [makeMapping({ onHand: 20, reserved: 5, externalProductId: 'MLB999' })],
    });

    const result = await service.push('company-1', 'user-1', 'variant-1');

    expect(result).toEqual({ pushed: 15 });
    expect(updateItem).toHaveBeenCalledWith('MLB999', { available_quantity: 15 });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'MERCADOLIVRE_INVENTORY_PUSHED' }));
  });

  it('lança NotFoundException quando não há vínculo com externalProductId', async () => {
    const { service } = makeService({ pushEnabled: true, mappings: [] });

    await expect(service.push('company-1', 'user-1', 'variant-1')).rejects.toThrow(NotFoundException);
  });
});
