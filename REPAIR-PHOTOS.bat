@echo off
chcp 65001 >nul
title SO Repair Profile Photos
cd /d "%~dp0"

echo ========================================
echo  ซ่อมรูปโปรไฟล์ทั้งฐาน
echo  1) ทิ้งรูป default/เก่าซ้ำ
echo  2) ดึงรูปใหม่จาก JobBKK/JobThai
echo ========================================
echo.

if not exist "%CD%\package.json" (
  echo โฟลเดอร์ผิด — วางไว้ที่ราก api-scraper
  pause
  exit /b 1
)
if not exist "%CD%\.env" (
  echo ไม่พบ .env — ต้องมี PGHOST/PGPASSWORD + APP_ENCRYPTION_KEY
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

echo [2/2] รันซ่อมรูปทั้งหมด (ใช้เวลานานได้ — เปิด browser login)...
node scripts/repair-profile-photos.mjs
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo repair photos ล้มเหลว code=%ERR%
  pause
  exit /b %ERR%
)

echo เสร็จแล้ว
pause
exit /b 0
