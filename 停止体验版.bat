@echo off
chcp 65001 >nul
rem Work outside the app directory so this window cannot lock it.
cd /d "%TEMP%" 2>nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\stop_preview.ps1"
exit /b

