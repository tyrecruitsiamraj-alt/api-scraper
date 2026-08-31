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
echo.
echo [2/2] กำลังเปิด Worker 2 หน้าต่าง...

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
