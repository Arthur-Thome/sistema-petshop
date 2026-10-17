Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$directory = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
try {
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw 'A homologacao ainda nao foi preparada.' }
  $files = @(Get-ChildItem -LiteralPath $directory -Filter 'contas-*.txt' -File | Sort-Object LastWriteTimeUtc -Descending)
  if ($files.Count -eq 0) { throw 'As contas ficticias ainda nao foram criadas. Execute Preparar homologacao primeiro.' }
  $configPath = Join-Path $directory 'config.json'
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $clusterFile = if ($config.postgres.clusterId) { Join-Path $directory "contas-$($config.postgres.clusterId).txt" } else { $null }
  $file = if ($clusterFile -and (Test-Path -LiteralPath $clusterFile -PathType Leaf)) { Get-Item -LiteralPath $clusterFile } else { $files[0] }
  $acl = Get-Acl -LiteralPath $file.FullName
  if (-not $acl.AreAccessRulesProtected) {
    $parentAcl = Get-Acl -LiteralPath (Split-Path -Parent $file.FullName)
    if (-not $parentAcl.AreAccessRulesProtected) { throw 'O arquivo de credenciais nao esta em uma pasta privada protegida.' }
  }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  foreach ($rule in $acl.Access) {
    if ($rule.IdentityReference.Value -notin @($identity,'NT AUTHORITY\SYSTEM')) { throw 'Acesso ao arquivo de credenciais nao esta restrito a esta conta Windows.' }
  }
  Start-Process -FilePath notepad.exe -ArgumentList @($file.FullName)
} catch {
  [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Credenciais ficticias - Homologacao', 'OK', 'Information')
}
