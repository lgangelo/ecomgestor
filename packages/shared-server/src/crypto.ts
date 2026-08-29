import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Criptografia simétrica de segredos em repouso (seção 5 da Fase 3 — credenciais de
 * integração como access_token/refresh_token nunca ficam em texto puro em `integration_credentials`).
 * AES-256-GCM: autenticado (detecta adulteração), com IV aleatório por valor.
 * A chave nunca é o segredo bruto do ambiente — é derivada via scrypt para ter exatamente
 * 32 bytes independentemente do tamanho do valor configurado em `INTEGRATION_SECRETS_KEY`.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT = 'ecommerce-manager-integration-secrets';

function deriveKey(rawKey: string): Buffer {
  return scryptSync(rawKey, SALT, 32);
}

export function encryptSecret(plain: string, rawKey: string): string {
  const key = deriveKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptSecret(ciphertext: string, rawKey: string): string {
  const parts = ciphertext.split('.');
  // Exatamente 3 partes, não "3 partes não-vazias" — um valor original vazio ('') gera um
  // terceiro segmento vazio (ex.: "iv.authTag."), que é um formato válido, só que sem dados
  // cifrados. Checar com `!parte` rejeitaria isso incorretamente (string vazia é falsy em JS).
  if (parts.length !== 3) {
    throw new Error('Formato de segredo criptografado inválido');
  }
  const [ivB64, authTagB64, dataB64] = parts;
  if (!ivB64 || !authTagB64) {
    throw new Error('Formato de segredo criptografado inválido');
  }
  const key = deriveKey(rawKey);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}
