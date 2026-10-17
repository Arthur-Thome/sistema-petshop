param([switch]$Quiet)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$root = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
$statePath = Join-Path $root 'launcher-state.json'
$dataPath = Join-Path $root 'postgres\data'
function Assert-PrivateAcl($path) {
  $acl = Get-Acl -LiteralPath $path
  if (-not $acl.AreAccessRulesProtected) {
    $parentAcl = Get-Acl -LiteralPath (Split-Path -Parent $path)
    if (-not $parentAcl.AreAccessRulesProtected) { throw 'O arquivo herda de um diretorio privado sem ACL protegida.' }
  }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  foreach ($rule in $acl.Access) { if ($rule.IdentityReference.Value -notin @($identity,'NT AUTHORITY\SYSTEM')) { throw 'Arquivo local acessivel por outra conta Windows.' } }
}
function Resolve-ManagedDataPath([string]$candidate) {
  if (-not [IO.Path]::IsPathRooted($candidate)) { throw 'Caminho de dados relativo recusado.' }
  $full = [IO.Path]::GetFullPath($candidate)
  $base = [IO.Path]::GetFullPath((Join-Path $root 'postgres\data'))
  $clusters = [IO.Path]::GetFullPath((Join-Path $root 'postgres\clusters'))
  if ($full -ieq $base) { return $full }
  $pattern = '^' + [regex]::Escape($clusters.TrimEnd('\')) + '\\[a-f0-9-]{36}\\data$'
  if ($full -notmatch $pattern) { throw 'Diretório do cluster fora da allowlist privada.' }
  $cursor = $full
  while ($cursor -and $cursor.Length -ge $clusters.Length) {
    if (Test-Path -LiteralPath $cursor -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Caminho do cluster contém link/junction.' }
    if ($cursor -ieq $clusters) { break }
    $cursor = Split-Path -Parent $cursor
  }
  return $full
}
try {
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { throw 'Nao ha uma sessao iniciada por este inicializador.' }
  if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { throw 'Este Windows nao oferece verificacao segura do proprietario da porta; nenhum processo sera encerrado.' }
  Assert-PrivateAcl $statePath
  Assert-PrivateAcl (Join-Path $root 'config.json')
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  $config = Get-Content -LiteralPath (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
  $dataPath = Resolve-ManagedDataPath ([string]$state.dataDirectory)
  if ($state.version -ne 1 -or -not $state.pgStartedByLauncher -or ($config.postgres.clusterId -and [string]$config.postgres.clusterId -ne [string]$state.clusterId) -or [IO.Path]::GetFullPath([string]$config.postgres.dataDirectory) -ne [IO.Path]::GetFullPath($dataPath) -or [int]$state.port -ne 55432 -or [string]$config.postgres.database -ne 'amores_pet_homologacao' -or [string]$config.postgres.host -ne '127.0.0.1' -or [int]$config.postgres.port -ne 55432 -or [string]$config.postgres.user -ne 'amores_pet_homologacao_app' -or [IO.Path]::GetFullPath([string]$config.postgres.pgCtlPath) -ne [IO.Path]::GetFullPath([string]$state.pgCtlPath)) { throw 'Registro da sessao ou cluster diverge da configuracao; nenhum processo foi encerrado.' }

  $app = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.appPid)" -ErrorAction SilentlyContinue
  if (-not $app -or [IO.Path]::GetFullPath($app.ExecutablePath) -ne [IO.Path]::GetFullPath([string]$state.appExecutable) -or $app.CommandLine -ne [string]$state.appCommand -or $app.CommandLine -notmatch [regex]::Escape([string]$state.appOwner) -or $app.CommandLine -notmatch [regex]::Escape('backend-runner.cjs')) { throw 'Identidade do processo Amores Pet nao confere; nenhum processo foi encerrado.' }

  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3001/__amores/stop' -Headers @{ 'X-Amores-Stop' = [string]$state.appToken } -TimeoutSec 5 | Out-Null
  $appStopped = $false
  for ($i=0; $i -lt 24; $i++) { Start-Sleep -Milliseconds 500; if (-not (Get-CimInstance Win32_Process -Filter "ProcessId = $($state.appPid)" -ErrorAction SilentlyContinue)) { $appStopped = $true; break } }
  if (-not $appStopped) { throw 'Aplicacao nao encerrou graciosamente; PostgreSQL foi mantido ativo para proteger a sessao.' }

  $markerPath = Join-Path $dataPath '.amores-homologacao-cluster.json'
  if (((Get-Item -LiteralPath $markerPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Marcador do cluster nao pode ser link/junction.' }
  $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($marker.formato -ne 'amores-pet-homologacao-v1' -or [string]$marker.clusterId -notmatch '^[a-f0-9-]{36}$' -or [string]$marker.clusterId -ne [string]$state.clusterId) { throw 'Marcador do cluster diverge; PostgreSQL nao sera tocado.' }
  $pidFile = Join-Path $dataPath 'postmaster.pid'
  $lines = Get-Content -LiteralPath $pidFile
  $pgPid = [int]$lines[0]
  if ($pgPid -ne [int]$state.pgPid -or [IO.Path]::GetFullPath([string]$lines[1]) -ne [IO.Path]::GetFullPath($dataPath) -or [int]$lines[3] -ne 55432 -or ($lines[5] -split ',').Trim() -notcontains '127.0.0.1') { throw 'postmaster.pid diverge da sessao; PostgreSQL nao sera tocado.' }
  $pg = Get-CimInstance Win32_Process -Filter "ProcessId = $pgPid" -ErrorAction SilentlyContinue
  $expectedPostgres = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath([string]$state.pgCtlPath))) 'postgres.exe'
  $normalizedPgCommand = if ($pg) { $pg.CommandLine.Replace('/','\') } else { '' }
  if (-not $pg -or [IO.Path]::GetFullPath($pg.ExecutablePath) -ne [IO.Path]::GetFullPath($expectedPostgres) -or $pg.ExecutablePath -ne [string]$state.pgExecutable -or $pg.CommandLine -ne [string]$state.pgCommand -or $normalizedPgCommand -notmatch [regex]::Escape($dataPath) -or $normalizedPgCommand -notmatch '(?i)-h\s+"?127\.0\.0\.1' -or $normalizedPgCommand -notmatch '(?i)-p\s+"?55432') { throw 'Identidade do processo PostgreSQL diverge; nenhum processo foi encerrado.' }
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue)
  if ($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $pgPid -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Listener da porta PostgreSQL diverge; nenhum processo foi encerrado.' }

  $env:PGHOST = '127.0.0.1'; $env:PGPORT = '55432'; $env:PGUSER = [string]$config.postgres.clusterUser; $env:PGPASSWORD = [string]$config.postgres.clusterPassword
  & $state.pgCtlPath -D $dataPath -m fast stop
  if ($LASTEXITCODE -ne 0) { throw 'pg_ctl nao conseguiu encerrar o cluster identificado. O estado foi preservado para diagnostico.' }
  if (Get-CimInstance Win32_Process -Filter "ProcessId = $pgPid" -ErrorAction SilentlyContinue) { throw 'O processo PostgreSQL continua ativo; nao foi forcado.' }
  Remove-Item -LiteralPath $statePath -Force
  if (-not $Quiet) { [void][Windows.Forms.MessageBox]::Show('Amores Pet e o cluster exclusivo desta sessao foram encerrados. Nenhum processo externo foi tocado.', 'Amores Pet — Homologacao', 'OK', 'Information') }
} catch {
  if ($Quiet) { [Console]::Error.WriteLine($_.Exception.Message); exit 1 } else { [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Amores Pet — Homologacao', 'OK', 'Warning') }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
