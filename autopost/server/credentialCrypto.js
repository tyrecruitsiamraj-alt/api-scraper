const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

// Local development normally starts from autopost/, while the shared encryption
// key already lives in the repository root .env. Never override deploy env vars.
dotenv.config({ path: path.join(__dirname, '../../.env'), override: false });

const PREFIX = 'enc:v1:';

function rawKey() {
  return String(
    process.env.AUTOPOST_CREDENTIAL_KEY ||
      process.env.APP_ENCRYPTION_KEY ||
      ''
  ).trim();
}

function keyBuffer() {
  const value = rawKey();
  if (!value) return null;
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function isEncrypted(value) {
  return String(value || '').startsWith(PREFIX);
}

function encryptCredential(value) {
  const plain = String(value || '');
  if (!plain || isEncrypted(plain)) return plain || null;
  const key = keyBuffer();
  if (!key) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
      throw new Error('AUTOPOST_CREDENTIAL_KEY (or APP_ENCRYPTION_KEY) is required in production');
    }
    return plain;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

function decryptCredential(value) {
  const stored = String(value || '');
  if (!stored || !isEncrypted(stored)) return stored;
  const key = keyBuffer();
  if (!key) throw new Error('credential is encrypted but AUTOPOST_CREDENTIAL_KEY is unavailable');
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('invalid encrypted credential format');
  const [ivRaw, tagRaw, cipherRaw] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function hasCredentialKey() {
  return !!keyBuffer();
}

module.exports = {
  decryptCredential,
  encryptCredential,
  hasCredentialKey,
  isEncrypted,
};
