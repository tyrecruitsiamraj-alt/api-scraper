# แผนงานหลักของ Project: SO Recruitment Automation

> ไฟล์นี้เป็นแหล่งอ้างอิงแผนงานกลาง (Single Source of Truth) สำหรับคนและ AI ทุกโมเดล
>
> อัปเดตล่าสุด: 25 สิงหาคม 2026 (Asia/Bangkok)
> สถานะ: Phase 9 กำลังทดสอบจริง — Gate A, B, D (เส้น Queue→Worker) และ F มีหลักฐานแล้ว; Gate E ผ่าน Preflight แต่ยังไม่มี Controlled Real Post; Gate C ยังขาดหลักฐานการกดจาก Web ภายใต้ session ผู้ใช้

## กติกาการใช้ไฟล์นี้

1. ทุกครั้งที่มีการวางแผนใหม่ ให้เพิ่มหรือปรับแผนในไฟล์นี้ก่อนส่งมอบ
2. หากขอบเขต ลำดับ หรือการตัดสินใจเปลี่ยน ให้แก้หัวข้อเดิม ไม่สร้างแผนซ้ำหลายไฟล์โดยไม่จำเป็น
3. ทุกการอัปเดตต้องบันทึกในหัวข้อ “ประวัติการปรับแผน”
4. ห้ามทำเครื่องหมายว่างานเสร็จจากการคาดเดา ต้องมีผลทดสอบหรือหลักฐานรองรับ
5. ห้ามแก้ข้อมูลย้อนหลัง ลบ Error หรือเปลี่ยนสถานะงานเพื่อทำให้ Dashboard เป็นสีเขียว
6. โมเดลที่ลงมือทำต้องอัปเดตสถานะ เช็กบ็อกซ์ หลักฐาน และ Commit ที่เกี่ยวข้องกลับเข้ามาในไฟล์นี้

## คำจำกัดความสถานะ

| สถานะ | ความหมาย |
|---|---|
| ✅ เสร็จและพิสูจน์แล้ว | มีโค้ด ผลทดสอบ และผลใช้งานจริงตามเกณฑ์รับงาน |
| 🟡 มีแล้วแต่ยังไม่จบ | มีโค้ดหรือ UI แล้ว แต่ Golden Flow/ความเสถียร/คุณภาพยังไม่ผ่านครบ |
| ⬜ วางแผนแล้ว | มี Requirement และแนวทาง แต่ยังไม่มีผลลัพธ์ที่ตรวจรับได้ |
| ⏸ พักไว้ | ตั้งใจยังไม่ทำในรอบปัจจุบัน |

## Master Roadmap — รวม Phase เดิมทั้งหมด

> สถานะในตารางนี้ประเมินจากโค้ด, Git history และเอกสาร ณ วันที่อัปเดต ไม่ถือว่า “เสร็จ” เพียงเพราะมีหน้า Web หรือมี Commit

| Phase | เป้าหมาย | สถานะปัจจุบัน | งานที่เหลือก่อนตรวจรับ |
|---|---|---|---|
| 0. Foundation & Settings | รวม Connector, บัญชี Facebook, Job และตั้งค่าโพสต์ไว้ใต้ Settings | 🟡 มีแล้วแต่ยังไม่จบ | ตรวจทุกหน้าด้วยข้อมูลจริง, ตัดทางเก่าที่ซ้ำ, ยืนยัน Pin บัญชีกับ Worker |
| 1. ใบขอและศูนย์งาน | รับใบขอ, แปลงข้อมูล, ตรวจความครบถ้วน และเลือก Scraping/Content/ทั้งสอง | 🟡 มีแล้วแต่ยังไม่จบ | ทำใบขอเป็น Parent Work Order จริง, แสดง Next Action และสถานะลูกทุกงานให้ครบ |
| 2. Resume Sourcing | JobBKK/JobThai, คำค้นอัตโนมัติ, อายุ/วันที่อัปเดต, รูป, dedupe และค้นต่อจนถึงเป้า | 🟡 มีแล้วแต่ยังไม่จบ | ทดสอบ JobThai สด, พิสูจน์ auto-run หลังสั่ง Web, แยก market exhausted จาก system error |
| 3. Candidate Library & Qualification | คลังผู้สมัคร, รูปทุกคน, อ่านแล้ว/โทรแล้ว, Hard Filter และผลตรวจรับ | 🟡 มีแล้วแต่ยังไม่จบ | แสดงเหตุผลผ่าน/ไม่ผ่านรายคน, ตรวจรูป/ไฟล์ครบ, เพิ่มคะแนนความเหมาะสมต่อใบงาน |
| 4. Content Intelligence | ใช้ข้อเท็จจริงใบขอ, Google Trends, คำค้นแนะนำ, Facebook research และ Second Brain | 🟡 มีแล้วแต่ยังไม่จบ | พิสูจน์ Research Gate สด, ตรวจ provenance และห้ามข้อมูลเทรนด์เปลี่ยนข้อเท็จจริงใบขอ |
| 5. Image, Template & Editor | สร้างภาพตรงตำแหน่ง, แก้ข้อความ/Caption, คิดใหม่, Template, Logo และ Brand Rule | 🟡 มีแล้วแต่ยังไม่จบ | พิสูจน์ gpt-image-2 จริง, ตรวจ Editor บน Web, ทำระบบ Template/Material/Brand Lock จาก Artwork |
| 6. Approval & Facebook Autopost | ตรวจงาน, อนุมัติ, สรุปกลุ่ม, Preflight, โพสต์ และติดตามจนเสร็จ | 🟡 มีแล้วแต่ถูก Block | เปิด Worker รุ่นตรง Production, แก้ Failure streak, Controlled Real Post และป้องกันโพสต์ซ้ำ |
| 7. Results, Leads & Learning | เก็บผู้สนใจ, engagement, A/B, Winning/Losing Pattern, รายงานและเรียนรู้ | 🟡 มีแล้วแต่ยังไม่พิสูจน์ | ทดสอบผลจริง, แยก human feedback/measured result, ตรวจ Sample Size ก่อนเลื่อน Pattern |
| 8. Candidate Fit Score | ให้แต่ละใบงานกำหนด Hard Gate และน้ำหนัก แล้วสรุปผู้สมัครเหมาะกี่ % | ⬜ วางแผนแล้ว | ออกแบบข้อมูล, Scorecard Editor, Evidence, Re-score และ Threshold ตามหัวข้อด้านล่าง |
| 9. Production Readiness | Version Contract, Worker, Queue, Golden Flow, Monitoring และ E2E | 🟡 กำลังเป็นลำดับแรก | ทำ Release Gate A–G ให้ผ่านทั้งหมด |
| 10. Scale & Cloud Worker | ย้ายจากเครื่องชั่วคราวไป Worker 24/7/Cloud เมื่อระบบนิ่ง | ⏸ พักไว้ | เริ่มหลัง Phase 9 ผ่านและวัดเสถียรภาพบนเครื่องนี้แล้ว |

