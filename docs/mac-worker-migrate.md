# ย้าย Worker ไป Mac (จาก Windows RM009)

> ใช้แผงสวิตช์ Mac: **`SO-Workers.command`** (ดับเบิลคลิก → สวิตช์ Scrap/Autopost · ไม่ค้าง Terminal)
> ทางลัดเดียวกัน: `start-mac.command`  
> อย่าใช้ `SO-Workers.bat` (ของ Windows) บน Mac

## 0) ก่อนย้าย — เช็คเน็ตบน Mac

เปิด Terminal:

```bash
curl -sS http://110.49.94.180:11434/api/tags | head   # Ollama (ถ้าใช้ draft) — ต้องได้ JSON
nc -vz 94.74.115.204 5432                              # Postgres กลาง — ต้อง succeeded
curl -sS https://api.ipify.org; echo                   # เทียบ Public IP กับเครื่องเดิม (ถ้าจะ pin FB)
```

ถึง Postgres ไม่ได้ = Scrap ใช้ไม่ได้บนเครื่องนี้

## 1) ติดตั้งครั้งเดียว

1. ลง **Node.js ≥ 18**, **git**, **Google Chrome**
2. Clone + install:

```bash
git clone https://github.com/tyrecruitsiamraj-alt/api-scraper.git
cd api-scraper
git checkout main && git pull --ff-only origin main
npm install
cd autopost && npm install && npx playwright install
cd ..
chmod +x SO-Workers.command start-mac.command scripts/so-worker-mac-lib.sh so-control.command so-tasks.command
```

3. **ก๊อปไฟล์ลับจาก Windows (RM009)** มาวางตำแหน่งเดิม (USB / AirDrop / Shared folder):

| จาก Windows | ไป Mac |
|---|---|
| `.env` | `api-scraper/.env` |
| `autopost/.env` | `api-scraper/autopost/.env` |
| `autopost/.auth/` (ถ้าย้ายโพสต์ FB) | `api-scraper/autopost/.auth/` |
| `.auth/` ของ JobBKK/JobThai (ถ้ามี) | วาง path เดิมตามที่ `.env` ชี้ |

`web/.env` ไม่ต้อง — เว็บอยู่ Vercel

4. ใน `autopost/.env` ตรวจว่ามีอย่างน้อย:
   - `DATABASE_URL` / ต่อ DB ได้
   - `WORKER_API_BASE=https://so-autopost.vercel.app`
   - `AUTO_POST_DAILY_ENABLED=0` จนกว่าจะยืนยันว่า Mac เป็นตัวหลักโพสต์

## 2) เปิดบน Mac

**แนะนำ:** ดับเบิลคลิก **`SO-Workers.command`** (หรือ `start-mac.command`)

- ขึ้นแผงสวิตช์ — กด **เปิด Scrap** / **เปิด Autopost** (ไม่มี Terminal ค้าง)
- Worker วิ่งพื้นหลัง + `caffeinate` กันหลับอัตโนมัติตอนเปิด Scrap
- **อื่นๆ… → อัปเดตโค้ด** = pull `main` แล้วเปิดตัวที่เคยเปิดอยู่ต่อ
- ปิดแผงได้ — worker ยังวิ่ง

จด hostname:

```bash
scutil --get LocalHostName
# หรือ
hostname
```

## 3) สลับงานจาก Windows → Mac (ลำดับนี้)

1. **Mac:** เปิด `so-control.command` → เริ่มทำงาน ให้เห็น `scraper-1`/`scraper-2` ออนไลน์บนเว็บ
2. **Vercel (so-scraping)** เปลี่ยน env:
   - `SCRAPE_PREFERRED_WORKER=<hostname-ของ-Mac>`  
     หรือใส่ `scraper-1` ชั่วคราวก็ได้
3. Redeploy / รอ env มีผล แล้วลองสร้าง scrape task ทดสอบ 1 งาน
4. **Windows RM009:** ปิดสวิตช์ Scrap (+ Autopost ถ้าไม่ใช้) — อย่าเปิดสองเครื่องพร้อมกันโดยไม่ตั้งใจ
5. ถ้าย้ายโพสต์ FB: เว็บ → บัญชี Facebook → ผูกเครื่องเป็น hostname Mac  
   - ย้ายทีละ 3–5 บัญชี + warm-up (เปลี่ยน IP อาจโดนยืนยันตัว)

## 4) เช็คว่าเวิร์ค

- so-scraping → ops / workers: `machine_name` = hostname Mac, `build_sha` ตรง `main`
- สั่งค้นหา 1 ตำแหน่ง → task ไม่ค้างว่า “ยังไม่มีเครื่อง”
- อย่าตั้ง `AUTO_POST_DAILY_ENABLED=1` สองเครื่องพร้อมกัน

## หมายเหตุ Mac

- JobBKK เป็น headful — ล็อกจอได้ แต่ **ห้าม Sign Out** / ปิดฝาแบบ sleep ถ้าไม่มี caffeinate
- `so-control` เปิด `caffeinate` ให้แล้วตอนเริ่ม scraper
- แผง Windows (`SO-Workers.bat`) ใช้บน Mac ไม่ได้
