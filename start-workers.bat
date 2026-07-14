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

REM Scraper POOL - นับบัญชี JobBKK/JobThai อัตโนมัติ แล้วเปิด runner ให้พอดี (ขนานข้ามบัญชี)
REM เพิ่มบัญชีในอนาคต = ขยาย runner เองไม่ต้องแก้อะไร (เพดาน SCRAPER_POOL_MAX, default 8)
start "SO Scraper Pool (auto-scale)" cmd /k "cd /d %~dp0 && npm run scraper:pool"

REM AutoPost worker (โพสต์ Facebook) - มี supervisor + ขนานหลายบัญชีในตัวเองแล้ว (WORKER_CONCURRENCY)
start "SO AutoPost Worker (worker:post)" cmd /k "cd /d %~dp0autopost && npm run worker:post"

echo.
echo --------------------------------------------------
echo  เปิดแล้ว 2 หน้าต่าง: Scraper Pool + AutoPost
echo  (Scraper Pool ปรับจำนวน runner ตามบัญชีเองอัตโนมัติ)
echo  *** ห้ามปิดหน้าต่างเหล่านั้น ระหว่างใช้งาน ***
echo  (หน้าต่างนี้ปิดได้เลย)
echo --------------------------------------------------
echo.
pause