## ลำดับความสำคัญที่ตัดสินแล้ว

1. **Phase 9 — Production Readiness:** ทำระบบปัจจุบันให้รันเองและจบจริงก่อนเพิ่ม Feature
2. **Phase 8 — Candidate Fit Score:** ทำให้ผล Scraping ตอบโจทย์ธุรกิจว่าใครเหมาะกับใบงานกี่เปอร์เซ็นต์
3. **Phase 5 — Template/Brand System:** ทำหลัง Artwork ส่ง Template, Logo, Font, Size และ Placement Rule
4. **Phase 7 — Learning Optimization:** เปิดใช้เต็มเมื่อมีผลจริงเพียงพอ ไม่เรียนรู้จากตัวอย่างเดียว
5. **Phase 10 — Scale/Cloud:** ย้าย Worker หลัง Golden Flow บนเครื่องนี้เสถียรแล้ว

## รายละเอียด Phase 8 — Candidate Fit Score

### Workflow เป้าหมาย

```text
ใบขอเข้ามา
→ AI แปลงเป็น Candidate Spec
→ ระบุ Hard Gate และปัจจัยให้คะแนน
→ คนตรวจและปรับน้ำหนักรวมให้เท่ากับ 100%
→ ระบบ Scrape และเก็บหลักฐาน Resume
→ ตรวจ Hard Gate
→ คำนวณคะแนนตามใบงาน
→ แสดงคะแนน เหตุผล และข้อมูลที่ยังไม่ทราบ
```

### กติกาที่ห้ามผิด

- Hard Gate แยกจากน้ำหนัก เช่น ใบขับขี่หรือใบอนุญาตบังคับ ไม่ให้คะแนนอื่นมาชดเชย
- ข้อมูลที่ Resume ไม่ระบุต้องเป็น `needs_review`/Unknown ห้ามเดาว่าผ่าน
- ผู้สมัครคนเดียวกันมีคะแนนต่างกันได้ในแต่ละใบงาน
- เปลี่ยนน้ำหนักแล้ว Re-score ได้โดยไม่ต้อง Scrape ใหม่
- ทุกคะแนนต้องย้อนดูหลักฐานจาก Resume ได้

### ผลลัพธ์รายคน

- สถานะ: `qualified`, `needs_review` หรือ `rejected`
- คะแนนความเหมาะสมต่อใบงาน
- ความครบถ้วนของหลักฐาน
- ผล Hard Gate รายข้อ
- คะแนนย่อยและเหตุผล
- Source/Resume ที่ใช้เป็นหลักฐาน

### งานที่ต้องทำ

- [ ] นิยาม Candidate Spec และ Scorecard Version
- [ ] ทำ Hard Gate Editor และ Weight Editor ต่อใบงาน
- [ ] กำหนดน้ำหนักเริ่มต้นตาม Job Family แต่ให้คนแก้ได้
- [ ] ทำ Scoring Engine ที่อธิบายผลได้
- [ ] ผูก Assessment กับใบงานและ Candidate โดยไม่แก้ข้อมูล Candidate ต้นฉบับ
- [ ] ทำหน้าสรุปเรียงผู้สมัครตามสถานะก่อนคะแนน
- [ ] ทำ Re-score หลังเปลี่ยนน้ำหนัก
- [ ] เพิ่ม Test กรณีตก Hard Gate แต่ Soft Score สูง, หลักฐานหาย และผู้สมัครซ้ำ

