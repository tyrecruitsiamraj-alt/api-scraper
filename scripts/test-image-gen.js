import { envString } from '../src/config.js';

/**
 * เทสสร้างรูป AI ตรง ๆ กับ OpenAI — โชว์ error จริง (ต่างจากใน pipeline ที่กลืน error เงียบ).
 * รันบนเครื่องที่มี OPENAI_API_KEY ใน .env (เช่น Mac worker):
 *   node scripts/test-image-gen.js
 */
console.log('=== เทสสร้างรูป AI (OpenAI) ===\n');

const key = envString('OPENAI_API_KEY');
if (!key) {
  console.error('❌ ไม่พบ OPENAI_API_KEY ใน .env (root)');
  console.error('   → เปิดไฟล์ .env เช็คว่ามีบรรทัด  OPENAI_API_KEY=sk-...  (มีชื่อตัวแปรนำหน้า)');
  console.error('   → ใส่แล้วต้อง "ปิด-เปิด worker ใหม่" ด้วย env ถึงจะโหลด');
  process.exit(1);
}
console.log(`✅ พบ key: ${key.slice(0, 10)}…${key.slice(-4)}  (${key.length} ตัวอักษร)`);
if (!key.startsWith('sk-')) {
  console.warn('⚠️  key ไม่ได้ขึ้นต้นด้วย sk- — อาจ copy มาผิด/มีอักขระเกินหน้า');
}

const model = envString('CONTENT_IMAGE_MODEL', 'gpt-image-1');
const size = envString('CONTENT_IMAGE_SIZE', '1024x1024');
console.log(`โมเดล = ${model} · ขนาด = ${size}\nกำลังยิง OpenAI (รอสักครู่)...\n`);

const res = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify({ model, prompt: 'a clean professional recruitment poster background, warm tone, no text', size, n: 1 }),
});

console.log(`HTTP ${res.status} ${res.statusText}`);
const body = await res.text();

if (res.ok) {
  console.log('\n✅ OpenAI สร้างรูปได้ปกติ! (API + key + เครดิต พร้อมหมด)');
  console.log('   → ถ้า draft ในระบบยังไม่มีรูป แปลว่า worker ยังไม่ได้ restart หลังใส่ key');
  console.log('   → ปิด 2 หน้าต่าง worker (Ctrl+C + ปิด) แล้วดับเบิลคลิก start-mac.command ใหม่');
} else {
  console.error('\n❌ OpenAI ปฏิเสธ — ข้อความจริง:\n' + body.slice(0, 800));
  console.error('\n── สาเหตุที่พบบ่อย ──');
  console.error(' • 401         = key ผิด / ถูกยกเลิก → สร้าง key ใหม่');
  console.error(' • 403 verify  = ต้อง verify องค์กรก่อนใช้ gpt-image-1:');
  console.error('                 platform.openai.com/settings/organization/general → Verify Organization → รอ ~15 นาที');
  console.error('                 (หรือเลี่ยงด้วยการใช้ dall-e-3 — ดูด้านล่าง)');
  console.error(' • 400 model   = โมเดลใช้ไม่ได้ → ลองใส่ใน .env:  CONTENT_IMAGE_MODEL=dall-e-3');
  console.error(' • billing     = ไม่มีเครดิต → เติมที่ platform.openai.com/settings/organization/billing');
}
