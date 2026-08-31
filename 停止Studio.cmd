@echo off
cd /d "%~dp0"
node scripts/stop-studio.mjs
if errorlevel 1 pause