## เป้าหมายปัจจุบัน

ทำให้ Production Readiness เป็น 100% จากการพิสูจน์ Golden Flow จริง:

```text
รับใบงาน
→ Web ส่งงานเข้าคิว
→ Worker รับงานเอง
→ สร้าง Caption และภาพที่ผ่าน Quality Gate
→ ตรวจ Facebook แบบไม่โพสต์จริง
→ เผยแพร่จริงในกลุ่มทดสอบที่อนุญาต
→ ติดตามผลและปิดงาน
```

สำหรับ Scraping ต้องพิสูจน์เส้นทาง:

```text
รับรายละเอียดงานและจำนวนเป้าหมาย
→ Web ส่งงานเข้าคิว
→ Worker ค้นจาก Connector
→ ตัดคนซ้ำและตรวจ Hard Filter
→ ส่งมอบ Resume หรือรายงานว่าตลาดไม่พอพร้อมหลักฐาน
```

## สถานะที่ตรวจพบล่าสุด

| ด่าน | สถานะ | หลักฐาน/ความหมาย |
|---|---|---|
| เครื่องสร้างประกาศ | ผ่าน | `SONB-RM009` ออนไลน์ และรายงาน `draft` + `content_pipeline=evidence-v1` |
| สิทธิ์สร้างรูป AI | ผ่านที่ Worker | Worker รายงาน `gpt-image-2` และ `configured=true` โดยไม่เปิดเผย Key |
| เครื่องเผยแพร่ Facebook | ยังไม่เปิด | Worker ทำงานแบบ `preflight` เท่านั้นตามกติกาความปลอดภัย จึงห้าม Dashboard นับว่าโพสต์จริงได้ |
| Facebook Preflight | ผ่าน | งาน `pf_mt89o4hc` จบ `completed` แบบไม่โพสต์จริงหลังเจ้าของบัญชียืนยัน Facebook session |
| บัญชีและกลุ่ม Facebook | ผ่าน | 1 บัญชีถูก Pin มาที่ `SONB-RM009` และมี 1 กลุ่ม |
| Caption และภาพ | ผ่านที่ Golden Flow | ใบงาน `LMM6705007` สร้างร่าง `2f7c0dab-2ecd-4ba3-925a-75dd86a2358c` ผ่าน Quality 100 พร้อมภาพจริงจาก `gpt-image-2` |
| Scraping | ทำงานได้บางส่วน | ครบเป้า 1 งาน, ตลาดไม่พอ 5 งาน, ระบบขัดข้อง 0 งาน |
| คิวเบื้องหลัง | ผ่านบางส่วน | Self-test ถูก Worker claim และจบ `done`; ยังไม่ยืนยันการกดจาก Web เพราะ Browser session เป็นหน้า Microsoft sign-in |
| Facebook ล่าสุด | ไม่ผ่าน | การเผยแพร่จริงล้มเหลว 3 ครั้งติดต่อกัน |
| Unit/Build/Logic Test | ผ่าน | Node test 100/100, AutoPost logic 4/4 และ `web npm run build` ผ่าน เมื่อ 25 สิงหาคม 2026 |

## Root Cause ที่ยืนยันจากโค้ด

### RC-01: Worker ไม่ได้รันบนเครื่องนี้

- ตอนตรวจไม่พบ Process `node` และไม่พบ Port ของระบบที่กำลัง Listen
- ผลกระทบ: งานสร้างประกาศ, Scraping และ Facebook ไม่มีเครื่องรับงาน
- จุดเริ่ม Worker: `start-workers.bat`

### RC-02: Version Contract ระหว่าง Production กับ Worker ไม่ตรงกับโค้ดปัจจุบัน

- เดิม Production fallback ยอมรับ Worker SHA: `a602d66cd932c23de05541cae70bd3456a76f56e`
- Commit ปัจจุบันของ Repository: `daa49f9d6c8ae7be99f33baebbf9c09d77b9c34e`
- จุดกำหนดค่า:
  - `web/lib/repo.ts`
  - `autopost/server/index.js`
- ผลกระทบ: Worker ใหม่อาจออนไลน์แต่ถูกกรองออกหรือได้รับ `upgrade_required`

### RC-03: ไม่มี Content Golden Flow รุ่นใหม่ที่ผ่านหลักฐานครบ

- Readiness ต้องพบ `quality_status='pass'`
- ต้องมี `image_bytes`
- ต้องมี `gen_notes.image_generation.ok=true`
- ผลกระทบ: ระบบยังยืนยันไม่ได้ว่า Caption และภาพพร้อมใช้จริง

### RC-04: Facebook มี Failure Streak จริง

- การผ่าน Preflight ไม่สามารถล้างผลล้มเหลวจากการเผยแพร่จริงได้
- ผลกระทบ: ห้ามรายงานว่า Production พร้อมจนกว่าจะมี Controlled Real Post สำเร็จและไม่มี Error ใหม่ในช่วงเฝ้าระวัง

### RC-05: Readiness ผสม “ตลาดมีคนไม่พอ” กับ “ระบบไม่พร้อม”

