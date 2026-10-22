/**
 * ถอดรหัสรหัสผ่าน Facebook ที่เก็บแบบ enc:v1 ในตาราง users
 *
 * รหัสบางบัญชีถูกเข้ารหัสไว้เป็น enc:v1:<iv>:<tag>:<ciphertext> (AES-256-GCM,
 * key = sha256(AUTOPOST_CREDENTIAL_KEY หรือ APP_ENCRYPTION_KEY)) โดยโค้ดจาก branch
 * codex/fix-content-position-feedback ที่ไม่ได้ merge เข้า main. worker เลยกรอกข้อความ
 * ที่เข้ารหัสลงช่องรหัส Facebook แทนรหัสจริง ไฟล์นี้ถอดก่อนส่งให้บอทกรอก
 * รหัสที่ไม่ได้ขึ้นต้นด้วย enc:v1: คืนค่าเดิม
 */

const crypto = require('crypto');
const path = require('path');

const PREFIX = 'enc:v1:';

let rootEnvLoaded = false;
/** กุญแจมักอยู่ใน .env ที่ root ของ repo (ตัว Scrap ใช้ APP_ENCRYPTION_KEY ตัวเดียวกัน) — ไม่ทับค่าที่ตั้งไว้แล้ว */
function loadRootEnvOnce() {
  if (rootEnvLoaded) return;
  rootEnvLoaded = true;
  try {
    require('dotenv').config({ path: path.join(__dirname, '../../.env'), override: false });
  } catch {
    /* ไม่มี dotenv หรือไม่มีไฟล์ — ใช้ env เดิม */
  }
}

function isEncrypted(value) {
  return String(value || '').startsWith(PREFIX);
}

function keyCandidates(env) {
  const names = ['AUTOPOST_CREDENTIAL_KEY', 'APP_ENCRYPTION_KEY'];
  return names
    .map((name) => ({ name, value: String(env[name] || '').trim() }))
    .filter((k) => k.value);
}

/**
 * @param {string|null|undefined} value
 * @param {Record<string, string|undefined>} [env]
 * @returns {string}
 */
function decryptCredential(value, env) {
  const stored = String(value || '');
  if (!isEncrypted(stored)) return stored;
  if (!env) {
    loadRootEnvOnce();
    env = process.env;
  }
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('รหัสผ่าน Facebook ที่เก็บไว้มีรูปแบบ enc:v1 ไม่ถูกต้อง');
  const [ivRaw, tagRaw, cipherRaw] = parts;

  const keys = keyCandidates(env);
  if (keys.length === 0) {
    throw new Error(
      'รหัสผ่าน Facebook ถูกเข้ารหัสไว้ แต่เครื่องนี้ไม่มีกุญแจ — ใส่ AUTOPOST_CREDENTIAL_KEY (หรือ APP_ENCRYPTION_KEY) ใน autopost/.env'
    );
  }
  // ลองทุกกุญแจที่มี: ตอนเข้ารหัสใช้ AUTOPOST_CREDENTIAL_KEY ถ้ามี ไม่งั้น APP_ENCRYPTION_KEY
  for (const k of keys) {
    try {
      const key = crypto.createHash('sha256').update(k.value, 'utf8').digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(cipherRaw, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      /* กุญแจนี้ไม่ตรง ลองตัวถัดไป */
    }
  }
  throw new Error(
    `ถอดรหัสผ่าน Facebook ไม่ได้ — กุญแจบนเครื่องนี้ (${keys.map((k) => k.name).join(', ')}) ไม่ตรงกับตอนที่เข้ารหัส`
  );
}

module.exports = { decryptCredential, isEncrypted };
