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

REM แผงสวิตช์เปิด/ปิด Worker — ไม่เปิด terminal รก
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\so-worker-control.ps1"
exit /b %ERRORLEVEL%
