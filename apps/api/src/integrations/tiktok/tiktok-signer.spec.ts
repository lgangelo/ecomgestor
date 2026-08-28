import { createHmac } from 'node:crypto';
import { signApiRequest, verifyTikTokWebhookSignature } from '@ecommerce-manager/integrations';

describe('TikTok Shop — assinatura de API (seção 8)', () => {
  it('é determinística e ignora a ordem de inserção dos parâmetros de query', () => {
    const a = signApiRequest({
      path: '/order/202309/orders/search',
      query: { app_key: 'key', timestamp: '1000', page_size: '10' },
      body: '',
      appSecret: 'secret',
    });
    const b = signApiRequest({
      path: '/order/202309/orders/search',
      query: { page_size: '10', timestamp: '1000', app_key: 'key' },
      body: '',
      appSecret: 'secret',
    });
    expect(a).toBe(b);
  });

  it('exclui sign e access_token do cálculo — incluí-los na query não muda a assinatura', () => {
    const base = signApiRequest({
      path: '/order/202309/orders/search',
      query: { app_key: 'key', timestamp: '1000' },
      body: '',
      appSecret: 'secret',
    });
    const withExtras = signApiRequest({
      path: '/order/202309/orders/search',
      query: { app_key: 'key', timestamp: '1000', sign: 'whatever', access_token: 'token-abc' },
      body: '',
      appSecret: 'secret',
    });
    expect(withExtras).toBe(base);
  });

  it('muda quando o corpo muda (POST assinado inclui o body)', () => {
    const a = signApiRequest({ path: '/x', query: { app_key: 'k' }, body: '{"a":1}', appSecret: 's' });
    const b = signApiRequest({ path: '/x', query: { app_key: 'k' }, body: '{"a":2}', appSecret: 's' });
    expect(a).not.toBe(b);
  });
});

describe('TikTok Shop — assinatura de webhook (seção 17/20)', () => {
  const appKey = 'app-key-123';
  const appSecret = 'app-secret-456';
  const rawBody = Buffer.from(JSON.stringify({ order_id: 'TT-1', type: 'ORDER_STATUS_CHANGE' }));

  function sign(key: string, secret: string, body: Buffer): string {
    return createHmac('sha256', secret).update(Buffer.concat([Buffer.from(key, 'utf8'), body])).digest('hex');
  }

  it('aceita uma assinatura válida calculada sobre o corpo bruto', () => {
    const signature = sign(appKey, appSecret, rawBody);
    expect(verifyTikTokWebhookSignature({ appKey, appSecret, rawBody, signatureHeader: signature })).toBe(true);
  });

  it('rejeita quando o corpo foi alterado após a assinatura (byte a mais invalida tudo)', () => {
    const signature = sign(appKey, appSecret, rawBody);
    const tamperedBody = Buffer.concat([rawBody, Buffer.from('x')]);
    expect(verifyTikTokWebhookSignature({ appKey, appSecret, rawBody: tamperedBody, signatureHeader: signature })).toBe(
      false,
    );
  });

  it('rejeita uma assinatura calculada com o app_secret errado', () => {
    const signature = sign(appKey, 'secret-errado', rawBody);
    expect(verifyTikTokWebhookSignature({ appKey, appSecret, rawBody, signatureHeader: signature })).toBe(false);
  });

  it('rejeita quando o header de assinatura está ausente ou mal formado', () => {
    expect(verifyTikTokWebhookSignature({ appKey, appSecret, rawBody, signatureHeader: undefined })).toBe(false);
    expect(verifyTikTokWebhookSignature({ appKey, appSecret, rawBody, signatureHeader: 'not-hex' })).toBe(false);
  });
});
