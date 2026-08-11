# แผนที่ระบบ api-scraper

## หน้าจอหลัก

| งาน | เส้นทาง |
|---|---|
| ศูนย์งาน | `/orchestrator` |
| รายละเอียดงาน | `/orchestrator/[id]` |
| คำขอจาก So Recruit | `/orchestrator/imports` |
| ค้นหาผู้สมัคร | `/scraping` |
| ภาพรวมการเผยแพร่ | `/autopost` |
| ผลลัพธ์และผู้สนใจ | `/autopost/results` |
| รายงาน | `/autopost/report` |
| บัญชีที่ใช้งาน | `/settings/connectors` |
| กลุ่มและการเผยแพร่ | `/settings/posting` |

## ส่วนทำงานเบื้องหลัง

- `workers/runner.js`: รับงานค้นหา สร้างร่าง และวัดผลจาก `work_queue`
- `src/core/orchestrator-draft.js`: สร้างร่างและนำบทเรียนเดิมกลับมาใช้
- `src/core/orchestrator-measure.js`: คำนวณผลและบันทึก Pattern
- `autopost/server/db.js`: เชื่อมการเผยแพร่กับการติดตามผลอัตโนมัติ
- `web/lib/actions.ts`: คำสั่งจากหน้าจอ
- `web/lib/repo.ts`: อ่านและเขียนข้อมูลของเว็บ

## ข้อมูลสำคัญ

- `recruit_campaigns`: งานหลักและสถานะ
- `campaign_contents`: ร่างแต่ละรุ่น
- `campaign_posts`: ผลการเผยแพร่และคะแนน
- `content_feedback`: เหตุผลอนุมัติ/ปฏิเสธจากคน
- `content_winning_patterns`: แนวที่มีผลจริงดี
- `content_losing_patterns`: แนวที่ผลต่ำหรือคนปฏิเสธ โดยใช้ `source` แยกประเภท
- `work_queue`: งานเบื้องหลัง การลองใหม่ และสิทธิ์ล็อก
- `workers`: สถานะเครื่องทำงาน

อย่าแก้สถานะด้วยมือหากยังไม่ตรวจคิวและงานที่กำลังทำ เพราะอาจทำให้งานซ้ำหรือชนกัน
