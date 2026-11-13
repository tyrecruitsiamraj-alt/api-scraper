import 'server-only';
import { q } from './db';
import { SO_LOGO_DATA_URL } from './resume-logo';
import { DEFAULT_RESUME_TEMPLATE, normalizeTemplateSettings } from './resume-template';
import type { ResumeTemplateSettings } from './resume-template';

/**
 * แบบฟอร์มเรซูเม่ที่ตั้งจากหน้าจอ (ตั้งค่า → แบบฟอร์มเรซูเม่) — มีได้หลายแบบ เลือกตอนกดดาวน์โหลด PDF
 * ยังไม่ได้ตั้งแบบไหนเป็นแบบเริ่มต้น = ใช้ "แบบมาตรฐาน" ที่มากับระบบ (หน้าตาเดิม)
 */

export const BUILTIN_TEMPLATE_ID = 'standard';

/** แบบที่มากับระบบ แก้ตรง ๆ ไม่ได้ (กด "คัดลอกไปแก้") · แถบขวา = ตามรูปที่เจ้าของส่งมา 12 พ.ย. 2569 */
const BUILTINS: { id: string; name: string; settings: ResumeTemplateSettings }[] = [
  { id: BUILTIN_TEMPLATE_ID, name: 'แบบมาตรฐาน', settings: DEFAULT_RESUME_TEMPLATE },
  {
    id: 'profile',
    name: 'แบบแถบขวา',
    settings: normalizeTemplateSettings({
      layout: 'profile',
      font: 'Noto Sans Thai',
      accentColor: '#c62828',
      textColor: '#444444',
      logo: SO_LOGO_DATA_URL,
      watermark: 'both',
      watermarkText: 'SIAMRAJATHANEE',
      watermarkTile: true,
      watermarkOpacity: 18,
      showContacts: false,
      showSources: false,
      footerText: '',
      sections: ['intro', 'work', 'education', 'skills'],
    }),
  },
];

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
  // แบบที่มากับระบบไม่มีแถวในตารางบน จึงจำว่าแบบไหนเป็นแบบเริ่มต้นไว้ที่นี่ (ใช้เมื่อไม่มีแถวไหน is_default)
  await q(`CREATE TABLE IF NOT EXISTS resume_template_builtin_default (only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row), template_id text NOT NULL)`);
  ensured = true;
}

type Row = { id: string; name: string; settings: unknown; is_default: boolean; updated_at: string; updated_by: string | null };

function toTemplate(r: Row): ResumeTemplate {
  return { id: r.id, name: r.name, isDefault: r.is_default, builtin: false, settings: normalizeTemplateSettings(r.settings), updatedAt: r.updated_at, updatedBy: r.updated_by };
}

/**
 * ทุกแบบ เรียงแบบเริ่มต้นก่อน · แบบที่มากับระบบอยู่ในรายการเสมอ
 * แบบเริ่มต้น: แถวที่ is_default → แบบของระบบที่จำไว้ → แบบมาตรฐาน
 */
export async function listResumeTemplates(): Promise<ResumeTemplate[]> {
  await ensureTable();
  const [rows, saved] = await Promise.all([
    q<Row>(`SELECT id::text, name, settings, is_default, updated_at, updated_by FROM resume_templates ORDER BY name`).then((r) => r.map(toTemplate)),
    q<{ template_id: string }>(`SELECT template_id FROM resume_template_builtin_default`),
  ]);
  const builtinDefault = rows.some((t) => t.isDefault)
    ? null
    : BUILTINS.find((b) => b.id === saved[0]?.template_id)?.id ?? BUILTIN_TEMPLATE_ID;
  const builtins: ResumeTemplate[] = BUILTINS.map((b) => ({ ...b, isDefault: b.id === builtinDefault, builtin: true, updatedAt: null, updatedBy: null }));
  return [...builtins, ...rows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
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

/** ตั้งเป็นแบบเริ่มต้น (มีได้แบบเดียว) · แบบของระบบ = ล้าง is_default ทุกแถวแล้วจำ id ไว้ */
export async function setDefaultResumeTemplate(id: string): Promise<void> {
  await ensureTable();
  await q(`UPDATE resume_templates SET is_default = (id::text = $1)`, [id]);
  if (BUILTINS.some((b) => b.id === id)) {
    await q(
      `INSERT INTO resume_template_builtin_default (template_id) VALUES ($1) ON CONFLICT (only_row) DO UPDATE SET template_id = EXCLUDED.template_id`,
      [id],
    );
  }
}
