@echo off
setlocal
pushd "%~dp0.." || exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0aitsys-short-admin.ps1" %*
set "exitCode=%ERRORLEVEL%"
popd
exit /b %exitCode%
