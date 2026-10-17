Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$root = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
$configPath = Join-Path $root 'config.json'
$dataPath = Join-Path $root 'postgres\data'
$statePath = Join-Path $root 'launcher-state.json'
$startLock = Join-Path $root 'launcher-start.lock'
$logs = Join-Path $root 'logs'
$clusterProcess = $null
$clusterPid = $null
$startedHere = $false

function Fail([string]$message) { throw $message }
function PortBusy([int]$port) { return (@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).Count -gt 0) }
function AssertPrivateFile([string]$file) {
  $acl = Get-Acl -LiteralPath $file
  if (-not $acl.AreAccessRulesProtected) {
    $parentAcl = Get-Acl -LiteralPath (Split-Path -Parent $file)
    if (-not $parentAcl.AreAccessRulesProtected) { Fail 'Configuracao nao herda de pasta privada protegida.' }
  }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  foreach ($rule in $acl.Access) { if ($rule.IdentityReference.Value -notin @($identity,'NT AUTHORITY\SYSTEM')) { Fail 'Configuracao acessivel por outra conta Windows.' } }
}
function Resolve-ManagedDataPath([string]$candidate) {
  if (-not [IO.Path]::IsPathRooted($candidate)) { Fail 'Caminho de dados relativo recusado.' }
  $full = [IO.Path]::GetFullPath($candidate)
  $base = [IO.Path]::GetFullPath((Join-Path $root 'postgres\data'))
  $clusters = [IO.Path]::GetFullPath((Join-Path $root 'postgres\clusters'))
  if ($full -ieq $base) { return $full }
  $pattern = '^' + [regex]::Escape($clusters.TrimEnd('\')) + '\\[a-f0-9-]{36}\\data$'
  if ($full -notmatch $pattern) { Fail 'Diretório do cluster fora da allowlist privada.' }
  $cursor = $full
  while ($cursor -and $cursor.Length -ge $clusters.Length) {
    if (Test-Path -LiteralPath $cursor -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'Caminho do cluster contém link/junction.' }
    if ($cursor -ieq $clusters) { break }
    $cursor = Split-Path -Parent $cursor
  }
  return $full
}
function CheckCluster([int]$expectedPid,$expectedCommand,$expectedExecutable,$markerId) {
  $pidPath = Join-Path $dataPath 'postmaster.pid'
  if (-not (Test-Path -LiteralPath $pidPath)) { Fail 'PID file nao apareceu; cluster nao validado.' }
  $lines = Get-Content -LiteralPath $pidPath
  if ($lines.Count -lt 6 -or [int]$lines[0] -ne $expectedPid -or [IO.Path]::GetFullPath([string]$lines[1]) -ne [IO.Path]::GetFullPath($dataPath) -or [int]$lines[3] -ne 55432 -or ($lines[5] -split ',').Trim() -notcontains '127.0.0.1') { Fail 'postmaster.pid diverge do cluster dedicado.' }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $expectedPid" -ErrorAction SilentlyContinue
  $normalized = if ($process) { $process.CommandLine.Replace('/','\') } else { '' }
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue)
  $marker = Get-Content (Join-Path $dataPath '.amores-homologacao-cluster.json') -Raw | ConvertFrom-Json
  if (-not $process -or [IO.Path]::GetFullPath($process.ExecutablePath) -ne [IO.Path]::GetFullPath($expectedExecutable) -or $process.CommandLine -ne $expectedCommand -or $normalized -notmatch [regex]::Escape($dataPath) -or $normalized -notmatch '(?i)-h\s+"?127\.0\.0\.1' -or $normalized -notmatch '(?i)-p\s+"?55432' -or $listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $expectedPid -or $listeners[0].LocalAddress -ne '127.0.0.1' -or $marker.clusterId -ne $markerId) { Fail 'Identidade do processo/porta/marcador diverge; cluster nao sera restaurado.' }
  return $process
}

try {
  if ($env:DATABASE_URL) { Fail 'DATABASE_URL herdada detectada; restauracao recusada.' }
  Get-ChildItem Env: | Where-Object { $_.Name -match '^(PG|PSQL)' } | ForEach-Object { Remove-Item "Env:$($_.Name)" -ErrorAction SilentlyContinue }
  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { Fail 'Configuracao de homologacao ausente.' }
  if ((Test-Path -LiteralPath $statePath) -or (Test-Path -LiteralPath $startLock)) { Fail 'Encerre o Amores Pet e aguarde o launcher sem sessao registrada antes de restaurar.' }
  if (PortBusy 3001) { Fail 'A porta da aplicacao esta ocupada; nenhuma sessao sera encerrada.' }
  if (PortBusy 55432) { Fail 'A porta PostgreSQL esta ocupada; nenhum processo sera adotado.' }
  if (((Get-Item -LiteralPath $configPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'Configuracao nao pode ser link/junction.' }
  AssertPrivateFile $configPath
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $pg = $config.postgres
  $dataPath = Resolve-ManagedDataPath ([string]$pg.dataDirectory)
  if (-not (Test-Path -LiteralPath $dataPath -PathType Container)) { Fail 'Cluster de homologacao ausente.' }
  if ([int]$config.version -ne 1 -or $pg.host -ne '127.0.0.1' -or [int]$pg.port -ne 55432 -or $pg.database -ne 'amores_pet_homologacao' -or $pg.user -ne 'amores_pet_homologacao_app') { Fail 'Destino de restauracao diverge da allowlist de homologacao.' }
  if (-not (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION')) -or (Get-Content (Join-Path $dataPath 'PG_VERSION') -Raw).Trim() -ne '17') { Fail 'O cluster dedicado precisa ser PostgreSQL 17.' }
  $markerPath = Join-Path $dataPath '.amores-homologacao-cluster.json'
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf) -or ((Get-Item -LiteralPath $markerPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'Marcador de propriedade ausente ou link/junction.' }
  $marker = Get-Content $markerPath -Raw | ConvertFrom-Json
  if ($marker.formato -ne 'amores-pet-homologacao-v1' -or [string]$marker.clusterId -notmatch '^[a-f0-9-]{36}$' -or ($pg.clusterId -and [string]$pg.clusterId -ne [string]$marker.clusterId)) { Fail 'Marcador de propriedade do cluster invalido ou divergente da configuracao.' }
  if (Test-Path -LiteralPath (Join-Path $dataPath 'postmaster.pid')) { Fail 'postmaster.pid existente; confira o cluster antes de restaurar.' }
  $tools = @($pg.pgCtlPath,$pg.psqlPath)
  foreach ($tool in $tools) { if ([string]$tool -notmatch '^[A-Za-z]:\\' -or -not (Test-Path -LiteralPath $tool -PathType Leaf)) { Fail 'Ferramentas PostgreSQL precisam ter caminhos absolutos existentes.' } }
  $pgBin = Split-Path -Parent ([IO.Path]::GetFullPath([string]$pg.pgCtlPath))
  $postgresExe = Join-Path $pgBin 'postgres.exe'
  if (-not (Test-Path -LiteralPath $postgresExe -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $pgBin 'initdb.exe') -PathType Leaf)) { Fail 'Executaveis PostgreSQL da instalacao configurada estao incompletos.' }
  $pgVersion = (& $pg.pgCtlPath --version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $pgVersion -notmatch 'PostgreSQL\) 17\.') { Fail 'pg_ctl deve pertencer ao PostgreSQL 17.' }
  $psqlVersion = (& $pg.psqlPath --version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $psqlVersion -notmatch 'PostgreSQL\) 17\.') { Fail 'psql deve pertencer ao PostgreSQL 17.' }

  Write-Host 'ATENCAO: somente o banco local amores_pet_homologacao sera recriado.' -ForegroundColor Yellow
  Write-Host 'Registros de teste desse banco serao substituidos; o cluster, imagens e outros bancos nao serao apagados.' -ForegroundColor Yellow
  $confirmation = Read-Host 'Digite exatamente RESTAURAR AMORES PET HOMOLOGACAO para continuar'
  if ($confirmation -cne 'RESTAURAR AMORES PET HOMOLOGACAO') { Fail 'Confirmacao nao corresponde; nenhuma alteracao foi feita.' }

  New-Item -ItemType Directory -Path $logs -Force | Out-Null
  $clusterProcess = Start-Process -FilePath $postgresExe -ArgumentList @('-D',$dataPath,'-h','127.0.0.1','-p','55432') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'postgres-stdout.log') -RedirectStandardError (Join-Path $logs 'postgres-stderr.log')
  $startedHere = $true
  for ($i=0; $i -lt 40; $i++) {
    if ($clusterProcess.HasExited) { Fail 'PostgreSQL encerrou durante a restauracao; consulte postgres-stderr.log.' }
    if (Test-Path -LiteralPath (Join-Path $dataPath 'postmaster.pid')) {
      $pidLines = Get-Content (Join-Path $dataPath 'postmaster.pid')
      if ($pidLines.Count -ge 6 -and [int]$pidLines[0] -eq $clusterProcess.Id) {
        $listener = @(Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue)
        if ($listener.Count -eq 1 -and $listener[0].OwningProcess -eq $clusterProcess.Id -and $listener[0].LocalAddress -eq '127.0.0.1') { break }
      }
    }
    Start-Sleep -Milliseconds 500
  }
  $clusterPid = [int]$clusterProcess.Id
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $clusterPid" -ErrorAction SilentlyContinue
  if (-not $process) { Fail 'Processo PostgreSQL nao encontrado apos inicializacao.' }
  $markerPath = Join-Path $dataPath '.amores-homologacao-cluster.json'
  $currentMarker = Get-Content $markerPath -Raw | ConvertFrom-Json
  $process = CheckCluster $clusterPid $process.CommandLine $postgresExe $currentMarker.clusterId
  $null = & $pg.pgCtlPath status -D $dataPath
  if ($LASTEXITCODE -ne 0) { Fail 'pg_ctl nao confirmou o cluster iniciado.' }

  $env:AMORES_RESTORE_CONFIRMATION = $confirmation
  & node (Join-Path $PSScriptRoot '..\..\backend\src\database\homologacao\preparar.cjs') --restore
  if ($LASTEXITCODE -ne 0) { Fail 'Restauração interrompida; nenhum banco fora do cluster dedicado foi acessado.' }
  $startedHere = $false
  [void][Windows.Forms.MessageBox]::Show('Banco de homologacao restaurado com dados ficticios. Nenhum arquivo de imagem foi removido.', 'Amores Pet — Restauracao', 'OK', 'Information')
} catch {
  [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Amores Pet — Restauracao', 'OK', 'Warning')
  if ($startedHere -and $clusterProcess -and $clusterPid) {
    try {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $clusterPid" -ErrorAction SilentlyContinue
      $normalized = if ($process) { $process.CommandLine.Replace('/','\') } else { '' }
      if ($process -and [IO.Path]::GetFullPath($process.ExecutablePath) -eq [IO.Path]::GetFullPath($postgresExe) -and $normalized -match [regex]::Escape($dataPath) -and $normalized -match '(?i)-h\s+"?127\.0\.0\.1' -and $normalized -match '(?i)-p\s+"?55432') {
        & $pg.pgCtlPath -D $dataPath -m fast stop
      }
    } catch { }
  }
} finally { Remove-Item Env:AMORES_RESTORE_CONFIRMATION -ErrorAction SilentlyContinue }
