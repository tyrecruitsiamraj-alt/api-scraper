#!/usr/bin/env node
/**
 * เว็บ So Scraping + หน้าจอ Autopost บนเครื่อง RM009 (แทน Vercel) — เปิด/ปิดด้วยสวิตช์ "เว็บ" บนแผง SO Workers
 *
 * - เว็บ (web/, Next.js) ฟังพอร์ต 3300 · เซิร์ฟเวอร์ Autopost (autopost/server) ฟังพอร์ต 3100
 *   Cloudflare Tunnel ชี้โดเมนเข้าสองพอร์ตนี้ (ขั้นตอนตั้งค่าใน docs/rm009-web-host.md)
 * - ค่าลับทั้งหมดของเว็บอยู่ที่ web/.env.local บนเครื่อง (ไม่ขึ้น git · แผงอัปเดตโค้ดไม่ลบไฟล์นี้)
 * - โค้ดเปลี่ยน (กด "อัปเดตโค้ด" บนแผง) → build ลงอีกช่อง (.next-slot-a / -b) ระหว่างเว็บเดิมยังเปิดอยู่
 *   build ผ่านแล้วค่อยสลับ เว็บดับแค่ไม่กี่วินาที · build ไม่ผ่าน = เว็บเดิมเปิดต่อ จด log แล้วรอโค้ดรุ่นถัดไป
 * - แพ็กเกจเว็บเปลี่ยน (web/package-lock.json) ต้องติดตั้งใหม่ เว็บดับระหว่างติดตั้ง + build (ไม่บ่อย)
 * - ตัวเว็บไม่เปิด worker เอง (WEB_KICK_WORKER=0) · เซิร์ฟเวอร์ Autopost เข้าคิวในฐานเท่านั้น ไม่เปิด Chrome (POST_REMOTE_WORKER=1)
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseEnv } from 'dotenv';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const WEB = path.join(ROOT, 'web');
const AUTOPOST = path.join(ROOT, 'autopost');
const OUTPUT = path.join(ROOT, 'output');
const LOG_DIR = process.env.WORKER_ALIVE_DIR || path.join(OUTPUT, 'worker-logs');
const STATE_PATH = path.join(OUTPUT, 'web-host-state.json');
const LOCK_PATH = path.join(OUTPUT, 'web-host.lock');
const LOG_PATH = path.join(LOG_DIR, 'web-host.log');
const BUILD_LOG_PATH = path.join(LOG_DIR, 'web-build.log');
const NEXT_BIN = path.join(WEB, 'node_modules', 'next', 'dist', 'bin', 'next');
const ENV_FILE = process.env.WEB_HOST_ENV_FILE || path.join(WEB, '.env.local');

const WEB_PORT = Number(process.env.WEB_HOST_PORT || 3300);
const AUTOPOST_PORT = Number(process.env.WEB_HOST_AUTOPOST_PORT || 3100);
const RUN_AUTOPOST = process.env.WEB_HOST_AUTOPOST !== '0';
const SLOTS = ['.next-slot-a', '.next-slot-b'];
const CHECK_EVERY_MS = 60_000;
const RESTART_DELAY_MS = 5_000;

const REQUIRED_WEB_ENV = [
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'AZURE_AD_CLIENT_ID',
  'AZURE_AD_CLIENT_SECRET',
  'AZURE_AD_TENANT_ID',
  'APP_ENCRYPTION_KEY',
  'PGHOST',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
];
const REQUIRED_AUTOPOST_ENV = ['AUTOPOST_URL', 'AUTOPOST_ACCESS_TOKEN'];

fs.mkdirSync(LOG_DIR, { recursive: true });

function stamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });
}

function log(message) {
  const line = `[${stamp()}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_PATH, `${line}\n`);
  } catch {
    /* log เขียนไม่ได้ไม่ควรทำให้เว็บล้ม */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** commit ปัจจุบันของโฟลเดอร์ อ่านจาก .git ตรง ๆ ไม่ต้องพึ่ง git ใน PATH */
