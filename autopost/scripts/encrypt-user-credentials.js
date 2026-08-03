/* eslint-disable no-console */
require('dotenv').config();
const db = require('../server/db');
const {
  encryptCredential,
  hasCredentialKey,
  isEncrypted,
} = require('../server/credentialCrypto');

async function main() {
  if (!hasCredentialKey()) {
    throw new Error('ตั้ง AUTOPOST_CREDENTIAL_KEY หรือ APP_ENCRYPTION_KEY ก่อนรัน migration');
  }
  const { rows } = await db.query(
    `SELECT id, password, fb_access_token
       FROM users
      WHERE (password IS NOT NULL AND password <> '')
         OR (fb_access_token IS NOT NULL AND fb_access_token <> '')`
  );
  let passwords = 0;
  let tokens = 0;
  for (const row of rows) {
    const password = row.password && !isEncrypted(row.password)
      ? encryptCredential(row.password)
      : row.password;
    const fbToken = row.fb_access_token && !isEncrypted(row.fb_access_token)
      ? encryptCredential(row.fb_access_token)
      : row.fb_access_token;
    if (password !== row.password) passwords += 1;
    if (fbToken !== row.fb_access_token) tokens += 1;
    if (password === row.password && fbToken === row.fb_access_token) continue;
    await db.query(
      `UPDATE users SET password=$2, fb_access_token=$3, updated_at=NOW() WHERE id=$1`,
      [row.id, password, fbToken],
    );
  }
  console.log(`Encrypted ${passwords} password(s) and ${tokens} Facebook token(s).`);
  await db.getPool().end();
}

main().catch(async (error) => {
  console.error(error.message || String(error));
  await db.getPool().end().catch(() => {});
  process.exit(1);
});