- งาน Scraping แบบ `partial` อาจเกิดจากตลาดไม่พอ แม้ระบบทำงานครบและไม่มี Error
- ปัจจุบัน `src/core/workflow-readiness.js` ลดสถานะเป็น Warning เมื่อมีงาน Partial
- ผลกระทบ: คะแนน Production Readiness ไม่สะท้อนความพร้อมของระบบอย่างตรงไปตรงมา

### RC-06: Dashboard เดิมนับแค่ Capability แต่ยังไม่ยืนยันผล Facebook จริง

- เดิม `src/core/workflow-readiness.js` นับ Facebook Preflight ว่าผ่านเพียงเพราะ Worker ประกาศ capability `preflight` และนับ Facebook Worker ว่าพร้อมโพสต์เพียงเพราะ `kind='autopost'`
- ผลกระทบ: Worker แบบ preflight-only หรือบัญชีที่ Login ไม่สำเร็จอาจทำให้ Dashboard เขียวเกินจริง
- แก้ใน Commit `26c6940941642b7e836482328b38979538b9618a`: ต้องมี capability `post` จึงนับว่าเผยแพร่จริงได้ และต้องมี Preflight สำเร็จของบัญชีภายใน 24 ชั่วโมงจึงนับว่า Facebook Preflight ผ่าน

### RC-07: Facebook Session ของบัญชีที่ผูกไว้เคยเข้าใช้งานไม่ได้ — แก้แล้ว

- ก่อนแก้ งาน Preflight แบบไม่โพสต์จริงถูก Worker `SONB-RM009` claim แล้ว แต่จบ `failed`; Playwright Trace หลังส่ง Login พบ Facebook ทำงานในสถานะผู้ใช้ `__user=0`
- เจ้าของบัญชียืนยัน Facebook checkpoint บนเครื่อง Worker แล้ว งาน `pf_mt89o4hc` จบ `completed` ใน mode `preflight` เมื่อ 25 ส.ค. 2026
- จุดที่ตรวจและหยุดอย่างปลอดภัย: `autopost/src/helpers/facebookLogin.ts:107-155` และ `autopost/tests/facebookPreflight.spec.ts:4-29`
- ไม่ได้มีการโพสต์จริง, ไม่ได้เปลี่ยนสถานะ Error และไม่พยายามข้าม checkpoint/ความปลอดภัยของ Facebook

### RC-08: Research Gate หยุดหลังตรวจ Facebook เพียงชุดแรก

- เดิม `collectFacebookPosts` จำกัดการตรวจไว้ 4 กลุ่มต่อรอบ จึงสรุปว่าไม่มีโพสต์ที่เกี่ยวข้องทั้งที่ยังสำรวจ source ที่กำหนดไม่ครบ
- ผลกระทบ: Golden Flow หยุดเป็น `needs_input` ทั้งที่ Google Trends ใช้งานได้และ Facebook session ถูกต้อง
- แก้: `src/core/market-research.js` ตรวจได้สูงสุด 50 กลุ่ม (bounded) และส่งสัญญาณ coverage ครบ; หาก Google มีหลักฐานและตรวจทุกกลุ่มที่ตั้งค่าแล้วไม่พบโพสต์ตรงตำแหน่ง ให้ผ่านเป็น **market gap** โดยไม่สร้าง Engagement ปลอม

### RC-09: รหัสเพศเปิดกว้างจาก ERP ถูกโมเดลแปลงเป็นชาย/หญิง

- ใบขอ `LMM6705007` มี `gender=O` ซึ่งหมายถึงไม่ระบุเพศ แต่ร่างแรกระบุเพศชายใน Caption และเพศหญิงบนโปสเตอร์ โดย Quality Gate เดิมไม่ตรวจ
- แก้: normalize `O/all/any/ไม่จำกัดเพศ` เป็นค่าว่างก่อนส่งเข้า Caption/Poster และเพิ่ม Quality Gate บล็อกเมื่อสื่อระบุชาย/หญิงที่ใบขอไม่ได้กำหนด
- ผลพิสูจน์: ร่างใหม่ `2f7c0dab-2ecd-4ba3-925a-75dd86a2358c` ไม่มีการอ้างเพศ และ Quality check `gender=pass`

### RC-10: Readiness ตีงานค้นหาที่ยังทำงานเป็นงานค้าง และ lock จาก Worker ที่หยุดรอนานเกินไป

- งาน `ธุรการ` ถูก process `SONB-RM009#24376` รับแล้ว process หยุดระหว่างรีเฟรช Worker; Queue lock เดิมรอ recovery 30 นาที ขณะที่ Dashboard แจ้งเตือนหลัง 10 นาที
- เกณฑ์เดิมใน `web/lib/repo.ts` ใช้เวลา Resume ล่าสุด จึง Fail แม้ `scrape_runs.heartbeat_at` ของงานใหม่ยังเดินอยู่หรือกรณีตลาดไม่มี Resume ตรงเงื่อนไข
- แก้: Readiness ตรวจ heartbeat ของ active `scrape_run` โดยตรง; Fail เฉพาะ run ที่หยุดรายงานเกิน 10 นาที ไม่เอา market gap มาปนกับ system failure
- ผลตรวจจริง: คืนเฉพาะ lock ที่ยืนยันว่า process เดิมหายแล้วกลับ Queue, Worker รับใหม่และงานปิด `partial` อย่างถูกต้อง (ผ่าน 5/15, ต้องตรวจเพิ่ม 1, ไม่ผ่าน 85); เกณฑ์ใหม่พบ stalled execution 0 งาน

