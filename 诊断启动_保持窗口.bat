@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%TEMP%" 2>nul
echo ============================================================
echo Qicaizhice - Local Application - startup diagnostics (window stays open)
echo ============================================================
echo.
call "%~dp0启动体验版.bat"
set "QZ_EXIT=%ERRORLEVEL%"
echo.
echo [INFO] Startup process exited with code %QZ_EXIT%.
echo [INFO] This window will remain open so you can copy the error.
echo Press any key to close this window.
pause >nul
endlocal & exit /b %QZ_EXIT%

