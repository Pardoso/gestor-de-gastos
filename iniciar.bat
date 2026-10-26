@echo off
rem Abre la app en el navegador del PC (modo desarrollo).
cd /d "%~dp0"
if not exist node_modules call npm.cmd install
start "" http://localhost:5173
call npm.cmd run dev
pause