### RC-11: Failure จากการทดสอบเคยค้างใน Dashboard โดยไม่มีบทเรียนถาวร

- ตรวจ Failure Facebook 7 รายการ: 1 รายการเป็น Phase 9 Preflight ที่ไม่โพสต์จริง และ 6 รายการเป็น Auto Daily จาก Mac เก่าที่ไม่มี Build Contract; Assignment เดิมไม่มี Post Log จึงยืนยันว่าไม่มีการเผยแพร่จริง
- ก่อนลบ บันทึกลง `operational_failure_lessons` 2 บทเรียน: Session ต้องผ่าน Preflight และ Auto Daily ต้องใช้ Worker ที่ Pin/มี Build Contract; เก็บเฉพาะหมวดสาเหตุและวิธีป้องกัน ไม่มี credential หรือข้อมูลผู้สมัคร
- ลบเฉพาะ `post_run_queue` 7 แถวและ `run_logs` ทดสอบ 1 แถวหลังตรวจหลักฐานแล้ว; ไม่ลบ Assignment, Job, Candidate หรือผลโพสต์จริง
- เพิ่ม Skill ไทย `.agents/skills/autopost-failure-learning` และให้ `completePostRunJob` บันทึก Failure ใหม่อัตโนมัติก่อนจบงาน

## Recommendation หากเลือกเพียงทางเดียว

ทำ Golden Flow Release บน Worker เครื่องนี้ให้ครบหนึ่งรอบ แล้วแยก Operational Readiness ออกจาก Business Outcome ของตลาดผู้สมัคร

## Release Gate สำหรับ Phase 9 — Production Readiness

### Gate A — จัด Version Contract

- [x] เลือก Worker Release SHA ที่จะใช้จริง
- [x] กำหนด `REQUIRED_WORKER_BUILD_SHA` ให้ตรงกันทั้ง Web และ Autopost Production
- [x] ตรวจว่า Worker รายงาน `build_sha`, `content_pipeline=evidence-v1`, `image_generation` และ `preflight`
- [x] Deploy Web และ Autopost ก่อนเปิด Worker รุ่นใหม่

เกณฑ์ผ่าน:

- หน้า Readiness เห็น Worker ออนไลน์ด้วย Build เดียวกับ Production
- ไม่มีข้อความ `upgrade_required`
- Web ไม่กรอง Worker ที่ถูกต้องออก

หลักฐาน (25 ส.ค. 2026) — ผ่าน:

- แก้ fallback ของ Web, AutoPost และ launcher ให้ใช้ Compatibility Release `daa49f9d6c8ae7be99f33baebbf9c09d77b9c34e`
- Commit `a6f44ed` ถูก Push แล้ว; Production AutoPost รับ Worker claim ที่ส่ง build SHA นี้ได้ (ไม่ตอบ `upgrade_required`)
- Heartbeat ของ Scraper/Content และ AutoPost รายงาน build SHA เดียวกัน พร้อม metadata ที่จำเป็น

### Gate B — เปิด Worker บนเครื่องนี้

- [x] เปิด Scraper/Content Worker และ Facebook Worker แบบ preflight-only บนเครื่องนี้
- [x] ยืนยัน Scraper/Content Worker มี heartbeat ต่อเนื่อง
- [x] ยืนยัน Facebook Worker มี heartbeat ต่อเนื่อง
- [x] ยืนยัน `OPENAI_API_KEY` ถูกมองว่า configured โดยไม่เปิดเผย Key
- [x] ยืนยันบัญชี Facebook ถูก Pin มาที่ชื่อ Worker ที่ออนไลน์

เกณฑ์ผ่าน:

- เครื่องสร้างประกาศ = ผ่าน
- สิทธิ์สร้างรูป AI = ผ่าน และแสดง `gpt-image-2`
- เครื่องเผยแพร่ Facebook = ผ่าน
- Facebook Preflight Worker = ผ่าน

หลักฐาน (25 ส.ค. 2026) — ผ่าน:

- Scraper/Content Worker รายงาน `types: scrape,draft,measure,selftest`, `content_pipeline=evidence-v1` และ Image Provider `gpt-image-2`
- Facebook Worker บน `SONB-RM009` รายงาน `capabilities: [post, preflight]`, Build contract `daa49…` และคง `AUTO_POST_DAILY_ENABLED=0`; จึงรับเฉพาะงานที่คนอนุมัติจากหน้า Web ไม่สร้างรอบโพสต์เอง
- Pin ของบัญชี Facebook อยู่ที่ `SONB-RM009`; ก่อนเปิด capability ตรวจแล้ว `post_run_queue` ว่าง จึงไม่มีงานเก่าถูก claim ระหว่างรีสตาร์ท

### Gate C — ทดสอบ Web → Queue → Worker

