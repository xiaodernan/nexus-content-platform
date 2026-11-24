@echo off
rem Nexus web watchdog runner. Pure ASCII so it survives cmd.exe's codepage.
rem %~dp0 = this script's directory (...\scripts), so .. = project root.
cd /d "%~dp0.."
node "%~dp0check-web-health.mjs" --auto
