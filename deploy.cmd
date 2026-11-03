@echo off
REM PROMAR - Vercel deploy (build + deploy + alias)
REM Istifade:  deploy.cmd

setlocal
set VERCEL=%APPDATA%\npm\vercel.cmd

echo [1/3] Frontend qurulur...
call npm run build:deploy || goto :err

echo [2/3] Vercel-e yuklenir...
for /f "tokens=*" %%i in ('"%VERCEL%" --prod --yes 2^>^&1 ^| findstr /r "https://.*vercel.app"') do (
  set LAST=%%i
)
if "%LAST%"=="" goto :err

echo [3/3] promarpanel.vercel.app alias edilir...
"%VERCEL%" alias set %LAST: =% promarpanel.vercel.app

echo.
echo Hazir: https://promarpanel.vercel.app
endlocal
exit /b 0

:err
echo XETA - deploy ugrusuz oldu
endlocal
exit /b 1