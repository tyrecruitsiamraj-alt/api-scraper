import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { missingEnv, nextSlot, readGitHead, slotReady } from '../scripts/web-host.mjs';

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
