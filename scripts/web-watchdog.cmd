@echo off
rem Nexus web watchdog runner. Pure ASCII so it survives cmd.exe's codepage.
rem %~dp0 = this script's directory (...\scripts), so .. = project root.
cd /d "%~dp0.."
rem WEB_PORT: which local port this watchdog guards. 3101 = this repo's dev server;
rem 3100 is occupied by a parallel next start production build (old code).
if "%WEB_PORT%"=="" set WEB_PORT=3101
node "%~dp0check-web-health.mjs" --auto
