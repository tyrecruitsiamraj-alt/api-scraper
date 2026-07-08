'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { encryptSecret } from './crypto';
import { kickWorker } from './worker-kick';
import {
  deleteConnector,
  deleteTask,
  insertConnector,
  insertTask,
  queueTask,
  setConnectorEnabled,
  setProviderCap,
  setTaskEnabled,
} from './repo';

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error('unauthorized');
}

/** Mirror api-scraper tasks-worker nextRunFrom() for the first scheduled fire. */
function firstNextRun(cron: string | null): string | null {
  if (!cron) return null;
  let sec: number | null = null;
  const m = cron.match(/^every:(\d+)$/);
  if (m) sec = Number.parseInt(m[1], 10);
  else if (cron === '@hourly') sec = 3600;
  else if (cron === '@daily') sec = 86400;
  if (!sec) return null;
  return new Date(Date.now() + sec * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function createTaskAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get('name') ?? '').trim();
  const connectorId = String(formData.get('connectorId') ?? '');
  const mode = (String(formData.get('mode') ?? 'count') === 'date_range' ? 'date_range' : 'count') as
    | 'count'
    | 'date_range';
  const schedule = String(formData.get('schedule') ?? '').trim() || null;
  const runNow = formData.get('runNow') === 'on';

  if (!name || !connectorId) throw new Error('กรุณากรอกชื่องานและเลือก connector');

  const position = String(formData.get('position') ?? '').trim();
  const keyword = String(formData.get('keyword') ?? '').trim();
  const criteria: Record<string, unknown> = {};
  if (position) criteria.position = position;
  if (keyword) criteria.keyword = keyword;

  // Optional filters — keys match what the JobBKK premium search understands
  // (see src/providers/jobbkk/browser/jobbkk-filters.js). "ไม่ระบุ"/empty = skip.
  const filterVal = (key: string) => {
    const v = String(formData.get(key) ?? '').trim();
    return v && v !== 'ไม่ระบุ' ? v : '';
  };
  const gender = filterVal('gender');
  const province = filterVal('province');
  const education = filterVal('education');
  const salaryMin = filterVal('salaryMin');
  const salaryMax = filterVal('salaryMax');
  const ageMin = filterVal('ageMin');
  const ageMax = filterVal('ageMax');
  if (gender) criteria.gender = gender;
  if (province) criteria.province = province;
  if (education) criteria.education = education;
  if (salaryMin) criteria.salaryMin = salaryMin;
  if (salaryMax) criteria.salaryMax = salaryMax;
  if (ageMin) criteria.ageMin = ageMin;
  if (ageMax) criteria.ageMax = ageMax;

  let targetCount: number | null = null;
  let updatedSince: string | null = null;
  if (mode === 'count') {
    const n = Number.parseInt(String(formData.get('targetCount') ?? ''), 10);
    targetCount = Number.isFinite(n) && n > 0 ? n : null;
  } else {
    updatedSince = String(formData.get('updatedSince') ?? '').trim() || null;
  }

  await insertTask({
    name,
    connectorId,
    mode,
    targetCount,
    updatedSince,
    criteria,
    scheduleCron: schedule,
    nextRunAt: firstNextRun(schedule),
    // run-now → queued so the worker picks it up immediately
    status: runNow ? 'queued' : 'idle',
  });
  if (runNow) kickWorker(); // start scraping immediately, no manual worker run
  revalidatePath('/scraping');
}

export async function queueTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  if (id) {
    await queueTask(id);
    kickWorker(); // "run now" → kick the worker right away
  }
  revalidatePath('/scraping');
}

export async function toggleTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  const enabled = formData.get('enabled') === 'true';
  if (id) await setTaskEnabled(id, enabled);
  revalidatePath('/scraping');
}

export async function deleteTaskAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  if (id) await deleteTask(id);
  revalidatePath('/scraping');
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------
export async function createConnectorAction(formData: FormData) {
  await requireSession();
  const platform = String(formData.get('platform') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const scrapeLimit = Number.parseInt(String(formData.get('scrapeLimit') ?? '15'), 10) || 15;
  const dailyCap = Number.parseInt(String(formData.get('dailyCap') ?? '200'), 10) || 200;

  if (!platform || !label || !username || !password) throw new Error('กรุณากรอกข้อมูล connector ให้ครบ');

  await insertConnector({
    platform,
    label,
    username,
    passwordEnc: encryptSecret(password),
    scrapeLimit,
    dailyCap,
  });
  revalidatePath('/connectors');
}

export async function toggleConnectorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  const enabled = formData.get('enabled') === 'true';
  if (id) await setConnectorEnabled(id, enabled);
  revalidatePath('/connectors');
}

export async function deleteConnectorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get('id') ?? '');
  if (id) await deleteConnector(id);
  revalidatePath('/connectors');
}

export async function setProviderCapAction(formData: FormData) {
  await requireSession();
  const platform = String(formData.get('platform') ?? '').trim();
  const dailyCap = Number.parseInt(String(formData.get('dailyCap') ?? ''), 10);
  if (platform && Number.isFinite(dailyCap) && dailyCap >= 0) await setProviderCap(platform, dailyCap);
  revalidatePath('/connectors');
}
