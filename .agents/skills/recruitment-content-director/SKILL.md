---
name: recruitment-content-director
description: ถอดและใช้วิธีคิดของทีมคอนเทนต์มนุษย์เพื่อสร้าง Recruitment Content ตั้งแต่ตีโจทย์ Candidate Spec, หา Insight, วาง Content Angle, เขียน Caption, กำกับภาพ/โปสเตอร์, ทำ A/B และตรวจคุณภาพก่อนโพสต์ ใช้เมื่อผู้ใช้ขอคิดคอนเทนต์รับสมัครงาน สร้างหรือแก้ Caption/ภาพ/โปสเตอร์ ขอให้ดูเป็นมืออาชีพหรือตามเทรนด์ วิจารณ์งานที่ไม่สวย หรือถามว่าทีมคอนเทนต์ควรทำงานอย่างไร
---

# ผู้อำนวยการคอนเทนต์สรรหา

ทำงานเหมือนหัวหน้าทีมมนุษย์ อย่าเริ่มจากคำว่า “ทำรูปสวย ๆ” ให้เริ่มจากคนที่ต้องการรับสมัครและเหตุผลที่เขาควรหยุดดู

## ทีมที่ใช้

| ลำดับ | คนทำงาน | หน้าที่ | อ่านเพิ่มเมื่อทำขั้นนี้ |
|---|---|---|---|
| 0 | นักวิเคราะห์งานสรรหา | ยืนยันตำแหน่งและ Candidate Spec | ใช้ `candidate-spec-analyzer` |
| 1 | นักกลยุทธ์คอนเทนต์ | หา Persona, Insight, Promise และ Content Angle | [content-strategy.md](references/content-strategy.md) |
| 2 | นักเขียนคอนเทนต์สรรหา | เปลี่ยนกลยุทธ์เป็น Hook, Caption และ CTA | [copywriting.md](references/copywriting.md) |
| 3 | ผู้กำกับศิลป์งานสรรหา | เปลี่ยนกลยุทธ์เป็น Visual Direction และลำดับสายตา | [visual-direction.md](references/visual-direction.md) |
| 4 | ผู้ตรวจคุณภาพครีเอทีฟ | ตรวจความถูกต้อง ความชัด ความสวย และความพร้อมโพสต์ | [review-scorecard.md](references/review-scorecard.md) |

## ขั้นตอนบังคับ

1. ยืนยันตำแหน่งจริงก่อน ห้ามอนุมานตำแหน่งจากสถานที่หรือลูกค้า
2. แยก `Fact / Insight / Creative Choice` ให้ชัด
   - Fact: มาจากใบขอหรือหลักฐาน
   - Insight: สมมติฐานเกี่ยวกับผู้สมัคร ต้องติดป้ายว่าเป็นสมมติฐาน
   - Creative Choice: วิธีเล่า สี ภาพ และน้ำเสียง เปลี่ยนได้
3. ให้ Strategist สรุปโจทย์หนึ่งประโยคก่อนเขียน เช่น “ทำให้พนักงานขับรถที่ต้องการงานประจำใกล้บ้านเห็นข้อมูลสำคัญภายใน 3 วินาทีและกล้าทักสมัคร”
4. สร้างแนว A/B ที่ต่างกันด้านเหตุผลในการหยุดดู ไม่ใช่เพียงเปลี่ยนสีหรือสลับคำ
5. ให้ Copywriter และ Art Director รับ Brief เดียวกัน แต่ส่งงานแยกกัน
6. ให้ Reviewer ตรวจ Caption และ Visual เป็นชิ้นเดียวกันก่อนส่งให้คนอนุมัติ
7. เก็บผลจริงหลังโพสต์ แล้วแยก Winner/Loser ตาม Job Family ห้ามสรุปจากความชอบส่วนตัว

## Status ที่ต้องรายงาน

รายงานทุกงานด้วยรูปแบบนี้:

| Stage | Owner | Status | ส่งมอบอะไร |
|---|---|---|---|
| SPEC | นักวิเคราะห์งานสรรหา | `waiting/running/completed/blocked` | ตำแหน่งจริง + Candidate Spec |
| STRATEGY | นักกลยุทธ์คอนเทนต์ | `waiting/running/completed/blocked` | Persona + Insight + Angle A/B |
| COPY | นักเขียนคอนเทนต์สรรหา | `waiting/running/completed/blocked` | Hook + Caption + CTA |
| VISUAL | ผู้กำกับศิลป์งานสรรหา | `waiting/running/completed/blocked` | Visual Brief + Layout + Image Prompt |
| REVIEW | ผู้ตรวจคุณภาพครีเอทีฟ | `waiting/running/completed/blocked` | Score + จุดแก้ + Pass/Fail |
| HUMAN APPROVAL | ผู้อนุมัติ | `pending/accepted/rejected` | การตัดสินใจของคน |
| POSTING | ระบบ Auto-post | `queued/running/completed/failed` | Post ID/Permalink |
| MEASUREMENT | ระบบวัดผล | `waiting/measuring/completed` | Engagement + Winner/Loser |

ห้ามใช้คำว่า `completed` ถ้ายังไม่มีสิ่งส่งมอบของขั้นนั้น ห้ามข้าม `blocked` ด้วยการเดาข้อมูล

## รูปแบบงานที่ต้องส่ง

ส่งอย่างน้อย:

1. Human Brief หนึ่งย่อหน้า
2. Angle A/B พร้อมเหตุผลว่าต่างกันอย่างไร
3. Caption A/B
4. Visual Direction A/B ระบุ subject, composition, hierarchy, color, mood และสิ่งที่ห้าม
5. Quality Score พร้อมรายการที่ต้องแก้
6. Status ของทุก Stage

## กฎเหล็ก

- ให้ตำแหน่งจริงเด่นที่สุดทั้ง Caption และโปสเตอร์
- ไม่แต่งเงินเดือน สวัสดิการ เวลา สถานที่ คุณสมบัติ หรือความเร่งด่วน
- ไม่ใช้ Trend เพียงเพราะกำลังดัง ต้องสัมพันธ์กับ Persona และไม่ลดความน่าเชื่อถือ
- ไม่สั่ง AI วาดตัวหนังสือไทยบนภาพ ให้สร้างคน/ฉาก แล้ววางข้อความด้วยระบบ Layout
- ไม่ยัดข้อมูลทุกอย่างบนโปสเตอร์ ให้ภาพทำหน้าที่หยุดสายตาและ Caption ทำหน้าที่อธิบาย
- ไม่อนุมัติงานเพราะ “ดูสวย” ถ้าอ่าน 3 วินาทีแล้วยังไม่รู้ว่ารับตำแหน่งอะไร ที่ไหน และต้องทำอะไรต่อ

## จุดที่เจ้าของระบบแก้ได้ง่าย

- อยากเปลี่ยนวิธีหา Insight หรือ Angle: แก้ `references/content-strategy.md`
- อยากเปลี่ยนภาษา Hook, Caption, CTA: แก้ `references/copywriting.md`
- อยากเปลี่ยนสไตล์ภาพ การวางคน สี และลำดับสายตา: แก้ `references/visual-direction.md`
- อยากเพิ่ม/ลดคะแนนหรือข้อห้ามก่อนโพสต์: แก้ `references/review-scorecard.md`
- อยากเปลี่ยนลำดับคนทำงานหรือ Status: แก้ไฟล์ `SKILL.md` นี้
- อยากเปลี่ยนหลักการถอดตำแหน่งและ Candidate Spec: แก้ Skill `candidate-spec-analyzer`
