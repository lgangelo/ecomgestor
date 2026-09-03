import { TikTokApiError, TikTokClient, refreshAccessToken } from '@ecommerce-manager/integrations';

function mockFetchOnce(status: number, body: unknown) {
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  });
}

describe('Classificação de erro da TikTok — envelope de erro com HTTP 200 (seção "token expirado")', () => {
  it('refreshAccessToken: HTTP 200 com code != 0 no envelope é classificado como AUTH, nunca PERMANENT', async () => {
    // A TikTok pode devolver o refresh token expirado/revogado com status 200 e o erro só
    // dentro do envelope — sem checar isso, o fluxo caía direto em "sem access_token no
    // payload", classificado PERMANENT, e a integração nunca acionava o aviso de reconectar.
    mockFetchOnce(200, { code: 40105, message: 'The refresh_token is invalid or has been revoked' });

    await expect(refreshAccessToken('app-key', 'app-secret', 'refresh-token')).rejects.toMatchObject({
      category: 'AUTH',
    });
  });

  it('refreshAccessToken: resposta 200 sem code de erro mas também sem access_token vira AUTH (nunca PERMANENT)', async () => {
    mockFetchOnce(200, { data: {} });

    await expect(refreshAccessToken('app-key', 'app-secret', 'refresh-token')).rejects.toMatchObject({
      category: 'AUTH',
    });
  });

  it('TikTokClient.request: erro de negócio com HTTP 200 e mensagem citando "token" é reclassificado como AUTH', async () => {
    // Chamada de negócio comum (não o endpoint de token) — sem o reforço por palavra-chave,
    // status=200 nunca bate em nenhuma faixa de `classifyError` e cai como PERMANENT.
    mockFetchOnce(200, { code: 40105, message: 'Invalid access_token, please refresh and try again' });
    const client = new TikTokClient({ appKey: 'k', appSecret: 's', accessToken: 'old-token' });

    await expect(client.request('GET', '/order/202309/orders/search')).rejects.toMatchObject({ category: 'AUTH' });
  });

  it('TikTokClient.request: erro de negócio sem palavra "token" continua PERMANENT (sem inventar categoria)', async () => {
    mockFetchOnce(200, { code: 12345, message: 'Some unrelated validation problem' });
    const client = new TikTokClient({ appKey: 'k', appSecret: 's', accessToken: 'old-token' });

    await expect(client.request('GET', '/order/202309/orders/search')).rejects.toMatchObject({ category: 'PERMANENT' });
  });
});

// Sanity: garante que o teste acima realmente exercita a classe real, não um mock solto.
describe('sanity', () => {
  it('TikTokApiError carrega a categoria', () => {
    const err = new TikTokApiError('x', 'AUTH');
    expect(err.category).toBe('AUTH');
  });
});
