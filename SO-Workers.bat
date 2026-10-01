@echo off
chcp 65001 >nul
title SO Workers
cd /d "%~dp0"

if not exist "%~dp0package.json" (
  echo โฟลเดอร์ผิด — ต้องอยู่ที่รากโปรเจกต์ api-scraper
  pause
  exit /b 1
)

if not exist "%~dp0scripts\so-worker-control.ps1" (
  echo ไม่พบ scripts\so-worker-control.ps1 — ลอง git pull ก่อน
  pause
  exit /b 1
)

REM -STA จำเป็นต่อ WinForms — ถ้าไม่มี แผงจะพังแล้วหน้าต่างหายไปทันที
powershell -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0scripts\so-worker-control.ps1"
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo เปิดแผงสวิตช์ไม่สำเร็จ code=%EC%
  pause
)
exit /b %EC%
