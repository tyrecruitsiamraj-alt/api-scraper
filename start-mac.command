#!/bin/bash
# ============================================================
#  SO Recruitment - เปิด Worker บน Mac (Scraper + AutoPost)
#  ดับเบิลคลิกไฟล์นี้เพื่อเริ่ม (เทียบเท่า start-workers.bat บน Windows)
#  - อัปเดตโค้ดล่าสุด (git pull)
#  - เปิด Scraper Pool + AutoPost Worker คนละหน้าต่าง
#  - caffeinate = กันเครื่องหลับ ตราบที่ worker ยังรัน (สำหรับรัน 24 ชม.)
# ============================================================
cd "$(dirname "$0")" || exit 1
ROOT="$PWD"

echo "=================================================="
echo "  SO Recruitment - เปิด Worker (Mac)"
echo "=================================================="
echo "[1/2] อัปเดตโค้ดล่าสุดจาก GitHub (git pull)..."
git pull
echo ""
echo "[2/2] กำลังเปิด Worker 2 หน้าต่าง..."

osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "cd " & quoted form of "$ROOT" & " && caffeinate -is npm run scraper:pool"
  do script "cd " & quoted form of "$ROOT/autopost" & " && npm run worker:post"
end tell
APPLESCRIPT

echo ""
echo "--------------------------------------------------"
echo "  เปิดแล้ว 2 หน้าต่าง: Scraper Pool + AutoPost"
echo "  *** ห้ามปิด 2 หน้าต่างนั้น ระหว่างใช้งาน ***"
echo "  (หน้านี้ปิดได้เลย)"
echo "--------------------------------------------------"
