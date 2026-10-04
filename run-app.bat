@echo off
cd /d "%~dp0"

echo ===========================================
echo    Starting Budget Control v2 (Local Dev)  
echo ===========================================

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto error
)

echo Opening http://localhost:5173 in browser...
call npm run dev -- --open
goto end

:error
echo Failed to start or install dependencies.
pause

:end
