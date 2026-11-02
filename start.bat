@echo off
setlocal
cd /d "%~dp0"
echo Starting TULLIP at http://127.0.0.1:5173
call npm.cmd run dev -- --host 127.0.0.1
