import {
  mapOrderStatus,
  normalizeOrder,
  normalizeProduct,
  normalizeTransactionType,
  extractSellerSku,
} from '@ecommerce-manager/integrations';

describe('TikTok Shop — mapper (seção 16/29, docs/integrations/tiktok-data-mapping.md)', () => {
  it('mapeia todos os status documentados na tabela de mapeamento', () => {
    expect(mapOrderStatus('UNPAID')).toBe('CREATED');
    expect(mapOrderStatus('AWAITING_SHIPMENT')).toBe('PAID');
    expect(mapOrderStatus('AWAITING_COLLECTION')).toBe('PROCESSING');
    expect(mapOrderStatus('PACKAGE_READY_TO_SHIP')).toBe('READY_TO_SHIP');
    expect(mapOrderStatus('IN_TRANSIT')).toBe('SHIPPED');
    expect(mapOrderStatus('COMPLETED')).toBe('DELIVERED');
    expect(mapOrderStatus('CANCELLED')).toBe('CANCELLED');
    expect(mapOrderStatus('IN_RETURN')).toBe('RETURN_REQUESTED');
  });

  it('nunca adivinha um status desconhecido — retorna null explicitamente', () => {
    expect(mapOrderStatus('SOME_FUTURE_STATUS_NOT_DOCUMENTED')).toBeNull();
  });

  it('é case-insensitive (a TikTok pode variar a caixa entre versões de API)', () => {
    expect(mapOrderStatus('shipped')).toBe('SHIPPED');
  });

  it('normaliza um pedido bruto preservando o status externo e mapeando o interno', () => {
    const raw = {
      order_id: 'TT-9001',
      status: 'AWAITING_SHIPMENT',
      buyer_name: 'Fulano',
      create_time: 1735689600,
      line_items: [
        { sku_id: 'sku-ext-1', quantity: 2, sale_price: '25.00', seller_discount: '1.00' },
      ],
      payment: { shipping_fee: '9.90', seller_shipping_fee: '5.00', platform_fee: '2.30' },
    };

    const normalized = normalizeOrder(raw);
    expect(normalized.externalOrderId).toBe('TT-9001');
    expect(normalized.status).toBe('AWAITING_SHIPMENT');
    expect(normalized.internalStatus).toBe('PAID');
    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]).toMatchObject({ externalSku: 'sku-ext-1', quantity: 2, unitPrice: '25.00' });
    expect(normalized.shippingRevenue).toBe('9.90');
    expect(normalized.marketplaceFee).toBe('2.30');
  });

  it('normaliza um pedido com status desconhecido sem lançar erro (internalStatus vazio)', () => {
    const normalized = normalizeOrder({ order_id: 'TT-9002', status: 'ALGO_NOVO', line_items: [] });
    expect(normalized.internalStatus).toBe('');
    expect(normalized.status).toBe('ALGO_NOVO');
  });

  it('normaliza produto e extrai o seller_sku separadamente (nunca persistido como externalSku)', () => {
    const raw = {
      product_id: 'p-1',
      product_name: 'Camiseta Azul',
      price: { sale_price: '49.90' },
      skus: [{ id: 'sku-ext-1', seller_sku: 'CAM-AZUL-M', inventory: [{ quantity: 10 }, { quantity: 5 }] }],
    };
    const product = normalizeProduct(raw);
    expect(product.externalSku).toBe('sku-ext-1');
    expect(product.name).toBe('Camiseta Azul');
    expect(product.stock).toBe(15);
    expect(extractSellerSku(raw)).toBe('CAM-AZUL-M');
  });

  it('normaliza categorias financeiras conhecidas e cai em OTHER para categorias não reconhecidas', () => {
    expect(normalizeTransactionType('order_amount')).toBe('GROSS_SALE');
    expect(normalizeTransactionType('commission_fee')).toBe('PLATFORM_FEE');
    expect(normalizeTransactionType('algo_nunca_visto')).toBe('OTHER');
  });
});
