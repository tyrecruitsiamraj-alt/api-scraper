# Prompt สำหรับทีม Jarvis: เลือกบัญชี กลุ่ม และเครื่อง ตอนสั่งงาน Scrap / Autopost

## เป้าหมาย

พนักงานสั่งงานจาก Jarvis ที่เดียว ตอนกดสั่ง ต้องเห็นข้อมูลเหล่านี้:

1. บัญชี Facebook แต่ละบัญชีวันนี้โพสต์ไปแล้วกี่ครั้ง โควต้าเท่าไหร่ หรือโดนพักอยู่ไหม
2. ชื่อกลุ่ม Facebook จริง และผลย้อนหลังของแต่ละกลุ่ม (โพสต์กี่ครั้ง ได้คอมเมนต์/เบอร์เท่าไหร่)
3. แต่ละเครื่อง (worker) ออนไลน์ไหม มีคิวงานค้างกี่งาน และพนักงาน**เลือกเครื่องเองได้** ทั้งงานโพสต์และงาน Scrap (เช่น เครื่องหลักคิวเต็มแต่งานรีบ)
4. บัญชี JobThai / JobBKK ตัวไหนพร้อมใช้

ถ้าบัญชีเต็มหรือถูกพัก ให้ขึ้น popup เตือนก่อนส่งคำสั่ง

ระบบ So Scraping มี API ให้แล้ว Jarvis ต้องทำ 4 อย่าง:
1. แสดงตัวเลือกจาก API options
2. บันทึกค่าที่พนักงานเลือกลงใน `job_snapshot`
3. เรียก API start ให้งานเริ่มทันที พนักงานไม่ต้องเข้าระบบ So Scraping
4. ดึงผลงานจาก API status มาแสดงในหน้าใบงานของ Jarvis

## 1. ดึงตัวเลือก

```
GET https://so-scraping.vercel.app/api/integrations/jarvis/options
x-api-key: <JARVIS_INTEGRATION_KEY>
```

- key ทีม So Scraping จะส่งให้แยก ห้ามใส่ใน frontend ให้เรียกจาก backend ของ Jarvis
- ดึงใหม่ทุกครั้งที่เปิดฟอร์มสั่งงาน (ข้อมูลเปลี่ยนตลอด ห้าม cache)
- key ผิดหรือไม่ส่ง ได้ 401

### คำตอบ (ตัวอย่างย่อ)

```json
{
  "generated_at": "2026-10-26T02:30:00.000Z",
  "accounts": [
    {
      "id": "fb_898d82093abe46eeab1980d8",
      "name": "Tyni Aiit",
      "worker": "SONB-RM009",
      "worker_online": true,
      "posted_today": 5,
      "daily_cap": 20,
      "remaining_today": 15,
      "paused_until": null,
      "pause_reason": null,
      "queue": { "running": 1, "queued": 0 },
      "status": "busy",
      "warning": "บัญชีนี้มีงานโพสต์ค้างอยู่ งานใหม่จะต่อคิวหลังงานนั้น",
      "group_ids": ["mvhmloqvry84difvmvr", "..."],
      "home_group_ids": ["mvhmloqvry84difvmvr"],
      "session_workers": ["SONB-RM009"]
    }
  ],
  "groups": [
    {
      "id": "mvhmloqvry84difvmvr",
      "fb_group_id": "102927176763949",
      "name": "ชมรมพนักงานขับรถผู้บริหาร",
      "url": "https://www.facebook.com/groups/102927176763949",
      "account_ids": ["fb_898d82093abe46eeab1980d8", "..."],
      "home_account_ids": ["fb_898d82093abe46eeab1980d8"],
      "last_posted_at": "2026-10-21T04:48:03.543Z",
      "stats_30d": { "attempts": 3, "posted": 2, "comments": 4, "phone_leads": 1 }
    }
  ],
  "workers": [
    {
      "name": "SONB-RM009",
      "kinds": ["autopost", "scraper"],
      "online": true,
      "last_seen": "2026-10-26T02:30:37.022Z",
      "build": "58b2299",
      "post_queue": { "running": 1, "queued": 0 },
      "scrape_queue": { "running": 1, "queued": 0 },
      "load": 2,
      "fb_account_ids": ["fb_898d82093abe46eeab1980d8"]
    }
  ],
  "scrape_accounts": [
    {
      "id": "8e1c7893-89a5-4adc-869a-2592776bf3ad",
      "platform": "jobthai",
      "label": "JobThai-Main",
      "enabled": true,
      "cooldown_until": null,
      "platform_cap": 1000,
      "platform_used_today": 75,
      "queue": { "running": 0, "queued": 0 },
      "status": "ready",
      "warning": null
    }
  ]
}
```

