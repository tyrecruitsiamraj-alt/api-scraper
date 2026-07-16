# Cutover Runbook — เอาโค้ดใหม่ขึ้นใช้จริง (ทีละ step ห้ามพัง)

> อัปเดต 2026-07-15 · โค้ดล่าสุดอยู่บน GitHub `origin/main` ถึง commit `2f213d1`
> เป้าหมาย: ให้ของที่ทำ (orchestrator เฟส 1-4, pin บัญชี→เครื่อง, reactions/ไลก์, Pool pre-check) ทำงานจริง
> กฎ: ทำตามลำดับ อย่าข้าม — โดยเฉพาะเรื่อง "deploy server ก่อน/พร้อม worker"

---

## STEP 0 — ยืนยันก่อน (สำคัญสุด ไม่ยืนยัน = อาจ deploy ไม่ถึงที่หมาย)

3 ส่วนถูก deploy จากที่ไหน? ต้องเป็น **repo นี้** (`tyrecruitsiamraj-alt/api-scraper`) ทั้งหมด ไม่งั้นโค้ดใหม่ไม่ขึ้น:

- [ ] **so-scraping.vercel.app** (web console) → Vercel project นี้ผูกกับ repo นี้ + branch `main` ไหม? (Vercel > Project > Settings > Git)
- [ ] **soworkautopost.vercel.app** (autopost server) → ผูกกับ repo นี้ (root = `autopost/`) หรือผูกกับ **repo เดิมที่ zip มา**?
  - ⚠️ ถ้ายังผูก repo เดิม → การแก้ pin/reactions ใน repo นี้ **จะไม่ขึ้น** ต้องย้าย Vercel project ให้ชี้ repo นี้ก่อน (หรือ deploy autopost จาก repo นี้)
- [ ] เครื่อง worker (RM017 / เครื่องใหม่) → `start-workers.bat` อยู่ใน repo นี้ และ `git pull` ดึงจาก repo นี้ไหม?

**ถ้าข้อ soworkautopost ยังไม่ชัด — หยุด แล้วเช็กก่อน** (นี่คือจุดที่ "งง 2 โปรเจกต์" จะย้อนกลับมา)

---

## STEP 1 — Migration (ทำครั้งเดียว, ปลอดภัย idempotent)

DB เดียวกันทั้งหมด (`94.74.115.204/ocr_service`) — รันที่เครื่องไหนก็ได้ที่ต่อ DB ได้:

```bash
npm run migrate       # (root) ลง schema-009 ให้ so-candidate-data
```

- [ ] เห็น `Applying schema-009.sql ... Schema applied ✓`
- คอลัมน์ autopost (`jobs.image_ref`, `post_logs.reactions/shares`, `users.preferred_worker`) สร้างเองอัตโนมัติตอน worker/server รันครั้งแรก (ensure functions) — ไม่ต้องรันมือ
- ✅ ผมรัน `npm run migrate` ไปแล้ว (schema-009 ลงเรียบร้อย) — ทำซ้ำได้ไม่พัง

---

## STEP 2 — ใส่ Keys (ไม่มี = ฟีเจอร์ปิดเงียบ ไม่พังส่วนอื่น)

**เครื่อง worker** (`.env` root ของ repo — ที่รัน `npm run worker:pool` / scraper pool):
- [ ] `ANTHROPIC_API_KEY=` — ไม่มี = AI คิด caption/brief ไม่ได้ (campaign ค้าง 'new')
- [ ] `OPENAI_API_KEY=` — ไม่มี = ไม่มีรูป (caption ยังทำได้)
- [ ] `MSSQL_HOST/USER/PASSWORD/DATABASE=` — ไม่มี = ดึงใบขอ ERP ไม่ได้ (`npm run erp:sync` เงียบ)
- (ค่าปรับได้: `CONTENT_TEXT_MODEL`, `ENGAGE_HIGH_SCORE` — ดู `.env.example`)

**Vercel (web + autopost)** — ไม่ต้องใส่ AI keys (worker เป็นคนเรียก AI) แต่ตรวจว่าเดิมมีครบ: `DATABASE_URL`, `DB_SCHEMA`, `AUTOPOST_URL`, `AUTOPOST_ACCESS_TOKEN` ฯลฯ (ไม่แตะของเดิม)

---

## STEP 3 — Deploy (ลำดับสำคัญ: server/web ก่อน → worker ตาม)

**3.1 Deploy Vercel ก่อน** (ทั้ง web + autopost):
- push แล้ว Vercel auto-deploy (ถ้า STEP 0 ผ่าน) — รอ build เขียว
- [ ] เปิด so-scraping.vercel.app เห็นเมนูใหม่ "รอบโพสต์" + โหมด Content Orchestrator

