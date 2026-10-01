@echo off
chcp 65001 >nul
title SO Update Scrap Now
cd /d "%~dp0"

echo ========================================
echo  ดึง main ล่าสุด + เปิด Scrap ใหม่
echo ========================================
echo.

if not exist "%CD%\package.json" (
  echo โฟลเดอร์ผิด — วางไว้ที่ราก api-scraper
  pause
  exit /b 1
)

echo [1/3] ดึงโค้ดจาก origin/main...
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

echo [2/3] ปิด Scrap เก่า...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'scraper-pool\.mjs|workers[/\\]runner\.js|npm.*scraper:pool|start-scrape\.cmd' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
timeout /t 2 /nobreak >nul
echo.

echo [3/3] เปิด Scrap ด้วยโค้ดใหม่...
if not exist "output\worker-logs" mkdir "output\worker-logs"
set "SHA="
for /f "delims=" %%i in ('git rev-parse --short HEAD') do set "SHA=%%i"
set "WORKER_BUILD_SHA=%SHA%"
set "LOG=%CD%\output\worker-logs\scrape-pool.log"
echo ==== %date% %time% UPDATE-SCRAPE-NOW sha=%SHA% ====>> "%LOG%"

REM เขียน launcher แล้ว start แบบย่อ — เหมือนแผงสวิตช์
> "%CD%\output\worker-logs\start-scrape.cmd" (
  echo @echo off
  echo chcp 65001 ^>nul
  echo cd /d "%CD%"
  echo set WORKER_BUILD_SHA=%SHA%
  echo title SO Scraper Pool ^(auto-scale^)
  echo call npm.cmd run scraper:pool
)
start "SO Scraper Pool (auto-scale)" /MIN "%CD%\output\worker-logs\start-scrape.cmd"

echo.
echo เสร็จแล้ว — โค้ด: %SHA%
echo ดู heartbeat ที่ so-scraping ว่า scraper-1/2 เป็น %SHA%
echo.
timeout /t 5 >nul
exit /b 0