### ความหมายของ `status`

**accounts** (บัญชี Facebook)

| status | ความหมาย | Jarvis ต้องทำ |
|---|---|---|
| `ready` | พร้อมโพสต์ | เลือกได้ |
| `busy` | มีงานโพสต์ค้างอยู่ งานใหม่จะต่อคิว | เลือกได้ แสดง `warning` เป็นข้อมูล |
| `full` | โพสต์ครบโควต้าวันนี้แล้ว | popup เตือนด้วย `warning` ถ้าพนักงานยืนยันจะสั่งต่อก็ส่งได้ |
| `paused` | ระบบพักบัญชีไว้ (เช่น โพสต์ไม่ผ่านติดกันหลายครั้ง) | popup เตือน และไม่ให้เลือก |
| `worker_offline` | เครื่องหลักของบัญชีนี้ (`worker`) ออฟไลน์ | popup เตือน ให้เลือกเครื่องอื่นที่ออนไลน์แทน |

บัญชีที่ยังไม่มีเครื่องประจำ (`worker` เป็น `null`) จะได้ `ready` พร้อม `warning` ว่ายังไม่มีเครื่องประจำ ให้เลือกได้ แล้วบังคับให้พนักงานเลือกเครื่องในขั้นถัดไป (ส่ง `worker` ใน `job_snapshot`) สถานะ `no_worker` เลิกส่งแล้ว

**scrape_accounts** (บัญชี JobThai / JobBKK)

| status | ความหมาย | Jarvis ต้องทำ |
|---|---|---|
| `ready` | พร้อมใช้ | เลือกได้ |
| `full` | เว็บนั้นเปิดดูโปรไฟล์ครบโควต้าวันนี้แล้ว | popup เตือน |
| `cooldown` | บัญชีพักชั่วคราว | ไม่ให้เลือก |
| `disabled` | ปิดใช้งาน | ไม่ให้เลือก |

ใช้ข้อความใน `warning` เป็นข้อความใน popup ได้เลย ระบบเขียนเป็นภาษาไทยไว้แล้ว

### กลุ่ม

- แสดง `name` ถ้า `name` เป็น `null` แปลว่าบอทยังไม่เคยเข้าไปอ่านชื่อ ให้แสดง `fb_group_id` แทน แล้วต่อท้ายว่า "ยังไม่มีชื่อ"
- กลุ่มไม่ได้ผูกกับบัญชี ทุกบัญชีเลือกได้ทุกกลุ่ม แสดง `groups` ทั้งหมดให้เลือก
  - `accounts[].group_ids` และ `groups[].account_ids` จึงมีครบทุกตัว (กรองตามสองช่องนี้เหมือนเดิมก็ได้ผลเท่ากัน)
  - `home_group_ids` / `home_account_ids` คือกลุ่มที่ตั้งไว้กับบัญชีนั้นในหน้าตั้งค่า ใช้ติดป้าย "กลุ่มประจำ" ได้ ไม่ต้องใช้กรอง
  - ถ้าบัญชียังไม่ได้เป็นสมาชิกกลุ่ม บอทจะกดเข้าร่วมให้ได้รอบละไม่เกิน 5 กลุ่ม กลุ่มที่ต้องรอแอดมินอนุมัติจะขึ้น "ยังไม่ได้เข้ากลุ่ม" ในผล
- `last_posted_at` เอาไว้บอกว่ากลุ่มนี้โพสต์ล่าสุดเมื่อไหร่
- `stats_30d` ผลย้อนหลัง 30 วัน ใช้เรียงหรือติดป้าย "กลุ่มที่ได้คนเยอะ":
  - `attempts` จำนวนครั้งที่สั่งโพสต์ลงกลุ่มนี้ / `posted` จำนวนครั้งที่โพสต์สำเร็จ
  - `comments` คอมเมนต์รวม / `phone_leads` จำนวนคนที่ทิ้งเบอร์ในคอมเมนต์
  - ตอนนี้ตัวเก็บคอมเมนต์ยังอ่านคอมเมนต์รายคนได้ไม่ครบ `comments` กับ `phone_leads` อาจต่ำกว่าจริง ทีม So Scraping กำลังแก้ ให้ใช้ `posted` เป็นหลักไปก่อน

