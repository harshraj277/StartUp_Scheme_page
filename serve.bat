@echo off
setlocal
cd /d "%~dp0"
echo.
echo  Serving Yojana Setu at http://localhost:8080
echo  (Press Ctrl+C to stop the server)
echo.
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8080
) else (
  npx --yes serve -l 8080
)
endlocal