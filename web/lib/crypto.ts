import 'server-only';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for connector credentials at rest.
 * MUST match api-scraper/src/db/crypto.js exactly so the worker can decrypt:
 * key = sha256(APP_ENCRYPTION_KEY), payload = base64( iv(12) | authTag(16) | ciphertext ).
 */
function key(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('APP_ENCRYPTION_KEY ไม่ได้ตั้งใน .env.local (จำเป็นสำหรับเข้ารหัส password connector)');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Matches autopost/server/credentialCrypto.js (enc:v1 AES-256-GCM). */
export function encryptAutopostCredential(plain: string): string {
  const secret = process.env.AUTOPOST_CREDENTIAL_KEY || process.env.APP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('AUTOPOST_CREDENTIAL_KEY หรือ APP_ENCRYPTION_KEY จำเป็นสำหรับบัญชี Facebook');
  }
  const derived = createHash('sha256').update(secret, 'utf8').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derived, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}
