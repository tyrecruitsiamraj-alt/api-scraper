@echo off
chcp 65001 >nul
title SO Recruitment - Start Workers
cd /d "%~dp0"
set "ROOT=%CD%"

echo ==================================================
echo   SO Recruitment - เปิด Worker (Windows)
echo   โฟลเดอร์: %ROOT%
echo ==================================================
echo.

if not exist "%ROOT%\package.json" (
  echo   โฟลเดอร์ผิด — ต้องอยู่ที่รากโปรเจกต์ api-scraper
  echo   ที่มีไฟล์ package.json กับ start-workers.bat
  pause
  exit /b 1
)

echo [1/3] ไปสาขา main แล้วดึงโค้ดล่าสุด...
git checkout main
if errorlevel 1 (
  echo   git checkout main ไม่สำเร็จ
  pause
  exit /b 1
)
git pull --ff-only origin main
if errorlevel 1 (
  echo   git pull ไม่สำเร็จ
  pause
  exit /b 1
)
for /f %%i in ('git rev-parse --short HEAD') do set "WORKER_BUILD_SHA=%%i"
echo   ใช้โค้ด %WORKER_BUILD_SHA%
echo.

echo [2/3] หยุด Worker รุ่นเก่า...
if exist "%ROOT%\scripts\stop-windows-workers.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\stop-windows-workers.ps1"
)
timeout /t 2 /nobreak >nul
echo.

echo [3/3] เปิด Worker 2 หน้าต่าง...
set "WORKER_BUILD_SHA=%WORKER_BUILD_SHA%"
set "WORKER_CAPABILITIES=post,preflight"
set "AUTO_POST_DAILY_ENABLED=0"

REM ห้ามใส่ quote ซ้อนใน cmd /k — จะทำให้หน้าต่างไม่เปิด
start "SO Scraper Pool (auto-scale)" cmd /k cd /d "%ROOT%" ^&^& npm run scraper:pool
start "SO AutoPost Worker (worker:post)" cmd /k cd /d "%ROOT%\autopost" ^&^& npm run worker:post

echo.
echo --------------------------------------------------
echo  ต้องเด้ง 2 หน้าต่างบนทาสก์บาร์:
echo    - SO Scraper Pool (auto-scale)
echo    - SO AutoPost Worker (worker:post)
echo  ถ้าไม่เห็น กด Alt+Tab
echo  รหัสโค้ด: %WORKER_BUILD_SHA%
echo  หน้าต่างนี้ปิดได้หลังเห็น 2 หน้าต่างแล้ว
echo --------------------------------------------------
echo.
pause
exit /b 0
