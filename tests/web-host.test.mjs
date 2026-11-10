import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { fillEnvText, missingEnv, nextSlot, readGitHead, slotReady } from '../scripts/web-host.mjs';

test('สลับช่อง build a ↔ b · ยังไม่มีช่อง = เริ่มที่ a', () => {
  assert.equal(nextSlot(undefined), '.next-slot-a');
  assert.equal(nextSlot('.next-slot-a'), '.next-slot-b');
  assert.equal(nextSlot('.next-slot-b'), '.next-slot-a');
});

test('ช่องที่ build ไม่จบ (ไม่มี BUILD_ID) ห้ามเอาไปเปิดเว็บ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-host-'));
  fs.mkdirSync(path.join(dir, '.next-slot-a'));
  assert.equal(slotReady('.next-slot-a', dir), false);
  fs.writeFileSync(path.join(dir, '.next-slot-a', 'BUILD_ID'), 'x');
  assert.equal(slotReady('.next-slot-a', dir), true);
  assert.equal(slotReady(undefined, dir), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('บอกชื่อค่าที่ยังขาดใน web/.env.local · Autopost ต้องมีประตู token เสมอ', () => {
  const full = {
    NEXTAUTH_URL: 'https://api-scraper.sosiamraj.com',
    NEXTAUTH_SECRET: 's',
    AZURE_AD_CLIENT_ID: 'c',
    AZURE_AD_CLIENT_SECRET: 's',
    AZURE_AD_TENANT_ID: 't',
    APP_ENCRYPTION_KEY: 'k',
    PGHOST: 'h',
    PGUSER: 'u',
    PGPASSWORD: 'p',
    PGDATABASE: 'd',
  };
  assert.deepEqual(missingEnv(full, false), []);
  assert.deepEqual(missingEnv(full, true), ['AUTOPOST_URL', 'AUTOPOST_ACCESS_TOKEN']);
  assert.deepEqual(missingEnv({ ...full, PGPASSWORD: '  ' }, false), ['PGPASSWORD']);
});

test('อ่าน commit จาก .git ได้ทั้งแบบไฟล์ ref และ packed-refs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-host-git-'));
  const git = path.join(dir, '.git');
  fs.mkdirSync(path.join(git, 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(git, 'packed-refs'), '# pack-refs\n502ad98aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/main\n');
  assert.equal(readGitHead(dir), '502ad98aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  fs.writeFileSync(path.join(git, 'refs', 'heads', 'main'), 'f479624bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n');
  assert.equal(readGitHead(dir), 'f479624bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  fs.writeFileSync(path.join(git, 'HEAD'), 'a8462c0ccccccccccccccccccccccccccccccccc\n');
  assert.equal(readGitHead(dir), 'a8462c0ccccccccccccccccccccccccccccccccc');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('commit ที่อ่านจาก .git ตรงกับ git rev-parse ของ repo นี้', async () => {
  const { execFileSync } = await import('node:child_process');
  const expected = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(readGitHead(), expected);
});

const ROOT_ENV = {
  PGHOST: '10.0.0.5',
  PGPORT: '5432',
  PGUSER: 'so_app',
  PGPASSWORD: 'pw-from-root',
  PGDATABASE: 'postgres',
  DB_SCHEMA: 'so-candidate-data',
  AUTOPOST_SCHEMA: 'so_autopost_apiscraper',
  APP_ENCRYPTION_KEY: 'key-from-root',
  OLLAMA_BASE_URL: 'http://ollama',
};
let n = 0;
const fakeRandom = () => `rand-${++n}`;

test('ไม่มีไฟล์เลย → สร้างให้ครบ เหลือว่างแค่ Azure 3 บรรทัด', () => {
  n = 0;
  const { text, blanks } = fillEnvText('', ROOT_ENV, fakeRandom);
  const env = parseEnv(text);
  assert.equal(env.NEXTAUTH_URL, 'https://api-scraper.sosiamraj.com');
  assert.equal(env.AUTOPOST_URL, 'https://so-autopost.sosiamraj.com');
  assert.equal(env.PGPASSWORD, 'pw-from-root');
  assert.equal(env.APP_ENCRYPTION_KEY, 'key-from-root');
  assert.equal(env.AUTOPOST_SCHEMA, 'so_autopost_apiscraper');
  assert.equal(env.OLLAMA_BASE_URL, undefined, 'เอาเฉพาะค่าที่เว็บใช้ ไม่ลอกทั้งไฟล์');
  assert.deepEqual([env.NEXTAUTH_SECRET, env.AUTOPOST_ACCESS_TOKEN, env.JARVIS_INTEGRATION_KEY], ['rand-1', 'rand-2', 'rand-3']);
  assert.deepEqual(blanks, ['AZURE_AD_CLIENT_ID', 'AZURE_AD_CLIENT_SECRET', 'AZURE_AD_TENANT_ID']);
  assert.deepEqual(missingEnv(env, true), ['AZURE_AD_CLIENT_ID', 'AZURE_AD_CLIENT_SECRET', 'AZURE_AD_TENANT_ID']);
});

test('ไม่ทับค่าที่คนกรอกไว้ · เติมบรรทัดว่างในที่เดิม · รันซ้ำไม่เปลี่ยนอะไร', () => {
  n = 0;
  const typed = 'NEXTAUTH_SECRET=mine\nPGPASSWORD=\nAZURE_AD_CLIENT_ID=abc\n';
  const first = fillEnvText(typed, ROOT_ENV, fakeRandom);
  const env = parseEnv(first.text);
  assert.equal(env.NEXTAUTH_SECRET, 'mine');
  assert.equal(env.PGPASSWORD, 'pw-from-root');
  assert.equal(env.AZURE_AD_CLIENT_ID, 'abc');
  assert.equal(first.text.split('\n')[1], 'PGPASSWORD=pw-from-root', 'บรรทัดว่างเดิมถูกเติมตรงที่เดิม');
  assert.deepEqual(first.blanks, ['AZURE_AD_CLIENT_SECRET', 'AZURE_AD_TENANT_ID']);
  const second = fillEnvText(first.text, ROOT_ENV, fakeRandom);
  assert.deepEqual(second.filled, []);
  assert.deepEqual(second.blanks, []);
  assert.equal(second.text, first.text);
});

test('.env ของโฟลเดอร์ไม่มีค่าฐาน → ไม่เติมค่าว่าง ปล่อยให้บอกว่าขาด', () => {
  const { text } = fillEnvText('', {}, fakeRandom);
  const env = parseEnv(text);
  assert.equal(env.PGHOST, undefined);
  assert.ok(missingEnv(env, true).includes('PGHOST'));
});

test('รหัสผ่านที่มี # ช่องว่าง หรือเครื่องหมายคำพูด อ่านกลับมาได้ครบ', () => {
  for (const pw of ['ab#cd', 'a b c', "it's#1", 'x"y#z', 'plain-Pass.123']) {
    const { text } = fillEnvText('', { ...ROOT_ENV, PGPASSWORD: pw }, fakeRandom);
    assert.equal(parseEnv(text).PGPASSWORD, pw);
  }
});
