import { randomFillSync } from 'node:crypto';

// O pacote `argon2` distribui apenas declarações .d.cts, que a resolução "node" clássica
// do TypeScript não carrega corretamente. Usamos require() (tipado manualmente) para
// evitar depender dessa resolução, mantendo tipagem explícita nas funções exportadas.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const argon2 = require('argon2') as {
  hash(password: string, options?: Record<string, unknown>): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  argon2id: number;
};

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB, recomendação OWASP para argon2id
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

const MIN_LENGTH = 12;

export function isPasswordStrongEnough(plain: string): boolean {
  if (plain.length < MIN_LENGTH) return false;
  const hasLower = /[a-z]/.test(plain);
  const hasUpper = /[A-Z]/.test(plain);
  const hasDigit = /\d/.test(plain);
  const hasSymbol = /[^A-Za-z0-9]/.test(plain);
  return [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length >= 3;
}

export function generateRandomPassword(length = 20): string {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_=+';
  const bytes = new Uint8Array(length);
  randomFillSync(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
