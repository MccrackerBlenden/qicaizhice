@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
set "QZ_ROOT=%~dp0"
cd /d "%TEMP%" 2>nul
if errorlevel 1 cd /d "%SystemRoot%"
set "QZ_NODE=%QZ_ROOT%.runtime\node\node.exe"
set "QZ_PYTHON=%QZ_ROOT%.runtime\python\python.exe"
:menu
cls
echo =========================================================
echo Qicaizhice - Local - Local project maintenance
 echo Data stays local. Stop preview before any restore.
echo =========================================================
echo 1  Database health check
echo 2  Create consistent SQLite backup
echo 3  List backups
echo 4  Restore selected backup (preview must be stopped)
echo 5  Create content-free support report
echo 0  Exit
set "QZ_CHOICE="
set /p "QZ_CHOICE=Select: "
if "%QZ_CHOICE%"=="1" goto status
if "%QZ_CHOICE%"=="2" goto backup
if "%QZ_CHOICE%"=="3" goto backups
if "%QZ_CHOICE%"=="4" goto restore
if "%QZ_CHOICE%"=="5" goto support
if "%QZ_CHOICE%"=="0" goto done
goto menu
:status
call :tool status
goto end_action
:backup
call :tool backup
goto end_action
:backups
call :tool list
goto end_action
:restore
call :tool list
if errorlevel 1 goto end_action
echo [CAUTION] Restore replaces the active project database.
echo A safety copy will be created first. Close the running app.
set "QZ_INDEX="
set /p "QZ_INDEX=Backup number (blank to cancel): "
if not defined QZ_INDEX goto menu
set "QZ_CONFIRM="
set /p "QZ_CONFIRM=Type RESTORE to confirm: "
if not "%QZ_CONFIRM%"=="RESTORE" goto menu
call :tool restore-index "%QZ_INDEX%" --confirm RESTORE
goto end_action
:support
set "QZ_REPORT=%TEMP%\Qicaizhice_Support_%RANDOM%_%RANDOM%.txt"
(
echo Qicaizhice - Local diagnostic report - locally generated
echo No enterprise names, financial amounts, project contents or absolute paths.
echo [Runtime]
if exist "%QZ_NODE%" (echo Portable Node: present) else (echo Portable Node: missing)
if exist "%QZ_PYTHON%" (echo Portable Python: present) else (echo Portable Python: missing)
echo [SQLite]
) > "%QZ_REPORT%"
call :tool status >> "%QZ_REPORT%" 2>&1
start "" notepad.exe "%QZ_REPORT%"
echo Review the report before sharing externally.
goto end_action
:end_action
echo.
pause
goto menu
:tool
rem Prefer the verified system runtime path over any stale portable executable.
where node >nul 2>nul
if not errorlevel 1 goto tool_system_node_check
where py >nul 2>nul
if not errorlevel 1 goto tool_launcher_python
where python >nul 2>nul
if not errorlevel 1 goto tool_system_python
if exist "%QZ_PYTHON%" goto tool_py
if exist "%QZ_NODE%" goto tool_node
goto tool_missing
:tool_node
"%QZ_NODE%" "%QZ_ROOT%storage\maintenance.mjs" %*
exit /b %ERRORLEVEL%
:tool_py
"%QZ_PYTHON%" "%QZ_ROOT%storage\maintenance.py" %*
exit /b %ERRORLEVEL%
:tool_system_node_check
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" >nul 2>nul
if errorlevel 1 goto tool_python_search
node "%QZ_ROOT%storage\maintenance.mjs" %*
exit /b %ERRORLEVEL%
:tool_python_search
where py >nul 2>nul
if not errorlevel 1 goto tool_launcher_python
where python >nul 2>nul
if not errorlevel 1 goto tool_system_python
if exist "%QZ_PYTHON%" goto tool_py
if exist "%QZ_NODE%" goto tool_node
goto tool_missing
:tool_launcher_python
py -3 "%QZ_ROOT%storage\maintenance.py" %*
exit /b %ERRORLEVEL%
:tool_system_python
python "%QZ_ROOT%storage\maintenance.py" %*
exit /b %ERRORLEVEL%
:tool_missing
echo [ERROR] No runtime found. Run the preview launcher once while online.
exit /b 2
:done
endlocal
exit /b 0
