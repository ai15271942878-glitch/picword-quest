@echo off
rem PicWord Quest launcher (double-click to start)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [PicWord Quest] Node.js not found. Please install Node.js 20+ from https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo [PicWord Quest] First run: installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo [PicWord Quest] Starting... the game opens at http://127.0.0.1:5173
echo [PicWord Quest] Keep this window open while playing. Close it to stop the game.
call npm run dev -- --open
pause
