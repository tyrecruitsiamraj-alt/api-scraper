#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export LANG=th_TH.UTF-8

echo "========================================"
echo " ซ่อมรูปโปรไฟล์ทั้งฐาน"
echo " 1) ทิ้งรูป default/เก่าซ้ำ"
echo " 2) ดึงรูปใหม่จาก JobBKK/JobThai"
echo "========================================"
echo

if [[ ! -f package.json ]]; then
  echo "โฟลเดอร์ผิด — วางไว้ที่ราก api-scraper"
  read -r -p "กด Enter เพื่อปิด..."
  exit 1
fi
if [[ ! -f .env ]]; then
  echo "ไม่พบ .env — ต้องมี PGHOST/PGPASSWORD + APP_ENCRYPTION_KEY"
  read -r -p "กด Enter เพื่อปิด..."
  exit 1
fi

echo "[1/2] ดึงโค้ด origin/main..."
git fetch origin main
git checkout -B main origin/main
git reset --hard origin/main
git rev-parse --short HEAD
echo

echo "[2/2] รันซ่อมรูปทั้งหมด (ใช้เวลานานได้ — เปิด browser login)..."
node scripts/repair-profile-photos.mjs
echo
echo "เสร็จแล้ว"
read -r -p "กด Enter เพื่อปิด..."
