@echo off
chcp 65001 >nul
title SO Recruitment - Start Workers
cd /d "%~dp0"

echo ==================================================
echo   SO Recruitment - เปิด Worker (Scraper + AutoPost)
echo ==================================================
echo.

echo [1/3] ไปสาขา main แล้วดึงโค้ดล่าสุด...
git checkout main
if errorlevel 1 (
  echo   ไม่สามารถเปลี่ยนไปสาขา main ได้
  echo   เปิด CMD ในโฟลเดอร์นี้ แล้วรัน: git status
  pause
  exit /b 1
)
git pull --ff-only origin main
if errorlevel 1 (
  echo   ดึงโค้ดไม่สำเร็จ
  pause
  exit /b 1
)
for /f %%i in ('git rev-parse --short HEAD') do set "WORKER_BUILD_SHA=%%i"
echo   ใช้โค้ด %WORKER_BUILD_SHA%
echo.

echo [2/3] หยุด Worker รุ่นเก่า...
if exist "%~dp0scripts\stop-windows-workers.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-windows-workers.ps1"
) else (
  echo   ไม่พบสคริปต์หยุดของเก่า — ข้ามขั้นนี้
)
timeout /t 2 /nobreak >nul
echo   หยุดของเก่าแล้ว
echo.

echo [3/3] เปิด Worker 2 หน้าต่าง...
set "WORKER_CAPABILITIES=post,preflight"
set "AUTO_POST_DAILY_ENABLED=0"

start "SO Scraper Pool (auto-scale)" cmd /k "cd /d "%~dp0" && echo SO Scraper Pool && npm run scraper:pool & echo. & echo ถ้าจบเองแปลว่าพัง — ดู error ด้านบน & pause"
start "SO AutoPost Worker (worker:post)" cmd /k "cd /d "%~dp0autopost" && echo SO AutoPost Worker && npm run worker:post & echo. & echo ถ้าจบเองแปลว่าพัง — ดู error ด้านบน & pause"

echo.
echo --------------------------------------------------
echo  ต้องเด้งขึ้นมา 2 หน้าต่าง:
echo    1) SO Scraper Pool (auto-scale)
echo    2) SO AutoPost Worker (worker:post)
echo  ถ้าไม่เห็น: กด Alt+Tab หา หรือดูทาสก์บาร์
echo  รหัสโค้ด: %WORKER_BUILD_SHA%
echo  หน้าต่างนี้กดปุ่มอะไรก็ได้เพื่อปิดได้
echo --------------------------------------------------
echo.
pause
exit /b 0
