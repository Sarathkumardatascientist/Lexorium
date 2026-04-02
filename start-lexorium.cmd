@echo off
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
set "LEXORIUM_LOCAL_DEV=1"
set "PUBLIC_APP_URL=http://localhost:3000"
title Lexorium Local Server
echo Starting Lexorium on http://localhost:3000 ...
start "" cmd /c "ping 127.0.0.1 -n 3 >nul && start http://localhost:3000"
"C:\Program Files\nodejs\node.exe" server.js
echo.
echo Lexorium server stopped.
pause
