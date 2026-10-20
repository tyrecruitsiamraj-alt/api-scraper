# Handoff: SO Recruitment Platform (api-scraper)

ตรวจเมื่อ 20 ต.ค. 2026 จาก `origin/main` ที่ `0e05080` (19 ต.ค. 2026)

## สรุปสั้น

- ระบบตอนนี้ใช้งานจริงแค่ 2 ส่วน คือ **ค้นหาผู้สมัคร (Scrap)** จาก JobBKK/JobThai และ **โพสต์ Facebook (Autopost)** ส่วนสร้างประกาศด้วย AI (Content) ถูกปิดตั้งแต่ 30 ก.ย. ใน `src/core/product-scope.js` (`contentGeneration: false`)
- งานหลังวันที่ 1 ก.ย. ทั้งหมด 109 commit ทำโดย Cursor Agent 96 commit ที่เหลือเป็น merge PR และ commit จากบัญชี `tyrecruitsiamraj-alt` เน้นซ่อมข้อมูลผู้สมัครที่ scrape มาไม่ครบ, ทำแผงสวิตช์เปิด-ปิด Worker บน Windows/Mac และทำหน้าศูนย์งานให้เรียบขึ้น
- `PROJECT_PLAN.md` ไม่ได้อัปเดตตั้งแต่ 1 ก.ย. ตัวเลข Readiness 77% และ Blocker ในไฟล์นั้นจึงเก่ากว่าโค้ดจริงประมาณ 7 สัปดาห์
- Node test บน main ผ่าน 263/264 ตัวที่ตกคือเทสต์ตัวกรองจังหวัดของ JobBKK Normal Search (รายละเอียดด้านล่าง)

## สถานะ Git ในเครื่องนี้

| Branch | สถานะ |
|---|---|
| `main` (local) | fast-forward แล้วถึง `0e05080` ตรงกับ `origin/main` |
| `codex/fix-content-position-feedback` (branch ที่เปิดอยู่) | pull แล้ว 2 commit ถึง `e927e93` (10 ส.ค.) แต่แยกจาก main ตั้งแต่ `c9cf2ea` (26 ก.ค.) และตามหลัง main 178 commit |

Branch ที่เปิดอยู่ควรถือว่า **ล้าสมัย** ด้วยเหตุผลนี้

1. เนื้อหาเป็นงาน Content AI ทั้งหมด ซึ่ง main ปิดไปแล้ว
2. Commit `e927e93` (ground content visuals and keywords) เข้า main แล้วในชื่อ `ec518ce`
3. Commit `2485bbd` ยังไม่เข้า main มีไฟล์ที่ main ไม่มี: `content-factual-validator.js`, `content-job-spec.js`, `content-quality-score.js`, `content-supervisor.js` และ `encryptAutopostCredential()` ใน `web/lib/crypto.ts`
4. **เลข migration ชนกัน** `schema-019.sql` ของ branch นี้สร้างตาราง Content AI Team (`content_agent_contracts`, `campaign_stage_runs`, `campaign_handoffs` ฯลฯ) แต่ `schema-019.sql` ของ main เป็น heartbeat ของ scrape run ถ้าจะหยิบงานจาก branch นี้กลับมา ต้องเปลี่ยนเป็น `schema-029.sql` ขึ้นไป
5. Commit `26f1e1b` (แก้ JobBKK login ค้าง) main แก้ `src/providers/jobbkk/session.js` ไปไกลกว่าแล้ว (Ant Design login, session takeover) ไม่ควร merge ทับ

Branch บน remote ที่มี commit ยังไม่เข้า main

| Branch | วันที่ | หมายเหตุ |
|---|---|---|
| `cursor/responsive-all-devices-b333` | 14 ต.ค. | PR #19 ยังเป็น Draft ทำหน้าศูนย์งานและหน้าแก้ Content ให้ใช้บนมือถือได้ ต้องเช็กว่ายังชนกับ `0e05080` ที่รื้อ WorkCenter ไปหรือไม่ |
| `cursor/cloud-agent-env-697e` | 30 ก.ย. | 1 commit |
| `cursor/remember-scrape-reds-b333` | 15 ก.ย. | 1 commit |
| `cursor/dev-environment-setup-8bea` | 10 ก.ย. | 1 commit |
| `agent/fix-autopost-patch-script` | 29 ก.ค. | 1 commit |

## ระบบทำอะไร

ข้อมูลอยู่ใน PostgreSQL กลาง (`94.74.115.204:5432`) แยก 2 schema

- `so-candidate-data` เก็บผู้สมัคร, connector, scrape task, คิวงาน, ใบขอจาก ERP
- `so_autopost_apiscraper` เก็บบัญชี/กลุ่ม Facebook, งานโพสต์, คอมเมนต์

