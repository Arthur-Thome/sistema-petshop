Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$resultCode = 'AP-PEPPER-EXPORT-UNEXPECTED'
$resultPath = $null

try {
  Import-Module (Join-Path $PSScriptRoot 'Pepper-Transfer-Private.psm1') -Force -ErrorAction Stop
  Initialize-AmoresPetPepperPrivateValidation

  $privateRoot = Get-AmoresPetPepperPrivateRoot
  $configPath = Join-Path $privateRoot 'config.json'
  Assert-AmoresPetPepperPrivatePath -Path $privateRoot -RequireProtected
  Assert-AmoresPetPepperPrivatePath -Path $configPath

  $config = Get-Content -LiteralPath $configPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  $appProperty = $config.PSObject.Properties['app']
  $pepperProperty = if ($appProperty -and $null -ne $appProperty.Value) {
    $appProperty.Value.PSObject.Properties['clientePublicoPepper']
  } else { $null }
  $pepper = if ($pepperProperty) { [string]$pepperProperty.Value } else { '' }
  $pepperValid = [Text.Encoding]::UTF8.GetByteCount($pepper) -ge 32 -and $pepper -match '^[A-Za-z0-9_-]{64}$'
  $config = $null; $appProperty = $null; $pepperProperty = $null; $pepper = $null
  if (-not $pepperValid) { throw 'AP-PEPPER-SOURCE-INVALID' }

  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $nodePath = if ($nodeCommand) { [string]$nodeCommand.Source } else { '' }
  if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw 'AP-PEPPER-NODE-MISSING'
  }
  $helperPath = Join-Path $PSScriptRoot 'pepperTransfer.cjs'
  if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) { throw 'AP-PEPPER-HELPER-MISSING' }

  $resultPath = Join-Path $privateRoot ('pepper-transfer-' + [guid]::NewGuid().ToString('N') + '.apet')
  Write-Host 'Origem local validada; será exportado somente o pepper, em pacote cifrado.'
  Write-Host 'A senha será solicitada sem eco e não será passada em argumentos.'
  & $nodePath $helperPath export --config $configPath --output $resultPath
  if ($LASTEXITCODE -ne 0) { throw 'AP-PEPPER-EXPORT-FAILED' }
  Assert-AmoresPetPepperPrivatePath -Path $resultPath
  Write-Host 'PEPPER_EXPORT=SUCCESS'
  Write-Host ('Pacote privado: ' + $resultPath)
  Write-Host 'Transporte o arquivo e compartilhe a senha por um canal separado.'
} catch {
  $message = [string]$_.Exception.Message
  if ($message -match '^AP-PEPPER-[A-Z0-9-]{1,80}$') { $resultCode = $message }
  Write-Host ('PEPPER_EXPORT=FAILED; CODE=' + $resultCode)
} finally {
  $config = $null; $appProperty = $null; $pepperProperty = $null; $pepper = $null
  [void](Read-Host 'Pressione Enter para fechar esta janela')
}
