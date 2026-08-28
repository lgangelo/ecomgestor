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
