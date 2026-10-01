@echo off
chcp 65001 >nul
title SO Workers
cd /d "%~dp0"
set "ROOT=%CD%"

REM ============================================================
REM  ดับเบิลคลิก = ดึงโค้ด แล้วเปิดแผงสวิตช์ (ไม่เปิด terminal รก)
REM  โหมดเก่า: start-workers.bat legacy
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

REM กัน bat เขียนทับตัวเองกลางทาง: pull ก่อน แล้วค่อยเปิดตัวใหม่
if /I not "%~1"=="--open" (
  echo [1/2] ดึงโค้ดล่าสุดจาก main...
  git fetch origin main
  if errorlevel 1 (
    echo   git fetch ไม่สำเร็จ — เปิดแผงด้วยโค้ดที่มีอยู่
  ) else (
    git checkout -B main origin/main
    if errorlevel 1 git reset --hard origin/main
    if not errorlevel 1 git reset --hard origin/main
    git clean -fd >nul 2>&1
    echo   ใช้โค้ด:
    git rev-parse --short HEAD
  )
  echo.
  echo [2/2] เปิดแผงสวิตช์ Worker...
  REM เปิดจากไฟล์ล่าสุดหลัง pull — ไม่ใช้บรรทัดที่เหลือของ bat เก่า
  cmd /c ""%~f0" --open"
  set "EC=%ERRORLEVEL%"
  if not "%EC%"=="0" (
    echo.
    echo เปิดแผงไม่สำเร็จ code=%EC%
    pause
  )
  exit /b %EC%
)

REM ---- --open: เปิดแผงอย่างเดียว ----
if exist "%ROOT%\scripts\so-worker-control.ps1" (
  powershell -NoProfile -STA -ExecutionPolicy Bypass -File "%ROOT%\scripts\so-worker-control.ps1"
  set "EC=%ERRORLEVEL%"
  if not "%EC%"=="0" (
    echo.
    echo PowerShell แผงสวิตช์จบด้วย error code=%EC%
    echo ถ้าไม่เห็นหน้าต่างสวิตช์ ดูข้อความด้านบน หรือรัน:
    echo   powershell -STA -ExecutionPolicy Bypass -File scripts\so-worker-control.ps1
    pause
  )
  exit /b %EC%
)

if exist "%ROOT%\SO-Workers.bat" (
  call "%ROOT%\SO-Workers.bat"
  exit /b %ERRORLEVEL%
)

echo ไม่พบแผงสวิตช์ — เปิดแบบเก่าชั่วคราว
pause
call "%ROOT%\start-workers-legacy.bat"
exit /b %ERRORLEVEL%
