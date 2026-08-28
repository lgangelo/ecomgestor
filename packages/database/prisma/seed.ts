/* eslint-disable no-console */
import {
  PrismaClient,
  RoleName,
  ChannelType,
  IntegrationProvider,
  IntegrationStatus,
  ProductStatus,
  VariantStatus,
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  StockEntryStatus,
  ReturnStatus,
  RefundStatus,
  FiscalDocumentType,
  FiscalDocumentStatus,
  MonthlyClosingStatus,
  SettlementStatus,
} from '../generated/client';
import {
  ALL_PERMISSIONS,
  ROLE_NAMES,
  DEFAULT_ROLE_PERMISSIONS,
  EXPENSE_CATEGORY_NAMES,
} from '@ecommerce-manager/shared';
import { hashPassword, generateRandomPassword } from '@ecommerce-manager/shared-server';

const prisma = new PrismaClient();

function daysAgo(days: number, hour = 10): Date {
  const now = new Date('2026-08-27T12:00:00.000Z');
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function utc(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

async function main() {
  console.log('Seeding database...');

  // -------------------------------------------------------------------
  // Empresa
  // -------------------------------------------------------------------
  const company = await prisma.company.upsert({
    where: { cnpj: '12.345.678/0001-90' },
    update: {},
    create: {
      name: 'Altenburg Ecommerce Demo',
      legalName: 'Altenburg Ecommerce Demo Ltda',
      cnpj: '12.345.678/0001-90',
      timezone: 'America/Sao_Paulo',
    },
  });

  // -------------------------------------------------------------------
  // Permissões e Roles (RBAC)
  // -------------------------------------------------------------------
  const permissionRecords = new Map<string, string>();
  for (const key of ALL_PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
    permissionRecords.set(key, perm.id);
  }

  const roleRecords = new Map<RoleName, string>();
  for (const name of ROLE_NAMES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `Role ${name}` },
    });
    roleRecords.set(name, role.id);

    for (const permKey of DEFAULT_ROLE_PERMISSIONS[name]) {
      const permissionId = permissionRecords.get(permKey);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  // -------------------------------------------------------------------
  // Usuários
  // -------------------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@altenburg.com.br';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? generateRandomPassword();
  const adminPasswordHash = await hashPassword(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      companyId: company.id,
      name: 'Administrador',
      email: adminEmail,
      passwordHash: adminPasswordHash,
      isActive: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: roleRecords.get('ADMIN')! } },
    update: {},
    create: { userId: admin.id, roleId: roleRecords.get('ADMIN')! },
  });

  const demoUsers: Array<{ name: string; email: string; role: RoleName }> = [
    { name: 'Gerente Demo', email: 'gerente@altenburg.com.br', role: 'MANAGER' },
    { name: 'Operador Demo', email: 'operador@altenburg.com.br', role: 'OPERATOR' },
    { name: 'Visualizador Demo', email: 'visualizador@altenburg.com.br', role: 'VIEWER' },
  ];
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? generateRandomPassword();
  const demoPasswordHash = await hashPassword(demoPassword);
  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        companyId: company.id,
        name: u.name,
        email: u.email,
        passwordHash: demoPasswordHash,
        isActive: true,
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleRecords.get(u.role)! } },
      update: {},
      create: { userId: user.id, roleId: roleRecords.get(u.role)! },
    });
  }

  // -------------------------------------------------------------------
  // Canais de venda + Integrações
  // -------------------------------------------------------------------
  const channelDefs: Array<{ name: string; type: ChannelType; isManual: boolean }> = [
    { name: 'TikTok Shop', type: ChannelType.TIKTOK_SHOP, isManual: false },
    { name: 'Shopee', type: ChannelType.SHOPEE, isManual: false },
    { name: 'Mercado Livre', type: ChannelType.MERCADO_LIVRE, isManual: false },
    { name: 'Instagram', type: ChannelType.INSTAGRAM, isManual: true },
    { name: 'WhatsApp', type: ChannelType.WHATSAPP, isManual: true },
    { name: 'Loja física', type: ChannelType.LOJA_FISICA, isManual: true },
    { name: 'Outro', type: ChannelType.OUTRO, isManual: true },
  ];
  const channels = new Map<ChannelType, string>();
  for (const c of channelDefs) {
    const channel = await prisma.salesChannel.upsert({
      where: { companyId_type_name: { companyId: company.id, type: c.type, name: c.name } },
      update: {},
      create: { companyId: company.id, name: c.name, type: c.type, isManual: c.isManual },
    });
    channels.set(c.type, channel.id);
  }

  await prisma.integration.upsert({
    where: { companyId_provider: { companyId: company.id, provider: IntegrationProvider.TIKTOK_SHOP } },
    update: {},
    create: {
      companyId: company.id,
      channelId: channels.get(ChannelType.TIKTOK_SHOP),
      provider: IntegrationProvider.TIKTOK_SHOP,
      status: IntegrationStatus.DISCONNECTED,
    },
  });
  await prisma.integration.upsert({
    where: { companyId_provider: { companyId: company.id, provider: IntegrationProvider.SHOPEE } },
    update: {},
    create: {
      companyId: company.id,
      channelId: channels.get(ChannelType.SHOPEE),
      provider: IntegrationProvider.SHOPEE,
      status: IntegrationStatus.COMING_SOON,
    },
  });
  await prisma.integration.upsert({
    where: {
      companyId_provider: { companyId: company.id, provider: IntegrationProvider.MERCADO_LIVRE },
    },
    update: {},
    create: {
      companyId: company.id,
      channelId: channels.get(ChannelType.MERCADO_LIVRE),
      provider: IntegrationProvider.MERCADO_LIVRE,
      status: IntegrationStatus.COMING_SOON,
    },
  });

  // -------------------------------------------------------------------
  // Categorias / Produtos / Variações / Custos
  // -------------------------------------------------------------------
  const categoryNames = ['Toalhas de Banho', 'Roupa de Cama', 'Cobertores e Mantas', 'Tapetes'];
  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const cat = await prisma.category.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: {},
      create: { companyId: company.id, name },
    });
    categories.set(name, cat.id);
  }

  interface VariantSeed {
    sku: string;
    barcode: string;
    color: string;
    size: string;
    weight: number;
    length: number;
    width: number;
    height: number;
    suggestedPrice: number;
    minStock: number;
    costHistory: Array<{ date: string; cost: number }>;
  }
  interface ProductSeed {
    name: string;
    description: string;
    baseSku: string;
    category: string;
    brand: string;
    variants: VariantSeed[];
  }

  const productSeeds: ProductSeed[] = [
    {
      name: 'Toalha Vienna Premium',
      description: 'Toalha de banho felpuda 100% algodão, linha premium.',
      baseSku: 'VIE-PRE',
      category: 'Toalhas de Banho',
      brand: 'Altenburg',
      variants: [
        {
          sku: 'VIE-PRE-AZ-M',
          barcode: '7891234500011',
          color: 'Azul',
          size: '70x140',
          weight: 0.6,
          length: 140,
          width: 70,
          height: 2,
          suggestedPrice: 129.9,
          minStock: 20,
          costHistory: [
            { date: '2026-06-01', cost: 62 },
            { date: '2026-07-15', cost: 68 },
            { date: '2026-08-20', cost: 71 },
          ],
        },
        {
          sku: 'VIE-PRE-BR-M',
          barcode: '7891234500028',
          color: 'Branco',
          size: '70x140',
          weight: 0.6,
          length: 140,
          width: 70,
          height: 2,
          suggestedPrice: 129.9,
          minStock: 20,
          costHistory: [{ date: '2026-07-01', cost: 65 }],
        },
        {
          sku: 'VIE-PRE-AZ-G',
          barcode: '7891234500035',
          color: 'Azul',
          size: '90x150',
          weight: 0.8,
          length: 150,
          width: 90,
          height: 2,
          suggestedPrice: 159.9,
          minStock: 15,
          costHistory: [{ date: '2026-07-01', cost: 79 }],
        },
      ],
    },
    {
      name: 'Jogo de Cama Malha 200 Fios',
      description: 'Jogo de cama em malha 100% algodão, 200 fios.',
      baseSku: 'JCM-200',
      category: 'Roupa de Cama',
      brand: 'Altenburg',
      variants: [
        {
          sku: 'JCM-200-SOL',
          barcode: '7891234500042',
          color: 'Branco',
          size: 'Solteiro',
          weight: 1.2,
          length: 0,
          width: 0,
          height: 0,
          suggestedPrice: 199.9,
          minStock: 12,
          costHistory: [{ date: '2026-06-10', cost: 98 }],
        },
        {
          sku: 'JCM-200-CAS',
          barcode: '7891234500059',
          color: 'Cinza',
          size: 'Casal',
          weight: 1.6,
          length: 0,
          width: 0,
          height: 0,
          suggestedPrice: 249.9,
          minStock: 10,
          costHistory: [{ date: '2026-06-10', cost: 122 }],
        },
        {
          sku: 'JCM-200-QUE',
          barcode: '7891234500066',
          color: 'Cinza',
          size: 'Queen',
          weight: 1.9,
          length: 0,
          width: 0,
          height: 0,
          suggestedPrice: 279.9,
          minStock: 8,
          costHistory: [{ date: '2026-06-10', cost: 139 }],
        },
      ],
    },
    {
      name: 'Manta Soft Inverno',
      description: 'Manta soft ultra macia para dias frios.',
      baseSku: 'MAN-SFT',
      category: 'Cobertores e Mantas',
      brand: 'Altenburg',
      variants: [
        {
          sku: 'MAN-SFT-CZ',
          barcode: '7891234500073',
          color: 'Cinza',
          size: 'Único',
          weight: 0.9,
          length: 220,
          width: 180,
          height: 3,
          suggestedPrice: 149.9,
          minStock: 15,
          costHistory: [{ date: '2026-06-05', cost: 71 }],
        },
        {
          sku: 'MAN-SFT-BG',
          barcode: '7891234500080',
          color: 'Bege',
          size: 'Único',
          weight: 0.9,
          length: 220,
          width: 180,
          height: 3,
          suggestedPrice: 149.9,
          minStock: 15,
          costHistory: [{ date: '2026-06-05', cost: 71 }],
        },
      ],
    },
    {
      name: 'Tapete Antiderrapante Box',
      description: 'Tapete antiderrapante para banheiro, secagem rápida.',
      baseSku: 'TAP-BOX',
      category: 'Tapetes',
      brand: 'Altenburg',
      variants: [
        {
          sku: 'TAP-BOX-CZ',
          barcode: '7891234500097',
          color: 'Cinza',
          size: '40x60',
          weight: 0.4,
          length: 60,
          width: 40,
          height: 1,
          suggestedPrice: 49.9,
          minStock: 25,
          costHistory: [{ date: '2026-07-01', cost: 18 }],
        },
        {
          sku: 'TAP-BOX-AZ',
          barcode: '7891234500103',
          color: 'Azul',
          size: '40x60',
          weight: 0.4,
          length: 60,
          width: 40,
          height: 1,
          suggestedPrice: 49.9,
          minStock: 25,
          costHistory: [{ date: '2026-07-01', cost: 18 }],
        },
      ],
    },
    {
      name: 'Toalha de Rosto Kit 3 Peças',
      description: 'Kit com 3 toalhas de rosto 100% algodão.',
      baseSku: 'TOA-KIT3',
      category: 'Toalhas de Banho',
      brand: 'Altenburg',
      variants: [
        {
          sku: 'TOA-KIT3-BR',
          barcode: '7891234500110',
          color: 'Branco',
          size: 'Único',
          weight: 0.5,
          length: 50,
          width: 30,
          height: 5,
          suggestedPrice: 69.9,
          minStock: 30,
          costHistory: [{ date: '2026-07-05', cost: 27 }],
        },
        {
          sku: 'TOA-KIT3-AZ',
          barcode: '7891234500127',
          color: 'Azul',
          size: 'Único',
          weight: 0.5,
          length: 50,
          width: 30,
          height: 5,
          suggestedPrice: 69.9,
          minStock: 30,
          costHistory: [{ date: '2026-07-05', cost: 27 }],
        },
      ],
    },
    {
      name: 'Edredom Dupla Face',
      description: 'Edredom dupla face, toque macio, ideal para todas as estações.',
      baseSku: 'EDR-DF',
      category: 'Roupa de Cama',
      brand: 'Altenburg',
      variants: [
        {
          sku: 'EDR-DF-CAS',
          barcode: '7891234500134',
          color: 'Grafite',
          size: 'Casal',
          weight: 2.1,
          length: 0,
          width: 0,
          height: 0,
          suggestedPrice: 289.9,
          minStock: 8,
          costHistory: [{ date: '2026-06-15', cost: 145 }],
        },
        {
          sku: 'EDR-DF-QUE',
          barcode: '7891234500141',
          color: 'Grafite',
          size: 'Queen',
          weight: 2.4,
          length: 0,
          width: 0,
          height: 0,
          suggestedPrice: 329.9,
          minStock: 6,
          costHistory: [{ date: '2026-06-15', cost: 168 }],
        },
      ],
    },
  ];

  const variantIds = new Map<string, string>(); // sku -> variantId
  const latestCost = new Map<string, number>(); // sku -> latest cost
  const minStockBySku = new Map<string, number>();

  for (const p of productSeeds) {
    const product = await prisma.product.upsert({
      where: { companyId_baseSku: { companyId: company.id, baseSku: p.baseSku } },
      update: {},
      create: {
        companyId: company.id,
        name: p.name,
        description: p.description,
        baseSku: p.baseSku,
        brand: p.brand,
        status: ProductStatus.ACTIVE,
        categoryId: categories.get(p.category),
      },
    });

    for (const v of p.variants) {
      const variant = await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: {},
        create: {
          productId: product.id,
          sku: v.sku,
          barcode: v.barcode,
          color: v.color,
          size: v.size,
          weight: v.weight,
          length: v.length || null,
          width: v.width || null,
          height: v.height || null,
          suggestedPrice: v.suggestedPrice,
          minStock: v.minStock,
          status: VariantStatus.ACTIVE,
        },
      });
      variantIds.set(v.sku, variant.id);
      minStockBySku.set(v.sku, v.minStock);

      for (const ch of v.costHistory) {
        await prisma.productCostHistory.create({
          data: {
            variantId: variant.id,
            cost: ch.cost,
            effectiveDate: utc(ch.date),
          },
        });
        latestCost.set(v.sku, ch.cost);
      }
    }
  }

  // -------------------------------------------------------------------
  // Fornecedores + Entrada de estoque
  // -------------------------------------------------------------------
  const supplierA = await prisma.supplier.create({
    data: {
      companyId: company.id,
      name: 'Têxtil Norte Fornecedora Ltda',
      document: '11.222.333/0001-44',
      email: 'contato@textilnorte.com.br',
    },
  });
  const supplierB = await prisma.supplier.create({
    data: {
      companyId: company.id,
      name: 'Distribuidora SulBRAS',
      document: '55.666.777/0001-88',
      email: 'vendas@sulbras.com.br',
    },
  });

  const stock: Record<string, number> = {};
  function addStock(sku: string, qty: number) {
    stock[sku] = (stock[sku] ?? 0) + qty;
  }

  const entryA = await prisma.stockEntry.create({
    data: {
      companyId: company.id,
      supplierId: supplierA.id,
      entryDate: daysAgo(50),
      invoiceNumber: 'NF-10023',
      status: StockEntryStatus.CONFIRMED,
    },
  });
  const entryAItems: Array<{ sku: string; quantity: number }> = [
    { sku: 'VIE-PRE-AZ-M', quantity: 80 },
    { sku: 'VIE-PRE-BR-M', quantity: 60 },
    { sku: 'VIE-PRE-AZ-G', quantity: 40 },
    { sku: 'TOA-KIT3-BR', quantity: 100 },
    { sku: 'TOA-KIT3-AZ', quantity: 90 },
  ];
  for (const item of entryAItems) {
    const variantId = variantIds.get(item.sku)!;
    await prisma.stockEntryItem.create({
      data: {
        stockEntryId: entryA.id,
        variantId,
        quantity: item.quantity,
        unitCost: latestCost.get(item.sku) ?? 0,
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        companyId: company.id,
        variantId,
        type: InventoryMovementType.PURCHASE,
        quantity: item.quantity,
        reference: entryA.invoiceNumber,
        note: 'Entrada de estoque inicial',
        createdBy: admin.id,
        createdAt: daysAgo(50),
      },
    });
    addStock(item.sku, item.quantity);
  }

  const entryB = await prisma.stockEntry.create({
    data: {
      companyId: company.id,
      supplierId: supplierB.id,
      entryDate: daysAgo(35),
      invoiceNumber: 'NF-88410',
      status: StockEntryStatus.CONFIRMED,
    },
  });
  const entryBItems: Array<{ sku: string; quantity: number }> = [
    { sku: 'JCM-200-SOL', quantity: 25 },
    { sku: 'JCM-200-CAS', quantity: 20 },
    { sku: 'JCM-200-QUE', quantity: 15 },
    { sku: 'MAN-SFT-CZ', quantity: 30 },
    { sku: 'MAN-SFT-BG', quantity: 30 },
    { sku: 'TAP-BOX-CZ', quantity: 50 },
    { sku: 'TAP-BOX-AZ', quantity: 50 },
    { sku: 'EDR-DF-CAS', quantity: 12 },
    { sku: 'EDR-DF-QUE', quantity: 8 },
  ];
  for (const item of entryBItems) {
    const variantId = variantIds.get(item.sku)!;
    await prisma.stockEntryItem.create({
      data: {
        stockEntryId: entryB.id,
        variantId,
        quantity: item.quantity,
        unitCost: latestCost.get(item.sku) ?? 0,
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        companyId: company.id,
        variantId,
        type: InventoryMovementType.PURCHASE,
        quantity: item.quantity,
        reference: entryB.invoiceNumber,
        note: 'Entrada de estoque inicial',
        createdBy: admin.id,
        createdAt: daysAgo(35),
      },
    });
    addStock(item.sku, item.quantity);
  }

  // -------------------------------------------------------------------
  // Pedidos (TikTok mock + vendas manuais) + itens + pagamentos + histórico
  // -------------------------------------------------------------------
  interface OrderSeed {
    channel: ChannelType;
    externalOrderId: string | null;
    customerName: string;
    daysAgo: number;
    status: OrderStatus;
    items: Array<{ sku: string; quantity: number; discount?: number }>;
    withFiscalDocument: boolean;
    createdBy?: string;
  }

  const orderSeeds: OrderSeed[] = [
    {
      channel: ChannelType.TIKTOK_SHOP,
      externalOrderId: 'TT-990211',
      customerName: 'Fernanda Alves',
      daysAgo: 25,
      status: OrderStatus.DELIVERED,
      items: [{ sku: 'VIE-PRE-AZ-M', quantity: 2 }],
      withFiscalDocument: true,
    },
    {
      channel: ChannelType.TIKTOK_SHOP,
      externalOrderId: 'TT-990344',
      customerName: 'Carlos Eduardo Souza',
      daysAgo: 20,
      status: OrderStatus.DELIVERED,
      items: [{ sku: 'JCM-200-CAS', quantity: 1 }],
      withFiscalDocument: true,
    },
    {
      channel: ChannelType.TIKTOK_SHOP,
      externalOrderId: 'TT-990512',
      customerName: 'Juliana Ramos',
      daysAgo: 15,
      status: OrderStatus.SHIPPED,
      items: [{ sku: 'MAN-SFT-CZ', quantity: 1 }, { sku: 'TAP-BOX-CZ', quantity: 1 }],
      withFiscalDocument: true,
    },
    {
      channel: ChannelType.TIKTOK_SHOP,
      externalOrderId: 'TT-990733',
      customerName: 'Roberto Lima',
      daysAgo: 10,
      status: OrderStatus.RETURN_REQUESTED,
      items: [{ sku: 'VIE-PRE-AZ-G', quantity: 1 }],
      withFiscalDocument: true,
    },
    {
      channel: ChannelType.TIKTOK_SHOP,
      externalOrderId: 'TT-990890',
      customerName: 'Patrícia Gomes',
      daysAgo: 6,
      status: OrderStatus.PROCESSING,
      items: [{ sku: 'TOA-KIT3-BR', quantity: 3 }],
      withFiscalDocument: false,
    },
    {
      channel: ChannelType.TIKTOK_SHOP,
      externalOrderId: 'TT-991020',
      customerName: 'André Martins',
      daysAgo: 3,
      status: OrderStatus.PAID,
      items: [{ sku: 'EDR-DF-CAS', quantity: 1 }],
      withFiscalDocument: false,
    },
    {
      channel: ChannelType.TIKTOK_SHOP,
      externalOrderId: 'TT-991155',
      customerName: 'Beatriz Nunes',
      daysAgo: 40,
      status: OrderStatus.CANCELLED,
      items: [{ sku: 'JCM-200-QUE', quantity: 1 }],
      withFiscalDocument: false,
    },
    {
      channel: ChannelType.INSTAGRAM,
      externalOrderId: null,
      customerName: 'Marcos Vinícius',
      daysAgo: 12,
      status: OrderStatus.DELIVERED,
      items: [{ sku: 'TOA-KIT3-AZ', quantity: 2 }],
      withFiscalDocument: true,
      createdBy: admin.id,
    },
    {
      channel: ChannelType.WHATSAPP,
      externalOrderId: null,
      customerName: 'Larissa Costa',
      daysAgo: 8,
      status: OrderStatus.PROCESSING,
      items: [{ sku: 'MAN-SFT-BG', quantity: 1 }],
      withFiscalDocument: false,
      createdBy: admin.id,
    },
    {
      channel: ChannelType.LOJA_FISICA,
      externalOrderId: null,
      customerName: 'Cliente Balcão',
      daysAgo: 2,
      status: OrderStatus.DELIVERED,
      items: [{ sku: 'TAP-BOX-AZ', quantity: 2 }, { sku: 'VIE-PRE-BR-M', quantity: 1 }],
      withFiscalDocument: true,
      createdBy: admin.id,
    },
  ];

  const statusFlow: OrderStatus[] = [
    OrderStatus.CREATED,
    OrderStatus.PAID,
    OrderStatus.PROCESSING,
    OrderStatus.READY_TO_SHIP,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
  ];

  let fiscalCounter = 1001;

  for (const seed of orderSeeds) {
    const channelId = channels.get(seed.channel)!;
    let subtotal = 0;
    const items: Array<{ variantId: string; sku: string; quantity: number; unitPrice: number; discount: number; unitCost: number }> = [];
    for (const it of seed.items) {
      const variantId = variantIds.get(it.sku)!;
      const priceRow = productSeeds
        .flatMap((p) => p.variants)
        .find((v) => v.sku === it.sku)!;
      const unitPrice = priceRow.suggestedPrice;
      const discount = it.discount ?? 0;
      const unitCost = latestCost.get(it.sku) ?? 0;
      subtotal += unitPrice * it.quantity - discount;
      items.push({ variantId, sku: it.sku, quantity: it.quantity, unitPrice, discount, unitCost });
    }
    const shipping = seed.channel === ChannelType.LOJA_FISICA ? 0 : 19.9;
    const total = subtotal + shipping;

    const order = await prisma.order.create({
      data: {
        companyId: company.id,
        channelId,
        externalOrderId: seed.externalOrderId,
        customerName: seed.customerName,
        status: seed.status,
        externalStatus: seed.externalOrderId ? seed.status : null,
        orderDate: daysAgo(seed.daysAgo),
        subtotal,
        discount: 0,
        shipping,
        total,
        paymentMethod: seed.channel === ChannelType.LOJA_FISICA ? 'Dinheiro' : 'Cartão de crédito',
        items: {
          create: items.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discount: i.discount,
            unitCost: i.unitCost,
          })),
        },
      },
      include: { items: true },
    });

    // Histórico de status: percorre o fluxo até o status atual (ou aplica cancelamento/devolução direto).
    const idx = statusFlow.indexOf(seed.status);
    const historyStatuses = idx >= 0 ? statusFlow.slice(0, idx + 1) : [OrderStatus.CREATED, seed.status];
    for (let i = 0; i < historyStatuses.length; i++) {
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: historyStatuses[i],
          changedAt: daysAgo(seed.daysAgo - i),
          changedBy: seed.createdBy ?? null,
        },
      });
    }

    if (seed.status !== OrderStatus.CANCELLED) {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          method: order.paymentMethod ?? 'Cartão de crédito',
          amount: total,
          status: PaymentStatus.PAID,
          paidAt: daysAgo(seed.daysAgo),
        },
      });
    }

    // Movimentação de estoque (saída por venda), exceto pedidos cancelados.
    if (seed.status !== OrderStatus.CANCELLED) {
      for (const it of items) {
        await prisma.inventoryMovement.create({
          data: {
            companyId: company.id,
            variantId: it.variantId,
            type: InventoryMovementType.SALE,
            quantity: -it.quantity,
            reference: seed.externalOrderId ?? order.id,
            note: `Venda ${seed.channel}`,
            createdBy: seed.createdBy ?? null,
            createdAt: daysAgo(seed.daysAgo),
          },
        });
        addStock(it.sku, -it.quantity);
      }
    }

    // Taxas de marketplace (mock) para pedidos do TikTok.
    if (seed.channel === ChannelType.TIKTOK_SHOP && seed.status !== OrderStatus.CANCELLED) {
      await prisma.marketplaceFee.create({
        data: {
          channelId,
          orderId: order.id,
          feeType: 'COMMISSION',
          amount: Number((total * 0.08).toFixed(2)),
        },
      });
      await prisma.marketplaceFee.create({
        data: {
          channelId,
          orderId: order.id,
          feeType: 'PAYMENT_FEE',
          amount: Number((total * 0.02).toFixed(2)),
        },
      });
    }

    if (seed.withFiscalDocument) {
      fiscalCounter += 1;
      await prisma.fiscalDocument.create({
        data: {
          companyId: company.id,
          orderId: order.id,
          type: FiscalDocumentType.SALE_INVOICE,
          number: String(fiscalCounter),
          series: '1',
          accessKey: `3526${fiscalCounter}00012345000199550010000${fiscalCounter}1234567890`,
          xmlPath: `fiscal/seed/nfe-${fiscalCounter}.xml`,
          status: FiscalDocumentStatus.ISSUED,
          issueDate: daysAgo(seed.daysAgo - 1),
        },
      });
    }

    // Devolução de exemplo para o pedido com status RETURN_REQUESTED.
    if (seed.status === OrderStatus.RETURN_REQUESTED) {
      const firstItem = order.items[0];
      const ret = await prisma.return.create({
        data: {
          orderId: order.id,
          reason: 'Produto com defeito de acabamento',
          status: ReturnStatus.REQUESTED,
          requestedAt: daysAgo(seed.daysAgo - 2),
        },
      });
      await prisma.returnItem.create({
        data: {
          returnId: ret.id,
          orderItemId: firstItem.id,
          quantity: 1,
          condition: 'Defeituoso',
        },
      });
      await prisma.refund.create({
        data: {
          returnId: ret.id,
          amount: firstItem.unitPrice,
          method: 'Estorno no cartão',
          status: RefundStatus.PENDING,
        },
      });
    }
  }

  // -------------------------------------------------------------------
  // Estoque atual + ajuste/avaria de exemplo
  // -------------------------------------------------------------------
  const adjustSku = 'TAP-BOX-CZ';
  await prisma.inventoryMovement.create({
    data: {
      companyId: company.id,
      variantId: variantIds.get(adjustSku)!,
      type: InventoryMovementType.DAMAGE,
      quantity: -3,
      note: 'Avaria identificada em conferência de estoque',
      createdBy: admin.id,
      createdAt: daysAgo(5),
    },
  });
  addStock(adjustSku, -3);

  for (const [sku, variantId] of variantIds.entries()) {
    const available = Math.max(stock[sku] ?? 0, 0);
    const minStock = minStockBySku.get(sku) ?? 0;
    // Reserva simulada para dar realismo (pedidos em processamento reservam estoque).
    const reserved = available > 5 && sku === 'TOA-KIT3-BR' ? 3 : 0;
    await prisma.inventory.upsert({
      where: { variantId },
      update: { available: Math.max(available - reserved, 0), reserved },
      create: {
        companyId: company.id,
        variantId,
        available: Math.max(available - reserved, 0),
        reserved,
      },
    });
    void minStock;
  }

  // -------------------------------------------------------------------
  // Financeiro: categorias de despesa + despesas
  // -------------------------------------------------------------------
  const expenseCategoryIds = new Map<string, string>();
  for (const name of EXPENSE_CATEGORY_NAMES) {
    const cat = await prisma.expenseCategory.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: {},
      create: { companyId: company.id, name },
    });
    expenseCategoryIds.set(name, cat.id);
  }

  const expenseSeeds: Array<{ category: string; description: string; amount: number; daysAgo: number; method: string }> = [
    { category: 'Marketing', description: 'Impulsionamento de anúncios TikTok Ads', amount: 850, daysAgo: 20, method: 'Cartão corporativo' },
    { category: 'Marketing', description: 'Produção de fotos de produto', amount: 400, daysAgo: 45, method: 'PIX' },
    { category: 'Contabilidade', description: 'Honorários contábeis - mensalidade', amount: 690, daysAgo: 15, method: 'Boleto' },
    { category: 'Embalagem', description: 'Compra de caixas e etiquetas', amount: 320.5, daysAgo: 30, method: 'PIX' },
    { category: 'Software', description: 'Assinatura ERP/Ecommerce Manager', amount: 199, daysAgo: 10, method: 'Cartão corporativo' },
    { category: 'Internet', description: 'Internet fibra - escritório', amount: 149.9, daysAgo: 25, method: 'Débito automático' },
    { category: 'Frete', description: 'Frete de reposição para devolução', amount: 45, daysAgo: 8, method: 'PIX' },
    { category: 'Taxa bancária', description: 'Tarifa de manutenção de conta PJ', amount: 39.9, daysAgo: 25, method: 'Débito automático' },
    { category: 'Impostos', description: 'DAS Simples Nacional', amount: 610.3, daysAgo: 18, method: 'Boleto' },
    { category: 'Material', description: 'Material de escritório', amount: 95, daysAgo: 33, method: 'PIX' },
    { category: 'Outros', description: 'Despesas diversas', amount: 60, daysAgo: 5, method: 'PIX' },
  ];
  for (const e of expenseSeeds) {
    await prisma.expense.create({
      data: {
        companyId: company.id,
        categoryId: expenseCategoryIds.get(e.category)!,
        description: e.description,
        amount: e.amount,
        date: daysAgo(e.daysAgo),
        paymentMethod: e.method,
      },
    });
  }

  // -------------------------------------------------------------------
  // Repasse (settlement) de exemplo para o canal TikTok
  // -------------------------------------------------------------------
  const tiktokOrders = await prisma.order.findMany({
    where: { companyId: company.id, channelId: channels.get(ChannelType.TIKTOK_SHOP), status: { not: OrderStatus.CANCELLED } },
  });
  const settlement = await prisma.settlement.create({
    data: {
      companyId: company.id,
      channelId: channels.get(ChannelType.TIKTOK_SHOP)!,
      periodStart: utc('2026-07-01'),
      periodEnd: utc('2026-07-31'),
      totalAmount: tiktokOrders.reduce((acc, o) => acc + Number(o.total), 0),
      status: SettlementStatus.CLOSED,
    },
  });
  for (const o of tiktokOrders) {
    await prisma.settlementTransaction.create({
      data: {
        settlementId: settlement.id,
        orderId: o.id,
        type: 'ORDER_PAYOUT',
        amount: o.total,
      },
    });
  }

  // -------------------------------------------------------------------
  // Fechamento mensal (Julho fechado, Agosto em aberto)
  // -------------------------------------------------------------------
  await prisma.monthlyClosing.upsert({
    where: { companyId_referenceMonth: { companyId: company.id, referenceMonth: utc('2026-07-01') } },
    update: {},
    create: {
      companyId: company.id,
      referenceMonth: utc('2026-07-01'),
      grossRevenue: 18450.3,
      discounts: 320.0,
      returnsAmount: 199.9,
      netRevenue: 17930.4,
      cmv: 8120.5,
      grossProfit: 9809.9,
      fees: 1476.0,
      marketing: 1250.0,
      packaging: 320.5,
      otherExpenses: 855.19,
      estimatedTaxes: 610.3,
      managementResult: 5297.91,
      status: MonthlyClosingStatus.CLOSED,
      closedAt: daysAgo(28),
    },
  });
  await prisma.monthlyClosing.upsert({
    where: { companyId_referenceMonth: { companyId: company.id, referenceMonth: utc('2026-08-01') } },
    update: {},
    create: {
      companyId: company.id,
      referenceMonth: utc('2026-08-01'),
      grossRevenue: 9820.1,
      discounts: 0,
      returnsAmount: 129.9,
      netRevenue: 9690.2,
      cmv: 4310.2,
      grossProfit: 5380.0,
      fees: 786.4,
      marketing: 850.0,
      packaging: 0,
      otherExpenses: 244.9,
      estimatedTaxes: 0,
      managementResult: 3498.7,
      status: MonthlyClosingStatus.OPEN,
    },
  });

  // -------------------------------------------------------------------
  // Auditoria (amostra)
  // -------------------------------------------------------------------
  const auditSeeds: Array<{ action: string; entity: string; entityId?: string }> = [
    { action: 'CREATE', entity: 'company', entityId: company.id },
    { action: 'CREATE', entity: 'user', entityId: admin.id },
    { action: 'CREATE', entity: 'product' },
    { action: 'UPDATE', entity: 'product_variant' },
    { action: 'ADJUST', entity: 'inventory' },
    { action: 'UPDATE', entity: 'order' },
    { action: 'CREATE', entity: 'expense' },
  ];
  for (const [i, a] of auditSeeds.entries()) {
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        userId: admin.id,
        action: a.action,
        entity: a.entity,
        entityId: a.entityId ?? null,
        ip: '127.0.0.1',
        createdAt: daysAgo(30 - i * 3),
      },
    });
  }

  console.log('Seed concluído.');
  console.log('----------------------------------------------------');
  console.log(`Usuário admin: ${adminEmail}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Senha gerada (guarde em local seguro): ${adminPassword}`);
  }
  console.log(`Usuários demo (mesma senha): ${demoUsers.map((u) => u.email).join(', ')}`);
  if (!process.env.SEED_DEMO_PASSWORD) {
    console.log(`Senha dos usuários demo: ${demoPassword}`);
  }
  console.log('----------------------------------------------------');
}

main()
  .catch((err) => {
    console.error('Erro ao executar seed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