ส่วนประกอบ

| ส่วน | ที่อยู่ | รันที่ไหน |
|---|---|---|
| Web Console (Next.js 14, login ด้วย Entra ID) | `web/` | Vercel |
| คิวงานกลาง `work_queue` + runner | `workers/runner.js`, `workers/scraper-pool.mjs` | เครื่อง Worker (เดิม Windows `SONB-RM009`, มีคู่มือย้ายไป Mac) |
| Scraper (Playwright login ครั้งเดียว แล้วดึงผ่าน HTTP) | `src/pipeline.js`, `src/tasks-worker.js`, `src/providers/jobbkk`, `src/providers/jobthai` | เครื่อง Worker |
| Autopost Facebook (Express + Playwright) | `autopost/` | เครื่อง Worker |
| ซิงก์ใบขอจาก ERP (SQL Server) | `src/erp/sync.js` | เครื่อง Worker |
| OCR / AI | `src/core/ollama.js` ชี้ไป Ollama ภายใน `110.49.94.180:11434` | เครื่องภายใน |

เส้นทาง Scrap: ใบขอ → ศูนย์งานบน Web กด "เริ่มค้นหา" → ลง `work_queue` → Worker หยิบงาน ล็อกทีละบัญชี (`connector_key`) → login แพลตฟอร์ม → ค้น → เปิด Resume → dedupe ด้วยเบอร์โทร/อีเมล/ชื่อ → เก็บรูปและไฟล์แนบเป็น bytea → ให้คะแนนความเหมาะสมต่อใบงาน (`candidate-fit-v1` ใน `scrape_task_candidates`)

Migration ไม่มีตารางจดเวอร์ชัน `src/db/migrate.js` รันทุกไฟล์ `schema.sql` ถึง `schema-028.sql` ซ้ำทุกครั้ง ทุกไฟล์ต้องเขียนแบบ `IF NOT EXISTS`

## เกิดอะไรขึ้นตั้งแต่ 1 ก.ย. 2026

| ช่วง | งาน |
|---|---|
| 10-11 ก.ย. | JobBKK เปลี่ยนไปใช้ Talent Normal Search และกรอกตัวกรองตามใบขอ, login ฟอร์ม Ant Design ใหม่, ยืนยัน session takeover, `start-workers.bat` กดครั้งเดียว |
| 14-16 ก.ย. | Poster Editor ลากเลเยอร์และเพิ่มรูป/ข้อความได้, ประกอบโปสเตอร์บน Vercel, Scrape จำบทเรียนจาก error ที่เคยเจอ, fail-closed ทั้ง Content และ Scrap |
| 30 ก.ย. | **ปิด Content AI** เหลือ Scrap + Autopost, บังคับ Resume ที่บันทึกต้องครบ (ไฟล์แนบ, การศึกษา, งาน, ติดต่อ), API ซ่อมแถวผู้สมัครที่ไม่ครบจาก OCR, Worker reset โค้ดเป็น `origin/main` ตอนเริ่ม |
| 1-2 ต.ค. | แผงสวิตช์ `SO-Workers.bat` / `SO-Workers.command` แทนหน้าต่าง terminal หลายบาน, ปุ่ม Update Code สั่งจากระยะไกล (`POST /api/update-workers`), JobThai อ่านช่วงเวลาทำงานและหน้าที่ได้ครบ |
| 14-15 ต.ค. | แก้คำนำหน้าชื่อหายทั้ง JobBKK/JobThai, ปุ่มซ่อมทั้งฐาน `REPAIR-CANDIDATES` และ `REPAIR-PHOTOS` (ตัดรูปหน้าผิด/รูป placeholder แล้วโหลดใหม่) |
| 19 ต.ค. | ศูนย์งานแบ่งเป็น 2 ห้อง: กล่องรับงาน Scrap ที่มีปุ่ม "เริ่มค้นหา" ปุ่มเดียว และห้อง Autopost แยกออกไป ใบขอ Content ที่ปิดแล้วแสดงเป็นแถบปฏิเสธ |

## ผลทดสอบ (รันบน main วันนี้)

```bash
node --test tests/*.test.js tests/*.test.mjs
```

ผล 264 เทสต์ ผ่าน 263 ตก 1 ตัว

- `tests/jobbkk-normal-search.browser.test.js` "Talent Normal Search fills every requested filter then reads a Resume ID" ตกด้วย `JOBBKK_FILTER_NOT_APPLIED: Normal Search ไม่ยืนยันจังหวัดตามใบขอ` เทสต์นี้เปิด browser กับหน้า fixture ในเครื่อง น่าจะเกี่ยวกับ commit `fix(jobbkk): stop province filter from leaving a quote tag` (30 ก.ย.) ที่เปลี่ยนวิธีเลือกจังหวัด ยังไม่ได้ไล่หาสาเหตุ
- `node --test tests/` (ส่งแค่ชื่อโฟลเดอร์) ใช้ไม่ได้บน Node 25 ต้องใช้ glob ตามคำสั่งด้านบน
- ยังไม่ได้รัน `web npm run build` และยังไม่ได้ทดสอบกับ JobBKK/JobThai/Facebook ของจริง

