import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 19 พ.ย. 2569: อัปรูปเรซูเม่แล้วขึ้น "อ่านชื่อผู้สมัครจากไฟล์ไม่ได้" ไม่มีตัวอย่างไฟล์ และไม่รู้ว่า AI อ่านอะไรได้
test('อ่านไม่ผ่านเก็บตัวหนังสือที่อ่านได้ · อ่านใหม่ล้างของเดิมให้อ่านจากไฟล์ใหม่', () => {
  const worker = fs.readFileSync(new URL('../src/db/resume-uploads.js', import.meta.url), 'utf8');
  assert.match(worker, /await setStatus\(id, 'failed', \{ error: reason, rawText: String\(text \?\? ''\)\.trim\(\) \|\| null \}\);/);
  const web = fs.readFileSync(new URL('../web/lib/resume-uploads.ts', import.meta.url), 'utf8');
  assert.match(web, /SET status = 'queued', error = NULL, finished_at = NULL, raw_text = NULL/);
  assert.match(web, /CASE WHEN u\.status = 'failed' THEN left\(u\.raw_text, 4000\) END AS read_text/);
});

test('เปิดไฟล์ต้นฉบับต้องล็อกอิน และต้องเป็นไฟล์ในรอบอัปโหลดนั้น', () => {
  const route = fs.readFileSync(new URL('../web/app/api/candidates/uploads/[batchId]/files/[id]/route.ts', import.meta.url), 'utf8');
  assert.match(route, /if \(!session\) return NextResponse\.json\(\{ error: 'ล็อกอินก่อน' \}, \{ status: 401 \}\);/);
  assert.match(route, /'X-Content-Type-Options': 'nosniff'/);
  const web = fs.readFileSync(new URL('../web/lib/resume-uploads.ts', import.meta.url), 'utf8');
  assert.match(web, /FROM resume_uploads WHERE id = \$1 AND batch_id = \$2/);
});

test('หน้าผลอัปโหลด: ปุ่มโหลด Resume เปิดตัวอย่างก่อน ตั้งแบบฟอร์มตามที่เลือกตอนอัป', () => {
  const page = fs.readFileSync(new URL('../web/app/(app)/candidates/upload/[batchId]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /<PdfDownloadDialog[\s\S]*?initialTemplateId=\{chosen\?\.id\}[\s\S]*?label="ดาวน์โหลด Resume"/);
  const dialog = fs.readFileSync(new URL('../web/components/PdfDownloadDialog.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /templates\.find\(\(t\) => t\.id === initialTemplateId\)/);
});