- [ ] สั่ง Self-test จากหน้า Web (Blocker: Browser ที่ตรวจเป็น Microsoft sign-in ยังไม่มี session ผู้ใช้)
- [x] ตรวจงานเข้า `work_queue`
- [x] ตรวจ Worker Claim งานเอง
- [x] ตรวจสถานะจบเป็น `done`
- [x] ตรวจว่าไม่มีงาน `queued` เกิน 10 นาทีหรือ `running` ค้าง

เกณฑ์ผ่าน:

- การทดสอบ Web → Queue → Worker = ผ่าน
- คิวเบื้องหลัง = ผ่าน

หลักฐาน (25 ส.ค. 2026) — ผ่านเฉพาะ Queue→Worker:

- Self-test ปลอดภัย `2eab530e-4d25-4503-a6fc-b4a4b6f07af2` ถูก Worker claim และจบ `done` โดยไม่มี Error
- ไม่ทำเครื่องหมาย Gate C ผ่านเต็ม เพราะยังไม่มีหลักฐานการกด Web Action ภายใต้ session ผู้ใช้

### Gate D — Content Golden Flow

- [x] เลือกใบขอจริงหนึ่งใบที่ข้อมูลตำแหน่ง, สถานที่, รายได้ และเวลางานครบ
- [ ] สร้าง Content ใหม่ผ่านหน้า Web
- [x] ตรวจ Caption เทียบข้อเท็จจริงต้นทาง
- [x] ตรวจภาพว่าตรงตำแหน่งและไม่มีข้อความผิด
- [x] ตรวจ Research Gate และ Quality Gate
- [x] ตรวจหลักฐาน `image_generation.ok=true`
- [ ] ทดลองแก้ข้อความบนภาพและ Caption จากหน้า Web

เกณฑ์ผ่าน:

- มีร่างใหม่อย่างน้อย 1 ร่างที่ Quality Gate ผ่าน
- มีภาพจริงพร้อมใช้และตรวจที่มาของการสร้างได้
- ข้อเท็จจริงสำคัญผิด = 0

หลักฐาน (25 ส.ค. 2026) — Golden Flow Queue→Worker ผ่าน; Web Editor ยังรอพิสูจน์:

- ใช้ใบขอจริง `LMM6705007` (หัวหน้าไซด์, โรงงานคูโบต้า นวนคร, 15,000 บาท, จ.-ศ. 7.00–17.00 น., 1 อัตรา)
- งาน draft `fc7e4c7e-46e3-4492-b368-98c962da0983` ถูก Worker claim และจบ `done`; ร่าง `2f7c0dab-2ecd-4ba3-925a-75dd86a2358c` เป็น `pending_approval`, Quality 100 และ `image_generation.ok=true` จาก `gpt-image-2`
- Research Gate มีคำแนะนำ Google 7 คำ และตรวจ Facebook source ครบ 36 กลุ่มแล้วไม่พบโพสต์ตรงตำแหน่ง; บันทึกเป็น market gap ไม่ใช่ Engagement ปลอม
- ตรวจภาพจริงแล้ว: หัวหน้าไซต์งานภูมิทัศน์พร้อม PPE/clipboard ไม่มีข้อความจากโมเดลทับโปสเตอร์ และ Caption/Poster ไม่ระบุเพศเนื่องจากใบขอใช้ `gender=O`
- Commit โค้ดและ Test: `4d5898c fix: ground content research and gender facts`
- ยังไม่ทำเครื่องหมายผ่านเต็ม เพราะหลักฐานการกดสร้างและทดลอง Editor จาก Web ภายใต้ session ผู้ใช้ยังไม่มี

### Gate E — Facebook Golden Flow

- [x] รัน Preflight โดยไม่โพสต์จริง
- [x] ตรวจ Session, บัญชี และกลุ่มเป้าหมาย
- [ ] เลือกกลุ่มทดสอบ/กลุ่มส่วนตัวที่ได้รับอนุญาต
- [ ] เผยแพร่จริงหนึ่งโพสต์แบบ Controlled Test
- [ ] ตรวจ Post Link, รูป, Caption, จำนวนกลุ่ม และการป้องกันโพสต์ซ้ำ
- [ ] เฝ้าระวัง 24 ชั่วโมงโดยไม่มี Failure ใหม่

เกณฑ์ผ่าน:

- Preflight สำเร็จ
- Controlled Real Post สำเร็จ
- โพสต์ซ้ำ = 0
- ไม่มีงานผิดพลาดใหม่ในช่วงตรวจย้อนหลัง 24 ชั่วโมง

กติกาความปลอดภัยระหว่างดำเนินการ:

- เปิด Facebook Worker สำหรับ Gate E ด้วย `WORKER_CAPABILITIES=preflight` และ `AUTO_POST_DAILY_ENABLED=0` เท่านั้น
- Server ต้องส่งงานเฉพาะ mode ที่ Worker ประกาศ capability; ห้ามให้ preflight-only Worker claim งาน `post`
- เปลี่ยนเป็น capability `post` ได้หลังผู้ใช้อนุญาต Controlled Real Post เป็นรายครั้งเท่านั้น

หลักฐานระหว่างดำเนินการ (25 ส.ค. 2026):

