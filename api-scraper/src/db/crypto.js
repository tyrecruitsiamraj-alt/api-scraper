import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { envString } from '../config.js';

/**
 * AES-256-GCM encryption for connector credentials at rest.
 * Key derived from APP_ENCRYPTION_KEY (any string) → sha256 → 32 bytes.
 * Stored format: base64( iv(12) | authTag(16) | ciphertext ).
 */
function key() {
  const secret = envString('APP_ENCRYPTION_KEY');
  if (!secret) throw new Error('APP_ENCRYPTION_KEY ไม่ได้ตั้งใน .env (จำเป็นสำหรับเข้ารหัส password connector)');
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload) {
  const buf = Buffer.from(String(payload), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
