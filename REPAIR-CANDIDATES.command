#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export LANG=th_TH.UTF-8

echo "========================================"
echo " ซ่อม Resume: คำนำหน้า + ประสบการณ์ + รูปโปรไฟล์"
echo " (จาก raw_text/OCR ที่มีอยู่ — ไม่เดาค่า)"
echo " รูป: คงใบหน้าใหม่สุดต่อคน ซ่อนรูปเก่าจากการ merge"
echo "========================================"
echo

if [[ ! -f package.json ]]; then
  echo "โฟลเดอร์ผิด — วางไว้ที่ราก api-scraper"
  read -r -p "กด Enter เพื่อปิด..."
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "ไม่พบ .env — ต้องมี PGHOST/PGPASSWORD"
  read -r -p "กด Enter เพื่อปิด..."
  exit 1
fi

echo "[1/2] ดึงโค้ด origin/main..."
git fetch origin main
git checkout -B main origin/main
git reset --hard origin/main
git rev-parse --short HEAD
echo

echo "[2/2] รัน repair (วนจนหมดคิว)..."
node scripts/repair-incomplete-candidates.mjs
echo
echo "เสร็จแล้ว"
read -r -p "กด Enter เพื่อปิด..."
