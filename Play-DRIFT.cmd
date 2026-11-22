@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\.bin\vite.cmd" (
    echo Installing DRIFT dependencies...
    call npm.cmd ci || goto failed
)
echo Keep this window open while playing DRIFT.
call npm.cmd run dev -- --host 127.0.0.1 --open
if errorlevel 1 goto failed
exit /b 0

:failed
echo DRIFT could not start. Check the error above.
pause
exit /b 1