### เครื่อง (worker)

พนักงานเลือกเครื่องได้เองทั้งงานโพสต์และงาน Scrap ระบบจะส่งงานไปเครื่องที่เลือก ไม่สลับไปเครื่องอื่นให้

- `workers` เรียงจากเครื่องที่ออนไลน์และคิวว่างที่สุดก่อน แสดง `online`, `load`, `post_queue`, `scrape_queue` ให้พนักงานเห็นว่าเครื่องไหนคิวแน่น
- `kinds` บอกว่าเครื่องนั้นรับงานอะไรได้: `autopost` = โพสต์ Facebook, `scraper` = Scrap ให้แสดงเฉพาะเครื่องที่รับงานประเภทนั้นได้
- ถ้าไม่เลือกเครื่อง: งานโพสต์ไปที่ `accounts[].worker` (เครื่องหลักของบัญชี) งาน Scrap ไปเครื่องที่ระบบตั้งไว้

**ข้อควรเตือนเมื่อเลือกเครื่องให้งานโพสต์**
- บัญชี Facebook ต้องล็อกอินไว้บนเครื่องนั้น ดูจาก `accounts[].session_workers` (หรือ `workers[].fb_account_ids`)
- ถ้าเลือกเครื่องที่ไม่อยู่ใน `session_workers` ให้ popup เตือนว่า "บัญชีนี้ยังไม่เคยล็อกอินบนเครื่องนี้ บอทจะล็อกอินใหม่ และ Facebook อาจขอยืนยันตัวตน" ถ้าพนักงานยืนยันก็ส่งได้
- ถ้าเครื่องที่เลือก `online = false` งานจะค้างรอจนเครื่องนั้นเปิด ให้ popup เตือนก่อนส่ง

## 2. ส่งค่าที่เลือกกลับมาใน `job_snapshot`

ยังใช้ตาราง `jarvis_rm.job_posting_requests` เหมือนเดิม เพิ่มแค่ฟิลด์ใน `job_snapshot`

**คำขอ Autopost (`request_type = 'content'`)**

| ฟิลด์ | ชนิด | บังคับไหม | หมายเหตุ |
|---|---|---|---|
| `group_ids` | string[] | บังคับ (มีอยู่แล้ว) | ใช้ `groups[].id` ไม่ใช่ `fb_group_id` |
| `account_id` | string | ไม่บังคับ (ใหม่) | `accounts[].id` ถ้าไม่ส่ง ระบบจะเลือกบัญชีที่ผูกกลุ่มให้เอง |
| `worker` | string | ไม่บังคับ (ใหม่) | `workers[].name` ที่ `kinds` มี `autopost` ถ้าไม่ส่ง ใช้ `accounts[].worker` |

ถ้าส่ง `account_id` มา บัญชีนั้นต้องไม่ถูกพัก ไม่งั้นงานจะขึ้นปัญหาให้แก้ในหน้างานโพสต์ กลุ่มใน `group_ids` ต้องเป็น `groups[].id` ที่มีในระบบ กลุ่มที่ไม่มีในระบบจะถูกตัดออก

**คำขอ Scrap (`request_type = 'scraping'`)**

| ฟิลด์ | ชนิด | บังคับไหม | หมายเหตุ |
|---|---|---|---|
| `scrape_connector_ids` | string[] | บังคับถ้าจะเริ่มงานเอง (ใหม่) | `scrape_accounts[].id` เรียงตามลำดับที่อยากใช้ ระบบใช้ตัวแรกที่พร้อม |
| `scrape_worker` | string | ไม่บังคับ (ใหม่) | `workers[].name` ที่ `kinds` มี `scraper` ทุกรอบของงานนี้จะรันที่เครื่องนี้ ถ้าเครื่องไม่พร้อม งานจะไม่เริ่มและขึ้นเหตุผลให้เห็น |

## 3. เริ่มงานทันที

หลังบันทึก `job_posting_requests` (status = `pending`) แล้ว ให้เรียก:

