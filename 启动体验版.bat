@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
set "QZ_ROOT=%~dp0"
cd /d "%TEMP%" 2>nul
if errorlevel 1 cd /d "%SystemRoot%"
echo ============================================================
echo Qicaizhice - Local Application - Windows local preview
echo ============================================================
echo Default: use installed Node.js or Python, the Windows-tested path.
echo Portable bootstrap is OPTIONAL via "启动_独立环境版.bat".
echo Local project data is NOT stored inside this program folder.
echo.
if not exist "%QZ_ROOT%启动_兼容环境版.bat" goto missing
if not exist "%QZ_ROOT%server.mjs" goto missing
call "%QZ_ROOT%启动_兼容环境版.bat"
set "QZ_EXIT=%ERRORLEVEL%"
if "%QZ_EXIT%"=="0" goto finished
echo.
echo [ERROR] The local preview could not start. Exit code %QZ_EXIT%.
echo [HELP] For diagnostics run "诊断启动_保持窗口.bat".
echo [HELP] If no supported Node.js/Python is installed, use "启动_独立环境版.bat".
goto error
:missing
set "QZ_EXIT=2"
echo [ERROR] Application files missing. Fully extract the ZIP first.
:error
echo.
echo Press any key to close this error window.
pause >nul
endlocal & exit /b %QZ_EXIT%
:finished
endlocal & exit /b 0

