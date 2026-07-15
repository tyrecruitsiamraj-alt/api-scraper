# แผน: Auto-post แบบไม่ง้อ PC + ไม่มี Chrome เด้ง (Track A + B)

> เขียนไว้ล่วงหน้า เผื่อกลับมาทำทีหลัง — อัปเดตล่าสุด 2026-07-15
> สถานะตอนเขียน: ยังรัน worker บนเครื่อง PC (`start-workers.bat`, hostname SONB-RM009) แบบ headful

## เป้าหมาย

1. สั่งโพสต์จากที่ไหนก็ได้ (เว็บ/มือถือ) → งานรันเองบนเซิร์ฟเวอร์ ไม่ต้องเปิดเครื่อง PC ทิ้งไว้
2. ไม่มีหน้าต่าง Chrome เด้งรบกวน
3. ความเสี่ยงโดน Facebook block ต่ำที่สุด

## หลักการที่ต้องจำ (สำคัญกว่าเทคนิคทั้งหมด)

Facebook ไม่ได้จับว่า "รันที่เครื่องไหน" แต่จับ 3 อย่าง:

| สิ่งที่ FB ดู | กติกาของเรา |
|---|---|
| **IP** | 1 บัญชี = IP เดิมเสมอ (ห้ามหลายบัญชีแชร์ IP เดียว, ห้ามบัญชีเดียวสลับ IP) |
| **Fingerprint เบราว์เซอร์** | 1 บัญชี = profile/session เดิมเสมอ (`.auth/{user}.json` ที่มีอยู่แล้ว) |
| **พฤติกรรม** | โพสต์แบบมนุษย์ + cap/cooldown (engine ปัจจุบันทำอยู่แล้ว: cap 15/วัน, cooldown, circuit breaker, human typing) |

⚠️ **ความจริงที่ต้องยอมรับ:** automation โพสต์ลง "กลุ่ม" ด้วยบัญชีคน ผิด ToS ของ FB เสมอ — ลดความเสี่ยงได้มากแต่ไม่มีวันเป็นศูนย์ ทางเดียวที่เสี่ยงศูนย์คือ Track A (API ทางการ ซึ่งลงได้แค่เพจ)

---

# Track A — Facebook Graph API (ทางการ, ความเสี่ยงศูนย์)

**ใช้ได้กับ:** โพสต์ลง **เพจ (Page)** ที่เราเป็นแอดมินเท่านั้น
**ใช้ไม่ได้กับ:** กลุ่ม (FB ปิด Groups API เมษายน 2024) และโปรไฟล์ส่วนตัว

## ของที่ต้องมี

