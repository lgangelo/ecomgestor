import { createHash } from 'node:crypto';
import { buildMercadoLivreAuthorizeUrl, generateMercadoLivrePkcePair } from '@ecommerce-manager/integrations';

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('generateMercadoLivrePkcePair — PKCE (RFC 7636), exigido pela aplicação real do usuário', () => {
  it('gera um code_verifier e um code_challenge = base64url(sha256(verifier))', () => {
    const { codeVerifier, codeChallenge } = generateMercadoLivrePkcePair();

    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/); // base64url puro, sem +/= nem padding
    expect(codeChallenge).toBe(base64UrlEncode(createHash('sha256').update(codeVerifier).digest()));
  });

  it('nunca repete o mesmo par entre chamadas (aleatório por tentativa de conexão)', () => {
    const first = generateMercadoLivrePkcePair();
    const second = generateMercadoLivrePkcePair();
    expect(first.codeVerifier).not.toBe(second.codeVerifier);
    expect(first.codeChallenge).not.toBe(second.codeChallenge);
  });
});

describe('buildMercadoLivreAuthorizeUrl — inclui code_challenge/method S256 e o state', () => {
  it('monta a URL com todos os parâmetros OAuth2 + PKCE esperados', () => {
    const url = new URL(
      buildMercadoLivreAuthorizeUrl({
        clientId: 'client-123',
        redirectUri: 'https://api.example.com/api/integrations/mercadolivre/callback',
        state: 'state-abc',
        codeChallenge: 'challenge-xyz',
      }),
    );

    expect(url.hostname).toBe('auth.mercadolivre.com.br');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.example.com/api/integrations/mercadolivre/callback');
    expect(url.searchParams.get('state')).toBe('state-abc');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
