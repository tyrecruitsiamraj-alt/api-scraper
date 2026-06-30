# Talent Scraper — Developer Handbook

> คู่มือสำหรับนักพัฒนา ครอบคลุมทุกอย่างในโฟลเดอร์ `api-scraper/`
> อัปเดตล่าสุด: 2026-06-30 · เขียนจากการวิเคราะห์ source code โดยตรง

ระบบนี้คือ **เครื่องมือ scrape ข้อมูลผู้สมัครงาน (resume / CV)** จากเว็บหางานไทย (JobBKK, JobThai) โดยใช้บัญชี employer ที่ได้รับอนุญาต แล้วเก็บข้อมูลแบบ deduplicated ลง PostgreSQL พร้อมรูปโปรไฟล์และไฟล์แนบ

> ⚠️ **ใช้กับบัญชีและสิทธิ์ที่ได้รับอนุญาตเท่านั้น** ข้อมูลผู้สมัครเป็นข้อมูลส่วนบุคคล (PDPA) — ดูหัวข้อ [กฎหมายและจริยธรรม](#14-กฎหมายและจริยธรรม)

---

## สารบัญ

1. [ภาพรวมโฟลเดอร์ — มีกี่โปรเจกต์](#1-ภาพรวมโฟลเดอร์)
2. [โครงสร้างไฟล์](#2-โครงสร้างไฟล์)
3. [Project A — `demo-scaping` (terminal demo)](#3-project-a--demo-scaping-terminal-demo)
4. [Project B — `api-scraper` (production hybrid scraper)](#4-project-b--api-scraper-production-hybrid-scraper)
5. [ฐานข้อมูล (PostgreSQL schema)](#5-ฐานข้อมูล-postgresql-schema)
6. [Data pipeline — `runConnector()`](#6-data-pipeline--runconnector)
7. [Workers — worker / tasks / extract](#7-workers)
8. [Providers — JobBKK vs JobThai + วิธีเพิ่มใหม่](#8-providers)
9. [Anti-ban, Crypto, OCR](#9-anti-ban-crypto-ocr)
10. [Control API & CLI](#10-control-api--cli)
11. [Web Console — So Recruit (Next.js)](#11-web-console--so-recruit-nextjs)
12. [ทุกชิ้นเชื่อมกันอย่างไร](#12-ทุกชิ้นเชื่อมกันอย่างไร)
13. [Runbook — งานที่ทำบ่อย](#13-runbook--งานที่ทำบ่อย)
14. [กฎหมายและจริยธรรม](#14-กฎหมายและจริยธรรม)
15. [Quick Reference](#15-quick-reference)
16. [ข้อควรระวัง / Known issues](#16-ข้อควรระวัง--known-issues)

---

## 1. ภาพรวมโฟลเดอร์

โฟลเดอร์นี้มี **2 โปรเจกต์** ที่เป็น "คนละรุ่น" ของไอเดียเดียวกัน:

| | Project A — `demo-scaping` | Project B — `api-scraper` |
|---|---|---|
| **ตำแหน่ง** | ย้ายไป `legacy-demo/` แล้ว | **root ของ repo** (โปรเจกต์หลัก) |
| **ชื่อใน package.json** | `demo-scaping` v1.0.0 | `api-scraper` v0.1.0 + `so-recruit-web` |
| **วิธีทำงาน** | เปิด browser (Playwright) คุมทุกหน้า | login ครั้งเดียวด้วย browser แล้ว scrape ผ่าน **HTTP ตรง** |
| **เก็บข้อมูล** | ไฟล์ (Markdown / CSV / JSONL) | **PostgreSQL** (dedupe + รูป + ไฟล์แนบ) |
| **คนใช้งาน** | คนนั่งดู: popup → กด Start → เห็น browser ทำงาน | อัตโนมัติเต็ม: connector + worker + web UI |
| **Human interaction** | มี (CAPTCHA/OTP แก้มือ) | Human = 0 (ออกแบบให้ไม่ต้องแตะ) |
| **ขนาด/ความสมบูรณ์** | demo / prototype | MVP ใกล้ production (Docker + Web) |

**สรุปสั้น ๆ:** Project A คือ prototype ที่ขับ browser ทั้งหมดและ export เป็นไฟล์ — ใช้เดโม่/ทดลอง selector ส่วน Project B คือสถาปัตยกรรมจริงที่ตั้งใจรันยาว ๆ: login ผ่าน browser นาน ๆ ครั้ง แล้ว scrape ผ่าน HTTP เร็ว ๆ เก็บลง DB กลาง มี Web Console (So Recruit) ให้ทีม HR ใช้

> 💡 **Project B ถูกเลื่อนขึ้นเป็น root ของ repo แล้ว (โปรเจกต์หลัก)** ส่วน Project A ย้ายไปเก็บใน `legacy-demo/` เป็น reference ของ selector/flow — งานพัฒนาใหม่ทั้งหมดทำที่ root

---

## 2. โครงสร้างไฟล์

```
api-scraper/                          ← repo root = Project B (โปรเจกต์หลัก)
├── src/
│   ├── config.js                     # env + criteria + runtime
│   ├── db/                           # schema*.sql, pool, crypto, migrate, repositories
│   ├── connectors/registry.js        # platform → provider
│   ├── core/                         # anti-ban, contacts, ollama, popup
│   ├── providers/jobbkk|jobthai/     # session/client/parser/assets/index
│   ├── pipeline.js                   # ★ runConnector() → DB
│   ├── worker.js                     # รัน connector ทุกตัว 1 รอบ
│   ├── tasks-worker.js               # รัน scrape_tasks (scrape→ocr→enrich)
│   ├── extract-worker.js             # OCR ไฟล์แนบผ่าน Ollama (แยก process)
│   ├── api/server.js                 # Control API (http เปล่า, port 8080)
│   ├── cli/connector.js              # CLI add/list connector
│   └── captcha.js / login.js / scrape.js / export.js   # legacy/utility
├── web/                              # So Recruit — Next.js 14 console
│   ├── app/(app)/                    # dashboard, candidates, scraping, connectors
│   ├── app/api/                      # auth(NextAuth), scrape-tasks, assets/[id]
│   ├── lib/                          # db, repo, actions, auth, crypto
│   ├── components/                   # Topbar, AttachmentViewer, ...
│   ├── .env                          # ← Azure AD + PG* + APP_ENCRYPTION_KEY (สร้างแล้ว)
│   └── .env.example
├── Dockerfile / docker-compose.yml / .dockerignore
├── .env                              # ← backend: PG* / criteria / APP_ENCRYPTION_KEY (สร้างแล้ว)
├── .env.example
├── package.json                      # name: api-scraper
├── HANDBOOK.md                       # ← คู่มือเล่มนี้
└── legacy-demo/                      # Project A (demo-scaping) — เก็บเป็น reference
    ├── scrape.js / auth.js / download.js / config-popup.js
    ├── jobbkk-filters.js / resume-premium-search.js / scrape-timing.js
    ├── candidate-assets.js
    ├── core/        # env, platform-resolve, scrape-pipeline, candidate-dedupe, candidate-export
    ├── providers/   # registry, provider-contract, stub, jobbkk/, jobthai/, jobdb/, facebook/
    ├── scripts/     # explore-jobthai*.js, test-*.js (R&D)
    └── package.json # name: demo-scaping
```

---

## 3. Project A — `demo-scaping` (terminal demo)

> 📁 ทุกไฟล์ในหัวข้อนี้อยู่ใต้ `legacy-demo/` แล้ว (เช่น `legacy-demo/scrape.js`, `legacy-demo/core/`)

### 3.1 ทำอะไร

Playwright-based scraper บน terminal: เปิด Chromium → popup เก็บเงื่อนไขค้นหา → login employer → ใส่ filter → ค้นหา → เก็บลิงก์ resume → scrape ทีละหน้า → export เป็นไฟล์ UI เป็นภาษาไทยทั้งหมด

- **Platform จริง:** `jobbkk`, `jobthai`
- **Platform stub (ยังไม่ทำ):** `jobdb`, `facebook` — เรียกแล้ว throw

### 3.2 คำสั่ง (npm scripts)

| คำสั่ง | ไฟล์ | ทำอะไร |
|---|---|---|
| `npm run scrape` | `scrape.js` | **entry หลัก** อ่าน `SCRAPE_PLATFORM` แล้วเรียก `runTalentScrape()` |
| `npm run auth` | `auth.js` | เปิด browser ให้ login มือ → เซฟ `context.storageState()` ลง `.auth/jobbkk.json` ⚠️ *(ดู [§16](#16-ข้อควรระวัง--known-issues) — ไฟล์นี้ไม่ถูกใช้ที่อื่น)* |
| `npm run download` | `download.js` | อ่าน `output/candidates.jsonl` เดิม → login JobBKK → re-download รูป/ไฟล์แนบ (ไม่ scrape ใหม่) |

### 3.3 Flow ตั้งแต่ต้นจนจบ (`npm run scrape`)

ขับโดย `runTalentScrape()` ที่ [core/scrape-pipeline.js:328](legacy-demo/core/scrape-pipeline.js):

1. **Resolve platform** — `normalizePlatformMode(SCRAPE_PLATFORM)` → `['jobbkk']` / `['jobthai']` / ทั้งคู่
2. **Preflight** — เช็ค env, credentials, URL; เตือนถ้า delay น้อยไปหรือ `DEBUG_MODE=true`
3. **เปิด Chromium** — default ไม่ headless, locale `th-TH`, `acceptDownloads`
4. **Config popup** — `collectSharedCriteria()` แสดง HTML page (ผ่าน `page.setContent`, ไม่ใช่หน้าเว็บจริง) ผู้ใช้กรอกเงื่อนไข + กด **Start** → เซฟ `output/search-criteria.json`
5. **ต่อ platform** (`runPlatformScrapePhase`):
   - `provider.prepareSession()` — login + ไปหน้า resume search
   - `provider.applyFilters()` — ใส่ filter → เซฟ `filter-apply-report.json`
   - `provider.runSearch()` — กดค้นหา
   - `provider.collectResumeLinks()` — เก็บลิงก์ (มี buffer เกิน maxCandidates ~50%) → `result-links.txt`
   - ถ้า 0 ลิงก์ → เปิด browser ค้างไว้ + เขียน `page-inspection.txt`
   - **วนเก็บ candidate** — เปิดหน้า detail → `parseResumeDetailPage()` → `dedupe()` → `downloadAssets()` (มี jitter คั่น)
   - **Export** — `candidates-readable.md`, `candidates.csv`, `candidates.jsonl`, `run_summary.json`
6. **Output dir** — platform เดียว → `output/`; หลาย platform → `output/<platformId>/`

### 3.4 Provider system (Project A)

- `provider-contract.js` = **JSDoc typedef เท่านั้น** (ไม่มี runtime code) นิยาม method ที่ provider ต้องมี: `prepareSession`, `applyFilters`, `runSearch`, `collectResumeLinks`, `parseResumeDetailPage`, `downloadAssets`, ฯลฯ
- `registry.js` → `resolveProvider(platformId)` แปลง id เป็น provider object (throw ถ้าไม่รู้จัก)
- `platform-resolve.js` → `PLATFORM_IDS = ['jobbkk','jobthai']` (flow ปกติเลือกได้แค่ 2 ตัวนี้)
- `stub-provider.js` → ใช้กับ jobdb/facebook (throw ทุก method)

### 3.5 Config (env) — Project A

ดู `.env.example` คีย์สำคัญ:

| ตัวแปร | ความหมาย | default |
|---|---|---|
| `SCRAPE_PLATFORM` | `jobbkk` / `jobthai` / `both` | `jobbkk` |
| `JOBBKK_EMPLOYER_LOGIN_URL` | หน้า login employer | (required) |
| `JOBBKK_RESUME_SEARCH_URL` | หน้า premium resume search | (required) |
| `JOBBKK_USERNAME` / `JOBBKK_PASSWORD` | บัญชี JobBKK | (required) |
| `JOBTHAI_LOGIN_URL` / `JOBTHAI_USERNAME` / `JOBTHAI_PASSWORD` | บัญชี JobThai | — |
| `HEADLESS` | รัน browser แบบ headless | `false` |
| `DEFAULT_MAX_CANDIDATES` | จำนวน resume เริ่มต้นใน popup | `15` |
| `DEBUG_MODE` | เซฟ PNG/HTML ทุกขั้น (ช้าลง) | `false` *(code)* |
| `PAUSE_AT_END` | เปิด browser ค้างจนกด Enter | `false` *(code)* |
| `DELAY_MS_MIN` / `DELAY_MS_MAX` | jitter คั่น candidate | `1200` / `2200` |

> ⚠️ ค่า default ใน README ของ Project A ขัดกับ `.env.example`/code บางตัว (`PAUSE_AT_END`, `DEBUG_MODE`) — **ยึดค่าใน code** (`scrape-pipeline.js:333-336`)

### 3.6 ไฟล์ output (Project A)

`search-criteria.json`, `filter-apply-report.json`, `result-links.txt`, `candidates-readable.md`, `candidates.csv`, `candidates.jsonl` (มี `raw_text` เต็ม), `run_summary.json`, รูป/ไฟล์แนบใน `candidates/<NNN>/`, และ debug PNG/HTML เมื่อ `DEBUG_MODE=true`

### 3.7 `scripts/` คืออะไร

7 ไฟล์ R&D สำหรับ JobThai โดยเฉพาะ (`explore-jobthai*.js`, `test-jobthai-*.js`) — ใช้ตอน reverse-engineer selector ของ JobThai ที่ตอนนี้อยู่ใน `providers/jobthai/` รันมือด้วย `node scripts/<file>.js` (ไม่มี npm alias) **ไม่ใช่ส่วนของ production flow**

---

## 4. Project B — `api-scraper` (production hybrid scraper)

### 4.1 โมเดล "login once, scrape over HTTP"

จุดต่างหลักจาก scraper ที่ขับ browser ทุกหน้า:

1. **Browser login (นาน ๆ ครั้ง)** — Playwright headless login 1 ครั้งต่อ connector แล้วเก็บ `storageState` (cookies/localStorage) ลง DB (`connectors.session_state`)
2. **HTTP scraping (ทางหลัก)** — search / pagination / detail ทำผ่าน **HTTP request ตรง** ที่แนบ session ที่เก็บไว้ — เร็ว เบา ตรวจจับยากกว่า browser automation มาก

browser จะถูกเรียกใหม่ก็ต่อเมื่อ session ตายจริง ๆ (logic `needsRelogin` / takeover ใน [pipeline.js](src/pipeline.js)) กลยุทธ์ CAPTCHA คือ "login ให้น้อยจน CAPTCHA แทบไม่โผล่" ([captcha.js](src/captcha.js))

### 4.2 คำสั่ง (npm scripts)

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run migrate` | สร้าง/อัปเดต schema (`schema.sql` → `002` → `003`, idempotent) |
| `npm run connector add -- --platform jobbkk --label X --username U --password P --limit 15 --daily 200` | เพิ่ม connector (เข้ารหัส password) |
| `npm run connector list` | list connector ทั้งหมด |
| `npm run worker` | รันทุก connector ที่ enabled 1 รอบ ด้วย criteria จาก `.env` (`PLATFORM=jobbkk` จำกัดได้) |
| `npm run tasks` | รัน `scrape_tasks` ที่ถึงคิว เป็น pipeline เต็ม (scrape → ocr → enrich) |
| `npm run extract` | OCR ไฟล์แนบที่ค้าง 1 batch ผ่าน Ollama |
| `npm run api` | เปิด Control API (default port 8080) |
| `npm run scrape` / `npm run login` | legacy standalone (เขียนไฟล์, JobBKK only) / pre-warm session |

**Dependencies:** `cheerio`, `csv-writer`, `dotenv`, `pg`, `playwright` (OCR ใช้ `fetch` ตรงไป Ollama ไม่มี SDK)

---

## 5. ฐานข้อมูล (PostgreSQL schema)

- **Schema name:** `"so-candidate-data"` (มี hyphen → ต้อง double-quote เสมอ) ตั้งผ่าน env `DB_SCHEMA`
- ทุก connection ตั้ง `search_path="<schema>",public` ([db/pool.js:9](src/db/pool.js))
- ต้องมี extension `pgcrypto` (ใช้ `gen_random_uuid()`)
- ใช้ DB ร่วมกันทั้ง backend และ web

### 5.1 ตารางหลัก (`schema.sql`)

| ตาราง | หน้าที่ | คอลัมน์เด่น |
|---|---|---|
| **`connectors`** | 1 แถว = 1 บัญชี platform (1 platform มีหลาย connector ได้) | `platform`, `label`, `username`, `password_enc` (AES-256-GCM), `scrape_limit`, `daily_cap`, `enabled`, `session_state` jsonb, `cooldown_until`; UNIQUE `(platform, label)` |
| **`scrape_runs`** | 1 แถว = 1 รอบ scrape | `connector_id`→connectors, `criteria` jsonb, `status` (running/success/partial/failed/cooldown), `requested/found/new_count/updated_count/failed`, `started_at/finished_at` |
| **`candidates`** | คนคนเดียว (deduped ข้าม platform) | **`dedupe_key` UNIQUE**, ชื่อ, `phone`+`phone_norm`, `email`+`email_norm`, `line_id`, demographics, job prefs, jsonb arrays `education`/`work_experience`/`hard_skills`/`soft_skills`/`language_skills` |
| **`candidate_sources`** | "tag" ที่มา — หลายแถวต่อ 1 candidate | `candidate_id`, `platform`, `connector_id`, `external_id`, `source_url`, `raw_text`; UNIQUE **`(platform, external_id)`** |
| **`candidate_assets`** | รูปโปรไฟล์ + ไฟล์แนบ | `kind` (profile/attachment), `file_type`, `mime`, `sha256`, `storage_kind` (default `db`=bytea), `content` bytea; UNIQUE **`(candidate_id, sha256)`** |

### 5.2 Migration 002 (`schema-002.sql`) เพิ่ม

- **`provider_limits`** — daily cap ต่อ **platform** (รวมทุก connector) seed: jobbkk=200, jobthai=150
- **`scrape_tasks`** — งาน schedule ได้ ผูกกับ 1 connector: `mode` (count/date_range), `target_count`, `updated_since`, `criteria`, `schedule_cron`, `status` (idle/queued/running/done/error), `progress_got/target`, `next_run_at`
- `scrape_runs.task_id` → ผูก run กลับไปที่ task
- คอลัมน์ AI ใน `candidate_assets`: `extracted_text`, `extracted` jsonb, `extract_status`, `extracted_at`

### 5.3 Migration 003 (`schema-003.sql`) เพิ่ม

- `scrape_tasks.phase` (idle/scraping/ocr/enrich/done/error) — ให้ UI แสดง progress แบบหลายเฟส

### 5.4 Dedupe ทำงานยังไง

[repositories.js](src/db/repositories.js) `upsertCandidate()`:

1. สร้าง `dedupe_key`: `phone:<digits>` → ถ้าไม่มีใช้ `email:<lower>` → ถ้าไม่มีใช้ `name:<name>:<birth_date>`
2. หา candidate เดิมตามลำดับ `phone_norm` → `email_norm` → `dedupe_key`
3. **ถ้าเจอ → update** (เติมเฉพาะคอลัมน์ที่ว่าง, refresh jsonb array ที่ไม่ใช่ `[]`) ไม่สร้างซ้ำ
4. ทุกที่ที่เจอ candidate คนนี้ → เพิ่มแถวใน `candidate_sources` (tag: platform + connector + external_id + url)

---

## 6. Data pipeline — `runConnector()`

หัวใจอยู่ที่ [`runConnector(connector, criteria, runtime, opts)`](src/pipeline.js) (ชื่อ export คือ `runConnector` ไม่ใช่ `run`):

```
startRun → คำนวณ cap → getSession → search → (paginate ภายใน provider)
   → loop detail: limiter.wait → fetchHtml → parseHtml
        → [enrichContacts ถ้ามี] → collectAssetsForDb
        → withTransaction(upsertCandidate + upsertSource + saveAsset)
   → finishRun
```

จุดสำคัญ:

- **Cap = `min(requested, connectorRemaining, providerRemaining)`** — `requested` จาก criteria หรือ `connector.scrape_limit`; `connectorRemaining = daily_cap − ที่ scrape วันนี้`; `providerRemaining = provider_limits − ที่ทั้ง platform scrape วันนี้` ถ้า `cap ≤ 0` → status `cooldown`
- **Session self-heal:** search error ที่ `e.needsRelogin` → force login ใหม่ (takeover) แล้ว retry 1 ครั้ง; detail ที่ parse แล้วไม่มี `name` → force login + refetch 1 ครั้ง (กันโดน kick session)
- **`enrichContacts` hook (optional):** สำหรับ platform ที่ซ่อน contact ใน HTML (เช่น JobThai) — pipeline เรียกหลัง parse
- **Soft-ban:** error ที่ `e.fatal` → status `cooldown` + `setConnectorCooldown(+2h)` แล้วหยุด loop
- `opts.onProgress(saved, target)` — ให้ tasks-worker อัปเดต progress

---

## 7. Workers

มี 3 entry point แยกหน้าที่:

| Worker | ไฟล์ | บทบาท |
|---|---|---|
| **worker** | [worker.js](src/worker.js) | batch ง่าย ๆ: list connector ที่ enabled (ข้ามตัวที่ยัง cooldown) แล้ว `runConnector` ทีละตัวด้วย criteria จาก `.env` ไม่มี queue |
| **tasks-worker** | [tasks-worker.js](src/tasks-worker.js) | queue/scheduler: ดึง `dueTasks()` แล้วรันเป็น 3 เฟส **scraping → ocr → enrich** พร้อมรายงาน progress |
| **extract-worker** | [extract-worker.js](src/extract-worker.js) | OCR แยก process: ดึง asset ที่ `extract_status='pending'` 1 batch (`EXTRACT_BATCH`=20) ส่งเข้า Ollama แยกไว้เพื่อไม่ให้ OCR ถ่วง scrape |

**Task queue model (`scrape_tasks`):** task ผูกกับ 1 connector มี `mode` (count/date_range), criteria, `schedule_cron` (option) — `dueTasks()` เลือกตัวที่ `enabled` และ (`status='queued'` หรือถึงเวลาตาม cron)

**เฟสใน tasks-worker:**
- **scraping** — `runConnector(..., {taskId, onProgress})`
- **ocr** — สำหรับแต่ละ asset ของ run นี้: `extractAttachment(content, file_type)` → `saveExtraction` (model `typhoon-ocr`)
- **enrich** — candidate ที่ขาด email/phone/line: ดึง OCR text รวม → `contactsFromText` → `fillCandidateContacts` (เติมเฉพาะที่ขาด)

> Scheduling เขียนเอง (ไม่มี cron library): `nextRunFrom(cron)` รองรับแค่ `every:<sec>`, `@hourly`, `@daily` อื่น ๆ → `null` (รันมือ/ครั้งเดียว)

---

## 8. Providers

### 8.1 สัญญา (interface) ที่ pipeline เรียก

provider = object ที่ export จาก `src/providers/<platform>/index.js`:

| Member | หน้าที่ | จำเป็น? |
|---|---|---|
| `id`, `label` | identity | ✅ |
| `getSession(opts)` → `{browser, context, request, reused, dumpState}` | login + คืน `context.request` (HTTP client) | ✅ |
| `searchResumeIds(request, criteria, runtime)` → `{ids, totalAvailable}` | search + paginate (ภายใน) | ✅ |
| `resumeDetailUrl(id)` / `fetchResumeHtml(request, id)` | ดึง HTML หน้า detail | ✅ |
| `parseResumeHtml(html, ctx)` → candidate record | parse ด้วย cheerio | ✅ |
| `collectAssetsForDb(request, record)` → asset[] | ดาวน์โหลดรูป/ไฟล์เป็น bytea | ✅ |
| `externalId(url)` | id เสถียรของ platform | ✅ |
| `enrichContacts(request, id, record, runtime)` | เผย contact ที่ถูกซ่อน | ⬜ optional |

> **กุญแจสำคัญ:** `getSession` คืน `context.request` (Playwright APIRequestContext) — ทุก method หลังจากนั้นทำผ่าน HTTP บน object นี้ ไม่เปิดหน้า browser อีก

### 8.2 JobBKK vs JobThai

| ด้าน | JobBKK | JobThai |
|---|---|---|
| **Login** | form login (`#username_emp`/`#password_emp`) ที่ `/login/employer_login` | **OAuth** auth-code ที่ `auth.jobthai.com/companies/login` → redirect `/callback` |
| **CAPTCHA** | detect **และ solve อัตโนมัติ** | detect แต่ **throw** (ไม่มี solver) |
| **"login ที่อื่นอยู่"** | จัดการ — กด `ตกลง`/`ยืนยัน` เพื่อ takeover | ไม่จัดการ |
| **Search** | **POST** form ไป `/resumes/premium` แล้ว GET หน้าถัดไป | **GET** query string ไป `resume_list.php` แล้วตาม next link |
| **ดึง id** | cheerio `data-id` บน anchor | regex `/resume/<n>,<id>` |
| **Detail URL** | `/resumes/preview_new/{id}` (รองรับ 2 layout) | `/resume/0,{id}.html` |
| **Contact** | **อยู่ใน HTML** parse ด้วย icon + text fallback (ไม่มี enrichContacts) | **ถูก mask** → เผยผ่าน `ajaxCheckViewStatusV2.php` |
| **Assets** | รูป + **ไฟล์แนบหลายไฟล์** (PDF/DOC/DOCX) เช็ค magic bytes | **รูปโปรไฟล์อย่างเดียว** ผ่าน `resume_image.php?...&unlock=1` |
| **Quota** | ไม่มีปัญหาเฉพาะ | ⚠️ **เผย contact กิน view quota / first-view-only** |
| **Province** | `provinces.json` แปลงชื่อ→id | ไม่ใช้ |

### 8.3 ⚠️ JobThai — เรื่องที่ต้องระวังมาก

- Contact ถูกซ่อนใน HTML → เผยด้วย **1 request เดียว** `GET .../common/ajaxCheckViewStatusV2.php?resumecode={id}&type=mobile` ที่คืนทุก contact คั่นด้วย `####` (`####phone####email####line####...`)
- **View quota:** JobThai ให้ resume detail เต็ม **เฉพาะการเปิดครั้งแรก** การเปิดซ้ำได้หน้าที่ถูกตัดข้อมูล และน่าจะกิน quota การดู resume ของบัญชี → **scrape แต่ละ resume ครั้งเดียว** pipeline เก็บ text ครั้งแรกไว้ใน `candidate_sources.raw_text` เพื่อ re-parse offline
- การออกแบบให้เรียก contact ครั้งเดียว (แทน 3 ครั้งแยก phone/email/line) ก็เพื่อประหยัด quota นี้
- Education parser **over-capture** (เก็บเกินดีกว่าพลาด) — กรองเฉพาะที่มีวุฒิจริง/GPA, ตัด `หลักสูตร` (training)

### 8.4 วิธีเพิ่ม provider ใหม่

1. สร้าง `src/providers/<platform>/` เลียนแบบ JobBKK (อ้างอิงครบสุด):
   - `session.js` → `get<Platform>Session(opts)` คืน `{browser, context, request, reused, dumpState}`
   - `client.js` → `searchResumeIds`, `resumeDetailUrl`, `fetchResumeHtml`, `fetchAsset` (ใช้ `withRetry`/`detectSoftBan`/`fatal` จาก `core/anti-ban.js`)
   - `parser.js` → `parseResumeHtml`, `externalId`
   - `assets.js` → `collectAssetsForDb`
   - `index.js` → รวมเป็น provider object (ใส่ `enrichContacts` เฉพาะถ้า contact ถูกซ่อน)
2. **register** ใน [src/connectors/registry.js](src/connectors/registry.js) — เพิ่ม key ใน `PROVIDERS` map (จุดเดียว) ไม่ต้องแก้ pipeline

---

## 9. Anti-ban, Crypto, OCR

### 9.1 Anti-ban — [core/anti-ban.js](src/core/anti-ban.js)

ปรัชญา: "ทำตัวเหมือนคนระมัดระวัง, fail safe"

- **`RateLimiter`** — เว้นช่วง request แบบสุ่ม `minMs + random*(maxMs-minMs)` (ไม่เป็นจังหวะคงที่)
- **`withRetry(fn, {retries=3, baseMs=1500})`** — exponential backoff + jitter; หยุดทันทีถ้า `e.fatal`
- **`detectSoftBan({status, finalUrl, body})`** — 429/403, redirect ไป login, หรือ body มี captcha/"please log in"/"blocked"/"too many requests"
- **`fatal(msg)`** — ติด `.fatal=true` → withRetry หยุด + pipeline เข้า cooldown 2h
- **Caps:** round limit ∩ connector daily cap ∩ provider daily cap (บังคับใน pipeline)

### 9.2 Crypto — [db/crypto.js](src/db/crypto.js)

- **AES-256-GCM** key = `SHA-256(APP_ENCRYPTION_KEY)` (ไม่มี salt)
- output = `base64( iv(12) | authTag(16) | ciphertext )`
- ⚠️ **`APP_ENCRYPTION_KEY` ห้ามเปลี่ยนเมื่อมี connector แล้ว** ไม่งั้น password เดิม decrypt ไม่ได้
- web (`web/lib/crypto.ts`) ใช้ scheme **เดียวกันเป๊ะ** เพื่อให้ worker decrypt ที่ web เข้ารหัสได้

### 9.3 OCR / Ollama — [core/ollama.js](src/core/ollama.js)

- endpoint `OLLAMA_HOST` (default `http://110.49.94.180:11434`), model `OCR_MODEL` (default `scb10x/typhoon-ocr1.5-3b:latest`)
- `extractAttachment(buffer, fileType)`: รูป → OCR ตรง; PDF → `pdftoppm` (poppler) แปลงเป็น PNG ทีละหน้า (สูงสุด `OCR_MAX_PAGES`=6) แล้ว OCR; อื่น ๆ → `skipped`
- `core/contacts.js` `contactsFromText()` — ดึง email/phone/LINE จาก OCR text (ทิ้ง `@jobbkk.com`, กรอง LINE id เข้ม)

---

## 10. Control API & CLI

### 10.1 Control API — [api/server.js](src/api/server.js)

Node `http` เปล่า (ไม่มี Express), port `PORT` (default 8080):

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/health` | liveness → `{ok:true}` |
| GET | `/connectors` | list connector |
| GET | `/candidates?limit=&offset=&platform=` | list candidate (limit cap 200) |
| GET | `/candidates/:id` | candidate + sources + asset metadata (id ต้อง match UUID) |
| GET | `/assets/:id` | stream ไฟล์ดิบจาก bytea (`Content-Disposition: inline`) |
| POST | `/runs` `{connectorId, criteria?}` | trigger scrape (async, คืน 202) |

> API นี้ **trigger ad-hoc run** ได้อย่างเดียว — CRUD `scrape_tasks` อยู่ที่ Web Console

### 10.2 CLI — [cli/connector.js](src/cli/connector.js)

- `add --platform --label --username --password [--limit 15] [--daily 200]` — เข้ารหัส password แล้วสร้าง connector
- `list` — แสดง id/platform/label/user/limit/daily/enabled/cooldown

---

## 11. Web Console — So Recruit (Next.js)

`web/` คือหน้าจอให้ทีมงานใช้: จัดการ connector, สร้าง/ดู task, เปิดดู candidate — อ่าน/เขียน **DB เดียวกับ backend**

### 11.1 Stack

- **Next.js 14.2** (App Router, server components), **NextAuth 4.24**, **pg 8.13** (ไม่มี ORM), React 18, Tailwind
- `next.config.mjs`: `serverComponentsExternalPackages: ['pg']` (กัน pg เข้า client bundle)
- Scripts: `dev`/`start` port **3000**, `build`, `lint`
- Design tokens: SIAMRAJ brand แดง `#e41c24`, font Kanit

### 11.2 Authentication — Azure AD / Entra ID (ไม่ใช่ username/password)

- [lib/auth.ts](web/lib/auth.ts): `AzureADProvider` (`AZURE_AD_CLIENT_ID/SECRET/TENANT_ID`, scope `openid profile email User.Read`)
- หน้า login เรียก `signIn('azure-ad')` — ปุ่ม "เข้าสู่ระบบด้วย Microsoft" ไม่มีฟอร์มรหัสผ่าน → **user มาจาก Azure AD tenant ขององค์กร**
- Session: JWT (httpOnly cookie, อายุ 8h), ไม่มี server-side store
- ป้องกัน route 3 ชั้น: `middleware.ts` (matcher `/candidates|/scraping|/connectors|/dashboard`), server guard ใน `(app)/layout.tsx` (`getServerSession` → redirect ถ้าไม่มี), และทุก action/API re-check session

### 11.3 หน้าจอ (ทั้งหมดภาษาไทย)

| Route | แสดงอะไร |
|---|---|
| `/dashboard` | สถิติรวม (candidate/source/asset/quota วันนี้), กราฟ candidate ต่อ platform + ความครบของข้อมูล, ตาราง recent runs |
| `/candidates` | list ค้นหา/filter platform/แบ่งหน้า (40/หน้า) |
| `/candidates/[id]` | detail: รูป, contact, การศึกษา, ประสบการณ์, ไฟล์แนบ (`AttachmentViewer`), skills |
| `/connectors` | จัดการบัญชี platform (เพิ่ม/เปิด-ปิด/ลบ) + ตั้ง daily cap ต่อ platform |
| `/scraping` | สร้าง task (`NewTaskForm`) + `TaskList` ที่ poll สถานะทุก 2.5s แสดง 3 เฟส scraping→ocr→enrich |

### 11.4 Data layer & การเชื่อม DB

- [lib/db.ts](web/lib/db.ts): `pg.Pool` (cached, max 5) ตั้ง `search_path="${DB_SCHEMA}",public` → ชี้ schema เดียวกับ backend (`server-only`)
- [lib/repo.ts](web/lib/repo.ts): SQL ทั้งหมดต่อตารางร่วม (candidates/sources/assets/connectors/provider_limits/scrape_tasks/scrape_runs)
- [lib/actions.ts](web/lib/actions.ts): server actions (`'use server'`) ทุกตัวเรียก `requireSession()` ก่อน
  - **สร้าง connector:** `createConnectorAction` → `encryptSecret(password)` → `insertConnector` (เก็บแค่ `password_enc`)
  - **สร้าง task:** `createTaskAction` ตั้ง `status: runNow ? 'queued' : 'idle'` → tasks-worker หยิบไปรัน
- [api/assets/[id]/route.ts](web/app/api/assets/[id]/route.ts): stream bytea (auth-gated, validate UUID, cache `private, max-age=300`)

### 11.5 Config — `web/.env.example`

`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AZURE_AD_CLIENT_ID/SECRET/TENANT_ID`, `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`, `DB_SCHEMA` (ต้องตรงกับ backend), `APP_ENCRYPTION_KEY` (**ต้องตรงกับ backend เป๊ะ**), `OLLAMA_HOST`/`OCR_MODEL` (อ้างอิงเฉย ๆ web ไม่อ่าน)

> ⚠️ `.env.example` ใส่ `NEXTAUTH_URL=http://localhost:3100` แต่ script รัน port **3000** — ปรับให้ตรงกัน

---

## 12. ทุกชิ้นเชื่อมกันอย่างไร

```
              ┌──────────────── Web Console (Next.js :3000) ───────────────┐
              │  Azure AD login → จัดการ connector / สร้าง task / ดู candidate │
              └───────────────┬───────────────────────────┬────────────────┘
                              │ encryptSecret               │ insertTask(status=queued)
                              ▼                             ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │           PostgreSQL  "so-candidate-data"  (DB กลาง — ใช้ร่วมกัน)            │
   │  connectors · scrape_tasks · scrape_runs · candidates · candidate_sources   │
   │  candidate_assets · provider_limits                                         │
   └───────▲───────────────▲───────────────────────────▲──────────────────┬─────┘
           │ runConnector   │ dueTasks                   │ pending assets    │ read
   ┌───────┴──────┐  ┌──────┴────────┐  ┌────────────────┴───────┐  ┌───────┴──────┐
   │  worker.js   │  │ tasks-worker  │  │   extract-worker.js     │  │ api/server.js│
   │ (ทุก conn.)  │  │ scrape→ocr→   │  │   (OCR via Ollama)      │  │ Control API  │
   │              │  │ enrich        │  │                         │  │  :8080       │
   └──────┬───────┘  └──────┬────────┘  └─────────────────────────┘  └──────────────┘
          │ getSession      │
          ▼                 ▼
   ┌──────────────────────────────┐         login ครั้งเดียว (browser) → reuse session
   │  providers/jobbkk · jobthai  │ ──HTTP──▶  JobBKK / JobThai
   └──────────────────────────────┘
```

**2 สัญญาที่ web กับ backend ต้องตรงกันเสมอ:**
1. **PostgreSQL schema** (`DB_SCHEMA` + ชื่อตาราง/คอลัมน์)
2. **AES-256-GCM scheme** (`APP_ENCRYPTION_KEY` + layout `base64(iv|tag|ciphertext)`)

web เป็น **ผู้ผลิต** connector/task — worker เป็น **ผู้บริโภค**

---

## 13. Runbook — งานที่ทำบ่อย

### 13.1 ตั้งค่า Project B ครั้งแรก (local)

```bash
# คำสั่งทั้งหมดรันที่ root ของ repo (โฟลเดอร์ api-scraper)
npm install
npx playwright install chromium        # ครั้งแรกครั้งเดียว
cp .env.example .env                    # ตั้ง PGPASSWORD + APP_ENCRYPTION_KEY
npm run migrate                         # สร้าง schema
npm run connector add -- --platform jobbkk --label "JobBKK-HR1" \
     --username USER --password PASS --limit 15 --daily 200
npm run worker                          # scrape ทุก connector → DB
npm run api                             # เปิด Control API :8080
```

### 13.2 รันด้วย Docker

```bash
docker compose run --rm migrate         # schema ครั้งเดียว
docker compose run --rm worker          # scrape 1 รอบ (cron ที่ host)
docker compose up -d api                # Control API ที่ host :8137 → container :8080
```

> Postgres เป็น **external** (ไม่อยู่ใน compose) — `api`/`worker`/`migrate` ใช้ image เดียวกัน, อ่าน `.env`

### 13.3 รัน Web Console

```bash
cd web
npm install
cp .env.example .env                    # ตั้ง Azure AD + PG* + APP_ENCRYPTION_KEY (ตรงกับ backend)
npm run dev                             # http://localhost:3000
```

### 13.4 รัน pipeline เต็ม (scrape + OCR + เติม contact)

```bash
# สร้าง task ผ่าน Web (/scraping) หรือ insert scrape_tasks ตรง ๆ
npm run tasks            # tasks-worker: scrape → ocr → enrich
# หรือแยก OCR ออกมา:
npm run extract          # OCR asset ที่ค้าง 1 batch
```

### 13.5 รัน Project A (demo)

```bash
cd legacy-demo
npm install
npx playwright install chromium
cp .env.example .env     # ตั้ง JOBBKK_* / JOBTHAI_*
npm run scrape           # popup → Start → ดู browser ทำงาน → ไฟล์ใน output/
```

---

## 14. กฎหมายและจริยธรรม

- ใช้กับ **บัญชี employer ที่ได้รับอนุญาตเท่านั้น** ห้าม bypass CAPTCHA/OTP/access control ของผู้อื่น
- ข้อมูล candidate = **ข้อมูลส่วนบุคคล** → อยู่ภายใต้ **PDPA** และ ToS ของแต่ละ platform
- password ของ connector **เข้ารหัสที่ rest** (AES-256-GCM)
- JobThai: เคารพ **view quota** — scrape แต่ละ resume ครั้งเดียว
- ออกแบบให้รันบน **host ที่ IP คงที่** (ไม่ใช่ Vercel/datacenter IP ที่โดนแบนง่าย)

---

## 15. Quick Reference

### Env vars หลัก (Project B + web)

| ตัวแปร | ใช้ที่ | หมายเหตุ |
|---|---|---|
| `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` | backend + web | DB เดียวกัน |
| `DB_SCHEMA` | backend + web | default `so-candidate-data` — **ต้องตรงกัน** |
| `APP_ENCRYPTION_KEY` | backend + web | **ต้องตรงกัน & ห้ามเปลี่ยน** |
| `POSITION/KEYWORD/MAX_CANDIDATES/PROVINCE/...` | backend | criteria เริ่มต้นของ worker |
| `REQUEST_DELAY_MIN_MS/MAX_MS` | backend | anti-ban (.env.example=2500/6000, code=600/1400) |
| `PORT` | backend API | default 8080 |
| `PLATFORM` | worker | จำกัด worker เฉพาะ platform |
| `OLLAMA_HOST/OCR_MODEL/OCR_MAX_PAGES/EXTRACT_BATCH` | OCR | ไม่อยู่ใน .env.example |
| `NEXTAUTH_URL/SECRET`, `AZURE_AD_*` | web | auth |

### DB tables

`connectors` · `scrape_runs` · `candidates` · `candidate_sources` · `candidate_assets` · `provider_limits` · `scrape_tasks`

### Control API

`GET /health` · `GET /connectors` · `GET /candidates` · `GET /candidates/:id` · `GET /assets/:id` · `POST /runs`

### ไฟล์ที่ควรเริ่มอ่าน

- Project B orchestration: [src/pipeline.js](src/pipeline.js)
- DB layer: [src/db/repositories.js](src/db/repositories.js), [src/db/schema.sql](src/db/schema.sql)
- Provider ตัวอย่าง: [src/providers/jobbkk/](src/providers/jobbkk/)
- Web data layer: [web/lib/repo.ts](web/lib/repo.ts), [web/lib/actions.ts](web/lib/actions.ts)
- Project A orchestration: [core/scrape-pipeline.js](legacy-demo/core/scrape-pipeline.js)

---

## 16. ข้อควรระวัง / Known issues

ปัญหา/ความไม่สอดคล้องที่เจอจากการอ่าน code (ควรรู้ก่อนแก้):

**Project A**
- **`auth.js` เซฟ storageState แต่ไม่มีใครใช้** — flow `scrape`/`download` login ใหม่ด้วย username/password ทุกครั้ง ไม่ได้โหลด `.auth/jobbkk.json`
- **`PLATFORM_IDS` นิยาม 2 ที่ไม่ตรงกัน** — `core/platform-resolve.js` = `['jobbkk','jobthai']`, `providers/registry.js` = 4 ตัว → flow ปกติเลือกได้แค่ 2 platform จริง
- **`download.js` hardcode JobBKK** — re-download candidate JobThai ไม่ถูกต้อง
- README defaults เพี้ยนจาก `.env.example`/code (`PAUSE_AT_END`, `DEBUG_MODE`, `DELAY_MS`)

**Project B**
- **มี 2 ทาง scrape:** legacy `src/scrape.js` (JobBKK only, เขียนไฟล์, ไม่แตะ DB) กับ DB pipeline (`worker`/`tasks`/`api`) — งานใหม่ใช้ DB pipeline
- **delay default ไม่ตรง:** code (`config.js`) = 600/1400ms แต่ `.env.example` = 2500/6000ms (ค่าใน `.env` ชนะ) → ค่าปลอดภัยคือใช้ตาม `.env.example`
- **Control API ไม่มี CRUD `scrape_tasks`** — จัดการ task ได้ที่ Web Console เท่านั้น
- env `OLLAMA_HOST/OCR_MODEL/OCR_MAX_PAGES/EXTRACT_BATCH` ใช้ใน code แต่ไม่อยู่ใน `.env.example`

**Web**
- `NEXTAUTH_URL` ใน `.env.example` = port 3100 แต่ script รัน 3000 — ปรับให้ตรง
- JobThai `getSession` ไม่รับ `forceLogin` (ต่างจาก JobBKK) — pipeline ยัง takeover ได้เพราะไม่ส่ง `storageState` แต่จะไม่ปิด dialog "login ที่อื่น" ถ้า JobThai เพิ่ม gate นี้ในอนาคตต้อง implement เพิ่ม

---

*คู่มือนี้สร้างจากการวิเคราะห์ source code ทั้งหมดในโฟลเดอร์ หากแก้ code แล้ว behavior เปลี่ยน อย่าลืมอัปเดตเอกสารนี้ด้วย*
