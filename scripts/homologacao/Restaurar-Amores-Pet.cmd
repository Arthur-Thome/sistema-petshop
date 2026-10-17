@echo off
setlocal
title Amores Pet - Restaurar homologacao
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Restaurar-Amores-Pet.ps1"
if errorlevel 1 (
  echo.
  echo Restauracao interrompida. Nenhum banco fora do cluster de homologacao sera tocado.
)
pause
