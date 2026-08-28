/**
 * Minimização de payload de webhook (seção 21/47 da Fase 3) — além da redação genérica de
 * segredos (`sanitizeForLog`, que só cobre chaves tipo token/senha), remove recursivamente
 * qualquer chave que pareça dado pessoal do comprador antes de persistir em `webhook_events`.
 * A integração nunca deve virar um CRM: o mínimo necessário para processar o pedido é o id,
 * não o nome/telefone/endereço do comprador.
 */
const PII_KEY_PATTERN = /buyer|customer|recipient|address|phone|email|cpf|document|receiver/i;

export function minimizeTikTokWebhookPayload(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => minimizeTikTokWebhookPayload(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEY_PATTERN.test(key)) {
        out[key] = '[OMITTED]';
      } else {
        out[key] = minimizeTikTokWebhookPayload(val, depth + 1);
      }
    }
    return out;
  }

  return value;
}
