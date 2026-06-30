import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env') });

export function envString(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v.trim();
}

export function envInt(name, fallback) {
  const n = Number.parseInt(envString(name, String(fallback)), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function envBool(name, fallback = false) {
  const v = envString(name, String(fallback)).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(v)) return true;
  if (['false', '0', 'no', 'off'].includes(v)) return false;
  return fallback;
}

export const OUTPUT_DIR = join(PROJECT_ROOT, 'output');
export const AUTH_DIR = join(PROJECT_ROOT, '.auth');

/** Search criteria from .env (no popup — fully automated). */
export function loadCriteria() {
  return {
    position: envString('POSITION'),
    keyword: envString('KEYWORD'),
    maxCandidates: Math.min(100, Math.max(1, envInt('MAX_CANDIDATES', 15))),
    province: envString('PROVINCE'),
    salaryMin: envString('SALARY_MIN'),
    salaryMax: envString('SALARY_MAX'),
    ageMin: envString('AGE_MIN'),
    ageMax: envString('AGE_MAX'),
    gender: envString('GENDER'),
  };
}

export function loadRuntime() {
  return {
    headless: envBool('HEADLESS', true),
    debug: envBool('DEBUG', false),
    delayMin: envInt('REQUEST_DELAY_MIN_MS', 600),
    delayMax: envInt('REQUEST_DELAY_MAX_MS', 1400),
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Random delay between requests — jitter to look less bot-like. */
export function requestGapMs(runtime) {
  const { delayMin, delayMax } = runtime;
  if (delayMax <= delayMin) return delayMin;
  return delayMin + Math.floor(Math.random() * (delayMax - delayMin + 1));
}