export function readGitHead(root = ROOT) {
  const gitDir = path.join(root, '.git');
  const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
  if (!head.startsWith('ref: ')) return head;
  const ref = head.slice(5).trim();
  const loose = path.join(gitDir, ref);
  if (fs.existsSync(loose)) return fs.readFileSync(loose, 'utf8').trim();
  const packed = path.join(gitDir, 'packed-refs');
  if (fs.existsSync(packed)) {
    for (const line of fs.readFileSync(packed, 'utf8').split('\n')) {
      const [sha, name] = line.trim().split(' ');
      if (name === ref) return sha;
    }
  }
  throw new Error(`อ่าน commit ปัจจุบันไม่ได้ (${ref})`);
}

function hashFile(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/** ช่อง build ที่ใช้เปิดเว็บได้ = build จบครบ (มี BUILD_ID) */
export function slotReady(slot, webDir = WEB) {
  return Boolean(slot) && fs.existsSync(path.join(webDir, slot, 'BUILD_ID'));
}

/** ช่องที่จะ build รอบหน้า = ช่องที่ไม่ได้เปิดอยู่ */
export function nextSlot(current) {
  return current === SLOTS[0] ? SLOTS[1] : SLOTS[0];
}

/** ค่าที่ต้องมีใน web/.env.local แต่ยังไม่มี */
export function missingEnv(env, runAutopost = RUN_AUTOPOST) {
  const need = runAutopost ? [...REQUIRED_WEB_ENV, ...REQUIRED_AUTOPOST_ENV] : REQUIRED_WEB_ENV;
  return need.filter((key) => !String(env[key] ?? '').trim());
}

function readWebEnv() {
  if (!fs.existsSync(ENV_FILE)) return null;
  return parseEnv(fs.readFileSync(ENV_FILE));
}

function acquireLock() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  try {
    const pid = Number(fs.readFileSync(LOCK_PATH, 'utf8'));
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        log(`ตัวคุมเว็บเปิดอยู่แล้ว (pid ${pid}) — ไม่เปิดซ้ำ`);
        process.exit(0);
      } catch {
        /* pid เดิมตายแล้ว ใช้ล็อกต่อได้ */
      }
    }
  } catch {
    /* ยังไม่มีล็อก */
  }
  fs.writeFileSync(LOCK_PATH, String(process.pid));
}

function releaseLock() {
  try {
    if (Number(fs.readFileSync(LOCK_PATH, 'utf8')) === process.pid) fs.rmSync(LOCK_PATH, { force: true });
  } catch {
    /* ignore */
  }
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
}

/** โปรเซสลูกที่ตายเองแล้วเปิดใหม่ใน 5 วินาที — ปิดจริงด้วย stop() */
class Service {
  constructor(name, makeSpawn) {
    this.name = name;
    this.makeSpawn = makeSpawn;
    this.child = null;
    this.wanted = false;
    this.args = null;
  }

  start(...args) {
    this.wanted = true;
    this.args = args;
    const { command, argv, options } = this.makeSpawn(...args);
    const out = fs.openSync(path.join(LOG_DIR, `${this.name}.out.log`), 'a');
    const child = spawn(command, argv, { ...options, stdio: ['ignore', out, out], windowsHide: true });
    this.child = child;
    log(`เปิด ${this.name} (pid ${child.pid})`);
    child.once('exit', (code, signal) => {
      fs.closeSync(out);
      if (this.child !== child) return;
      this.child = null;
      if (!this.wanted) return;
      log(`${this.name} ปิดเอง (code ${code ?? signal}) — เปิดใหม่ใน 5 วินาที`);
      setTimeout(() => {
        if (this.wanted && !this.child) this.start(...this.args);
      }, RESTART_DELAY_MS);
    });
    child.once('error', (e) => log(`${this.name} เปิดไม่ขึ้น: ${e.message}`));
  }

  async stop() {
    this.wanted = false;
    const child = this.child;
    if (!child) return;
    const exited = new Promise((r) => child.once('exit', r));
    killTree(child);
    await Promise.race([exited, sleep(15_000)]);
    if (this.child === child) this.child = null;
    log(`ปิด ${this.name} แล้ว`);
  }

  async restart(...args) {
    await this.stop();
    this.start(...args);
  }

