@echo off
chcp 65001 >nul
title SO Repair Candidates
cd /d "%~dp0"

echo ========================================
echo  ซ่อม Resume: คำนำหน้า + ประสบการณ์ทำงาน
echo  (จาก raw_text/OCR ที่มีอยู่ — ไม่เดาค่า)
echo ========================================
echo.

if not exist "%CD%\package.json" (
  echo โฟลเดอร์ผิด — วางไว้ที่ราก api-scraper
  pause
  exit /b 1
)

if not exist "%CD%\.env" (
  echo ไม่พบ .env — ต้องมี PGHOST/PGPASSWORD
  pause
  exit /b 1
)

echo [1/2] ดึงโค้ด origin/main...
git fetch origin main
if errorlevel 1 (
  echo git fetch ไม่สำเร็จ
  pause
  exit /b 1
)
git checkout -B main origin/main
git reset --hard origin/main
git rev-parse --short HEAD
echo.

echo [2/2] รัน repair (วนจนหมดคิว)...
node scripts/repair-incomplete-candidates.mjs
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo repair ล้มเหลว code=%ERR%
  pause
  exit /b %ERR%
)

echo เสร็จแล้ว
pause
exit /b 0
