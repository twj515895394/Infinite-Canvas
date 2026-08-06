@echo off
cd /d "%~dp0"

echo ============================================
echo   Install Dependencies (project .venv)
echo ============================================
echo.

set "VENV_DIR=%~dp0.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "BASE_PY="

if exist "%~dp0python\python.exe" (
    set "BASE_PY=%~dp0python\python.exe"
    echo [OK] Bootstrap Python: bundled python\
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Python not found.
        echo Install Python 3.10+ or put portable python\ next to this script.
        pause
        exit /b 1
    )
    for /f "delims=" %%I in ('where python') do (
        if not defined BASE_PY set "BASE_PY=%%I"
    )
    echo [OK] Bootstrap Python: system
)

if not exist "%VENV_PY%" (
    echo.
    echo [1/3] Creating virtualenv at .venv ...
    "%BASE_PY%" -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo [ERROR] Failed to create .venv
        pause
        exit /b 1
    )
    echo [OK] .venv created
) else (
    echo [OK] Using existing .venv
)

echo.
echo [2/3] Upgrading pip in .venv ...
"%VENV_PY%" -m pip install -U pip
if errorlevel 1 (
    echo [WARN] pip upgrade failed, continue with current pip
)

echo.
echo [3/3] Installing requirements into .venv ...
if exist "%~dp0packages" (
    echo Trying offline wheels in packages\ ...
    "%VENV_PY%" -m pip install --no-index --find-links=packages -r requirements.txt
    if not errorlevel 1 goto :extra
    echo Offline install failed, falling back to online...
)

"%VENV_PY%" -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo [ERROR] Install failed. Check network / Python version.
    pause
    exit /b 1
)

:extra
echo.
echo [Extra] Installing uvicorn[standard] for WebSocket support...
"%VENV_PY%" -m pip install "uvicorn[standard]"
if errorlevel 1 (
    echo [WARN] uvicorn[standard] failed. WebSocket may be limited.
)

echo.
echo ============================================
echo   Done. Dependencies are inside .venv
echo   Start with: run.bat
echo   Interpreter: .venv\Scripts\python.exe
echo ============================================
pause
