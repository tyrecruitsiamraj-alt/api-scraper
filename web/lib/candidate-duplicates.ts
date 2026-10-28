import 'server-only';
import { q } from './db';
import { groupDuplicateCandidates } from '../../src/core/candidate-duplicates.js';

type DuplicateIndex = ReturnType<typeof groupDuplicateCandidates>;

let cache: { at: number; value: DuplicateIndex } | null = null;
const TTL_MS = 60_000;

/** กลุ่มผู้สมัครที่เป็นคนเดียวกัน (เบอร์ 9 หลักท้าย หรืออีเมลตรงกัน) — คำนวณจากทั้งคลัง เก็บไว้ 1 นาที */
export async function getCandidateDuplicates(): Promise<DuplicateIndex> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await q<{ id: string; phone_norm: string | null; email_norm: string | null; last_updated_at: string | null }>(
    `SELECT id, phone_norm, email_norm, last_updated_at FROM candidates`,
  );
  const value = groupDuplicateCandidates(rows);
  cache = { at: Date.now(), value };
  return value;
}
