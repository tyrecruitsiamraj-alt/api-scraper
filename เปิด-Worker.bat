@echo off
REM ไฟล์นี้ชื่อไทยให้หาเจอง่ายบน Windows — เปิดแผงสวิตช์ Worker
cd /d "%~dp0"
call "%~dp0start-workers.bat" --open
