import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateContent } from '../src/core/content-gen.js';
import { generateImage } from '../src/core/ai-image.js';
import { PROJECT_ROOT } from '../src/config.js';

/**
 * เทสคิด content จริง 1 ใบ โดยไม่ต้องมีใบขอ ERP/DB — ใช้ตรวจว่า key ใช้ได้จริง
 *
 *   node scripts/test-content-gen.js                      # ใช้ตำแหน่งตัวอย่าง "พนักงานขาย"
 *   node scripts/test-content-gen.js "ช่างไฟฟ้า" "ระยอง"   # ระบุตำแหน่ง/จังหวัดเอง
 *
 * ต้องมี ANTHROPIC_API_KEY ใน .env (root). มี OPENAI_API_KEY ด้วย = ได้รูปที่ output/
 */
const position = process.argv[2] || 'พนักงานขาย';
const province = process.argv[3] || 'กรุงเทพมหานคร';

console.log(`ทดสอบคิด content: ตำแหน่ง "${position}" จังหวัด "${province}" ...`);

const content = await generateContent({
  title: position,
  province,
  qty: 3,
  remaining_qty: 2,
  snapshot: { site_name: province, request_name: position },
});

if (!content) {
  console.error('❌ คิด content ไม่ได้ — เช็คว่าใส่ ANTHROPIC_API_KEY ใน .env แล้วหรือยัง (หรือ key หมดเครดิต)');
  process.exit(1);
}

console.log('\n===== แคปชัน (Facebook) =====\n' + content.caption);
console.log('\n===== แนววิดีโอ (brief) =====\n' + content.videoBrief);
console.log('\n===== prompt รูป =====\n' + content.imagePrompt);
console.log(`\n(โมเดล: ${content.model})`);

const image = await generateImage({ prompt: content.imagePrompt });
if (image) {
  const dir = join(PROJECT_ROOT, 'output');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'test-content-image.png');
  writeFileSync(file, image.bytes);
  console.log(`\n🖼️ รูปสร้างสำเร็จ → ${file} (เปิดดูได้เลย)`);
} else {
  console.log('\n(ไม่มีรูป — ยังไม่ได้ใส่ OPENAI_API_KEY หรือสร้างไม่สำเร็จ; แคปชันใช้ได้ปกติ)');
}
console.log('\n✅ เทสผ่าน — ระบบพร้อมคิด content จริงใน pipeline');
