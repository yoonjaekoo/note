@echo off
setlocal
set "APP=%~dp0index.html"
where msedge >nul 2>nul
if %errorlevel%==0 (
  start "" msedge --app="file:///%APP:\=/%" --user-data-dir="%LOCALAPPDATA%\NoteAppProfile"
  exit /b 0
)
start "" "%APP%"
