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

REM Scraper runner - เปิด 2 ตัว = scrape ขนานกันได้ 2 บัญชี (JobBKK + JobThai พร้อมกัน)
REM runner 1 ตัว = 1 งาน/ครั้ง; มี lock ต่อบัญชีกันชนกัน คนละบัญชีจึงวิ่งพร้อมกันได้
REM ถ้ามีบัญชี scrape มากกว่า 2 และอยากขนานเพิ่ม ก็ก็อปบรรทัด start เพิ่มได้
start "SO Scraper #1 (worker:pool)" cmd /k "cd /d %~dp0 && npm run worker:pool"
start "SO Scraper #2 (worker:pool)" cmd /k "cd /d %~dp0 && npm run worker:pool"

REM AutoPost worker (โพสต์ Facebook) - มี supervisor + ขนานหลายบัญชีในตัวเองแล้ว (WORKER_CONCURRENCY)
start "SO AutoPost Worker (worker:post)" cmd /k "cd /d %~dp0autopost && npm run worker:post"

echo.
echo --------------------------------------------------
echo  เปิดแล้ว 3 หน้าต่าง: Scraper x2 + AutoPost x1
echo  (Scraper 2 ตัว = JobBKK/JobThai วิ่งพร้อมกันได้)
echo  *** ห้ามปิดหน้าต่างเหล่านั้น ระหว่างใช้งาน ***
echo  (หน้าต่างนี้ปิดได้เลย)
echo --------------------------------------------------
echo.
pause
