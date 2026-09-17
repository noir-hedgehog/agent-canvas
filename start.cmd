@echo off
cd /d "%~dp0"
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)" 2>nul
if errorlevel 1 (
 echo Please install Node.js 24 or newer.
 pause
 exit /b 1
)
if not exist node_modules\tsx\dist\loader.mjs (
 call npm ci --omit=dev --no-audit --no-fund
 if errorlevel 1 exit /b 1
)
node --import tsx server/index.ts
pause
