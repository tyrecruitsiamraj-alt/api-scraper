import { createObjectCsvWriter } from 'csv-writer';
import { writeFile } from 'node:fs/promises';

const HEADERS = [
  'index', 'scraped_at', 'focus_position', 'source', 'platform',
  'prefix', 'first_name', 'last_name', 'name', 'phone', 'email', 'line_id',
  'age', 'gender', 'province', 'address', 'expected_salary', 'available_start',
  'desired_positions', 'education_count', 'education_summary',
  'work_experience_count', 'experience_summary', 'hard_skills', 'soft_skills',
  'profile_image_local', 'attachments_count', 'parse_status', 'source_url',
];

const list = (v) => (Array.isArray(v) ? v.join(' | ') : String(v ?? ''));

export async function writeJsonl(path, rows) {
  await writeFile(path, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

export async function writeCsv(path, rows) {
  const w = createObjectCsvWriter({ path, header: HEADERS.map((id) => ({ id, title: id })), encoding: 'utf8' });
  await w.writeRecords(
    rows.map((r) => ({
      ...r,
      hard_skills: list(r.hard_skills),
      soft_skills: list(r.soft_skills),
      education_count: Array.isArray(r.education) ? r.education.length : 0,
      work_experience_count: Array.isArray(r.work_experience) ? r.work_experience.length : 0,
      attachments_count: Array.isArray(r.attachments) ? r.attachments.length : 0,
    })),
  );
}

export function buildReadableMarkdown(meta, candidates) {
  const lines = [
    `# JobBKK (API) Scraping Result`,
    '',
    `Run date: ${meta.runAt}`,
    `Position: ${meta.position || '-'}`,
    `Keyword: ${meta.keyword || '-'}`,
    `Requested: ${meta.requested} | Found ids: ${meta.found} | Scraped: ${candidates.length}`,
    '',
    '---',
    '',
  ];
  for (const c of candidates) {
    const no = String(c.index ?? 0).padStart(3, '0');
    lines.push(
      `## Candidate ${no} (${c.parse_status})`,
      '',
      `* ชื่อ-นามสกุล: ${c.name || '-'}`,
      `* อายุ: ${c.age || '-'} | เพศ: ${c.gender || '-'} | จังหวัด: ${c.province || '-'}`,
      `* โทร: ${c.phone || '-'} | อีเมล: ${c.email || '-'} | Line: ${c.line_id || '-'}`,
      `* ที่อยู่: ${c.address || '-'}`,
      `* ตำแหน่งที่ต้องการ: ${c.desired_positions || '-'} | เงินเดือน: ${c.expected_salary || '-'}`,
      `* รูปโปรไฟล์: ${c.profile_image_local || '-'}`,
      `* ไฟล์แนบ: ${(c.attachments || []).length}`,
      `* การศึกษา: ${c.education_summary || '-'}`,
      `* ประสบการณ์: ${c.experience_summary || '-'}`,
      `* Source: ${c.source_url}`,
      '',
      '---',
      '',
    );
  }
  return lines.join('\n') + '\n';
}