  get running() {
    return Boolean(this.child);
  }
}

/** ค่าจาก web/.env.local — ส่งเข้าโปรเซสลูกตรง ๆ (ชนะไฟล์ .env อื่นในโฟลเดอร์ web) */
let fileEnv = {};

const web = new Service('web', (slot, sha) => ({
  command: process.execPath,
  argv: [NEXT_BIN, 'start', '-p', String(WEB_PORT)],
  options: {
    cwd: WEB,
    env: {
      ...process.env,
      ...fileEnv,
      NODE_ENV: 'production',
      NEXT_DIST_DIR: slot,
      APP_BUILD_SHA: sha,
      WEB_KICK_WORKER: '0',
      PORT: String(WEB_PORT),
    },
  },
}));

const autopost = new Service('autopost-server', () => ({
  command: process.execPath,
  argv: [path.join(AUTOPOST, 'server', 'index.js')],
  options: {
    cwd: AUTOPOST,
    env: {
      ...process.env,
      PORT: String(AUTOPOST_PORT),
      // ห้ามเปิด Chrome จากเซิร์ฟเวอร์ — กดโพสต์ = เข้าคิวในฐาน ให้ worker:post รับไปทำ
      POST_REMOTE_WORKER: '1',
      AUTOPOST_ACCESS_TOKEN: fileEnv.AUTOPOST_ACCESS_TOKEN,
    },
  },
}));

function runStep(label, command, argv, options) {
  return new Promise((resolve) => {
    const out = fs.openSync(BUILD_LOG_PATH, 'a');
    fs.appendFileSync(BUILD_LOG_PATH, `\n==== [${stamp()}] ${label} ====\n`);
    const child = spawn(command, argv, { ...options, stdio: ['ignore', out, out], windowsHide: true });
    child.once('error', (e) => {
      fs.appendFileSync(BUILD_LOG_PATH, `${e.message}\n`);
      fs.closeSync(out);
      resolve(1);
    });
    child.once('exit', (code) => {
      fs.closeSync(out);
      resolve(code ?? 1);
    });
  });
}

function waitHttp(port, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 5000 }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => (Date.now() > until ? resolve(0) : setTimeout(attempt, 2000));
    attempt();
  });
}

let building = false;
let autopostSha = '';
const selfHash = hashFile(SELF);

async function startWeb(slot, sha) {
  await web.restart(slot, sha);
  const code = await waitHttp(WEB_PORT);
  log(code ? `เว็บตอบแล้ว (HTTP ${code}) โค้ด ${sha.slice(0, 7)}` : 'เว็บยังไม่ตอบภายใน 90 วินาที — ดู web.out.log');
}

async function tick() {
  if (building) return;
  building = true;
  try {
    const latest = readWebEnv();
    if (latest && !missingEnv(latest).length) fileEnv = latest;
    const sha = readGitHead();
    const state = readState();

    if (state.sha !== sha || !slotReady(state.slot)) {
      if (state.failedSha === sha) {
        // build รุ่นนี้ไม่ผ่านไปแล้ว รอโค้ดรุ่นถัดไป ไม่ build ซ้ำทุกนาที
      } else {
        await build(sha, state);
      }
    }

    if (RUN_AUTOPOST && autopostSha !== sha) {
      await autopost.restart();
      autopostSha = sha;
    }

    // ตัวคุมเว็บเองถูกแก้ในรุ่นนี้ → ปิดตัวเอง ให้หน้าต่างเปิดใหม่ด้วยโค้ดใหม่ (เว็บ build ไว้แล้ว เปิดต่อได้ทันที)
    if (hashFile(SELF) !== selfHash) {
      log('ตัวคุมเว็บมีโค้ดใหม่ — ปิดแล้วให้เปิดใหม่');
      await shutdown(0);
    }
  } catch (e) {
    log(`ตรวจรอบนี้ไม่สำเร็จ: ${e.message}`);
  } finally {
    building = false;
  }
}

