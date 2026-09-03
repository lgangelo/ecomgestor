import {
  mapOrderStatus,
  normalizeOrder,
  normalizeProductSkus,
  normalizeStatement,
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

  it('normaliza um produto com múltiplas SKUs (cor/tamanho) — uma por variação, não só a primeira', () => {
    // Campos conferidos contra um payload real (product-level "id", não "product_id"; preço em
    // skus[].price.tax_exclusive_price/.tax_inclusive_price, não .amount) — ver comentário em
    // normalizeProductSkus.
    const raw = {
      id: 'p-1',
      title: 'Camiseta Azul',
      skus: [
        {
          id: 'sku-ext-1',
          seller_sku: 'CAM-AZUL-M',
          price: { tax_exclusive_price: '49.90', currency: 'BRL' },
          inventory: [{ quantity: 10 }, { quantity: 5 }],
        },
        {
          id: 'sku-ext-2',
          seller_sku: 'CAM-AZUL-G',
          price: { tax_inclusive_price: '54.90', tax_exclusive_price: '52.00', currency: 'BRL' },
          inventory: [{ quantity: 3 }],
        },
      ],
    };
    const products = normalizeProductSkus(raw);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ externalProductId: 'p-1', externalSku: 'sku-ext-1', name: 'Camiseta Azul', price: '49.90', stock: 15 });
    expect(products[1]).toMatchObject({ externalProductId: 'p-1', externalSku: 'sku-ext-2', name: 'Camiseta Azul', price: '54.90', stock: 3 });
    expect(extractSellerSku(raw.skus[0])).toBe('CAM-AZUL-M');
    expect(extractSellerSku(raw.skus[1])).toBe('CAM-AZUL-G');
  });

  it('normaliza categorias financeiras conhecidas e cai em OTHER para categorias não reconhecidas', () => {
    expect(normalizeTransactionType('order_amount')).toBe('GROSS_SALE');
    expect(normalizeTransactionType('commission_fee')).toBe('PLATFORM_FEE');
    expect(normalizeTransactionType('algo_nunca_visto')).toBe('OTHER');
  });

  it('normaliza um extrato lendo o status de payment_status (payload real não tem campo "status")', () => {
    // Payload real confirmado via `check-settlements` CLI em produção — sem isto, `status` sempre
    // vinha vazio e todo extrato caía no fallback PENDING de `mapSettlementStatus`, inflando o
    // card "A receber" do dashboard com extratos que já tinham sido pagos de verdade.
    const raw = {
      id: '7679917821555394311',
      statement_time: 1788134400,
      settlement_amount: '151.52',
      payment_status: 'PAID',
      payment_id: '3691886739683378500',
      payment_time: 1788151301,
    };
    const statement = normalizeStatement(raw);
    expect(statement.externalStatementId).toBe('7679917821555394311');
    expect(statement.totalAmount).toBe('151.52');
    expect(statement.status).toBe('PAID');
  });
});
