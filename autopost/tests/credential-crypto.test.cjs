const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { decryptCredential, isEncrypted } = require('../server/credential-crypto');

// เข้ารหัสแบบเดียวกับ encryptAutopostCredential ใน branch codex (enc:v1 AES-256-GCM)
function encryptV1(plain, secret) {
  const key = crypto.createHash('sha256').update(secret, 'utf8').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${enc.toString('base64url')}`;
}

test('plain passwords pass through unchanged', () => {
  assert.equal(decryptCredential('hunter2', {}), 'hunter2');
  assert.equal(decryptCredential('', {}), '');
  assert.equal(isEncrypted('hunter2'), false);
});

test('decrypts with AUTOPOST_CREDENTIAL_KEY', () => {
  const stored = encryptV1('ทดสอบ-pass-1', 'credential-key');
  assert.equal(isEncrypted(stored), true);
  assert.equal(decryptCredential(stored, { AUTOPOST_CREDENTIAL_KEY: 'credential-key' }), 'ทดสอบ-pass-1');
});

test('falls back to APP_ENCRYPTION_KEY when the first key does not match', () => {
  const stored = encryptV1('pass-2', 'app-key');
  const env = { AUTOPOST_CREDENTIAL_KEY: 'other-key', APP_ENCRYPTION_KEY: 'app-key' };
  assert.equal(decryptCredential(stored, env), 'pass-2');
});

test('no key on the machine: clear error, no ciphertext typed', () => {
  const stored = encryptV1('pass-3', 'app-key');
  assert.throws(() => decryptCredential(stored, {}), /ใส่ AUTOPOST_CREDENTIAL_KEY/);
});

test('wrong key: says which keys were tried', () => {
  const stored = encryptV1('pass-4', 'app-key');
  assert.throws(() => decryptCredential(stored, { APP_ENCRYPTION_KEY: 'nope' }), /APP_ENCRYPTION_KEY\) ไม่ตรง/);
});
