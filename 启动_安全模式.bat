@echo off
chcp 65001 >nul
cd /d "%TEMP%" 2>nul
set "QZ_SAFE_MODE=1"
call "%~dp0启动体验版.bat"
exit /b

