# Prompt สำหรับทีม Jarvis: เลือกบัญชี กลุ่ม และเครื่อง ตอนสั่งงาน Scrap / Autopost

## เป้าหมาย

พนักงานสั่งงานจาก Jarvis ที่เดียว ตอนกดสั่ง ต้องเห็นข้อมูลเหล่านี้:

1. บัญชี Facebook แต่ละบัญชีวันนี้โพสต์ไปแล้วกี่ครั้ง โควต้าเท่าไหร่ หรือโดนพักอยู่ไหม
2. ชื่อกลุ่ม Facebook จริง ไม่ใช่แค่เลขกลุ่ม
3. แต่ละเครื่อง (worker) ออนไลน์ไหม และมีคิวงานค้างกี่งาน
4. บัญชี JobThai / JobBKK ตัวไหนพร้อมใช้

ถ้าบัญชีเต็มหรือถูกพัก ให้ขึ้น popup เตือนก่อนส่งคำสั่ง

ระบบ So Scraping มี API ให้ดึงข้อมูลทั้งหมดนี้แล้ว Jarvis ต้องทำ 2 อย่าง: แสดงตัวเลือกจาก API นี้ และส่งค่าที่พนักงานเลือกกลับมาใน `job_snapshot`

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
      "group_ids": ["mvhmloqvry84difvmvr", "..."]
    }
  ],
  "groups": [
    {
      "id": "mvhmloqvry84difvmvr",
      "fb_group_id": "102927176763949",
      "name": "ชื่อกลุ่มตัวอย่าง",
      "url": "https://www.facebook.com/groups/102927176763949",
      "account_ids": ["fb_898d82093abe46eeab1980d8"],
      "last_posted_at": "2026-10-21T04:48:03.543Z"
    }
  ],
  "workers": [
    {
      "name": "SONB-RM009",
      "kinds": ["autopost", "scraper"],
      "online": true,
      "last_seen": "2026-10-26T02:30:37.022Z",
      "build": "39f8268",
      "post_queue": { "running": 1, "queued": 0 },
      "scrape_queue": { "running": 1, "queued": 0 },
      "load": 2
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
| `worker_offline` | เครื่องของบัญชีนี้ออฟไลน์ | popup เตือน และไม่ให้เลือก |
| `no_worker` | บัญชียังไม่ได้ผูกกับเครื่อง | ไม่ให้เลือก |

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
- ให้เลือกได้เฉพาะกลุ่มที่อยู่ใน `group_ids` ของบัญชีที่เลือก หรือกรองจาก `account_ids` ของกลุ่ม
- `last_posted_at` เอาไว้บอกว่ากลุ่มนี้โพสต์ล่าสุดเมื่อไหร่

### เครื่อง (worker)

- งานโพสต์ Facebook **เลือกเครื่องเองไม่ได้** เพราะ session ล็อกอินของบัญชีเก็บอยู่บนเครื่องเดียว เครื่องจึงถูกกำหนดจากบัญชี (`accounts[].worker`)
- ให้แสดง `load` และ `online` ของเครื่องนั้นข้างชื่อบัญชี พนักงานจะเห็นว่าเครื่องไหนคิวแน่น แล้วเลือกบัญชีที่อยู่บนเครื่องว่างกว่าแทนได้
- `workers` เรียงจากเครื่องที่ออนไลน์และคิวว่างที่สุดก่อน

## 2. ส่งค่าที่เลือกกลับมาใน `job_snapshot`

ยังใช้ตาราง `jarvis_rm.job_posting_requests` เหมือนเดิม เพิ่มแค่ฟิลด์ใน `job_snapshot`

**คำขอ Autopost (`request_type = 'content'`)**

| ฟิลด์ | ชนิด | บังคับไหม | หมายเหตุ |
|---|---|---|---|
| `group_ids` | string[] | บังคับ (มีอยู่แล้ว) | ใช้ `groups[].id` ไม่ใช่ `fb_group_id` |
| `account_id` | string | ไม่บังคับ (ใหม่) | `accounts[].id` ถ้าไม่ส่ง ระบบจะเลือกบัญชีที่ผูกกลุ่มให้เอง |

ถ้าส่ง `account_id` มา บัญชีนั้นต้องผูกทุกกลุ่มใน `group_ids` และต้องไม่ถูกพัก ไม่งั้นงานจะขึ้นปัญหาให้แก้ในหน้างานโพสต์

**คำขอ Scrap (`request_type = 'scraping'`)**

| ฟิลด์ | ชนิด | บังคับไหม | หมายเหตุ |
|---|---|---|---|
| `scrape_connector_ids` | string[] | ไม่บังคับ (ใหม่) | `scrape_accounts[].id` ตัวแรกที่พร้อมใช้จะถูกเลือกไว้ให้ในหน้าเริ่มค้นหา |

## 3. ลำดับในฟอร์มที่แนะนำ

1. เปิดฟอร์ม → เรียก options
2. **Autopost**: เลือกบัญชี (แสดง `posted_today/daily_cap`, สถานะ, เครื่องและ `load`) → เลือกกลุ่มของบัญชีนั้น (แสดงชื่อกลุ่ม)
3. **Scrap**: เลือกบัญชี JobThai / JobBKK (แสดงสถานะ และ `platform_used_today/platform_cap`)
4. กดส่ง → ถ้าบัญชีที่เลือกเป็น `full` / `paused` / `worker_offline` ให้ popup เตือนด้วย `warning` ก่อน
5. บันทึก `job_posting_requests` พร้อม `job_snapshot` ตามข้อ 2

## ทดสอบ

```
curl -H "x-api-key: <key>" https://so-scraping.vercel.app/api/integrations/jarvis/options
```

ต้องได้ HTTP 200 และมี `accounts`, `groups`, `workers`, `scrape_accounts`