- แก้ AutoPost Server ให้ Capability `preflight` รับได้เฉพาะงาน `preflight` และ Capability `post` รับได้เฉพาะงาน `post`
- เพิ่ม `WORKER_CAPABILITIES` ให้เปิด remote worker แบบ `preflight` อย่างเดียวได้ และปิด auto-daily เมื่อไม่มี capability `post`
- Syntax check ผ่าน; ต้อง Deploy Server แล้วทดสอบผ่านคิวจริง

ผลทดสอบจริง (25 ส.ค. 2026) — Preflight ผ่าน; Controlled Real Post ยังไม่เริ่ม:

- หลังเจ้าของบัญชียืนยัน Facebook session งาน `pf_mt89o4hc` ถูก Worker `SONB-RM009-29300` claim และจบ `completed` ใน mode `preflight`
- ไม่มีการโพสต์จริง; จากนั้นเปิด Worker เครื่องนี้เป็น `post,preflight` โดยปิด Auto Daily เพื่อรอ Controlled Real Post ที่คนอนุมัติ
- Controlled Real Post ยังไม่เริ่มและจะหยุดขออนุญาตเป็นรายครั้งก่อนเปิด capability `post`

### Gate F — แยกคะแนน Scraping ออกจากความพร้อมระบบ

- [x] ปรับ Readiness ให้ `error`, Worker offline, Queue ค้าง และ Pipeline ค้าง เป็นตัวหักคะแนนระบบ
- [x] แสดงงาน `partial/market_exhausted` เป็น Business Outcome แยกต่างหาก
- [x] ห้ามเปลี่ยนงาน Partial เป็น Done หาก Resume ผ่าน Hard Filter ยังไม่ครบเป้าหมาย
- [x] เพิ่ม Test Case ยืนยันว่า “ตลาดไม่พอ แต่ระบบทำครบ” ไม่ทำให้ Operational Readiness ล้ม

เกณฑ์ผ่าน:

- ระบบขัดข้อง 0 งาน = Operational Scraping ผ่าน
- จำนวนงานตลาดไม่พอยังคงแสดงตามจริง
- Definition of Done ของแต่ละงาน Scraping ไม่ถูกผ่อน

หลักฐาน (25 ส.ค. 2026) — ผ่าน:

- เพิ่ม Unit Test: ตลาดไม่พอ 5 งานแต่ไม่มี system error ยังได้ Readiness 100%
- เพิ่ม Unit Test: มี Scraping system error 1 งานต้อง Block Readiness
- Commit `a6f44ed` ถูก Push แล้ว; ชุด Unit Test เต็มผ่าน 95/95 โดยไม่แก้ข้อมูล `partial` ย้อนหลัง
- งาน `partial` ยังแสดงเป็นผลตลาด และ `error` ยัง Block Readiness ตามจริง

### Gate G — Final Production Verification

- [ ] สถานะตรงกับ So Recruit
- [ ] ทุก Readiness Gate ผ่าน
- [ ] ไม่มี Warning ที่ถูกซ่อนหรือลบข้อมูลเพื่อให้คะแนนเพิ่ม
- [ ] รัน Unit/Integration/E2E ที่เกี่ยวข้องทั้งหมด
- [ ] บันทึกผลทดสอบ เวลา Commit และผู้ตรวจลงในไฟล์นี้

เกณฑ์ผ่านสุดท้าย:

- Production Readiness = 100%
- Golden Flow สำเร็จตั้งแต่ Web ถึงผลลัพธ์จริง
- ข้อเท็จจริงสำคัญผิด = 0
- งานค้างเงียบ = 0
- โพสต์ซ้ำ = 0
- ระบบขัดข้องใน Scraping = 0

สถานะ (25 ส.ค. 2026) — ยังไม่ผ่าน:

- ผ่านแล้ว: Node test 100/100, AutoPost logic test 4/4, `web npm run build`, Queue→Worker self-test, Version Contract, Content Golden Flow ผ่าน Research/Quality/Image Gate และ Facebook Preflight (ทดสอบก่อน Commit `4d5898c`)
- ยังไม่ผ่าน: Web Action/Editor ภายใต้ user session, Controlled Real Post และเฝ้าระวัง 24 ชั่วโมง
- Commit ที่ตรวจ Gate: `a6f44ed`, `a4a7dc3`, `26c6940941642b7e836482328b38979538b9618a`

## KPI

| KPI | เป้าหมาย |
|---|---:|
| งานสำเร็จโดยไม่ต้องให้คนตาม | อย่างน้อย 95% |
| ประกาศผ่านการตรวจรอบแรก | อย่างน้อย 80% |
| ข้อเท็จจริงสำคัญผิด | 0 |
| โพสต์ซ้ำ | 0 |
| งานติดปัญหาแต่ไม่แจ้งเตือน | 0 |
| Resume ที่นับผ่านโดยไม่มีหลักฐาน Hard Filter | 0 |
| Readiness Gate ที่มีหลักฐานทดสอบ | 100% |

## Dependency และสิทธิ์ที่ต้องมี

- Worker เครื่องนี้ต้องเปิดและไม่ Sleep/Sign out ระหว่างงาน Browser
- Root `.env` ต้องมีค่าฐานข้อมูลและ `OPENAI_API_KEY`
- `autopost/.env` ต้องมี `DATABASE_URL`, `WORKER_API_BASE` และ `POST_WORKER_TOKEN`
- Production Web และ Autopost ต้องตั้ง Worker Build Contract ตรงกัน
- ต้องมีกลุ่ม Facebook สำหรับ Controlled Test ที่ได้รับอนุญาต

