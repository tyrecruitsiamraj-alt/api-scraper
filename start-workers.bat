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

REM Scraper runner (รับงาน scrape JobBKK/JobThai) - วนรับงานตลอด
start "SO Scraper Worker (worker:pool)" cmd /k "cd /d %~dp0 && npm run worker:pool"

REM AutoPost worker (โพสต์ Facebook) - มี supervisor รีสตาร์ทเองเมื่อล่ม
start "SO AutoPost Worker (worker:post)" cmd /k "cd /d %~dp0autopost && npm run worker:post"

echo.
echo --------------------------------------------------
echo  เปิดแล้ว 2 หน้าต่าง: Scraper + AutoPost
echo  *** ห้ามปิด 2 หน้าต่างนั้น ระหว่างใช้งาน ***
echo  (หน้าต่างนี้ปิดได้เลย)
echo --------------------------------------------------
echo.
pause
