@echo off
chcp 65001 >nul
title SO Recruitment - Start Workers
cd /d "%~dp0"

echo ==================================================
echo   SO Recruitment - เปิด Worker (Scraper + AutoPost)
echo ==================================================
echo.
echo [1/2] อัปเดตโค้ดล่าสุดจาก GitHub (git pull)...
git pull
if defined SO_WORKERS_RELOADED goto :run

echo.
echo   สลับไป main แล้วดึงโค้ดให้ตรง origin...
git checkout main
if errorlevel 1 (
  echo   ไม่สามารถเปลี่ยนไปสาขา main ได้ — จะไม่เปิด Worker เก่า
  pause
  exit /b 1
)
git pull --ff-only origin main
if errorlevel 1 goto :pull_failed
for /f %%i in ('git rev-parse HEAD') do set "PULLED_SHA=%%i"
for /f %%i in ('git rev-parse origin/main') do set "REMOTE_SHA=%%i"
if not defined PULLED_SHA goto :pull_failed
if not "%PULLED_SHA%"=="%REMOTE_SHA%" goto :pull_failed
echo   ใช้โค้ด %PULLED_SHA%

REM เปิดไฟล์นี้ใหม่หลัง git pull เพื่อใช้สคริปต์ที่เพิ่งดึงมา
set "SO_WORKERS_RELOADED=1"
call "%~f0"
exit /b %ERRORLEVEL%

:run
echo.
echo [2/3] หยุด Worker รุ่นเก่า...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-windows-workers.ps1"
timeout /t 2 /nobreak >nul
echo   หยุดของเก่าแล้ว
echo.
echo [3/3] เปิด Worker 2 หน้าต่าง...

REM ประกาศ Build จริงที่กำลังรัน ห้ามฝัง SHA เก่าไว้ใน launcher เพราะหลัง
REM git pull แล้ว Dashboard จะเห็น Worker คนละรุ่นกับ Source ที่เปิดอยู่.
for /f %%i in ('git rev-parse HEAD') do set "WORKER_BUILD_SHA=%%i"

REM เครื่องนี้รับทั้งตรวจ Facebook และโพสต์ที่คนอนุมัติจากหน้า Web ได้
REM แต่ห้ามให้ worker สร้างรอบโพสต์อัตโนมัติเอง; Controlled Post ต้องมาจากงานที่คนอนุมัติเท่านั้น
set "WORKER_CAPABILITIES=post,preflight"
set "AUTO_POST_DAILY_ENABLED=0"

REM Scraper POOL - นับบัญชี JobBKK/JobThai อัตโนมัติ แล้วเปิด runner ให้พอดี (ขนานข้ามบัญชี)
REM เพิ่มบัญชีในอนาคต = ขยาย runner เองไม่ต้องแก้อะไร (เพดาน SCRAPER_POOL_MAX, default 8)
start "SO Scraper Pool (auto-scale)" cmd /k "cd /d %~dp0 && npm run scraper:pool"

REM AutoPost worker (โพสต์ Facebook) - มี supervisor + ขนานหลายบัญชีในตัวเองแล้ว (WORKER_CONCURRENCY)
start "SO AutoPost Worker (worker:post)" cmd /k "cd /d %~dp0autopost && npm run worker:post"

echo.
echo --------------------------------------------------
echo  เปิดแล้ว 2 หน้าต่าง: Scraper Pool + AutoPost
echo  (Scraper Pool ปรับจำนวน runner ตามบัญชีเองอัตโนมัติ)
echo  Worker compatibility release: %WORKER_BUILD_SHA%
echo  *** ห้ามปิดหน้าต่างเหล่านั้น ระหว่างใช้งาน ***
echo  (หน้าต่างนี้ปิดได้เลย)
echo --------------------------------------------------
echo.
pause
exit /b 0

:pull_failed
echo   ดึงโค้ดไม่สำเร็จหรือสาขายังไม่ตรง origin/main — จะไม่เปิด Worker เก่า
pause
exit /b 1
