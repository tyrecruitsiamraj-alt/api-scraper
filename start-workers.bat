@echo off
chcp 65001 >nul
title SO Workers
cd /d "%~dp0"

REM ค่าเริ่มต้น = แผงสวิตช์ (ไม่เปิด terminal รก)
REM ถ้าอยากเปิดแบบเก่าที่มีหน้าต่าง cmd: start-workers.bat legacy

if /I "%~1"=="legacy" (
  call "%~dp0start-workers-legacy.bat"
  exit /b %ERRORLEVEL%
)

call "%~dp0SO-Workers.bat"
exit /b %ERRORLEVEL%
