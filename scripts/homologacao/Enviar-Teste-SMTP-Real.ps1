param(
  [Parameter(Mandatory = $true)][string]$Destinatario,
  [switch]$ConfirmarEnvioReal
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ConfirmarEnvioReal) { throw 'Envio externo bloqueado. Use -ConfirmarEnvioReal somente apos autorizar o teste de entrega.' }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node.exe -ErrorAction Stop).Source
$tool = Join-Path $repo 'backend\src\database\homologacao\enviarTesteSmtpReal.cjs'
$oldApproval = $env:AMORES_PET_REAL_EMAIL_APPROVED
$oldRecipient = $env:AMORES_PET_REAL_EMAIL_TO
try {
  $env:AMORES_PET_REAL_EMAIL_APPROVED = '1'
  $env:AMORES_PET_REAL_EMAIL_TO = $Destinatario
  & $node $tool
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  if ($null -eq $oldApproval) { Remove-Item Env:AMORES_PET_REAL_EMAIL_APPROVED -ErrorAction SilentlyContinue }
  else { $env:AMORES_PET_REAL_EMAIL_APPROVED = $oldApproval }
  if ($null -eq $oldRecipient) { Remove-Item Env:AMORES_PET_REAL_EMAIL_TO -ErrorAction SilentlyContinue }
  else { $env:AMORES_PET_REAL_EMAIL_TO = $oldRecipient }
}
