Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

try {
  $repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $tool = Join-Path $repo 'backend\src\database\homologacao\configurarSmtp.cjs'
  $output = & $node $tool 2>&1
  if ($LASTEXITCODE -ne 0) { throw (($output | ForEach-Object { [string]$_ }) -join "`n") }
  [void][Windows.Forms.MessageBox]::Show('Configuracao SMTP importada para o armazenamento privado local. Os valores nao foram exibidos.', 'Amores Pet - Homologacao', 'OK', 'Information')
} catch {
  [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Importacao SMTP nao concluida', 'OK', 'Warning')
  exit 1
}
