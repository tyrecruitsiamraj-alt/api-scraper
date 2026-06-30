import { createObjectCsvWriter } from 'csv-writer';
import { writeFile } from 'node:fs/promises';

export const CSV_CANDIDATE_HEADERS = [
  'index',
  'scraped_at',
  'focus_position',
  'source',
  'prefix',
  'first_name',
  'last_name',
  'name',
  'phone',
  'email',
  'line_id',
  'age',
  'gender',
  'province',
  'address',
  'expected_salary',
  'available_start',
  'desired_positions',
  'education_count',
  'education_json',
  'education_summary',
  'work_experience_count',
  'work_experience_json',
  'experience_summary',
  'hard_skills',
  'soft_skills',
  'profile_image_url',
  'profile_image_local',
  'attachments_count',
  'attachments_summary',
  'parse_status',
  'source_url',
];

function cleanText(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function listToText(value) {
  if (Array.isArray(value)) return value.join(' | ');
  return cleanText(value);
}

function formatList(value) {
  if (Array.isArray(value) && value.length) return value.map((v) => `  - ${v}`).join('\n');
  return cleanText(value) || '-';
}

export async function writeJsonl(path, rows) {
  await writeFile(path, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

export async function writeCsv(path, rows, { attachmentsSummary }) {
  const csvWriter = createObjectCsvWriter({
    path,
    header: CSV_CANDIDATE_HEADERS.map((id) => ({ id, title: id })),
    encoding: 'utf8',
  });
  const csvRows = rows.map((row) => {
    const normalized = { ...row };
    for (const field of ['hard_skills', 'soft_skills']) {
      normalized[field] = listToText(normalized[field]);
    }
    normalized.attachments_count = Array.isArray(row.attachments) ? row.attachments.length : 0;
    normalized.attachments_summary = row.attachments_summary || attachmentsSummary(row.attachments);
    normalized.education_count = Array.isArray(row.education) ? row.education.length : 0;
    normalized.education_json = JSON.stringify(row.education || []);
    normalized.work_experience_count = Array.isArray(row.work_experience) ? row.work_experience.length : 0;
    normalized.work_experience_json = JSON.stringify(row.work_experience || []);
    return normalized;
  });
  await csvWriter.writeRecords(csvRows);
}

export function buildReadableMarkdown({
  platformLabel,
  runAt,
  position,
  keyword,
  requestedCandidates,
  totalFoundOnPage,
  scrapedSuccess,
  scrapedFailed,
  candidates,
  formatEducationMarkdown,
  formatWorkExperienceMarkdown,
}) {
  const lines = [
    `# ${platformLabel} Scraping Result`,
    '',
    `Run date: ${runAt}`,
    `Position: ${position || '-'}`,
    `Keyword: ${keyword || '-'}`,
    `Requested candidates: ${requestedCandidates}`,
    `Total candidates found on page: ${totalFoundOnPage}`,
    `Candidates scraped successfully: ${scrapedSuccess}`,
    `Candidates failed: ${scrapedFailed}`,
    '',
    '---',
    '',
  ];

  for (const c of candidates) {
    const no = String(c.candidate_index ?? c.index ?? 0).padStart(3, '0');
    lines.push(
      `## Candidate ${no}`,
      '',
      '### Summary',
      '',
      `* คำนำหน้า: ${c.prefix || '-'}`,
      `* ชื่อ: ${c.first_name || '-'}`,
      `* นามสกุล: ${c.last_name || '-'}`,
      `* ชื่อ-นามสกุล (เต็ม): ${c.name || '-'}`,
      `* Age: ${c.age || '-'}`,
      `* Gender: ${c.gender || '-'}`,
      `* Province: ${c.province || '-'}`,
      `* Address: ${c.address || '-'}`,
      `* Expected Salary: ${c.expected_salary || '-'}`,
      `* Available Start: ${c.available_start || '-'}`,
      '',
      '### Contact',
      '',
      `* Phone: ${c.phone || '-'}`,
      `* Email: ${c.email || '-'}`,
      `* Line: ${c.line_id || '-'}`,
      `* Source URL: ${c.source_url || '-'}`,
      '',
      '### Profile Image',
      '',
      `* URL: ${c.profile_image_url || '-'}`,
      `* Local: ${c.profile_image_local || '-'} (${c.profile_image_download_status || '-'})`,
      '',
      '### Attachments',
      '',
      ...(Array.isArray(c.attachments) && c.attachments.length
        ? c.attachments.flatMap((att) => [
            `* ${att.title || 'attachment'}`,
            `  - source: ${att.source_url || '-'}`,
            `  - local: ${att.local_path || '-'} (${att.download_status || '-'})`,
          ])
        : ['-']),
      '',
      '### Desired Job',
      '',
      `* Desired Position: ${c.desired_positions || '-'}`,
      `* Desired Work Area: ${c.desired_work_area || '-'}`,
      `* Job Type: ${c.job_type || '-'}`,
      '',
      '### Education',
      '',
      ...formatEducationMarkdown(c.education),
      ...(Array.isArray(c.education) && c.education.length ? [] : [c.education_summary || '-', '']),
      '### Work Experience',
      '',
      ...formatWorkExperienceMarkdown(c.work_experience),
      ...(Array.isArray(c.work_experience) && c.work_experience.length ? [] : [c.experience_summary || '-', '']),
      '### Skills',
      '',
      '* Hard Skills:',
      formatList(c.hard_skills),
      '* Soft Skills:',
      formatList(c.soft_skills),
      '',
      '### Raw Text Preview',
      '',
      c.raw_text_preview || '-',
      '',
      '---',
      '',
    );
  }

  return `${lines.join('\n')}\n`;
}