**3.2 อัปเดต worker บนเครื่อง PC** (หลัง Vercel เขียวแล้ว):
- ปิดหน้าต่าง worker เดิม → ดับเบิลคลิก `start-workers.bat` (มัน`git pull`ให้เอง) → เปิดใหม่
- [ ] บรรทัดแรกของหน้าต่าง AutoPost ต้องขึ้น `worker_name=SONB-RM017 (pin บัญชี...)`

> ⚠️ **ห้ามสลับลำดับ:** ถ้า pin บัญชีไว้ แต่ worker ยังรันโค้ดเก่า (ไม่ส่ง worker_name) → บัญชีที่ pin **จะค้างรอ ไม่มีใครหยิบ** ดังนั้น worker ต้องเป็นโค้ดใหม่ก่อนเริ่ม pin

---

## STEP 4 — Verify (พิสูจน์ทีละอย่างว่าไม่พัง)

- [ ] **Autopost เดิมยังโพสต์ได้:** หน้า "รอบโพสต์" เห็น run ใหม่ worker=RM017 สถานะเดิน (อย่าเพิ่งแตะ pin)
- [ ] **Orchestrator:** สร้าง campaign ทดสอบ 1 ใบ (หน้า "ใบขอจาก ERP" หรือ insert แถวทดสอบใน `erp_open_requests`) → กด "เริ่มทำ content" → รอ worker → หน้าอนุมัติขึ้น caption + รูป (ถ้ามี OPENAI key)
- [ ] **Pool pre-check:** การ์ด "So Recruit" บนหน้า campaign ขึ้น (จะเป็น "ยังไม่พบ" จนกว่า So Recruit เติม request_no)

---

## STEP 5 — เปิด pin (เฉพาะเมื่อมีเครื่องที่ 2 เท่านั้น)

ถ้ามีเครื่องเดียว (RM017) **ข้าม step นี้** — pin ไม่ช่วยกัน block บนเครื่องเดียว

มีเครื่องที่ 2:
1. [ ] เครื่องใหม่เช็ก **public IP** (`https://api.ipify.org`) ต่างจาก RM017
2. [ ] เครื่องใหม่รัน `start-workers.bat` → จด `worker_name` จากบรรทัดแรก
3. [ ] หน้า "บัญชี Facebook" → แบ่งบัญชี: ครึ่งผูก RM017, ครึ่งผูกเครื่องใหม่
4. [ ] ดู "รอบโพสต์" ว่าบัญชีวิ่งตรงเครื่องที่ผูก (บัญชี pin ค้าง = เครื่องนั้นไม่ออนไลน์)

---

## STEP 6 — Warm-up (บัญชีที่เพิ่งเปลี่ยนเครื่อง/IP)

- [ ] บัญชีที่ย้ายเครื่อง: โพสต์วันละน้อย (3-5) 3-4 วันแรก อย่าดัน cap เต็ม
- [ ] ถ้าเจอ checkpoint FB → ยืนยันตัวตนผ่านมือถือเจ้าของบัญชี 1 ครั้ง แล้วรอ IP นิ่ง

---

## Rollback (ถ้าอะไรพัง)

- **โค้ดพัง:** Vercel > Deployments > เลือก deploy ก่อนหน้า > "Promote to Production" (คืนทันที)
- **worker พัง:** ปิดหน้าต่าง worker → `git checkout <commit เก่า>` → รันใหม่ (DB/คิวไม่กระทบ อยู่กลาง)
- **DB:** schema-009 เป็น ADD COLUMN/INDEX เท่านั้น (non-destructive) — ไม่ต้อง rollback, ปล่อยไว้ได้
- ⚠️ บัญชีที่ย้ายไปใช้ IP เครื่องใหม่แล้ว: rollback มาเครื่องเก่า = สลับ IP อีก — rollback เป็นชุดเดียวกับที่ย้าย

---

## สรุป "ใครทำอะไร"

| Step | ผม (Claude) ช่วยได้ | คุณต้องทำเอง |
|---|---|---|
| 0 ยืนยัน deploy source | บอกจุดเช็ก | เข้า Vercel settings ดู |
| 1 migrate | ✅ ทำแล้ว | — |
| 2 keys | บอกว่าใส่ตรงไหน | ใส่ค่า (creds) |
| 3 deploy | — | Vercel + start-workers.bat |
| 4 verify | ช่วยไล่ query/log | กดทดสอบบนเว็บ |
| 5 pin | ทำโค้ดเสร็จแล้ว | เอาเครื่อง 2 มา + กรอก |
| 6 warm-up | — | คุมจังหวะโพสต์ |
