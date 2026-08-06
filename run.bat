@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Prefer project venv, then bundled portable Python, then system Python
set "PYEXE=%~dp0.venv\Scripts\python.exe"
if not exist "%PYEXE%" set "PYEXE=%~dp0python\python.exe"
if not exist "%PYEXE%" set "PYEXE=python"

set "PORT=3888"
set "URL=http://127.0.0.1:%PORT%/"

echo Starting Infinite-Canvas...
echo Visit: %URL%
echo Press Ctrl+C to stop.
echo.

rem If 3888 is already listening, show who holds it and try to free leftover
rem Infinite-Canvas / uvicorn processes from a previous run.
call :free_port_if_our_server
if errorlevel 1 (
  echo.
  echo [ERROR] Port %PORT% is still in use by another process.
  echo Close that program, or change the port in main.py / run.bat.
  echo.
  pause
  exit /b 1
)

rem Open browser shortly after server should be up (does not start a second server)
start "" cmd /c "timeout /t 2 /nobreak >nul && start \"\" \"%URL%\""

"%PYEXE%" main.py
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo Server exited with code %EXIT_CODE%.
) else (
  echo Server stopped.
)
pause
exit /b %EXIT_CODE%

:free_port_if_our_server
set "LISTEN_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "LISTEN_PID=%%P"
)
if not defined LISTEN_PID exit /b 0

echo [WARN] Port %PORT% is already in use by PID %LISTEN_PID%.
set "CMDLINE="
for /f "usebackq delims=" %%C in (`powershell -NoProfile -Command "$p=Get-CimInstance Win32_Process -Filter \"ProcessId=%LISTEN_PID%\"; if($p){$p.CommandLine}"`) do set "CMDLINE=%%C"
if defined CMDLINE (
  echo        Command: %CMDLINE%
) else (
  echo        Command: ^(unknown^)
)

echo %CMDLINE% | findstr /I /C:"Infinite-Canvas" /C:"main.py" /C:"uvicorn" >nul
if errorlevel 1 (
  echo [ERROR] That process does not look like Infinite-Canvas. Will not kill it.
  exit /b 1
)

echo [INFO] Stopping leftover Infinite-Canvas process PID %LISTEN_PID% ...
taskkill /PID %LISTEN_PID% /F >nul 2>&1
timeout /t 1 /nobreak >nul

set "LISTEN_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "LISTEN_PID=%%P"
)
if defined LISTEN_PID (
  echo [ERROR] Port %PORT% still listening after taskkill ^(PID %LISTEN_PID%^).
  exit /b 1
)

echo [OK] Port %PORT% is free now.
echo.
exit /b 0
