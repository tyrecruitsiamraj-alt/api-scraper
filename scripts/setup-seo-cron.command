#!/bin/bash
# ติดตั้ง cron งานประจำสัปดาห์อัตโนมัติทุกวันจันทร์ บน Mac (worker 24 ชม.):
#   08:30 SEO trend · 08:45 best-time · 09:00 สำรวจเทรนด์จากกลุ่ม FB (trend-discover, headless)
# ใช้: ดับเบิลคลิกไฟล์นี้บน Mac ครั้งเดียว (รันซ้ำได้ ไม่ซ้ำซ้อน) — log ที่ output/*.log
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "❌ ไม่พบ node ใน PATH — ติดตั้ง Node.js ก่อน"; read -r -p "กด Enter เพื่อปิด..."; exit 1
fi
mkdir -p "$ROOT/output"

LINE="30 8 * * 1 cd $ROOT && $NODE scripts/seo-update.mjs >> $ROOT/output/seo-update.log 2>&1"
LINE2="45 8 * * 1 cd $ROOT && $NODE scripts/best-time-update.mjs >> $ROOT/output/best-time.log 2>&1"
# trend-discover: cron ไม่มีจอ → บังคับ headless (TREND_HEADLESS=1). ถ้า FB บล็อก headless
# ค่อยรันมือผ่านแผง so-control T→1 (headful) แทน. หมุน 6 กลุ่ม/รอบ วนครบข้ามสัปดาห์
LINE3="0 9 * * 1 cd $ROOT && TREND_HEADLESS=1 $NODE scripts/trend-discover.mjs >> $ROOT/output/trend-discover.log 2>&1"

# เอาบรรทัดเก่าออกก่อน (กันซ้ำ/path เปลี่ยน) แล้วใส่ใหม่ทั้งหมด
( crontab -l 2>/dev/null | grep -v 'seo-update.mjs' | grep -v 'best-time-update.mjs' | grep -v 'trend-discover.mjs' ; echo "$LINE" ; echo "$LINE2" ; echo "$LINE3" ) | crontab -

echo "✓ ติดตั้งแล้ว (ทุกวันจันทร์): SEO 08:30 + Best-time 08:45 + สำรวจเทรนด์ 09:00"
echo "  $LINE"
echo "  $LINE2"
echo "  $LINE3"
echo
echo "ทดสอบรันทันที 1 ครั้ง? (ใช้ Ollama ~2-3 นาที)"
read -r -p "พิมพ์ y แล้ว Enter เพื่อรันเลย / Enter เฉย ๆ เพื่อข้าม: " RUN_NOW
if [ "$RUN_NOW" = "y" ]; then
  cd "$ROOT" && "$NODE" scripts/seo-update.mjs
fi
read -r -p "เสร็จแล้ว — กด Enter เพื่อปิด..."
