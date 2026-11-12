import 'server-only';
import { q } from './db';
import { DEFAULT_RESUME_TEMPLATE, normalizeTemplateSettings } from './resume-template';
import type { ResumeTemplateSettings } from './resume-template';

/**
 * แบบฟอร์มเรซูเม่ที่ตั้งจากหน้าจอ (ตั้งค่า → แบบฟอร์มเรซูเม่) — มีได้หลายแบบ เลือกตอนกดดาวน์โหลด PDF
 * ยังไม่ได้ตั้งแบบไหนเป็นแบบเริ่มต้น = ใช้ "แบบมาตรฐาน" ที่มากับระบบ (หน้าตาเดิม)
 */

export const BUILTIN_TEMPLATE_ID = 'standard';
export const BUILTIN_TEMPLATE_NAME = 'แบบมาตรฐาน';

export type ResumeTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
  builtin: boolean;
  settings: ResumeTemplateSettings;
  updatedAt: string | null;
  updatedBy: string | null;
};

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await q(`
    CREATE TABLE IF NOT EXISTS resume_templates (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name        text NOT NULL,
      settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_default  boolean NOT NULL DEFAULT false,
      updated_by  text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )`);
  ensured = true;
}

type Row = { id: string; name: string; settings: unknown; is_default: boolean; updated_at: string; updated_by: string | null };

function toTemplate(r: Row): ResumeTemplate {
  return { id: r.id, name: r.name, isDefault: r.is_default, builtin: false, settings: normalizeTemplateSettings(r.settings), updatedAt: r.updated_at, updatedBy: r.updated_by };
}

/** ทุกแบบ เรียงแบบเริ่มต้นก่อน แล้วตามชื่อ · แบบมาตรฐานของระบบอยู่ในรายการเสมอ */
export async function listResumeTemplates(): Promise<ResumeTemplate[]> {
  await ensureTable();
  const rows = (await q<Row>(`SELECT id::text, name, settings, is_default, updated_at, updated_by FROM resume_templates ORDER BY name`)).map(toTemplate);
  const builtin: ResumeTemplate = {
    id: BUILTIN_TEMPLATE_ID,
    name: BUILTIN_TEMPLATE_NAME,
    isDefault: !rows.some((t) => t.isDefault),
    builtin: true,
    settings: DEFAULT_RESUME_TEMPLATE,
    updatedAt: null,
    updatedBy: null,
  };
  return [builtin, ...rows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** แบบที่ขอ หรือแบบเริ่มต้นถ้าไม่ระบุ/ไม่เจอ */
export async function getResumeTemplate(id: string | null | undefined): Promise<ResumeTemplate> {
  const all = await listResumeTemplates();
  return all.find((t) => t.id === id) ?? all.find((t) => t.isDefault) ?? all[0];
}

export async function saveResumeTemplate(input: { id: string | null; name: string; settings: unknown; actor: string | null }): Promise<string> {
  await ensureTable();
  const settings = JSON.stringify(normalizeTemplateSettings(input.settings));
  if (input.id && /^[0-9a-f-]{36}$/i.test(input.id)) {
    await q(
      `UPDATE resume_templates SET name = $2, settings = $3::jsonb, updated_by = $4, updated_at = now() WHERE id = $1`,
      [input.id, input.name, settings, input.actor],
    );
    return input.id;
  }
  const rows = await q<{ id: string }>(
    `INSERT INTO resume_templates (name, settings, updated_by) VALUES ($1, $2::jsonb, $3) RETURNING id::text`,
    [input.name, settings, input.actor],
  );
  return rows[0].id;
}

export async function deleteResumeTemplate(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await ensureTable();
  await q(`DELETE FROM resume_templates WHERE id = $1`, [id]);
}

/** ตั้งเป็นแบบเริ่มต้น (มีได้แบบเดียว) · แบบมาตรฐาน = ล้างแบบเริ่มต้นทั้งหมด */
export async function setDefaultResumeTemplate(id: string): Promise<void> {
  await ensureTable();
  await q(`UPDATE resume_templates SET is_default = (id::text = $1)`, [id]);
}
