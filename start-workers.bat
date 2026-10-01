@echo off
chcp 65001 >nul
title SO Workers
cd /d "%~dp0"
set "ROOT=%CD%"

REM ============================================================
REM  ดับเบิลคลิกไฟล์นี้ = แผงสวิตช์เปิด/ปิด (ไม่เปิด terminal รก)
REM  โหมดเก่ามีหน้าต่างดำ: start-workers.bat legacy
REM ============================================================

if /I "%~1"=="legacy" (
  call "%~dp0start-workers-legacy.bat"
  exit /b %ERRORLEVEL%
)

if not exist "%ROOT%\package.json" (
  echo โฟลเดอร์ผิด — ต้องอยู่ที่รากโปรเจกต์ api-scraper
  pause
  exit /b 1
)

echo [1/2] ดึงโค้ดล่าสุดจาก main...
git fetch origin main
if errorlevel 1 (
  echo   git fetch ไม่สำเร็จ — เปิดแผงด้วยโค้ดที่มีอยู่
  goto :open_panel
)
git checkout -B main origin/main >nul 2>&1
if errorlevel 1 (
  git reset --hard origin/main
) else (
  git reset --hard origin/main
)
git clean -fd >nul 2>&1

REM หลัง git reset ไฟล์ .bat นี้อาจถูกแทนที่ — เปิดแผงจากพาธที่แน่นอน
goto :open_panel

:open_panel
echo [2/2] เปิดแผงสวิตช์ Worker...
if exist "%ROOT%\SO-Workers.bat" (
  call "%ROOT%\SO-Workers.bat"
  exit /b %ERRORLEVEL%
)
if exist "%ROOT%\scripts\so-worker-control.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\so-worker-control.ps1"
  exit /b %ERRORLEVEL%
)

echo.
echo ยังไม่มีแผงสวิตช์ในโค้ดนี้ — กำลังเปิดแบบเก่าชั่วคราว
echo กรุณา merge PR แผงสวิตช์เข้า main แล้วกด start-workers อีกครั้ง
echo.
call "%ROOT%\start-workers-legacy.bat"
exit /b %ERRORLEVEL%
