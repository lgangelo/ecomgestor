import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Assinatura de chamadas de API da TikTok Shop (seção 8 da Fase 3 — pesquisa confirmada em
 * docs/integrations/tiktok.md, item "Assinatura das requests"): HMAC-SHA256 de
 * `app_secret + path + query string ordenada (excluindo sign/access_token) + corpo + app_secret`,
 * usando o app_secret como chave. O resultado vai no parâmetro de query `sign`.
 *
 * Confirmado em produção (conexão real): faltava envolver a string com o app_secret nos dois
 * lados (não é só "usar o app_secret como chave do HMAC") — sem isso a TikTok responde
 * "Invalid credentials. The 'sign' query parameter is invalid.", mesmo com o restante correto.
 *
 * Deliberadamente distinta de `verifyWebhookSignature` abaixo — são dois mecanismos
 * diferentes documentados separadamente pela TikTok, nunca devem ser confundidos.
 */
export function signApiRequest(params: {
  path: string;
  query: Record<string, string>;
  body: string;
  appSecret: string;
}): string {
  const { path, query, body, appSecret } = params;
  const sortedKeys = Object.keys(query)
    .filter((key) => key !== 'sign' && key !== 'access_token')
    .sort();
  const sortedQuery = sortedKeys.map((key) => `${key}${query[key]}`).join('');
  const base = `${appSecret}${path}${sortedQuery}${body}${appSecret}`;
  return createHmac('sha256', appSecret).update(base, 'utf8').digest('hex');
}

const HEX_64_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * Verificação de assinatura de webhook (seção 20 da Fase 3): HMAC-SHA256 de
 * `app_key + corpo bruto`, chave = app_secret, comparado em tempo constante.
 * Exige o corpo BRUTO (Buffer), nunca o JSON já parseado — a TikTok não documenta timestamp
 * na assinatura, então esta função sozinha não protege contra replay (ver seção 17 da
 * pesquisa em docs/integrations/tiktok.md); a proteção real vem da idempotência por
 * external_event_id, aplicada pelo chamador.
 */
export function verifyTikTokWebhookSignature(params: {
  appKey: string;
  appSecret: string;
  rawBody: Buffer;
  signatureHeader: string | undefined | null;
}): boolean {
  const { appKey, appSecret, rawBody, signatureHeader } = params;
  if (!signatureHeader) return false;
  const trimmed = signatureHeader.trim().toLowerCase();
  if (!HEX_64_PATTERN.test(trimmed)) return false;

  const expected = createHmac('sha256', appSecret)
    .update(Buffer.concat([Buffer.from(appKey, 'utf8'), rawBody]))
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(trimmed, 'hex');
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}
