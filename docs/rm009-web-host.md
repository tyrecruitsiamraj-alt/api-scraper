# ย้ายเว็บ So Scraping จาก Vercel มาเปิดบน RM009

เว็บใหม่: https://api-scraper.sosiamraj.com · หน้าจอ Autopost ที่ฝังในเว็บ: https://so-autopost.sosiamraj.com
ทั้งคู่วิ่งผ่าน Cloudflare Tunnel เข้าเครื่อง RM009 (เว็บพอร์ต 3300 · Autopost พอร์ต 3100)

## ตั้งครั้งแรก (ทำตามลำดับ)

1. **RM009 → แผง SO Workers → อัปเดตโค้ด** (กดตอน Autopost ไม่ได้โพสต์อยู่) แผงใหม่จะมีสวิตช์แถวที่ 3 "เว็บ So Scraping"
2. **สร้างไฟล์ `web\.env.local` ในโฟลเดอร์ api-scraper บน RM009** คัดลอกค่าจาก Vercel → โปรเจกต์ so-scraping → Settings → Environment Variables (Production) ครบทุกตัวด้านล่าง ยกเว้น 2 บรรทัดแรกที่ต้องใช้ค่าใหม่
   ```
   NEXTAUTH_URL=https://api-scraper.sosiamraj.com
   AUTOPOST_URL=https://so-autopost.sosiamraj.com
   NEXTAUTH_SECRET=
   AZURE_AD_CLIENT_ID=
   AZURE_AD_CLIENT_SECRET=
   AZURE_AD_TENANT_ID=
   APP_ENCRYPTION_KEY=
   PGHOST=
   PGPORT=
   PGUSER=
   PGPASSWORD=
   PGDATABASE=
   DB_SCHEMA=
   AUTOPOST_SCHEMA=
   AUTOPOST_ACCESS_TOKEN=
   JARVIS_INTEGRATION_KEY=
   REPAIR_TOKEN=
   SCRAPE_PREFERRED_WORKER=
   ```
   ค่าว่างใน Vercel ก็เว้นว่างไว้ · ห้ามส่งไฟล์นี้ทางแชท · แผงอัปเดตโค้ดไม่ลบไฟล์นี้
3. **แผง SO Workers → สวิตช์ "เว็บ So Scraping" → เปิด** ครั้งแรกติดตั้งแพ็กเกจ + build ราว 10 นาที ดูความคืบหน้าที่ปุ่ม "เปิดไฟล์ log" → `web-host.log`
   เสร็จแล้วจะมีบรรทัด `เว็บตอบแล้ว (HTTP 200)` · ค่าในไฟล์ขาด = log บอกชื่อค่าที่ขาด แก้ไฟล์แล้วรอ 1 นาที
4. **Cloudflare → Zero Trust → Networks → Tunnels → tunnel ของ RM009 → Public Hostname**
   - แก้ `api-scraper.sosiamraj.com` → Service `HTTP` · URL `localhost:3300`
   - เพิ่ม `so-autopost.sosiamraj.com` → Service `HTTP` · URL `localhost:3100`
   - ปิดหน้าต่าง `npm run api` ตัวเดิมที่ตอบ `/health` (ตัวนั้นเปิดดูข้อมูลผู้สมัครได้โดยไม่ต้องล็อกอิน)
5. **Azure portal → App registrations → แอปที่ใช้ล็อกอิน So Scraping → Authentication → Add URI**
   `https://api-scraper.sosiamraj.com/api/auth/callback/azure-ad` → Save (ไม่ใส่ = ล็อกอินแล้วขึ้น error redirect_uri)
6. **Jarvis → ตั้งค่า → เชื่อมระบบภายนอก → การ์ด So Scraping**
   ช่อง URL ใส่ `https://api-scraper.sosiamraj.com` · ช่อง key วางค่า `JARVIS_INTEGRATION_KEY` ตัวเดิม (ปุ่มบันทึกกดได้เมื่อมี key) → ทดสอบ → บันทึก
7. **ทดสอบ** เปิด https://api-scraper.sosiamraj.com → ล็อกอิน → เปิดหน้า Autopost รายงาน / เก็บคอมเมนต์ (เป็นหน้าที่ฝัง Autopost) → ใน Jarvis กดดูตัวเลือกโพสต์ของใบขอสักใบ
8. ใช้ได้ครบสักสองสามวันแล้วค่อยปิดโปรเจกต์ so-scraping / so-autopost บน Vercel (อย่าลบ เก็บไว้ถอยกลับ)

## หลังย้ายแล้ว

- **push ขึ้น GitHub ไม่ได้ขึ้นเว็บทันทีแล้ว** ต้องกด "อัปเดตโค้ด" บน RM009 (หรือปุ่มอัปเดตเครื่องในหน้าเว็บ) เว็บจะ build รุ่นใหม่เองภายใน 1 นาทีหลังโค้ดเปลี่ยน ใช้เวลาราว 3–5 นาที ระหว่างนั้นเว็บเดิมยังเปิดอยู่ แล้วสลับ ดับไม่กี่วินาที
- build ไม่ผ่าน = เว็บรุ่นเดิมเปิดต่อ log จด `build โค้ด … ไม่ผ่าน` รายละเอียดอยู่ `web-build.log` แก้โค้ดแล้วอัปเดตใหม่
- แพ็กเกจเว็บเปลี่ยน (web/package-lock.json) ต้องติดตั้งใหม่ เว็บดับราว 5–10 นาที
- เว็บดับ / โปรแกรมปิดเอง → เปิดใหม่ใน 5 วินาที · หน้าต่างทั้งตัวปิด → แผงเปิดใหม่ใน 10 วินาที · RM009 ปิดเครื่อง = เว็บดับ
- เว็บไม่เปิด worker เอง และเซิร์ฟเวอร์ Autopost ไม่เปิด Chrome — กดโพสต์ = เข้าคิวในฐานให้ worker รับไปทำเหมือนเดิม
