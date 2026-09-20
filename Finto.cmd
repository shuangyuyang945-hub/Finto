@echo off
setlocal
cd /d "%~dp0"

set "CODEX_PYTHONW=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\pythonw.exe"
if exist "%CODEX_PYTHONW%" (
  start "Finto" "%CODEX_PYTHONW%" "%~dp0desktop.py"
  exit /b 0
)

where pyw >nul 2>nul
if %errorlevel% equ 0 (
  start "Finto" pyw -3 "%~dp0desktop.py"
  exit /b 0
)

where pythonw >nul 2>nul
if %errorlevel% equ 0 (
  start "Finto" pythonw "%~dp0desktop.py"
  exit /b 0
)

echo Finto 需要 Python 3 才能启动。
pause
