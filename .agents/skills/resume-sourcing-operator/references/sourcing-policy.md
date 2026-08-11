# นโยบายการค้นหา Resume

## Search Spec

สร้างข้อมูลกลาง: `job_title`, `job_family`, `job_dna`, `target_count`, `location`, `hard_filters`, `soft_scores`, `excluded_profiles` และ `unknowns`

Job DNA คือแก่นของงาน เช่น งานขับรถใช้ใบขับขี่ วินัย และประวัติปลอดภัยเป็น Gate; งานช่างใช้ทักษะและใบรับรอง; งานบริการหน้าบ้านใช้การสื่อสารและบริการลูกค้า

## ลำดับการค้นหา

| รอบ | คำค้น | ทำอัตโนมัติได้ | เงื่อนไข |
|---|---|---|---|
| 1 | ตำแหน่งตรง | ได้ | ใช้คำไทยที่พบใน Resume จริง |
| 2 | คำพ้องตำแหน่งตรง | ได้ | Job DNA เดิม |
| 3 | ตำแหน่งใกล้เคียง 🟢 | ได้ | Job Family เดียวกันและผ่าน Gate |
| 4 | ตำแหน่งใกล้เคียง 🟡 | ตรวจรายคน | ต้องตรวจตัวแปรเสี่ยงเพิ่ม |
| 5 | ตำแหน่ง 🔴/ข้าม Family | ไม่ได้ | ต้องให้คนอนุมัติ |

เลือกแพลตฟอร์มจาก Yield ใน Second Brain หากไม่มีประวัติ ให้ใช้ Connector ที่พร้อมและมีโควตา

## Funnel ที่ต้องวัด

เก็บ `found`, `opened`, `unique`, `qualified`, `needs_review`, `rejected`, `quota_used` และ `duration_seconds`

- Unique Yield = `unique / opened`
- Qualified Yield = `qualified / opened`
- Quota Efficiency = `qualified / quota_used`

ใช้ Qualified Yield เลือกคำค้น ไม่ใช้จำนวน Found อย่างเดียว

## Reason Codes

ใช้ `duplicate`, `wrong_job_family`, `missing_required_license`, `missing_required_skill`, `location_mismatch`, `experience_below_minimum`, `compensation_mismatch`, `insufficient_evidence`, `platform_login`, `captcha_or_checkpoint`, `daily_cap` และ `market_exhausted`

## Retry และ Stop Rule

- Session หมด: Login สดและลอง Search เดิมอีกหนึ่งครั้ง
- Resume Timeout: ข้ามรายนั้นและทำคนถัดไป
- CAPTCHA/Checkpoint: หยุดบัญชีนั้นและแจ้งคน
- Daily Cap: ใช้ Connector อื่นที่อนุญาตหรือรอรอบถัดไป
- คำค้นหมดผล: ไปคำถัดไป ห้ามวนหน้าเดิม
- ครบเป้า: หยุดเปิด Resume เพิ่มทันที
- ทุกคำหมดและยังไม่ครบ: `ยังไม่ครบเป้า`

## Quality Gate รายคน

- `qualified`: ผ่าน Hard Filter จากหลักฐาน
- `needs_review`: ข้อมูล Hard Filter สำคัญหายไป
- `rejected`: มีหลักฐานว่าไม่ผ่าน

ห้ามตีความ `ไม่ระบุ` เป็น `ผ่าน` สำหรับใบอนุญาตหรือทักษะบังคับ

## Platform Execution

JobBKK: ใช้ Browser หน้าเดิมเปิด `/resumes/premium` เลือกตำแหน่ง กด `button#btn-search` อ่าน Card และเปิด `/resumes/preview_new/{id}`

JobThai: ใช้ authenticated request เรียก `/findresume/resume_list.php` อ่าน ID เปิด `/resume/0,{id}.html` และเปิดเผยข้อมูลติดต่อหลังผ่านตัวกรองที่ตรวจได้
