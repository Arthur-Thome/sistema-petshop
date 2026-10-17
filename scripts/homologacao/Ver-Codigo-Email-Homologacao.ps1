Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$root = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
$statePath = Join-Path $root 'launcher-state.json'
$configPath = Join-Path $root 'config.json'

function Assert-PrivateAcl($path) {
  $acl = Get-Acl -LiteralPath $path
  if (-not $acl.AreAccessRulesProtected) {
    $parentAcl = Get-Acl -LiteralPath (Split-Path -Parent $path)
    if (-not $parentAcl.AreAccessRulesProtected) { throw 'Arquivo local sem ACL privada validada.' }
  }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  foreach ($rule in $acl.Access) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($identity,'NT AUTHORITY\SYSTEM')) {
      throw 'Arquivo local permite acesso a outra conta Windows.'
    }
  }
}

try {
  foreach ($path in @($statePath,$configPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'Sessao local de homologacao nao encontrada ou caminho indireto recusado.'
    }
    Assert-PrivateAcl $path
  }
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace([string]$state.appToken)) { throw 'Identidade da sessao local ausente.' }
  $result = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:3001/__amores/email-inbox' -Headers @{ 'X-Amores-Stop' = [string]$state.appToken } -TimeoutSec 5
  $items = @()
  foreach ($email in $result.emails) {
    $codeMatch = [regex]::Match([string]$email.raw, '(?i)\be:\s*(\d{6})')
    $code = if ($codeMatch.Success) { $codeMatch.Groups[1].Value } else { 'codigo nao localizado' }
    $recipient = (@($email.to) -join ', ')
    $items += ("Para: {0}`nCodigo: {1}" -f $recipient,$code)
  }
  if ($items.Count -eq 0) { $message = 'A caixa local esta vazia. Solicite um codigo na aplicacao de homologacao.' }
  else { $message = ($items -join "`n`n") }
  [void][Windows.Forms.MessageBox]::Show($message, 'E-mails capturados localmente - Amores Pet', 'OK', 'Information')
} catch {
  [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Caixa local de homologacao', 'OK', 'Warning')
  exit 1
}
