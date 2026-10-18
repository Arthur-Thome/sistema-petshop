Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$resultCode = 'AP-PEPPER-IMPORT-UNEXPECTED'

try {
  Import-Module (Join-Path $PSScriptRoot 'Pepper-Transfer-Private.psm1') -Force -ErrorAction Stop
  Initialize-AmoresPetPepperPrivateValidation

  $privateRoot = Get-AmoresPetPepperPrivateRoot
  $configPath = Join-Path $privateRoot 'config.json'
  $runtimePath = Join-Path $privateRoot 'neon-runtime.json'
  Assert-AmoresPetPepperPrivatePath -Path $privateRoot -RequireProtected
  if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    Assert-AmoresPetPepperPrivatePath -Path $configPath
  } else {
    Write-Host 'A configuracao privada ainda nao existe; sera criado somente o arquivo minimo sob a raiz ACL-validada.'
  }

  if (Test-Path -LiteralPath $runtimePath) {
    throw 'AP-PEPPER-NEON-RUNTIME-EXISTS'
  }

  $packageFiles = @(Get-ChildItem -LiteralPath $privateRoot -Filter 'pepper-transfer-*.apet' -File -ErrorAction Stop)
  if ($packageFiles.Count -eq 0) { throw 'AP-PEPPER-PACKAGE-MISSING' }
  if ($packageFiles.Count -gt 1) { throw 'AP-PEPPER-PACKAGE-AMBIGUOUS' }
  $packagePath = $packageFiles[0].FullName
  Assert-AmoresPetPepperPrivatePath -Path $packagePath

  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $nodePath = if ($nodeCommand) { [string]$nodeCommand.Source } else { '' }
  if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw 'AP-PEPPER-NODE-MISSING'
  }
  $helperPath = Join-Path $PSScriptRoot 'pepperTransfer.cjs'
  if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) { throw 'AP-PEPPER-HELPER-MISSING' }

  Write-Host 'Destino privado validado; a configuração existente será preservada.'
  Write-Host 'Se o pepper já existir com outro valor, a importação será recusada sem alteração.'
  Write-Host 'A senha será solicitada sem eco; nenhum valor será passado em argumentos.'
  & $nodePath $helperPath import --package $packagePath --config $configPath
  if ($LASTEXITCODE -ne 0) { throw 'AP-PEPPER-IMPORT-FAILED' }
  Assert-AmoresPetPepperPrivatePath -Path $configPath
  Write-Host 'PEPPER_IMPORT=SUCCESS; ACL_VALIDADA=YES'
  Write-Host 'Agora o launcher Neon poderá criar neon-runtime.json com DPAPI nesta conta Windows.'
} catch {
  $message = [string]$_.Exception.Message
  if ($message -match '^AP-PEPPER-[A-Z0-9-]{1,80}$') { $resultCode = $message }
  Write-Host ('PEPPER_IMPORT=FAILED; CODE=' + $resultCode)
} finally {
  $config = $null; $packageFiles = $null; $packagePath = $null
  [void](Read-Host 'Pressione Enter para fechar esta janela')
}
