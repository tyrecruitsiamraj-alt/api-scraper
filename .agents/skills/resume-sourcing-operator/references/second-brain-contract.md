# สัญญา Second Brain สำหรับ Resume Sourcing

Second Brain คือประสบการณ์รวมจากผลค้นหาจริง ไม่ใช่คลัง Resume และไม่เก็บข้อมูลส่วนบุคคล

## ข้อมูลที่อ่านก่อนค้น

ค้น Pattern ด้วย Job Family, ตำแหน่ง, พื้นที่, แพลตฟอร์ม, คำค้น และความใหม่ ใช้เฉพาะ Pattern ที่มี Sample เพียงพอและไม่หมดอายุ หากไม่มีข้อมูลให้เริ่ม Baseline

## Learning Event

เก็บ `job_family`, `normalized_position`, `location`, `platform`, `search_term`, `found_count`, `opened_count`, `unique_count`, `qualified_count`, `needs_review_count`, `rejected_count`, `quota_used`, `duration_seconds`, `reason_counts` และ `observed_at`

ห้ามเก็บชื่อ เบอร์ Email LINE ที่อยู่ เลขบัตร รูป หรือเนื้อหา Resume ลง Pattern

## การเลื่อนเป็นบทเรียน

- รอบเดียว: `observation`
- อย่างน้อย 3 Attempts และเปิดรวม 20 Resume: `candidate_pattern`
- หลายช่วงเวลาและ Qualified Yield ดีกว่า Baseline สม่ำเสมอ: `recommended_pattern`
- ผลแย่ต่อเนื่องหรือเก่ากว่า 90 วัน: ลดความเชื่อมั่น

แยก `human_feedback`, `search_outcome` และ `hire_outcome` ออกจากกัน ใช้ Hire Yield, Qualified Yield, Quota Efficiency, ความใหม่ และขนาดตัวอย่างตามลำดับ

Second Brain เปลี่ยนได้เฉพาะลำดับแพลตฟอร์ม คำค้น และข้อเสนอขยาย ห้ามเปลี่ยน Hard Filter หรือข้อเท็จจริงจากใบขอ
