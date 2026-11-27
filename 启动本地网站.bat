@echo off
setlocal
cd /d "%~dp0"
echo Pixel Studio: http://localhost:5173/
echo Keep this window open. Press Ctrl+C to stop the server.
python -m http.server 5173 --bind 127.0.0.1
if errorlevel 1 pause
