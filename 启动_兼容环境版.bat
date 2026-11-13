@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "QZ_ROOT=%~dp0"
if not exist "%QZ_ROOT%server.mjs" if not exist "%QZ_ROOT%run_preview.py" goto missing
rem Do not hold the extracted application folder as the CMD working directory.
cd /d "%TEMP%" 2>nul
if errorlevel 1 cd /d "%SystemRoot%"
echo ============================================================
echo Qicaizhice - Local Application Local Preview
echo ============================================================
echo Starting locally. Close with Ctrl+C or run Stop Preview BAT.
echo This window will automatically close after normal shutdown.
echo.
where node >nul 2>nul
if not errorlevel 1 (
  node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" >nul 2>nul
  if not errorlevel 1 goto node
  echo [INFO] Node.js is too old for the local SQLite service; trying Python.
)
where py >nul 2>nul
if not errorlevel 1 goto py
where python >nul 2>nul
if not errorlevel 1 goto python
echo [ERROR] Need Node.js 22.13+ or Python 3.10+.
echo [HELP] Use "启动_独立环境版.bat" to prepare isolated Node and Python, or see 新用户上手与数据安全.md.
goto error
:node
node "%QZ_ROOT%server.mjs"
if not errorlevel 1 goto finished
echo [WARN] Node could not launch; attempting Python fallback if installed.
where py >nul 2>nul
if not errorlevel 1 goto py
where python >nul 2>nul
if not errorlevel 1 goto python
goto error
:py
py -3 "%QZ_ROOT%run_preview.py"
if errorlevel 1 goto error
goto finished
:python
python "%QZ_ROOT%run_preview.py"
if errorlevel 1 goto error
goto finished
:missing
echo [ERROR] Cannot find preview server. Please extract the full ZIP.
goto error
:error
echo.
echo [ERROR] Startup failed. Screenshot the error above if needed.
echo Press any key to close the error window.
pause >nul
endlocal & exit /b 1
:finished
endlocal & exit /b 0