## ของที่ยังค้างหรือยังไม่มีหลักฐาน

1. **Facebook ยังไม่มีหลักฐานโพสต์จริง** แผนล่าสุด (31 ส.ค.) บอกว่า Worker เปิดแค่ `preflight` และรอผู้ใช้อนุญาต Controlled Real Post หลังจากนั้นไม่มี commit หรือเอกสารบันทึกว่าโพสต์จริงแล้ว
2. **JobBKK Live Search** เดิมติดที่ Premium Resume Search ถูก redirect ออก main เปลี่ยนไปใช้ Normal Search แล้ว แต่ไม่มีบันทึกผลทดสอบสดใน `PROJECT_PLAN.md`
3. **Phase 8 Candidate Fit Score** ยังไม่มี Hard Gate Editor และ Weight Editor ต่อใบงาน
4. **Phase 9 Release Gate A-G** ยังไม่ปิด
5. `PROJECT_PLAN.md` และ `HANDBOOK.md` ยังพูดถึง Content Orchestrator เป็นส่วนที่ใช้งาน ต้องอัปเดตให้ตรงกับขอบเขตใหม่
6. ข้อเสี่ยงที่ `HANDBOOK.md` หัวข้อ 17 บันทึกไว้และยังไม่เห็นว่าแก้: Control API (`src/api/server.js`) ไม่มี authentication, migration ของ Autopost กระจายอยู่ทั้งไฟล์ SQL และ `ALTER` ตอนรัน, `autopost/server/index.js` ใหญ่และรวมหลายหน้าที่

## ความเสี่ยงด้านข้อมูล

Repo `tyrecruitsiamraj-alt/api-scraper` เป็น **public** และมี IP ของ Postgres กลาง (`94.74.115.204`) กับ Ollama ภายในอยู่ใน `.env.example`, `docker-compose.yml`, `DEPLOY.md`, `docs/*.md`, `src/db/pool.js`, `src/core/ollama.js` ฐานนี้เก็บข้อมูลส่วนบุคคลของผู้สมัคร (ชื่อ เบอร์ อีเมล รูป Resume) ซึ่งอยู่ใต้ PDPA ผมไม่พบรหัสผ่านหรือ API key จริงใน main แต่ควรตัดสินใจว่าจะทำ repo เป็น private หรือย้าย host ออกจากโค้ด และตรวจว่าพอร์ต 5432 เปิดรับจากอินเทอร์เน็ตแค่ไหน

## ขั้นต่อไปที่แนะนำ

1. ตัดสินใจเรื่อง branch `codex/fix-content-position-feedback` ถ้า Content AI จะไม่กลับมา ให้เก็บไว้เป็นหลักฐานแล้วสลับไปทำงานบน main ถ้าจะกลับมา ให้ cherry-pick เฉพาะไฟล์ validator/job-spec/quality-score และเปลี่ยนเลข schema
2. ไล่สาเหตุเทสต์ JobBKK province filter ที่ตก
3. ตัดสิน PR #19 (responsive) ว่าจะ rebase บน `0e05080` หรือปิด
4. อัปเดต `PROJECT_PLAN.md` ให้ตรงกับขอบเขต Scrap + Autopost และบันทึกผลทดสอบสดของ JobBKK กับสถานะ Facebook ล่าสุด
5. จัดการเรื่อง repo public กับ IP ฐานข้อมูล

## คำสั่งที่ใช้บ่อย

```bash
npm run migrate                      # รัน schema ทุกไฟล์ (idempotent)
npm run worker:pool                  # runner ของ work_queue
npm run scraper:pool                 # scraper pool ตามจำนวนบัญชี
npm run smoke:workflow               # self-test คิว → worker
node --test tests/*.test.js tests/*.test.mjs
cd web && npm run build
```

เครื่อง Worker ใช้แผงสวิตช์ `SO-Workers.bat` (Windows) หรือ `SO-Workers.command` (Mac) ซ่อมข้อมูลเก่าด้วย `REPAIR-CANDIDATES.*` และ `REPAIR-PHOTOS.*`

เอกสารอ้างอิง: `HANDBOOK.md` (ภาพรวมระบบ), `PROJECT_PLAN.md` (แผนและ Release Gate, ข้อมูลถึง 1 ก.ย.), `docs/new-worker-setup.md`, `docs/mac-worker-migrate.md`, `docs/cutover-runbook.md`
