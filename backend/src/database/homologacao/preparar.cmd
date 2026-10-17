@echo off
setlocal
title Amores Pet - Preparar homologacao
set "REPO=%~dp0..\..\..\.."
if not exist "%REPO%\frontend\node_modules\vite\bin\vite.js" (
  echo Dependencias locais do frontend ausentes. Solicite a preparacao tecnica; nenhum pacote sera instalado.
  pause
  exit /b 1
)
pushd "%REPO%\frontend"
set "VITE_API_URL=/api"
call npm.cmd run build
set "BUILD_RESULT=%ERRORLEVEL%"
set "VITE_API_URL="
popd
if not "%BUILD_RESULT%"=="0" (
  echo O build do frontend falhou. Nenhum banco foi iniciado.
  pause
  exit /b 1
)
findstr /S /I /M /C:"http://localhost:3001/api" "%REPO%\frontend\dist\assets\*.js" >nul
if not errorlevel 1 (
  echo O build ainda aponta a API para localhost; a homologacao exige API relativa na mesma origem.
  echo Verifique a configuracao VITE_API_URL sem alterar arquivos .env e execute novamente.
  pause
  exit /b 1
)
findstr /S /I /M /C:"baseURL:`/api`" "%REPO%\frontend\dist\assets\*.js" >nul
if errorlevel 1 (
  echo O build nao confirmou a API relativa /api na mesma origem; nenhum backend foi iniciado.
  pause
  exit /b 1
)
node "%~dp0preparar.cjs"
if errorlevel 1 (
  echo.
  echo A preparacao foi interrompida. Nenhum dado existente foi removido.
  pause
  exit /b 1
)
echo.
echo Homologacao preparada com dados ficticios.
pause
