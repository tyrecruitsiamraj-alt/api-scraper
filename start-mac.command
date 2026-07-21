#!/bin/bash
# ============================================================
#  SO Recruitment - เปิด Worker บน Mac (ทำทุกอย่างให้อัตโนมัติ)
#  ผู้ใช้แค่ "ดับเบิลคลิกไฟล์นี้" — ไม่ต้องแก้อะไรเอง
#    1) ดึงโค้ดล่าสุด (git pull)
#    2) ตั้งค่า .env ให้ถูก (ชี้ so-autopost + schema ใหม่) อัตโนมัติ
#    3) เปิด Scraper + AutoPost + กันเครื่องหลับ 24 ชม.
# ============================================================
cd "$(dirname "$0")" || exit 1
ROOT="$PWD"

echo "=================================================="
echo "  SO Recruitment - เปิด Worker (Mac)"
echo "=================================================="

echo "[1/3] อัปเดตโค้ดล่าสุด (git pull)..."
git pull

# --- ฟังก์ชันตั้งค่า .env แบบไม่ทับค่าอื่น (รันซ้ำได้ปลอดภัย) ---
set_env() {
  local f="$1" k="$2" v="$3"
  if [ ! -f "$f" ]; then
    echo "  ⚠️  ไม่พบไฟล์ $f — เครื่องนี้ยังไม่ได้ติดตั้ง kit ให้ครบ (ต้องมี .env ที่มีรหัส DB)"
    return
  fi
  if grep -q "^${k}=" "$f"; then
    grep -v "^${k}=" "$f" > "$f.tmp" && printf '%s=%s\n' "$k" "$v" >> "$f.tmp" && mv -f "$f.tmp" "$f"
  else
    printf '%s=%s\n' "$k" "$v" >> "$f"
  fi
  echo "  ✓ $f : $k=$v"
}

echo "[2/3] ตั้งค่าให้ชี้ so-autopost (schema แยกของเรา)..."
set_env "$ROOT/autopost/.env" DB_SCHEMA so_autopost_apiscraper
set_env "$ROOT/autopost/.env" WORKER_API_BASE https://so-autopost.vercel.app
set_env "$ROOT/.env" AUTOPOST_SCHEMA so_autopost_apiscraper
# caption ใช้ Ollama บริษัท (ฟรี ประหยัด token) — OPENAI key บนเครื่องนี้มีไว้สร้างรูปอย่างเดียว
# (ไม่ตั้ง = auto-select จะเห็น OPENAI_API_KEY แล้วสลับไปใช้ GPT ซึ่งเสียเงิน)
set_env "$ROOT/.env" CONTENT_TEXT_PROVIDER ollama

echo "[3/3] เปิด Worker 2 หน้าต่าง (กันเครื่องหลับด้วย caffeinate)..."
osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "cd " & quoted form of "$ROOT" & " && caffeinate -is npm run scraper:pool"
  do script "cd " & quoted form of "$ROOT/autopost" & " && npm run worker:post"
end tell
APPLESCRIPT

echo ""
echo "--------------------------------------------------"
echo "  ✅ เปิดแล้ว 2 หน้าต่าง: Scraper Pool + AutoPost"
echo "  *** ห้ามปิด 2 หน้าต่างนั้น ระหว่างใช้งาน ***"
echo "  (หน้าต่างนี้ปิดได้เลย)"
echo "--------------------------------------------------"
