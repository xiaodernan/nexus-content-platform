@echo off
rem Run next dev in the foreground of the scheduled task itself.
rem The task's MultipleInstancesPolicy=IgnoreNew ensures only one instance.
rem If a dev server is already listening, npx exits with EADDRINUSE (harmless).
rem %~dp0 = ...\scripts; ..\apps\web = the web workspace.
cd /d "%~dp0..\apps\web"
call npx next dev -p 3101