1. Facebook Page ของบริษัท (แอดมินคือบัญชีที่เราคุม)
2. Meta App ที่ [developers.facebook.com](https://developers.facebook.com) (ประเภท Business)
3. Permissions: `pages_manage_posts` + `pages_read_engagement`
   - ใช้ภายในบริษัท: ให้คนที่มี role ใน app (admin/developer/tester) generate token ได้เลย **ไม่ต้องผ่าน App Review**
   - ถ้าจะให้คนนอก org ใช้: ต้องยื่น App Review
4. **Page Access Token แบบ long-lived** (อายุ ~60 วัน ต่ออายุได้ / token ของ Page ที่ได้จาก long-lived user token = ไม่หมดอายุ)
   - ขั้นตอน: User token → แลกเป็น long-lived (`GET /oauth/access_token?grant_type=fb_exchange_token`) → `GET /me/accounts` ได้ Page token

## Endpoint ที่ใช้

```
# โพสต์ข้อความ
POST https://graph.facebook.com/v21.0/{page-id}/feed
     ?message={caption}&access_token={PAGE_TOKEN}

# โพสต์พร้อมรูป (อัปโหลด bytes ตรง ๆ ได้)
POST https://graph.facebook.com/v21.0/{page-id}/photos
     multipart: source=<image bytes>, caption=<caption>

# ตั้งเวลาโพสต์
เพิ่ม published=false&scheduled_publish_time=<unix ts>

# อ่าน engagement (ใช้ทำเฟส 4 ได้เลย ไม่ต้อง scrape)
GET /{post-id}?fields=shares,comments.summary(true),reactions.summary(true)
```

## จุดต่อกับ codebase ปัจจุบัน (ทำน้อยกว่าที่คิด)

- `so_autopost_jobs.users.fb_access_token` — **คอลัมน์มีอยู่แล้ว** (ตอนนี้ใช้แค่ดึงชื่อกลุ่ม ผ่าน `getUserFbToken()` ใน `autopost/server/db.js` + `server/index.js` ~บรรทัด 359)
- แนวทาง: เพิ่ม "connector ประเภท page" —
  1. เพิ่มแถว user ประเภทใหม่ (หรือ table `fb_pages`) เก็บ `page_id` + `page_token`
  2. เขียน `postToPageViaApi(pageId, caption, imageBytes)` ฝั่ง `autopost/server/` (fetch ธรรมดา ไม่ใช้ Playwright)
  3. **รันบน Vercel ได้เลย** — ไม่ต้องมี worker/Chrome เพราะเป็น HTTP ล้วน
  4. Content Orchestrator: `enqueueApprovedPost()` (ใน `web/lib/repo.ts`) แตก branch — ถ้าเป้าหมายเป็นเพจ → ยิง API ตรง / ถ้าเป็นกลุ่ม → เข้าคิว worker แบบเดิม
  5. เฟส 4 (วัดผล): เพจอ่าน engagement ผ่าน API ได้ตรง ๆ แม่นกว่า scrape

## เหมาะกับอะไร

- ประกาศรับสมัครที่ลงเพจบริษัทได้ → ย้ายมาทางนี้ให้หมด (เสถียร + ตั้งเวลาได้ + วัดผลแม่น)
- ส่วนที่ต้องการ reach จากกลุ่ม → ยังต้อง Track B

---

# Track B — Worker บนเซิร์ฟเวอร์ (Xvfb + proxy ต่อบัญชี, ความเสี่ยงต่ำ)

**แนวคิด:** ย้าย worker จาก PC ไปเครื่องเซิร์ฟเวอร์ที่เปิดตลอด, Chrome ยังรัน **headful เหมือนเดิมเป๊ะ** แต่บน "จอเสมือน" (Xvfb) จึงไม่มีหน้าต่างโผล่และไม่ต้องมีจอจริง — ต่อ FB แล้วแยกไม่ออกจากคนเปิดเครื่องจริง (headless ธรรมดามี fingerprint จับง่ายกว่า **ห้ามใช้**)

## สถาปัตยกรรม

```
มือถือ/เว็บ (สั่ง)                     เซิร์ฟเวอร์ (รัน — เปิดตลอด)
┌──────────────┐    ┌──────────────┐    ┌─────────────────────────────┐
│ Console       │    │ post_run_queue│    │ worker:post (supervisor)     │
│ (Vercel)      │───▶│ (Postgres)    │◀───│  └ xvfb-run playwright test  │
│ กดสั่ง/8:00   │    │  1 คิว/บัญชี  │    │     └ Chrome (จอเสมือน)      │
└──────────────┘    └──────────────┘    │        └ proxy ของบัญชีนั้น ──▶ FB
                                         └─────────────────────────────┘
```

การ "สั่ง" ไม่เปลี่ยนเลย (คิวกลางเดิม) — เปลี่ยนแค่ "ที่รัน"

## สเปกเครื่อง

| ขนาด | รองรับ | ประมาณราคา |
|---|---|---|
| VPS 8GB RAM / 4 vCPU | ~4-6 Chrome ขนาน | ~300-600 บ./เดือน |
| VPS 16GB / 8 vCPU | ~8-12 ขนาน | ~600-1,200 บ./เดือน |
| VPS 32GB (เทียบเท่า PC ปัจจุบัน) | ~15 ขนาน (WORKER_CONCURRENCY=15 เดิม) | ~1,500-2,500 บ./เดือน |

- OS: Ubuntu 22.04+ (แนะนำ) — Xvfb เป็นของ Linux; ถ้าอยากใช้ Windows Server ให้รันแบบ RDP ค้าง session แทน Xvfb (ทำได้แต่ดูแลยากกว่า)
- ตั้งในไทยได้ยิ่งดี (IP ไทยสอดคล้องกับบัญชี/กลุ่มไทย) หรือใช้ proxy ไทยทับอีกชั้น (ดูข้อถัดไป)

## Proxy ต่อบัญชี (หัวใจของ Track B — gap ที่ค้างอยู่ตอนนี้)

ปัจจุบัน 42 บัญชีออก IP เดียวกัน = จุดเสี่ยงใหญ่สุด ต้องแก้พร้อมกันตอนย้ายเครื่อง:

- ใช้ **ISP/Residential proxy แบบ static** (ไม่ใช่ rotating!) เจ้าเช่น IPRoyal, Soax, Bright Data — เลือก IP ไทย
- ราคา ~70-150 บ./IP/เดือน × จำนวนบัญชี
- **ผูกตายบัญชี→IP:** เพิ่มคอลัมน์ `proxy_url` ใน `so_autopost_jobs.users` (รูปแบบ `http://user:pass@ip:port`)

### งานโค้ดที่ต้องทำ (ตอนกลับมาทำจริง)

1. `ALTER TABLE users ADD COLUMN proxy_url TEXT` + ช่องกรอกในหน้า admin (`autopost/public/app.js` — งานผู้ใช้/ระวัง ไฟล์นี้แก้เองไม่ได้)
2. `autopost/tests/humanBrowser.fixture.ts` + `playwright.config.ts` (`channel: 'chrome'` ทั้ง 2 project): รับ proxy per-user —
   Playwright: `browser.newContext({ proxy: { server, username, password } })`
   ข้อควรระวัง: ตอนนี้ 1 test run = 1 user (spawn จาก `scripts/post-remote-worker.js` ผ่าน env `ASSIGNMENT_IDS`) → ส่ง `PROXY_URL` เป็น env ต่อ run ได้เลย ง่ายสุด
3. `scripts/post-remote-worker.js`: ตอน claim งาน → อ่าน `users.proxy_url` ของ user นั้น → ใส่ `env.PROXY_URL` ก่อน spawn playwright
4. ทดสอบ: เปิด `https://api.ipify.org` ใน context ก่อนโพสต์ → log ยืนยันว่า IP ตรงกับ proxy ของบัญชี

## ย้าย session (.auth) จาก PC → เซิร์ฟเวอร์

1. คัดโฟลเดอร์ `autopost/.auth/` (storageState ต่อบัญชี — สร้างโดย `facebookLogin.ts` ผ่าน `context.storageState()`) ขึ้นเซิร์ฟเวอร์
2. **ครั้งแรกที่บัญชีเปลี่ยน IP** FB อาจถาม checkpoint/ยืนยันตัวตน → ต้องมีคนช่วยกดยืนยันผ่านมือถือของเจ้าของบัญชี 1 ครั้ง (วางแผนทำทีละ 3-5 บัญชี/วัน อย่าย้ายทีเดียว 42 บัญชี)
3. หลังผ่านครั้งแรก session + IP นิ่งแล้วจะไม่ถามอีก

## Setup บนเซิร์ฟเวอร์ (Ubuntu)

```bash
# 1. พื้นฐาน
sudo apt update && sudo apt install -y xvfb
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

# 2. โค้ด + deps
git clone <repo> && cd api-scraper/autopost
npm install
npx playwright install chrome --with-deps   # ใช้ Chrome จริง (channel: 'chrome')

# 3. .env (ค่าเดียวกับเครื่อง PC เดิม)
#    DATABASE_URL, WORKER_API_BASE=https://<autopost-vercel>, POST_WORKER_TOKEN,
#    WORKER_CONCURRENCY=<ตาม RAM>, USER_{env_key}_EMAIL/_PASSWORD (ถ้าไม่ได้เก็บใน DB),
#    AUTO_POST_DAILY_ENABLED=1 (รอบ 8:00 — ย้ายมาอยู่เครื่องนี้แทน)

# 4. วาง .auth/ ที่คัดมาจาก PC

# 5. รันผ่านจอเสมือน + ให้ฟื้นเองด้วย systemd
xvfb-run -a --server-args="-screen 0 1920x1080x24" npm run worker:post
```

ตัวอย่าง systemd unit (`/etc/systemd/system/autopost-worker.service`):

```ini
[Unit]
Description=Autopost worker (Xvfb)
After=network-online.target

[Service]
WorkingDirectory=/opt/api-scraper/autopost
ExecStart=/usr/bin/xvfb-run -a --server-args="-screen 0 1920x1080x24" /usr/bin/npm run worker:post
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
```

> ทางเลือกแทน VPS+ทำเอง: บริการ anti-detect cloud (AdsPower/Multilogin/GoLogin) — จัดการ fingerprint+proxy ให้เสร็จ จ่ายต่อ profile (~100-300 บ./profile/เดือน) แต่ต้องเขียน integration ใหม่แทน Playwright เดิม = งานโค้ดเยอะกว่า ไม่แนะนำถ้า engine เดิมใช้ได้ดีอยู่

## เช็กลิสต์ตอนย้ายจริง (เรียงตามลำดับ)

- [ ] เช่า VPS + setup ตามด้านบน (ยังไม่เปิด worker)
- [ ] เพิ่ม `users.proxy_url` + โค้ด proxy per-run (ข้อ 1-4 ด้านบน)
- [ ] ซื้อ ISP proxy ไทย static เท่าจำนวนบัญชีที่จะย้ายชุดแรก (3-5 บัญชี)
- [ ] ย้าย `.auth` ชุดแรก + ตั้ง proxy ให้ตรงบัญชี → เปิด worker บนเซิร์ฟเวอร์ **ปิด worker ฝั่ง PC**（ห้ามรัน 2 ที่พร้อมกัน — บัญชีจะสลับ IP）
- [ ] ทดสอบโพสต์บัญชีทดสอบ 1 บัญชี ดู: โพสต์ขึ้นจริง / ไม่โดน checkpoint / IP ตรง proxy
- [ ] warm-up: ชุดแรกโพสต์วันละน้อย ๆ (3-5 โพสต์) สัก 3-4 วันก่อนดัน cap เต็ม
- [ ] ทยอยย้ายบัญชีที่เหลือทีละชุด จนครบ → ปลด `start-workers.bat` ฝั่ง PC
- [ ] ย้ายรอบ 8:00 (`AUTO_POST_DAILY_ENABLED`) มาไว้เครื่องเซิร์ฟเวอร์เครื่องเดียว

## Rollback

เครื่อง PC เดิมยังใช้ได้เสมอ — แค่ปิด worker ฝั่งเซิร์ฟเวอร์แล้วเปิด `start-workers.bat` กลับ (คิวกลางอยู่ที่ Postgres ไม่ผูกกับเครื่อง) แต่ระวัง: บัญชีที่ย้ายไปใช้ proxy แล้ว ถ้ากลับมาโพสต์จาก IP ออฟฟิศ = สลับ IP อีกรอบ ควร rollback เป็นชุดเดียวกับที่ย้าย

---

# สรุปภาพรวม: อะไรไปทางไหน

| งาน | ทางที่ใช้ | เสี่ยง |
|---|---|---|
| โพสต์ลงเพจบริษัท | **Track A** (Graph API บน Vercel — ไม่ต้องมี worker เลย) | ศูนย์ |
| โพสต์ลงกลุ่ม | **Track B** (worker บนเซิร์ฟเวอร์ + Xvfb + proxy/บัญชี) | ต่ำ (ไม่ศูนย์) |
| วัด engagement เพจ | Graph API (`comments.summary`, `reactions.summary`) | ศูนย์ |
| วัด engagement กลุ่ม | collect bot เดิม (Playwright) | ต่ำ |

**ลำดับที่แนะนำถ้ากลับมาทำ:** A ก่อน (งานน้อย เห็นผลเร็ว ปลอดภัย) → แล้วค่อย B (มีชิ้นส่วน: proxy per account + ย้ายเครื่อง + warm-up)

## เอกสาร/ไฟล์ที่เกี่ยวข้องใน repo

- `autopost/scripts/post-remote-worker.js` — ตัว worker (จุดใส่ PROXY_URL per run)
- `autopost/tests/postAll.spec.ts` + `tests/humanBrowser.fixture.ts` — ตัวโพสต์จริง (จุดรับ proxy)
- `autopost/src/helpers/facebookLogin.ts` — จัดการ session `.auth/`
- `autopost/server/db.js` — `users` table (จุดเพิ่ม `proxy_url`), `getUserFbToken()` (โครง Graph API)
- `web/lib/repo.ts` → `enqueueApprovedPost()` — จุดแตก branch เพจ(API)/กลุ่ม(worker) สำหรับ Orchestrator
- หน้า "รอบโพสต์" (`/autopost/runs`) — ใช้ดูว่าบัญชีไหนวิ่งที่ worker ไหน (ยืนยันว่าย้ายเครื่องสำเร็จ)
