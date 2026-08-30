import { SENSITIVE_LOG_KEYS } from '@ecommerce-manager/shared';

const SENSITIVE_KEY_SET = new Set(SENSITIVE_LOG_KEYS.map((k) => k.toLowerCase()));

/**
 * Remove recursivamente qualquer chave sensível (senhas, tokens, segredos) antes de logar.
 * Nunca deve ser removido de nenhum ponto que escreva logs — é a última barreira contra
 * vazamento acidental de credenciais nos logs estruturados.
 */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForLog(v, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();

  // Decimal do Prisma (e qualquer outra instância com toJSON próprio, ex.: Decimal.js) nunca
  // deve ser tratada como um dicionário genérico — iterar suas propriedades internas (dígitos,
  // expoente, sinal) via Object.entries produz lixo em vez do valor numérico real.
  if (typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return (value as { toJSON: () => unknown }).toJSON();
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_SET.has(key.toLowerCase())) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = sanitizeForLog(val, depth + 1);
      }
    }
    return out;
  }

  return value;
}