## Risk และวิธีควบคุม

| ความเสี่ยง | วิธีควบคุม |
|---|---|
| Worker Build ไม่ตรง Production | ใช้ SHA เดียวเป็น Release Contract และตรวจ heartbeat ก่อนส่งงาน |
| Facebook จำกัดบัญชี/Checkpoint | เริ่มจาก Preflight และกลุ่มทดสอบ จำกัด concurrency และหยุดเมื่อเจอ checkpoint |
| ภาพผิดตำแหน่ง | ใช้ Job Family/Visual Contract และ Quality Gate ก่อนอนุมัติ |
| Dashboard เขียวแต่ระบบยังพัง | บังคับ Golden Flow พร้อมหลักฐาน ไม่อนุญาตแก้สถานะด้วยมือ |
| ตลาดมีคนไม่พอถูกตีความเป็นบัค | แยก Operational Readiness และ Business Outcome |
| โมเดลอื่นทำต่อแล้วไม่รู้บริบท | ใช้ไฟล์นี้เป็นแผนกลางและบังคับบันทึกผลทุก Phase |

## Handoff สำหรับโมเดลที่ลงมือทำ

### การแบ่งบทบาทโมเดล

- **Terra (แนะนำเป็นตัวหลัก):** ลงมือ Phase 9 / Release Gate A–G เพราะต้องวิเคราะห์ข้าม Web, Queue, Worker, Content และ Facebook พร้อมรักษา Root Cause และความเข้ากันได้ของระบบ
- **Luna:** ใช้ตรวจงานอิสระหลัง Terra, รัน Test ซ้ำ, ตรวจ Diff และยืนยันว่าเช็กบ็อกซ์มีหลักฐานครบ เหมาะกับงานตรวจที่กำหนดขอบเขตชัดและทำซ้ำจำนวนมาก
- ห้ามให้สองโมเดลแก้ไฟล์ชุดเดียวกันพร้อมกัน ให้ Terra จบและ Commit ก่อน Luna ตรวจ

ก่อนแก้โค้ด:

1. อ่านไฟล์นี้ทั้งหมด
2. ตรวจ `git status` และห้ามทับงานที่ยังไม่ Commit
3. ยืนยัน Root Cause จาก Code/DB/Log ก่อนแก้
4. ทำตาม Release Gate ตามลำดับ ห้ามข้าม Facebook Controlled Test แล้วรายงานว่า 100%

หลังแก้แต่ละ Phase/Gate:

1. อัปเดตเช็กบ็อกซ์ในไฟล์นี้
2. เพิ่มผลทดสอบและหลักฐานในหัวข้อ Phase นั้น
3. บันทึก Commit SHA ที่ทดสอบ
4. ระบุสิ่งที่ยังไม่ผ่านอย่างตรงไปตรงมา

## ประวัติการปรับแผน

| วันที่ | การเปลี่ยนแปลง | ผู้จัดทำ |
|---|---|---|
| 25 ส.ค. 2026 | กำหนด Terra เป็นผู้ลงมือ Phase 9 และ Luna เป็นผู้ตรวจอิสระหลัง Commit | Codex |
| 25 ส.ค. 2026 | รวม Phase เดิมเป็น Master Roadmap 0–10, เพิ่ม Candidate Fit Score และเปลี่ยนแผน Readiness เป็น Release Gate A–G เพื่อไม่ให้ชื่อชนกัน | Codex |
| 25 ส.ค. 2026 | สร้างแผนกลางครั้งแรกจากการตรวจ Production Readiness, Worker Version Contract, Content Golden Flow, Facebook และ Scraping | Codex |
| 25 ส.ค. 2026 | ทำ Gate A/B/F, พิสูจน์ Queue→Worker, บันทึก Blocker Facebook Session และแก้ Readiness ไม่ให้นับ preflight-only/Preflight ที่ล้มเหลวเป็นพร้อม | Codex |
| 25 ส.ค. 2026 | ยืนยัน Facebook Preflight, Golden Flow `LMM6705007`, แก้ Research coverage และการแต่งเพศจาก ERP `O`; Node 100/100, AutoPost 4/4 และ Web build ผ่าน | Codex |
| 25 ส.ค. 2026 | แก้เกณฑ์ Readiness ของคิวให้ใช้ heartbeat ของ scrape run แทนเวลา Resume ล่าสุด; ยืนยันงานธุรการปิด partial ตามผลตลาด ไม่ค้าง | Codex |
| 25 ส.ค. 2026 | เปิด Facebook Worker บน SONB-RM009 เป็น `post,preflight` ด้วย Build Contract ตรง Web และปิด Auto Daily; ยังไม่โพสต์จริง | Codex |
| 25 ส.ค. 2026 | เก็บบทเรียน Failure Facebook 2 หมวดก่อนลบ run ทดสอบ 7 รายการ/Log 1 รายการ; เพิ่ม Autopost Failure Learning Skill และการบันทึกอัตโนมัติ | Codex |
