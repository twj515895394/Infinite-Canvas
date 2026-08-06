@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem ── Studio V2 一键启动（验收 / 日常开发）────────────────────────────
rem 后端 FastAPI :3888（旧 UI 仍可由此进入）
rem 前端 Vite    :13888（专用端口，避开 5173/3000 等常用口）
rem 浏览器打开新 UI；旧 run.bat 行为不变。

set "BACKEND_PORT=3888"
set "FRONTEND_PORT=13888"
set "V2_URL=http://127.0.0.1:%FRONTEND_PORT%/"
set "API_URL=http://127.0.0.1:%BACKEND_PORT%/"

set "PYEXE=%~dp0.venv\Scripts\python.exe"
if not exist "%PYEXE%" set "PYEXE=%~dp0python\python.exe"
if not exist "%PYEXE%" set "PYEXE=python"

set "NPM=npm.cmd"
where npm.cmd >nul 2>&1
if errorlevel 1 (
  where npm >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] 未找到 npm。请先安装 Node.js，或确认 PATH 含 npm。
    pause
    exit /b 1
  )
  set "NPM=npm"
)

if not exist "%~dp0studio-v2\package.json" (
  echo [ERROR] 未找到 studio-v2\package.json，请在仓库根目录运行本脚本。
  pause
  exit /b 1
)

echo ============================================
echo  Infinite-Canvas  Studio V2
echo  新 UI  %V2_URL%
echo  后端   %API_URL%  ^(旧 UI 同此^)
echo ============================================
echo.

rem ── 后端：端口空闲则新开窗口；已被本项目占用则复用 ──
call :port_listening %BACKEND_PORT%
if errorlevel 1 (
  echo [OK] 后端已在 %BACKEND_PORT% 监听，复用现有进程。
) else (
  echo [INFO] 启动后端 main.py → %BACKEND_PORT% ...
  start "Infinite-Canvas Backend :%BACKEND_PORT%" cmd /k "cd /d ""%~dp0"" && ""%PYEXE%"" main.py"
  call :wait_port %BACKEND_PORT% 40
  if errorlevel 1 (
    echo [ERROR] 等待后端 %BACKEND_PORT% 超时。请查看 Backend 窗口日志。
    pause
    exit /b 1
  )
  echo [OK] 后端已就绪。
)

rem ── 前端依赖：缺 node_modules 时自动 npm install ──
if not exist "%~dp0studio-v2\node_modules\" (
  echo [INFO] studio-v2 首次依赖安装 ^(npm install^) ...
  pushd "%~dp0studio-v2"
  call %NPM% install
  if errorlevel 1 (
    popd
    echo [ERROR] npm install 失败。
    pause
    exit /b 1
  )
  popd
)

rem ── 前端：固定 13888；占用则提示，不静默换端口 ──
call :port_listening %FRONTEND_PORT%
if errorlevel 1 (
  echo [WARN] 前端端口 %FRONTEND_PORT% 已被占用。
  echo        若已是本次 Vite，将直接打开浏览器；否则请先释放该端口。
) else (
  echo [INFO] 启动 Studio V2 ^(Vite^) → %FRONTEND_PORT% ...
  start "Infinite-Canvas Studio V2 :%FRONTEND_PORT%" cmd /k "cd /d ""%~dp0studio-v2"" && call %NPM% run dev -- --host 127.0.0.1 --port %FRONTEND_PORT% --strictPort"
  call :wait_port %FRONTEND_PORT% 60
  if errorlevel 1 (
    echo [ERROR] 等待前端 %FRONTEND_PORT% 超时。请查看 Studio V2 窗口日志。
    pause
    exit /b 1
  )
  echo [OK] 前端已就绪。
)

echo.
echo 打开新 UI: %V2_URL%
echo 旧版入口:  %API_URL%
echo 关闭：分别关掉 Backend / Studio V2 两个窗口，或在窗口内 Ctrl+C。
echo.
start "" "%V2_URL%"
exit /b 0

rem ── helpers ─────────────────────────────────────────────────────────
:port_listening
rem exit 1 = listening, 0 = free
set "PL_PORT=%~1"
netstat -ano | findstr /R /C:":%PL_PORT% .*LISTENING" >nul 2>&1
if errorlevel 1 exit /b 0
exit /b 1

:wait_port
set "WP_PORT=%~1"
set "WP_MAX=%~2"
if "%WP_MAX%"=="" set "WP_MAX=30"
set /a WP_I=0
:wait_port_loop
call :port_listening %WP_PORT%
if errorlevel 1 exit /b 0
set /a WP_I+=1
if %WP_I% GEQ %WP_MAX% exit /b 1
timeout /t 1 /nobreak >nul
goto wait_port_loop
