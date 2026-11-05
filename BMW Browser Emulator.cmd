@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\emulator.ps1" Start
if errorlevel 1 pause
