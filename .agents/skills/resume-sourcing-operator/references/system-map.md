# แผนที่ระบบค้นหา Resume

## หน้าจอและคำสั่ง

- `/scraping`: กรอกรายละเอียดงาน จำนวน Resume และเริ่มงาน
- `/settings/connectors`: เพิ่มบัญชี JobBKK/JobThai และตรวจความพร้อม
- `/candidates`: ตรวจ Resume ที่ระบบเก็บได้
- `web/lib/actions.ts`: สร้าง Task, เข้าคิว และกดรันต่อ
- `workers/runner.js`: รับงานจาก `work_queue`

## ขั้นตอนเบื้องหลัง

- `src/tasks-worker.js`: แปลงเนื้องานเป็นคำค้น ขยายตำแหน่ง ทำ OCR และปิดสถานะ
- `src/core/job-family.js`: จัด Job Family และตำแหน่งใกล้เคียง
- `src/pipeline.js`: เปิด Session ค้น เปิด Resume กรอง และบันทึก
- `src/providers/jobbkk/`: Login, ค้นและเปิด Resume ของ JobBKK
- `src/providers/jobthai/`: Login, ค้นและเปิด Resume ของ JobThai
- `src/core/candidate-match.js`: แยกตัวกรองเว็บไซต์และตัวกรองในระบบ

## ข้อมูลหลัก

- `scrape_tasks`: เป้าหมาย สถานะ และความคืบหน้า
- `scrape_runs`: ผลการค้นแต่ละรอบและการใช้โควตา
- `candidates`: ผู้สมัครกลางที่ตัดซ้ำแล้ว
- `candidate_sources`: แหล่งและ Platform ID
- `scrape_task_candidates`: ผู้สมัครไม่ซ้ำที่ผูกกับ Task
- `candidate_assets`: รูปและเอกสารแนบ

## การวิเคราะห์งานค้าง

ตรวจตามลำดับ: `work_queue` → `scrape_tasks.phase` → Connector/Session → `scrape_runs.error` → จำนวนใน `scrape_task_candidates` ห้ามแก้สถานะเป็นสำเร็จด้วยมือหากจำนวนจริงยังไม่ครบ