async function build(sha, state) {
  const short = sha.slice(0, 7);
  const lockHash = hashFile(path.join(WEB, 'package-lock.json'));
  // รอบแรก (ยังไม่เคยจด lockHash) ติดตั้งด้วย — web/node_modules บนเครื่องอาจเก่ากว่าโค้ด
  const needInstall = !fs.existsSync(NEXT_BIN) || state.lockHash !== lockHash;

  if (needInstall) {
    log(`ติดตั้งแพ็กเกจเว็บ (โค้ด ${short}) — เว็บปิดระหว่างนี้ประมาณ 5–10 นาที`);
    await web.stop();
    const code = await runStep(`npm ci (${short})`, 'npm', ['ci', '--no-audit', '--no-fund'], { cwd: WEB, shell: true });
    if (code !== 0) {
      saveState({ ...state, failedSha: sha, failedAt: new Date().toISOString() });
      log(`ติดตั้งแพ็กเกจเว็บไม่สำเร็จ (code ${code}) — ดู web-build.log`);
      if (slotReady(state.slot)) await startWeb(state.slot, state.sha);
      return;
    }
  }

  const slot = nextSlot(state.slot);
  log(`build เว็บโค้ด ${short} ลง ${slot}${web.running ? ' (เว็บเดิมยังเปิดอยู่)' : ''}`);
  fs.rmSync(path.join(WEB, slot), { recursive: true, force: true });
  const started = Date.now();
  const code = await runStep(`next build ${short} → ${slot}`, process.execPath, [NEXT_BIN, 'build'], {
    cwd: WEB,
    env: { ...process.env, ...fileEnv, NODE_ENV: 'production', NEXT_DIST_DIR: slot, NEXT_TELEMETRY_DISABLED: '1' },
  });
  if (code !== 0 || !slotReady(slot)) {
    saveState({ ...state, failedSha: sha, failedAt: new Date().toISOString() });
    log(`build โค้ด ${short} ไม่ผ่าน (code ${code}) — เว็บเดิมเปิดต่อ ดู web-build.log`);
    if (!web.running && slotReady(state.slot)) await startWeb(state.slot, state.sha);
    return;
  }
  log(`build ผ่านใน ${Math.round((Date.now() - started) / 1000)} วินาที — สลับเว็บ`);
  saveState({ slot, sha, lockHash, builtAt: new Date().toISOString() });
  await startWeb(slot, sha);
  // ช่องเก่าเก็บไว้ build รอบหน้า (ลบตอนจะ build ทับ) — ถอยกลับได้ถ้าต้องการ
}

let stopping = false;
async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  await Promise.all([web.stop(), autopost.stop()]);
  releaseLock();
  process.exit(code);
}

async function main() {
  acquireLock();
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  log(`ตัวคุมเว็บเริ่ม · เว็บพอร์ต ${WEB_PORT}${RUN_AUTOPOST ? ` · Autopost พอร์ต ${AUTOPOST_PORT}` : ''}`);

  const alive = () => {
    try {
      fs.writeFileSync(path.join(LOG_DIR, 'alive-web.txt'), stamp());
    } catch {
      /* ignore */
    }
  };
  alive();
  setInterval(alive, 30_000);

  // รอจนมี web/.env.local ครบ — ไม่ปิดตัวเอง (ไม่งั้นหน้าต่างเปิดซ้ำทุก 10 วินาที)
  let env = readWebEnv();
  for (;;) {
    const missing = env ? missingEnv(env) : ['ไฟล์ web/.env.local'];
    if (!missing.length) break;
    log(`ยังเปิดเว็บไม่ได้ ขาด: ${missing.join(', ')} — ใส่แล้วรอ 1 นาที`);
    await sleep(CHECK_EVERY_MS);
    env = readWebEnv();
  }
  fileEnv = env;

  const state = readState();
  if (slotReady(state.slot) && state.sha) {
    // เปิดเว็บรุ่นที่ build ไว้ก่อนทันที แล้วค่อยเช็กว่าต้อง build ใหม่ไหม
    await startWeb(state.slot, state.sha);
  }
  await tick();
  setInterval(tick, CHECK_EVERY_MS);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  main().catch((e) => {
    log(`ตัวคุมเว็บล้ม: ${e.stack || e.message}`);
    shutdown(1);
  });
}
