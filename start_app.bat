@echo off
echo Starting UFC Predictor...
echo.

:: Start the save/proxy server in background
start "UFC Save Server" /min cmd /c "python save_server.py"

:: Wait a moment for server to start
timeout /t 2 /nobreak >nul

:: Open the app in Chrome via Localhost (server mode)
:: Try common Chrome locations
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "http://localhost:5555"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "http://localhost:5555"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "http://localhost:5555"
) else (
    echo Chrome not found, opening in default browser...
    start "" "http://localhost:5555"
)

echo.
echo App started at http://localhost:5555
echo Save server running in background.
echo Close the "UFC Save Server" window when done.
