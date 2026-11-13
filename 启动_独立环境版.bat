@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
set "QZ_ROOT=%~dp0"
cd /d "%TEMP%" 2>nul
if errorlevel 1 cd /d "%SystemRoot%"
echo ============================================================
echo Qicaizhice - Local Application - OPTIONAL portable runtime launcher
echo ============================================================
echo This launcher checks or downloads official Node.js and Python.
echo It will NOT replace a runtime after a failed execution check.
echo.
if not exist "%QZ_ROOT%tools\prepare_portable_runtime.ps1" goto missing
if not exist "%QZ_ROOT%server.mjs" goto missing
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%QZ_ROOT%tools\prepare_portable_runtime.ps1"
if errorlevel 1 goto bootstrap_error
set "QZ_NODE=%QZ_ROOT%.runtime\node\node.exe"
set "QZ_PYTHON=%QZ_ROOT%.runtime\python\python.exe"
if not exist "%QZ_NODE%" goto bootstrap_error
if not exist "%QZ_PYTHON%" goto bootstrap_error
set "PATH=%QZ_ROOT%.runtime\python;%QZ_ROOT%.runtime\node;%PATH%"
set "PYTHONDONTWRITEBYTECODE=1"
"%QZ_NODE%" "%QZ_ROOT%server.mjs"
if errorlevel 1 goto server_error
goto finished
:bootstrap_error
set "QZ_EXIT=1"
echo [ERROR] Portable runtime verification or preparation failed.
echo [HELP] Existing runtimes were not overwritten after a failed self-check.
echo [HELP] Try "启动体验版.bat" if system Node.js or Python is available.
goto error
:server_error
set "QZ_EXIT=1"
echo [ERROR] Local server exited unsuccessfully.
goto error
:missing
set "QZ_EXIT=2"
echo [ERROR] Required program files are missing. Fully extract the ZIP.
:error
echo Press any key to close this error window.
pause >nul
endlocal & exit /b %QZ_EXIT%
:finished
endlocal & exit /b 0

