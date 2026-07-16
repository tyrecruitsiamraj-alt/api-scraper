# ติดตั้งเครื่อง Worker ใหม่ (เครื่อง 24 ชม.)

> คู่มือเพิ่มเครื่อง worker เข้าระบบ — ใช้กับเครื่องที่ 2, 3, ... ได้ทุกเครื่อง
> บทบาทที่รองรับ: โพสต์ FB (autopost) + สมองระบบ (scraper pool / AI คิด content / วัดผล / erp:sync)

## ก่อนเริ่ม — เช็ค 3 อย่าง (ผ่านครบค่อยลงมือ)

1. **อยู่วงเน็ตที่ถึงระบบภายใน?** เปิด PowerShell รัน:
   ```
   curl http://110.49.94.180:11434/api/tags     # Ollama (AI คิด content) — ต้องได้ JSON
   Test-NetConnection 94.74.115.204 -Port 5432  # Postgres กลาง — ต้อง TcpTestSucceeded: True
   ```
   ❌ ถึงไม่ครบ = เครื่องนี้ทำได้แค่บทบาทโพสต์ FB (ถ้าถึง DB) หรือใช้ไม่ได้เลย
2. **Public IP ต่างจากเครื่องเดิม (RM017)?** เปิด `https://api.ipify.org` บนทั้ง 2 เครื่องเทียบกัน
   — ต่างกัน = pin ช่วยกันแบนจริง / เหมือนกัน = pin ช่วยแค่จัดระเบียบ (ยังคุ้มติดตั้ง)
3. **นโยบายเครื่องบริษัท** — บางเครื่อง (เช่น RM009) โดน AppLocker บล็อก installer/scheduled task
   ถ้าติดตั้ง Node ไม่ได้ ให้ใช้ Node แบบ portable (zip) แทน MSI

## ติดตั้ง (ทำครั้งเดียว)

1. ลง **Node.js ≥18** + **git** + **Google Chrome** (autopost ใช้ channel chrome จริง)
2. Clone โค้ด (repo public ไม่ต้อง auth):
   ```
   git clone https://github.com/tyrecruitsiamraj-alt/api-scraper.git
   cd api-scraper && npm install
   cd autopost && npm install && npx playwright install --with-deps
   ```
3. **ก๊อบไฟล์ลับจากเครื่องเดิม** (ไม่มีใน repo — อยู่บน RM017/RM009):
   - `.env` (root) — DB, APP_ENCRYPTION_KEY, OLLAMA_BASE_URL ฯลฯ
   - `autopost/.env` — DATABASE_URL, WORKER_API_BASE, POST_WORKER_TOKEN, WORKER_CONCURRENCY
   - `web/.env` ไม่ต้อง (เว็บอยู่ Vercel)
4. ตั้งชื่อเครื่องให้จำง่าย (ไม่บังคับ): เติม `WORKER_NAME=ชื่อที่ต้องการ` ใน `autopost/.env`
   (เว้นว่าง = ใช้ hostname ของเครื่อง)
5. **บัญชี FB ที่จะย้ายมาเครื่องนี้:** ก๊อบไฟล์ session เฉพาะบัญชีนั้นจาก `autopost/.auth/` เครื่องเดิมมาวาง
   ⚠️ บัญชีที่ย้ายเครื่อง = เปลี่ยน IP → เสี่ยง FB ขอยืนยันตัวตน 1 ครั้ง — **ย้ายทีละ 3-5 บัญชี + warm-up**
   (โพสต์วันละน้อย 3-4 วันแรก) อย่ายกทั้งหมดทีเดียว
6. รัน: ดับเบิลคลิก **`start-workers.bat`** (เปิด 2 หน้าต่าง: Scraper Pool + AutoPost)
   - จดค่า `worker_name=...` จากบรรทัดแรกของหน้าต่าง AutoPost — ใช้กรอกตอน pin
7. กันเครื่องหลับ: Settings → Power → Sleep = Never (เครื่อง 24 ชม. ต้องไม่หลับ)
   หมายเหตุ: scraping JobBKK เป็น headful — เครื่องต้อง login ค้าง desktop ไว้ (ล็อกจอได้ แต่ห้าม sign out)

## ลำดับเปิดใช้ pin (ห้ามสลับขั้น!)

1. เครื่องเดิม (RM017): ปิดหน้าต่าง worker → เปิด `start-workers.bat` ใหม่ (git pull โค้ด pin อัตโนมัติ)
   — **ต้องทำก่อน pin** ไม่งั้นบัญชีที่ pin จะค้าง (worker เก่าไม่รู้จัก pin)
2. เครื่องใหม่: เปิด `start-workers.bat`
3. เว็บ → บัญชี Facebook → panel "ผูกบัญชีกับเครื่อง" → แบ่งบัญชี 2 เครื่อง (ชุดแรกย้ายแค่ 3-5)
4. ดูหน้า "รอบโพสต์" ว่าแต่ละบัญชีวิ่งตรงเครื่อง — งานที่ขึ้น "⏳ รอเครื่อง X" = เครื่องนั้น offline

## ย้าย "สมองระบบ" มาเครื่อง 24 ชม. (แนะนำ)

งานพวกนี้เดิมรันบน RM009 (เครื่องทำงานส่วนตัว — ปิดเครื่อง = ระบบหยุด):
- Scraper Pool (`npm run scraper:pool`) + runner (AI คิด content 'draft' + วัดผล 'measure')
- รอบโพสต์อัตโนมัติ 8:00 (`AUTO_POST_DAILY_ENABLED=1` ฝั่ง autopost)
- `npm run erp:sync` (ดึงใบขอ ERP — เมื่อได้ MSSQL creds)

วิธีย้าย: แค่ **เปิด start-workers.bat บนเครื่อง 24 ชม. แล้วไม่ต้องเปิดฝั่ง RM009 อีก**
(คิว/ล็อกอยู่ที่ DB กลาง — เครื่องไหนเปิดเครื่องนั้นทำ ไม่ชนกัน)
⚠️ ยกเว้น: อย่าให้ 2 เครื่องเปิด "รอบ 8:00" พร้อมกัน — ตั้ง `AUTO_POST_DAILY_ENABLED=0` ในเครื่องที่ไม่ใช่ตัวหลัก

## เช็คว่าเวิร์คแล้ว

- หน้า "รอบโพสต์": เห็นชื่อเครื่องใหม่หยิบงาน
- หน้า "บัญชี Facebook": ชื่อเครื่องใหม่โผล่ใน dropdown ผูกเครื่อง
- สั่งโพสต์บัญชีที่ pin เครื่องใหม่ → งานวิ่งเครื่องใหม่เท่านั้น
