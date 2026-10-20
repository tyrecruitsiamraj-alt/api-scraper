import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResumeHtml } from '../src/providers/jobbkk/parser.js';
import { isResumeMasked } from '../src/providers/jobbkk/client.js';

// Shape of the live JobBKK resume page on 20 Oct 2026 (Next.js). Values are made up.
const PAGE = `<!doctype html><html><body>
  <script>self.__next_f.push([1,"{\\"guestPrompt\\":{\\"message\\":\\"กรุณาล็อกอินเพื่อดูข้อมูลการติดต่อเรซูเม่\\"}}"])</script>
  <div>
    <h3 class="font-db-heavy text-center"><span class="min-w-0 break-words">สมหญิง ทดสอบดี</span></h3>
    <div class="mb-4"><p class="mb-2">ความสมบูรณ์ของ ใบสมัครงาน</p></div>
  </div>
  <div class="grid grid-cols-2">
    <div class="resume-card"><img src="/svg/resume_premium/skill-resume-20-1.png" alt=""><span>หญิง</span></div>
    <div class="resume-card"><img src="/svg/resume_premium/skill-resume13-1.png" alt=""><span>สมรส</span></div>
  </div>
</body></html>`;

test('Oct 2026 resume layout: name and gender come from the heading and icon cards', () => {
  const record = parseResumeHtml(PAGE, { sourceUrl: 'https://www.jobbkk.com/resumes/preview_new/1', index: 1 });
  assert.equal(record.first_name, 'สมหญิง');
  assert.equal(record.last_name, 'ทดสอบดี');
  assert.equal(record.gender, 'หญิง');
  assert.equal(record.marital_status, 'สมรส');
});

test('i18n strings inside <script> do not mark a resume as masked', () => {
  assert.equal(isResumeMasked(PAGE), false);
  assert.equal(isResumeMasked('<div class="ownerNoLogin">กรุณา ล็อคอิน เพื่อดูข้อมูลการติดต่อ</div>'), true);
});
