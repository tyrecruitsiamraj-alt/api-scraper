#!/bin/bash
# ติดตั้ง cron รัน SEO Trend Update อัตโนมัติทุกวันจันทร์ 08:30 บนเครื่อง Mac (worker 24 ชม.)
# ใช้: ดับเบิลคลิกไฟล์นี้บน Mac ครั้งเดียว (รันซ้ำได้ ไม่ซ้ำซ้อน) — log ที่ output/seo-update.log
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "❌ ไม่พบ node ใน PATH — ติดตั้ง Node.js ก่อน"; read -r -p "กด Enter เพื่อปิด..."; exit 1
fi
mkdir -p "$ROOT/output"

LINE="30 8 * * 1 cd $ROOT && $NODE scripts/seo-update.mjs >> $ROOT/output/seo-update.log 2>&1"
LINE2="45 8 * * 1 cd $ROOT && $NODE scripts/best-time-update.mjs >> $ROOT/output/best-time.log 2>&1"

# เอาบรรทัดเก่าออกก่อน (กันซ้ำ/path เปลี่ยน) แล้วใส่ใหม่ทั้งคู่
( crontab -l 2>/dev/null | grep -v 'seo-update.mjs' | grep -v 'best-time-update.mjs' ; echo "$LINE" ; echo "$LINE2" ) | crontab -

echo "✓ ติดตั้งแล้ว: SEO จันทร์ 08:30 + Best-time จันทร์ 08:45"
echo "  $LINE"
echo "  $LINE2"
echo
echo "ทดสอบรันทันที 1 ครั้ง? (ใช้ Ollama ~2-3 นาที)"
read -r -p "พิมพ์ y แล้ว Enter เพื่อรันเลย / Enter เฉย ๆ เพื่อข้าม: " RUN_NOW
if [ "$RUN_NOW" = "y" ]; then
  cd "$ROOT" && "$NODE" scripts/seo-update.mjs
fi
read -r -p "เสร็จแล้ว — กด Enter เพื่อปิด..."
