import { mapMercadoLivreOrderStatus, normalizeMercadoLivreOrder } from '@ecommerce-manager/integrations';
import type { MercadoLivreOrder } from '@ecommerce-manager/integrations';

describe('Mercado Livre — mapper (docs/integrations/mercado-livre.md, seção 4)', () => {
  it('mapeia o único status confirmado contra uma chamada real ("cancelled")', () => {
    expect(mapMercadoLivreOrderStatus('cancelled')).toBe('CANCELLED');
    expect(mapMercadoLivreOrderStatus('CANCELLED')).toBe('CANCELLED');
  });

  it('nunca adivinha um status ainda não confirmado — retorna null explicitamente', () => {
    expect(mapMercadoLivreOrderStatus('paid')).toBeNull();
    expect(mapMercadoLivreOrderStatus('confirmed')).toBeNull();
  });

  // Payload real (anonimizado), confirmado contra uma chamada de produção em 2026-09-05 — ver
  // docs/integrations/mercado-livre.md, seção 4.
  const realOrder: MercadoLivreOrder = {
    id: 2000016592129816,
    date_created: '2026-05-24T23:49:17.000-04:00',
    last_updated: '2026-05-25T00:11:20.000-04:00',
    date_closed: '2026-05-24T23:50:01.000-04:00',
    pack_id: 2000013151469317,
    fulfilled: false,
    buying_mode: 'buy_equals_pay',
    total_amount: 76,
    paid_amount: 0,
    order_items: [
      {
        item: {
          id: 'MLB6717678206',
          title: 'Bolsa Saco Com Design Franzido Em Material Macio',
          category_id: 'MLB7022',
          variation_id: 201389264747,
          seller_custom_field: null,
          warranty: 'Sem garantia',
          condition: 'new',
          seller_sku: 'MLB6717678206_201389264747',
          global_price: null,
          net_weight: null,
        },
        quantity: 1,
        unit_price: 76,
        currency_id: 'BRL',
        manufacturing_days: null,
        picked_quantity: null,
        sale_fee: 14.44,
        listing_type_id: 'gold_pro',
      },
    ],
    currency_id: 'BRL',
    payments: [
      {
        id: 160887959518,
        order_id: 2000016592129816,
        payer_id: 205265842,
        collector: { id: 532363529 },
        payment_method_id: 'account_money',
        payment_type: 'account_money',
        status: 'refunded',
        status_detail: 'bpp_refunded',
        transaction_amount: 76,
        transaction_amount_refunded: 76,
        taxes_amount: 0,
        total_paid_amount: 76,
        marketplace_fee: 0,
        date_approved: '2026-05-24T23:50:00.000-04:00',
        date_created: '2026-05-24T23:50:00.000-04:00',
        date_last_modified: '2026-05-25T00:11:19.000-04:00',
      },
    ],
    shipping: { id: 47139993745 },
    status: 'cancelled',
    status_detail: null,
    tags: ['not_delivered', 'not_paid', 'pack_order'],
    context: { channel: 'marketplace', site: 'MLB', flows: [] },
    buyer: { id: 205265842, nickname: 'PINTOCOELHOPAULA', first_name: 'PAULA', last_name: 'PINTO COELHO' },
    seller: { id: 532363529 },
    taxes: { amount: null, currency_id: null, id: null },
  };

  it('normaliza o pedido real preservando o status externo e mapeando o interno', () => {
    const normalized = normalizeMercadoLivreOrder(realOrder);
    expect(normalized.externalOrderId).toBe('2000016592129816');
    expect(normalized.status).toBe('cancelled');
    expect(normalized.internalStatus).toBe('CANCELLED');
    expect(normalized.customerName).toBe('PAULA PINTO COELHO');
    expect(normalized.orderDate).toEqual(new Date('2026-05-24T23:49:17.000-04:00'));
    expect(normalized.paidAt).toEqual(new Date('2026-05-24T23:50:00.000-04:00'));
  });

  it('mapeia os itens do pedido, incluindo o seller_sku real', () => {
    const normalized = normalizeMercadoLivreOrder(realOrder);
    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]).toMatchObject({
      externalSku: 'MLB6717678206_201389264747',
      quantity: 1,
      unitPrice: '76.00',
    });
  });

  it('soma sale_fee de todos os itens como marketplaceFee — nunca usa payments[].marketplace_fee (veio zerado)', () => {
    const normalized = normalizeMercadoLivreOrder(realOrder);
    expect(normalized.marketplaceFee).toBe('14.44');
  });

  it('nunca inventa shippingRevenue/shippingCost (dado mora em GET /shipments/{id}, fora de escopo)', () => {
    const normalized = normalizeMercadoLivreOrder(realOrder);
    expect(normalized.shippingRevenue).toBeUndefined();
    expect(normalized.shippingCost).toBeUndefined();
  });

  it('normaliza um pedido com status desconhecido sem lançar erro (internalStatus vazio)', () => {
    const normalized = normalizeMercadoLivreOrder({ ...realOrder, status: 'paid' });
    expect(normalized.internalStatus).toBe('');
    expect(normalized.status).toBe('paid');
  });

  it('usa item.id como fallback quando seller_sku não vem preenchido', () => {
    const withoutSku: MercadoLivreOrder = {
      ...realOrder,
      order_items: [{ ...realOrder.order_items[0], item: { ...realOrder.order_items[0].item, seller_sku: undefined } }],
    };
    const normalized = normalizeMercadoLivreOrder(withoutSku);
    expect(normalized.items[0].externalSku).toBe('MLB6717678206');
  });
});