```
POST https://so-scraping.vercel.app/api/integrations/jarvis/start
x-api-key: <JARVIS_INTEGRATION_KEY>
Content-Type: application/json

{ "request_no": "OPL6910068" }
```

ระบบจะเริ่มงานตามค่าใน `job_snapshot` เท่านั้น ไม่เลือกอะไรแทน

**ผลลัพธ์**

| HTTP | ความหมาย | Jarvis ต้องทำ |
|---|---|---|
| 200 | เริ่มแล้ว | แจ้งพนักงานว่าเริ่มงานแล้ว |
| 409 | ใบนี้เริ่มไปแล้ว | ไม่ต้องทำอะไร เรียกซ้ำได้ ไม่สร้างงานซ้ำ |
| 422 | ข้อมูลไม่ครบหรือติดปัญหา (เช่น ยังไม่เลือกบัญชี Scrap, บัญชีไม่ได้ผูกกลุ่ม) | แสดง `error` ให้พนักงานเห็น คำสั่งยังค้างอยู่ แก้แล้วเรียกใหม่ได้ |
| 404 | ไม่พบเลขใบนี้ | ตรวจว่าบันทึกสำเร็จก่อนเรียก |
| 401 | key ผิด | ตรวจ key |

**ตัวอย่างผลลัพธ์ 200**

งานโพสต์:
```json
{ "ok": true, "type": "content", "request_no": "LBM6903001", "queue_id": "mvoz...", "worker": "SONB-RM009", "preflight_queued": false }
```
- `preflight_queued` เป็น `false` เสมอ ระบบเลิกทดสอบก่อนโพสต์แล้ว สั่งแล้วงานเข้าคิวโพสต์เลย ถ้าบัญชีล็อกอินไม่ได้จะรู้จากผลรอบโพสต์

งาน Scrap:
```json
{ "ok": true, "type": "scraping", "request_no": "OPL6910068", "task_id": "7d97...", "queued": true, "message": null }
```
- `queued: false` แปลว่าสร้างงานแล้วแต่ยังเริ่มไม่ได้ (เช่น เครื่องที่เลือกยังไม่เปิด Scrape) เหตุผลอยู่ใน `message` ให้แสดงให้พนักงานเห็น

## 4. ดูผลงาน

```
GET https://so-scraping.vercel.app/api/integrations/jarvis/status?request_no=OPL6905114
x-api-key: <JARVIS_INTEGRATION_KEY>
```

- ขอได้ครั้งละหลายใบ คั่นด้วยจุลภาค ไม่เกิน 20 ใบ เช่น `?request_no=OPL6905114,OPL6910068`
- ใช้ตอนเปิดหน้าใบงาน หรือรีเฟรชทุก 1–2 นาทีระหว่างงานยังไม่จบ (`run_status` เป็น `queued` / `running` หรือ Scrap `group` เป็น `working`)
- ยอดไลก์และคอมเมนต์อัปเดตทุกราว 2 ชั่วโมง (รอบเก็บคอมเมนต์ของเครื่อง)

**ตัวอย่างงานโพสต์ (`type: "content"`)**
```json
{
  "requests": [
    {
      "request_no": "OPL6905114",
      "type": "content",
      "jarvis_status": "in_progress",
      "position": "พนักงานขับรถ นายไทย",
      "account": { "id": "fb_898d82093abe46eeab1980d8", "name": "Tyni Aiit" },
      "worker": "SONB-RM009",
      "run_status": "running",
      "run_queued_at": "2026-10-27T01:24:07.458Z",
      "summary": { "groups": 18, "posted": 4, "failed": 0, "waiting": 14, "reactions": 0, "comments": 0, "shares": 0, "phone_leads": 0 },
      "groups": [
        {
          "fb_group_id": "226719385068994",
          "name": "พนักงานขับรถผู้บริหาร มืออาชีพ กรุงเทพและปริมณฑล",
          "status": "posted",
          "at": "2026-10-27T01:33:31.532Z",
          "error": null,
          "post_link": "https://www.facebook.com/groups/226719385068994/posts/1762979614776289/",
          "approval": "อนุมัติเเล้ว",
          "reactions": 0,
          "comments": 0,
          "shares": 0,
          "collected_at": null
        }
      ],
      "issues": [],
      "detail_url": "https://so-scraping.vercel.app/autopost/jobs"
    }
  ]
}
```

