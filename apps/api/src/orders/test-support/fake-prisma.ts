/**
 * Prisma fake em memória usado apenas nos testes de sincronização externa de pedidos
 * (orders-external-sync.spec.ts). Implementa só o subconjunto de operações que
 * `OrdersService`/`InventoryLedgerService` realmente chamam — não é um mock genérico de
 * Prisma, é deliberadamente estreito para ficar fácil de auditar linha a linha.
 */
import { randomUUID } from 'node:crypto';

export interface FakeOrder {
  id: string;
  companyId: string;
  channelId: string;
  externalOrderId: string | null;
  customerName: string | null;
  status: string;
  externalStatus: string | null;
  externalUpdatedAt: Date | null;
  integrationSyncStatus: string;
  integrationIssue: string | null;
  orderDate: Date;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}

export interface FakeOrderItem {
  id: string;
  orderId: string;
  variantId: string | null;
  externalSku: string | null;
  quantity: number;
  productNameAtSale: string;
  skuAtSale: string;
  unitPrice: number;
  unitCost: number;
  sellerDiscount: number;
  platformDiscount: number;
  shippingRevenue: number;
  shippingCost: number;
  marketplaceFee: number;
}

export interface FakeMapping {
  id: string;
  channelId: string;
  externalSku: string;
  variantId: string;
  syncStatus: string;
}

export interface FakeVariant {
  id: string;
  sku: string;
  productName: string;
  cost: number;
}

export interface FakeInventory {
  variantId: string;
  companyId: string;
  onHand: number;
  reserved: number;
}

export class FakeDb {
  orders: FakeOrder[] = [];
  orderItems: FakeOrderItem[] = [];
  mappings: FakeMapping[] = [];
  variants: FakeVariant[] = [];
  inventories: FakeInventory[] = [];
  statusHistory: Array<{ id: string; orderId: string; status: string; note: string | null }> = [];
  movements: unknown[] = [];

  addVariant(v: FakeVariant) {
    this.variants.push(v);
    this.inventories.push({ variantId: v.id, companyId: 'company-1', onHand: 0, reserved: 0 });
  }

  addMapping(m: Omit<FakeMapping, 'id'>) {
    this.mappings.push({ id: randomUUID(), ...m });
  }

  /** Objeto passado como `PrismaService` (nível "client") — `$transaction` chama a função com o mesmo objeto. */
  asPrismaService() {
    const client = {
      order: {
        findUnique: async ({ where }: { where: { companyId_channelId_externalOrderId?: { companyId: string; channelId: string; externalOrderId: string } } }) => {
          const key = where.companyId_channelId_externalOrderId!;
          return this.orders.find(
            (o) => o.companyId === key.companyId && o.channelId === key.channelId && o.externalOrderId === key.externalOrderId,
          ) ?? null;
        },
        findFirst: async ({ where }: { where: { id: string; companyId: string } }) => {
          const order = this.orders.find((o) => o.id === where.id && o.companyId === where.companyId);
          if (!order) return null;
          return { ...order, items: this.orderItems.filter((i) => i.orderId === order.id) };
        },
        create: async ({ data }: { data: Record<string, unknown> & { items: { create: Partial<FakeOrderItem>[] } } }) => {
          const id = randomUUID();
          const { items, ...orderData } = data;
          const order = { id, ...orderData } as unknown as FakeOrder;
          this.orders.push(order);
          const createdItems = items.create.map((item) => {
            const created: FakeOrderItem = {
              id: randomUUID(),
              orderId: id,
              variantId: item.variantId ?? null,
              externalSku: item.externalSku ?? null,
              quantity: item.quantity!,
              productNameAtSale: item.productNameAtSale!,
              skuAtSale: item.skuAtSale!,
              unitPrice: item.unitPrice as number,
              unitCost: item.unitCost as number,
              sellerDiscount: (item.sellerDiscount as number) ?? 0,
              platformDiscount: (item.platformDiscount as number) ?? 0,
              shippingRevenue: (item.shippingRevenue as number) ?? 0,
              shippingCost: (item.shippingCost as number) ?? 0,
              marketplaceFee: (item.marketplaceFee as number) ?? 0,
            };
            this.orderItems.push(created);
            return created;
          });
          return { ...order, items: createdItems };
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const order = this.orders.find((o) => o.id === where.id)!;
          Object.assign(order, data);
          return order;
        },
      },
      orderItem: {
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const item = this.orderItems.find((i) => i.id === where.id)!;
          Object.assign(item, data);
          return item;
        },
        count: async ({ where }: { where: { orderId: string; variantId: null } }) => {
          return this.orderItems.filter((i) => i.orderId === where.orderId && i.variantId === null).length;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { orderId: string; marketplaceFee?: number };
          data: Record<string, unknown>;
        }) => {
          const items = this.orderItems.filter(
            (i) => i.orderId === where.orderId && (where.marketplaceFee === undefined || i.marketplaceFee === where.marketplaceFee),
          );
          for (const item of items) Object.assign(item, data);
          return { count: items.length };
        },
      },
      orderStatusHistory: {
        create: async ({ data }: { data: { orderId: string; status: string; note?: string | null } }) => {
          const entry = { id: randomUUID(), orderId: data.orderId, status: data.status, note: data.note ?? null };
          this.statusHistory.push(entry);
          return entry;
        },
      },
      channelProductMapping: {
        findFirst: async ({
          where,
        }: {
          where: { channelId: string; externalSku: string; syncStatus: { in: string[] } };
        }) => {
          const mapping = this.mappings.find(
            (m) =>
              m.channelId === where.channelId &&
              m.externalSku === where.externalSku &&
              where.syncStatus.in.includes(m.syncStatus),
          );
          if (!mapping) return null;
          const variant = this.variants.find((v) => v.id === mapping.variantId)!;
          return {
            ...mapping,
            variant: {
              id: variant.id,
              sku: variant.sku,
              product: { name: variant.productName },
              costHistory: [{ cost: variant.cost }],
            },
          };
        },
      },
      inventory: {
        findUnique: async ({ where }: { where: { variantId: string } }) => {
          const inv = this.inventories.find((i) => i.variantId === where.variantId);
          return inv ? { id: `inv-${inv.variantId}`, ...inv, updatedAt: new Date() } : null;
        },
        findUniqueOrThrow: async ({ where }: { where: { variantId: string } }) => {
          const inv = this.inventories.find((i) => i.variantId === where.variantId)!;
          return { id: `inv-${inv.variantId}`, ...inv, updatedAt: new Date() };
        },
        create: async ({ data }: { data: { companyId: string; variantId: string; onHand: number; reserved: number } }) => {
          this.inventories.push(data);
          return { id: `inv-${data.variantId}`, ...data, updatedAt: new Date() };
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { variantId: string; onHand: number; reserved: number };
          data: { onHand: number; reserved: number };
        }) => {
          const inv = this.inventories.find((i) => i.variantId === where.variantId);
          if (!inv || inv.onHand !== where.onHand || inv.reserved !== where.reserved) return { count: 0 };
          inv.onHand = data.onHand;
          inv.reserved = data.reserved;
          return { count: 1 };
        },
      },
      inventoryMovement: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const movement = { id: randomUUID(), ...data };
          this.movements.push(movement);
          return movement;
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
    };

    return { client };
  }
}
