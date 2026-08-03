import { readFileSync } from 'node:fs';

const ROOT = new URL('../../.agents/skills/recruitment-content-director/references/', import.meta.url);
const ALLOWED = new Set(['content-strategy', 'copywriting', 'visual-direction', 'review-scorecard']);

/** อ่าน Human Playbook สดทุกรอบ เพื่อให้แก้ Markdown แล้วงานรอบถัดไปใช้ทันที. */
export function loadHumanPlaybook(name) {
  if (!ALLOWED.has(name)) return '';
  try {
    return readFileSync(new URL(`${name}.md`, ROOT), 'utf8').trim().slice(0, 14_000);
  } catch (error) {
    console.warn(`[human-playbook] อ่าน ${name}.md ไม่สำเร็จ: ${error.message}`);
    return '';
  }
}

export function withHumanPlaybook(baseSystem, names = []) {
  const sections = names
    .map((name) => loadHumanPlaybook(name))
    .filter(Boolean)
    .map((text) => `## Human Playbook — ใช้เป็นวิธีทำงานของผู้เชี่ยวชาญ\n${text}`);
  return [baseSystem, ...sections].filter(Boolean).join('\n\n');
}