| ฟิลด์ | ความหมาย |
|---|---|
| `run_status` | `queued` รอเครื่อง · `running` กำลังโพสต์ · `completed` จบรอบ · `failed` รอบนี้ล้ม · `null` ยังไม่เริ่ม |
| `groups[].status` | `posted` สำเร็จ · `failed` ไม่สำเร็จ (เหตุผลใน `error`) · `waiting` ยังไม่ถึงคิว |
| `groups[].approval` | สถานะโพสต์ในกลุ่ม เช่น "อนุมัติเเล้ว" / "รออนุมัติ" (แอดมินกลุ่มต้องอนุมัติก่อนคนอื่นเห็น) |
| `summary.phone_leads` | จำนวนคนที่ทิ้งเบอร์ในคอมเมนต์ของใบนี้ |
| `issues` | เหตุผลที่ยังเริ่มงานไม่ได้ (ถ้ามี) |

**ตัวอย่างงาน Scrap (`type: "scraping"`)**
```json
{
  "requests": [
    {
      "request_no": "OPL6910068",
      "type": "scraping",
      "jarvis_status": "in_progress",
      "tasks": [
        {
          "task_id": "7d976c2b-2598-42e4-aa5a-1d1c08442de4",
          "platform": "JobBKK",
          "account": "JobBKK-HR1",
          "group": "attention",
          "status_label": "ได้ไม่ครบเป้า",
          "step": "ขั้น 4/7 · ค้นหาและคัดโปรไฟล์",
          "note": "ค้นครบแล้วแต่ยังได้คนไม่ครบเป้า",
          "target": 1,
          "qualified": 0,
          "needs_review": 0,
          "rejected": 6,
          "last_error": "ยังไม่ครบเป้า: ...",
          "last_run_at": "2026-10-26T02:17:21.888Z",
          "detail_url": "https://so-scraping.vercel.app/scraping/7d976c2b-2598-42e4-aa5a-1d1c08442de4"
        }
      ]
    }
  ]
}
```

- 1 ใบงาน Scrap อาจมีหลาย `tasks` (เช่น JobThai กับ JobBKK)
- `group`: `working` กำลังทำ · `review` ต้องตรวจรับ · `attention` ติดปัญหา · `done` เสร็จแล้ว · `idle` ยังไม่เริ่ม
- `qualified` = ผู้สมัครที่ผ่านเกณฑ์ เทียบกับ `target`
- `detail_url` เปิดดูรายละเอียดและรายชื่อผู้สมัครในระบบ So Scraping

ใบที่ไม่พบจะได้ `{ "request_no": "...", "type": "unknown", "error": "ไม่พบคำสั่งนี้" }`

## 5. ลำดับในฟอร์มที่แนะนำ

1. เปิดฟอร์ม → เรียก options
2. **Autopost**: เลือกบัญชี (แสดง `posted_today/daily_cap` และสถานะ) → เลือกกลุ่มของบัญชีนั้น (แสดงชื่อกลุ่มกับ `stats_30d`) → เลือกเครื่อง (ค่าเริ่มต้น = `accounts[].worker` แสดง `load` ทุกเครื่อง)
3. **Scrap**: เลือกบัญชี JobThai / JobBKK (แสดงสถานะ และ `platform_used_today/platform_cap`) → เลือกเครื่อง (เฉพาะเครื่องที่มี `scraper` แสดง `load`)
4. กดส่ง → popup เตือนก่อนถ้า: บัญชีเป็น `full` / `paused` / `worker_offline`, เครื่องที่เลือกออฟไลน์, หรือบัญชียังไม่ได้ล็อกอินบนเครื่องที่เลือก
5. บันทึก `job_posting_requests` พร้อม `job_snapshot` ตามข้อ 2
6. เรียก `POST /start` ตามข้อ 3 แล้วแสดงผลให้พนักงานเห็น
7. หน้าใบงานใน Jarvis ดึง `GET /status` ตามข้อ 4 มาแสดงผลรายกลุ่มหรือความคืบหน้า Scrap

## ทดสอบ

```
curl -H "x-api-key: <key>" https://so-scraping.vercel.app/api/integrations/jarvis/options
```

ต้องได้ HTTP 200 และมี `accounts`, `groups`, `workers`, `scrape_accounts`
