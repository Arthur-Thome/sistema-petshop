param([switch]$SkipBrowser, [switch]$Quiet)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$root = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
$configPath = Join-Path $root 'config.json'
$statePath = Join-Path $root 'launcher-state.json'
$startLockPath = Join-Path $root 'launcher-start.lock'
$dataPath = Join-Path $root 'postgres\data'
$runtime = Join-Path $root 'runtime'
$logs = Join-Path $root 'logs'
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$appProcess = $null; $owner = $null; $token = $null; $pgPid = $null; $pgCommand = $null; $pgProcess = $null; $pgLaunchProcess = $null; $marker = $null; $startLockToken = $null; $startLockStream = $null; $config = $null; $pg = $null; $app = $null

function Fail([string]$message) { throw $message }
function PortBusy([int]$port) { return (@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).Count -gt 0) }
function Set-One($name,$value) { Set-Item -Path "Env:$name" -Value ([string]$value) }
function Resolve-ManagedDataPath([string]$candidate) {
  if (-not [IO.Path]::IsPathRooted($candidate)) { Fail 'Caminho de dados relativo recusado.' }
  $full = [IO.Path]::GetFullPath($candidate)
  $base = [IO.Path]::GetFullPath((Join-Path $root 'postgres\data'))
  $clusters = [IO.Path]::GetFullPath((Join-Path $root 'postgres\clusters'))
  if ($full -ieq $base) { return $full }
  $pattern = '^' + [regex]::Escape($clusters.TrimEnd('\')) + '\\[a-f0-9-]{36}\\data$'
  if ($full -notmatch $pattern) { Fail 'Diretório de cluster fora da allowlist privada.' }
  $cursor = $full
  while ($cursor -and $cursor.Length -ge $clusters.Length) {
    if (Test-Path -LiteralPath $cursor) {
      if (((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'Caminho do cluster contém link/junction.' }
    }
    if ($cursor -ieq $clusters) { break }
    $cursor = Split-Path -Parent $cursor
  }
  return $full
}
function Acquire-StartLock {
  $stream = $null
  try {
    try { $stream = [IO.File]::Open($startLockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch {
      if (-not (Test-Path -LiteralPath $startLockPath -PathType Leaf)) { Fail 'Nao foi possivel obter a trava exclusiva de inicializacao.' }
      if (((Get-Item -LiteralPath $startLockPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'A trava de inicializacao e um link/junction; nenhum arquivo foi alterado.' }
      Assert-PrivateAcl $startLockPath
      try { $stream = [IO.File]::Open($startLockPath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
      catch { Fail 'Outra inicializacao esta usando a trava exclusiva; aguarde e tente novamente.' }
      try {
        $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::UTF8, $true, 1024, $true)
        $lockText = $reader.ReadToEnd(); $reader.Dispose()
        try { $oldLock = $lockText | ConvertFrom-Json } catch { Fail 'A trava antiga esta ilegivel; ela foi preservada para diagnostico.' }
        if ($oldLock.version -ne 1 -or $oldLock.pid -notmatch '^\d+$' -or [string]::IsNullOrWhiteSpace([string]$oldLock.token)) { Fail 'A identidade da trava antiga e incerta; nenhum arquivo foi alterado.' }
        $ownerProcess = Get-Process -Id ([int]$oldLock.pid) -ErrorAction SilentlyContinue
        if ($ownerProcess) { Fail 'A inicializacao registrada ainda esta ativa ou o PID foi reutilizado; a trava foi preservada.' }
        Write-HomologLog 'Trava antiga comprovadamente sem processo proprietario; reutilizacao exclusiva autorizada.'
      } catch { $stream.Dispose(); throw }
    }
    $record = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json @{ version=1; pid=$PID; token=$startLockToken; startedUtc=(Get-Date).ToUniversalTime().ToString('o') } -Compress))
    $stream.SetLength(0); $stream.Position = 0; $stream.Write($record, 0, $record.Length); $stream.Flush()
    $script:startLockStream = $stream
  } catch {
    if ($stream) { $stream.Dispose() }
    throw
  }
}
function Write-HomologLog([string]$message) {
  try { Add-Content -LiteralPath (Join-Path $logs 'launcher.log') -Encoding UTF8 -Value ("{0:o} {1}" -f (Get-Date), $message) } catch { }
}
function Check-ClusterProcess($pidValue,$expectedCommand) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
  if (-not $p) { Fail 'O processo PostgreSQL comprovado nao esta ativo.' }
  $normalizedCommand = $p.CommandLine.Replace('/','\')
  if ([IO.Path]::GetFileName($p.ExecutablePath) -ne 'postgres.exe' -or $p.CommandLine -ne $expectedCommand -or $normalizedCommand -notmatch [regex]::Escape($dataPath) -or $normalizedCommand -notmatch '(?i)-h\s+"?127\.0\.0\.1' -or $normalizedCommand -notmatch '(?i)-p\s+"?55432') { Fail 'A identidade do processo PostgreSQL nao confere; nada sera encerrado.' }
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue)
  if ($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne [int]$pidValue -or $listeners[0].LocalAddress -ne '127.0.0.1') { Fail 'O listener PostgreSQL nao pertence exclusivamente ao processo identificado.' }
  return $p
}
function Set-SecretAcl($path) {
  $acl = Get-Acl -LiteralPath $path
  $acl.SetAccessRuleProtection($true, $false)
  $acl.Access | ForEach-Object { [void]$acl.RemoveAccessRule($_) }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')))
  Set-Acl -LiteralPath $path -AclObject $acl
}
function Assert-PrivateAcl($path) {
  $acl = Get-Acl -LiteralPath $path
  if (-not $acl.AreAccessRulesProtected) {
    $parentAcl = Get-Acl -LiteralPath (Split-Path -Parent $path)
    if (-not $parentAcl.AreAccessRulesProtected) { Fail 'O arquivo herda de um diretorio privado sem ACL protegida.' }
  }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  foreach ($rule in $acl.Access) {
    $name = $rule.IdentityReference.Value
    if ($name -notin @($identity,'NT AUTHORITY\SYSTEM')) { Fail 'A configuracao de homologacao possui permissao para outra conta Windows.' }
  }
}
function Save-PrivateConfig($path,$config) {
  Assert-PrivateAcl $path
  $originalAcl = Get-Acl -LiteralPath $path
  $temporary = $path + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
  try {
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Dispose()
    Set-Acl -LiteralPath $temporary -AclObject $originalAcl
    Assert-PrivateAcl $temporary
    $json = ConvertTo-Json -InputObject $config -Depth 32
    [IO.File]::WriteAllText($temporary, $json + "`n", (New-Object Text.UTF8Encoding($false)))
    Assert-PrivateAcl $temporary
    [IO.File]::Replace($temporary, $path, $null)
    Assert-PrivateAcl $path
  } catch {
    if (Test-Path -LiteralPath $temporary -PathType Leaf) { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
    Fail 'Nao foi possivel atualizar a configuracao privada; as permissoes existentes foram preservadas.'
  }
}
function Ensure-ClientEmailPepper($path,$config) {
  $pepper = [string]$config.app.clientePublicoPepper
  if (-not [string]::IsNullOrWhiteSpace($pepper)) {
    if ([Text.Encoding]::UTF8.GetByteCount($pepper) -lt 32) { Fail 'CLIENTE_PUBLICO_PEPPER privado invalido; a configuracao existente foi preservada.' }
    return $pepper
  }
  $bytes = New-Object byte[] 48
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  $pepper = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  $config.app | Add-Member -MemberType NoteProperty -Name clientePublicoPepper -Value $pepper -Force
  Save-PrivateConfig $path $config
  return $pepper
}

$clusterStarted = $false
try {
  if (-not $node) { Fail 'Node.js nao foi encontrado. Solicite a preparacao tecnica.' }
  if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { Fail 'Este Windows nao disponibiliza a verificacao segura de proprietario de porta; nenhum processo sera iniciado.' }
  if ($env:DATABASE_URL) { Fail 'DATABASE_URL herdada detectada. O launcher nao a usara; feche a sessao e abra o atalho novamente.' }
  Get-ChildItem Env: | Where-Object { $_.Name -match '^(PG|PSQL)' } | ForEach-Object { Remove-Item "Env:$($_.Name)" -ErrorAction SilentlyContinue }
  Get-ChildItem Env: | Where-Object { $_.Name -match '^(EMAIL_|SMTP_PROVIDER_)' } | ForEach-Object { Remove-Item "Env:$($_.Name)" -ErrorAction SilentlyContinue }
  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { Fail 'Configuracao local ausente. Execute o preparador do banco de homologacao.' }
  if (-not (Test-Path -LiteralPath (Join-Path $repo 'frontend\dist\index.html') -PathType Leaf)) { Fail 'Frontend compilado ausente. Solicite a preparacao tecnica; o inicializador nao executa npm.' }
  if (-not (Test-Path -LiteralPath (Join-Path $repo 'backend\node_modules\pg') -PathType Container)) { Fail 'Dependencias do backend ausentes. O inicializador nao instala pacotes.' }
  New-Item -ItemType Directory -Path $runtime,$logs -Force | Out-Null
  $startLockToken = [guid]::NewGuid().ToString('N')
  Acquire-StartLock
  if (Test-Path -LiteralPath (Join-Path $runtime '.env')) { Fail 'Foi encontrado .env inesperado no runtime; nenhuma configuracao sera carregada.' }
  $configItem = Get-Item -LiteralPath $configPath -Force
  if (($configItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'O arquivo config.json nao pode ser um link ou junction.' }
  Assert-PrivateAcl $configPath
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $pg = $config.postgres; $app = $config.app
  $clientEmailPepper = Ensure-ClientEmailPepper $configPath $config
  $expectedData = Resolve-ManagedDataPath ([string]$pg.dataDirectory)
  $dataPath = $expectedData
  if ([int]$config.version -ne 1 -or $pg.host -ne '127.0.0.1' -or [int]$pg.port -ne 55432 -or $pg.database -ne 'amores_pet_homologacao' -or $app.host -ne '127.0.0.1' -or [int]$app.port -ne 3001) { Fail 'Configuracao recusada: host, porta, nome ou caminho nao correspondem ao contrato isolado.' }
  if ([string]$pg.user -ne 'amores_pet_homologacao_app' -or [string]::IsNullOrWhiteSpace([string]$pg.password) -or [string]::IsNullOrWhiteSpace([string]$pg.clusterUser) -or [string]::IsNullOrWhiteSpace([string]$pg.clusterPassword) -or [string]::IsNullOrWhiteSpace([string]$app.jwtSecret) -or ([string]$app.jwtSecret).Length -lt 32) { Fail 'Credenciais locais incompletas ou incompatíveis com o perfil dedicado.' }
  foreach ($path in @($pg.pgCtlPath,$pg.psqlPath)) { if ([string]$path -notmatch '^[A-Za-z]:\\' -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { Fail 'Ferramentas PostgreSQL devem ter caminhos absolutos existentes.' } }
  if (-not (Test-Path -LiteralPath (Join-Path $dataPath '.amores-homologacao-cluster.json') -PathType Leaf)) { Fail 'Marcador de propriedade do cluster ausente; o launcher nao tocara no PostgreSQL.' }
  if (((Get-Item -LiteralPath $dataPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or ((Get-Item -LiteralPath (Join-Path $dataPath '.amores-homologacao-cluster.json') -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'Diretorio ou marcador do cluster nao pode ser link/junction.' }
  $marker = Get-Content -LiteralPath (Join-Path $dataPath '.amores-homologacao-cluster.json') -Raw | ConvertFrom-Json
  if ($marker.formato -ne 'amores-pet-homologacao-v1' -or [string]$marker.clusterId -notmatch '^[a-f0-9-]{36}$' -or ($pg.clusterId -and [string]$pg.clusterId -ne [string]$marker.clusterId)) { Fail 'Marcador de propriedade invalido ou divergente da configuracao.' }

  if (Test-Path -LiteralPath $statePath) {
    if (((Get-Item -LiteralPath $statePath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'Registro de sessao e um link/junction; identidade incerta. Nenhum processo ou arquivo foi alterado.' }
    Assert-PrivateAcl $statePath
    try { $old = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } catch { Fail 'Registro de sessao ilegivel; identidade incerta. Consulte os logs sem remover o arquivo.' }
    if ($old.version -ne 1 -or $old.appPid -notmatch '^\d+$' -or $old.pgPid -notmatch '^\d+$' -or [int]$old.appPid -eq [int]$old.pgPid -or
        -not $old.appToken -or -not $old.appOwner -or -not $old.appCommand -or -not $old.pgCommand -or
        -not $old.pgStartedByLauncher -or [int]$old.port -ne 55432 -or
        [IO.Path]::GetFullPath([string]$old.dataDirectory) -ne [IO.Path]::GetFullPath($expectedData) -or
        [string]$old.clusterId -ne [string]$marker.clusterId) {
      Fail 'Registro de sessao nao corresponde a configuracao e marcador atuais; identidade incerta, nenhum arquivo foi removido.'
    }
    $oldApp = Get-CimInstance Win32_Process -Filter "ProcessId = $($old.appPid)" -ErrorAction SilentlyContinue
    $oldPg = Get-CimInstance Win32_Process -Filter "ProcessId = $($old.pgPid)" -ErrorAction SilentlyContinue
    $oldAppHandle = Get-Process -Id ([int]$old.appPid) -ErrorAction SilentlyContinue
    $oldPgHandle = Get-Process -Id ([int]$old.pgPid) -ErrorAction SilentlyContinue
    if (($oldAppHandle -and -not $oldApp) -or ($oldPgHandle -and -not $oldPg)) {
      Fail 'Um PID registrado existe, mas sua identidade nao pode ser lida; estado preservado para diagnostico.'
    }
    $appListeners = @(Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue)
    $pgListeners = @(Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue)

    if (-not $oldApp -and -not $oldPg) {
      if ($appListeners.Count -ne 0 -or $pgListeners.Count -ne 0) { Fail 'O registro parece antigo, mas uma das portas continua ocupada; identidade incerta e registro preservado.' }
      $expectedNode = (Get-Item -LiteralPath $node).FullName
      $expectedPostgres = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath([string]$pg.pgCtlPath))) 'postgres.exe'
      if ([IO.Path]::GetFullPath([string]$old.appExecutable) -ne [IO.Path]::GetFullPath($expectedNode) -or
          [IO.Path]::GetFullPath([string]$old.pgExecutable) -ne [IO.Path]::GetFullPath($expectedPostgres) -or
          [string]$old.appCommand -notmatch [regex]::Escape('backend-runner.cjs') -or
          [string]$old.appCommand -notmatch [regex]::Escape([string]$old.appOwner)) {
        Fail 'O registro inativo nao comprova propriedade deste launcher; arquivo preservado para diagnostico.'
      }
      $pidFile = Join-Path $dataPath 'postmaster.pid'
      if (Test-Path -LiteralPath $pidFile) {
        $pidLines = Get-Content -LiteralPath $pidFile
        $normalizedPgCommand = ([string]$old.pgCommand).Replace('/','\')
        if ($pidLines.Count -lt 6 -or [int]$pidLines[0] -ne [int]$old.pgPid -or
            [IO.Path]::GetFullPath([string]$pidLines[1]) -ne [IO.Path]::GetFullPath($expectedData) -or
            [int]$pidLines[3] -ne 55432 -or ($pidLines[5] -split ',').Trim() -notcontains '127.0.0.1' -or
            $normalizedPgCommand -notmatch [regex]::Escape($expectedData) -or
            $normalizedPgCommand -notmatch '(?i)-h\s+"?127\.0\.0\.1' -or $normalizedPgCommand -notmatch '(?i)-p\s+"?55432') {
          Fail 'O processo esta ausente, mas postmaster.pid nao corresponde ao cluster registrado; estado preservado.'
        }
        & $pg.pgCtlPath -D $expectedData status *> $null
        if ($LASTEXITCODE -eq 0) { Fail 'pg_ctl ainda identifica o cluster ativo; estado preservado.' }
        $stalePidPath = "$pidFile.stale-$([guid]::NewGuid().ToString('N'))"
        Move-Item -LiteralPath $pidFile -Destination $stalePidPath
        Write-HomologLog 'postmaster.pid antigo foi movido para arquivo de diagnostico apos validar PID, caminho, porta, host, marcador e ausencia do processo.'
      }
      if ((Get-Process -Id ([int]$old.appPid) -ErrorAction SilentlyContinue) -or
          (Get-Process -Id ([int]$old.pgPid) -ErrorAction SilentlyContinue) -or
          (PortBusy 3001) -or (PortBusy 55432)) {
        Fail 'A sessao mudou durante a validacao; registro preservado e nenhum processo foi tocado.'
      }
      $currentMarker = Get-Content -LiteralPath (Join-Path $dataPath '.amores-homologacao-cluster.json') -Raw | ConvertFrom-Json
      if ([string]$currentMarker.clusterId -ne [string]$old.clusterId) { Fail 'O marcador mudou durante a validacao; registro preservado.' }
      Remove-Item -LiteralPath $statePath -Force
      Write-HomologLog 'Registro de sessao antigo invalidado: PIDs ausentes, portas livres e config/marcador correspondentes.'
    } elseif ($oldApp -and -not $oldPg) {
      # Recupera PostgreSQL somente quando o backend e o cluster registrado
      # podem ser identificados e a porta do banco est\u00e1 livre.
      $expectedNode = (Get-Item -LiteralPath $node).FullName
      $expectedPostgres = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath([string]$pg.pgCtlPath))) 'postgres.exe'
      $normalizedPgCommand = ([string]$old.pgCommand).Replace('/','\')
      if ([IO.Path]::GetFullPath([string]$old.appExecutable) -ne [IO.Path]::GetFullPath($expectedNode) -or
          $oldApp.ExecutablePath -ne $expectedNode -or $oldApp.CommandLine -ne [string]$old.appCommand -or
          $oldApp.CommandLine -notmatch [regex]::Escape('backend-runner.cjs') -or
          $oldApp.CommandLine -notmatch [regex]::Escape([string]$old.appOwner) -or
          [IO.Path]::GetFullPath([string]$old.pgExecutable) -ne [IO.Path]::GetFullPath($expectedPostgres) -or
          $normalizedPgCommand -notmatch [regex]::Escape($expectedData) -or
          $normalizedPgCommand -notmatch '(?i)-h\s+"?127\.0\.0\.1' -or
          $normalizedPgCommand -notmatch '(?i)-p\s+"?55432' -or
          $appListeners.Count -ne 1 -or $appListeners[0].OwningProcess -ne [int]$old.appPid -or
          $appListeners[0].LocalAddress -ne '127.0.0.1' -or $pgListeners.Count -ne 0) {
        Fail 'PostgreSQL ausente, mas identidade do backend, cluster ou portas diverge; nada foi iniciado nem encerrado.'
      }
      $pidFile = Join-Path $expectedData 'postmaster.pid'
      if (Test-Path -LiteralPath $pidFile) {
        $pidLines = Get-Content -LiteralPath $pidFile
        if ($pidLines.Count -lt 6 -or [int]$pidLines[0] -ne [int]$old.pgPid -or
            [IO.Path]::GetFullPath([string]$pidLines[1]) -ne [IO.Path]::GetFullPath($expectedData) -or
            [int]$pidLines[3] -ne 55432 -or ($pidLines[5] -split ',').Trim() -notcontains '127.0.0.1') {
          Fail 'postmaster.pid nao corresponde ao cluster registrado; arquivo preservado e PostgreSQL nao iniciado.'
        }
      }
      & $pg.pgCtlPath -D $expectedData status *> $null
      if ($LASTEXITCODE -eq 0) { Fail 'pg_ctl ainda identifica o cluster ativo; nenhum PostgreSQL foi iniciado.' }
      if (PortBusy 55432) { Fail 'A porta 55432 ficou ocupada durante a validacao; nenhum processo foi tocado.' }
      if (Test-Path -LiteralPath $pidFile) {
        $stalePidPath = "$pidFile.stale-$([guid]::NewGuid().ToString('N'))"
        Move-Item -LiteralPath $pidFile -Destination $stalePidPath
        Write-HomologLog 'postmaster.pid comprovadamente obsoleto foi movido para diagnostico antes da recuperacao do cluster identificado.'
      }

      $pgStdout = Join-Path $logs 'postgres-stdout.log'; $pgStderr = Join-Path $logs 'postgres-stderr.log'
      $pgArguments = @('-D',$expectedData,'-h','127.0.0.1','-p','55432')
      $pgLaunchProcess = Start-Process -FilePath $expectedPostgres -ArgumentList $pgArguments -WorkingDirectory $runtime -WindowStyle Hidden -PassThru -RedirectStandardOutput $pgStdout -RedirectStandardError $pgStderr
      $pgProcess = $pgLaunchProcess; $clusterStarted = $true
      $clusterReady = $false
      for ($i=0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if ($pgProcess.HasExited) { break }
        if (Test-Path -LiteralPath $pidFile) {
          $pidLines = Get-Content -LiteralPath $pidFile
          $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue)
          if ($pidLines.Count -ge 6 -and [int]$pidLines[0] -eq $pgProcess.Id -and
              [IO.Path]::GetFullPath([string]$pidLines[1]) -eq [IO.Path]::GetFullPath($expectedData) -and
              [int]$pidLines[3] -eq 55432 -and ($pidLines[5] -split ',').Trim() -contains '127.0.0.1' -and
              $listeners.Count -eq 1 -and $listeners[0].OwningProcess -eq $pgProcess.Id -and $listeners[0].LocalAddress -eq '127.0.0.1') { $clusterReady = $true; break }
        }
      }
      if (-not $clusterReady) { Fail 'O cluster isolado nao recuperou prontidao; consulte postgres-stderr.log.' }
      $pgProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($pgLaunchProcess.Id)" -ErrorAction SilentlyContinue
      $normalizedPgCommand = if ($pgProcess) { $pgProcess.CommandLine.Replace('/','\') } else { '' }
      if (-not $pgProcess -or [IO.Path]::GetFullPath([string]$pgProcess.ExecutablePath) -ne [IO.Path]::GetFullPath($expectedPostgres) -or
          $normalizedPgCommand -notmatch [regex]::Escape($expectedData) -or
          $normalizedPgCommand -notmatch '(?i)-h\s+"?127\.0\.0\.1' -or $normalizedPgCommand -notmatch '(?i)-p\s+"?55432') {
        Fail 'O PostgreSQL iniciou, mas sua identidade nao foi comprovada.'
      }
      $pgPid = [int]$pgProcess.ProcessId; $pgCommand = [string]$pgProcess.CommandLine
      $null = Check-ClusterProcess $pgPid $pgCommand

      Set-One 'DB_HOST' '127.0.0.1'; Set-One 'DB_PORT' '55432'; Set-One 'DB_NAME' 'amores_pet_homologacao'; Set-One 'DB_USER' ([string]$pg.user); Set-One 'DB_PASSWORD' ([string]$pg.password); Set-One 'DB_SSL' 'disable'
      Set-One 'HOMOLOGACAO_DATA_DIRECTORY' $expectedData; Set-One 'HOMOLOGACAO_PG_CTL' ([IO.Path]::GetFullPath([string]$pg.pgCtlPath))
      $databaseCheck = & $node (Join-Path $PSScriptRoot 'verificar-banco.cjs') 2>&1
      if ($LASTEXITCODE -ne 0) { $databaseCheck | Add-Content -LiteralPath (Join-Path $logs 'banco-error.log'); Fail 'A identidade SQL do cluster recuperado nao confere; consulte banco-error.log.' }
      $databaseCheck | Set-Content -LiteralPath (Join-Path $logs 'banco.log') -Encoding UTF8
      $clusterStarted = $false

      $ready = $false
      for ($i=0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if (-not (Get-CimInstance Win32_Process -Filter "ProcessId = $($old.appPid)" -ErrorAction SilentlyContinue)) { break }
        try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health/ready' -TimeoutSec 2; if ($health.status -eq 'ready') { $ready = $true; break } } catch { }
      }
      if (-not $ready) { Fail 'PostgreSQL recuperado e identificado, mas a API ainda nao confirmou readiness. O cluster foi mantido ativo.' }
      $old.pgPid = $pgPid; $old.pgExecutable = $pgProcess.ExecutablePath; $old.pgCommand = $pgCommand
      $old | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
      Write-HomologLog 'PostgreSQL encerrado recuperado a partir do cluster marcado; backend proprio, SQL identity e health readiness confirmados.'
      Write-Output 'PostgreSQL da homologacao recuperado; backend e API prontos, dados preservados.'
      if (-not $SkipBrowser) { Start-Process 'http://127.0.0.1:3001/login' }
      return
    } elseif (-not $oldApp -and $oldPg) {
      # Recupera somente o backend cujo PID anterior está ausente, mantendo
      # o PostgreSQL ativo após comprovar processo, linha de comando e listener.
      $expectedNode = (Get-Item -LiteralPath $node).FullName
      $expectedPostgres = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath([string]$pg.pgCtlPath))) 'postgres.exe'
      $normalizedPgCommand = $oldPg.CommandLine.Replace('/','\')
      if ($appListeners.Count -ne 0 -or
          [IO.Path]::GetFullPath([string]$old.pgExecutable) -ne [IO.Path]::GetFullPath($expectedPostgres) -or
          [IO.Path]::GetFullPath([string]$old.appExecutable) -ne [IO.Path]::GetFullPath($expectedNode) -or
          [string]$old.appCommand -notmatch [regex]::Escape('backend-runner.cjs') -or
          [string]$old.appCommand -notmatch [regex]::Escape([string]$old.appOwner) -or
          [IO.Path]::GetFullPath([string]$oldPg.ExecutablePath) -ne [IO.Path]::GetFullPath($expectedPostgres) -or
          [string]$oldPg.CommandLine -ne [string]$old.pgCommand -or
          $normalizedPgCommand -notmatch [regex]::Escape($expectedData) -or
          $normalizedPgCommand -notmatch '(?i)-h\s+"?127\.0\.0\.1' -or
          $normalizedPgCommand -notmatch '(?i)-p\s+"?55432' -or
          $pgListeners.Count -ne 1 -or $pgListeners[0].OwningProcess -ne [int]$old.pgPid -or
          $pgListeners[0].LocalAddress -ne '127.0.0.1') {
        Fail 'Backend ausente, mas identidade do PostgreSQL ou da sessao diverge; nada foi iniciado nem encerrado.'
      }
      $null = Check-ClusterProcess ([int]$old.pgPid) ([string]$old.pgCommand)

      Set-One 'DB_HOST' '127.0.0.1'; Set-One 'DB_PORT' '55432'; Set-One 'DB_NAME' 'amores_pet_homologacao'; Set-One 'DB_USER' ([string]$pg.user); Set-One 'DB_PASSWORD' ([string]$pg.password); Set-One 'DB_SSL' 'disable'
      Set-One 'HOMOLOGACAO_DATA_DIRECTORY' $expectedData; Set-One 'HOMOLOGACAO_PG_CTL' ([IO.Path]::GetFullPath([string]$pg.pgCtlPath))
      $databaseCheck = & $node (Join-Path $PSScriptRoot 'verificar-banco.cjs') 2>&1
      if ($LASTEXITCODE -ne 0) { Write-HomologLog 'Recuperacao recusada: verificacao da identidade SQL falhou.'; Fail 'O banco nao passou na verificacao da homologacao; backend nao iniciado. Consulte banco-error.log.' }
      $databaseCheck | Set-Content -LiteralPath (Join-Path $logs 'banco.log') -Encoding UTF8

      Set-One 'PORT' '3001'; Set-One 'HOST' '127.0.0.1'; Set-One 'JWT_SECRET' ([string]$app.jwtSecret)
       Set-One 'CLIENTE_PUBLICO_PEPPER' $clientEmailPepper; Set-One 'AMORES_HOMOLOG_EMAIL_SINK' '1'
      Set-One 'AMORES_PET_HOMOLOGACAO' '1'; Set-One 'SERVIR_FRONTEND_LOCAL' '1'
      Set-One 'FRONTEND_URL' 'http://127.0.0.1:3001'; Set-One 'AMORES_HOMOLOG_RUNTIME' $runtime
      Set-One 'AMORES_HOMOLOG_REPO' $repo; Set-One 'AMORES_HOMOLOG_OWNER_ID' ([string]$old.appOwner)
      Set-One 'AMORES_HOMOLOG_STOP_TOKEN' ([string]$old.appToken)
      Remove-Item Env:DATABASE_URL,Env:PGSERVICE,Env:PGOPTIONS -ErrorAction SilentlyContinue
      $owner = [string]$old.appOwner; $token = [string]$old.appToken
      $argumentLine = '"' + (Join-Path $PSScriptRoot 'backend-runner.cjs') + '" --owner-id ' + $owner
      $appProcess = Start-Process -FilePath $node -ArgumentList $argumentLine -WorkingDirectory $runtime -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'backend.log') -RedirectStandardError (Join-Path $logs 'backend-error.log')
      $ready = $false
      for ($i=0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if ($appProcess.HasExited) { break }
        try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health/ready' -TimeoutSec 2; if ($health.status -eq 'ready') { $ready = $true; break } } catch { }
      }
      if (-not $ready) { Fail 'Backend da homologacao nao recuperou prontidao; PostgreSQL foi preservado. Consulte backend-error.log.' }
      $newApp = Get-CimInstance Win32_Process -Filter "ProcessId = $($appProcess.Id)" -ErrorAction SilentlyContinue
      if (-not $newApp -or [IO.Path]::GetFullPath([string]$newApp.ExecutablePath) -ne [IO.Path]::GetFullPath($expectedNode) -or
          $newApp.CommandLine -notmatch [regex]::Escape('backend-runner.cjs') -or
          $newApp.CommandLine -notmatch [regex]::Escape($owner)) {
        Fail 'Backend recuperado, mas identidade do processo nao foi comprovada; PostgreSQL e registro foram preservados.'
      }
      $newAppListeners = @(Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue)
      if ($newAppListeners.Count -ne 1 -or $newAppListeners[0].OwningProcess -ne $appProcess.Id -or $newAppListeners[0].LocalAddress -ne '127.0.0.1') {
        Fail 'Backend recuperado, mas o listener nao pertence exclusivamente ao processo iniciado.'
      }
      $old.appPid = $appProcess.Id
      $old.appExecutable = $expectedNode
      $old.appCommand = $newApp.CommandLine
      $old.appStartedUtc = (Get-Date).ToUniversalTime().ToString('o')
      $old | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
      Write-HomologLog 'Backend encerrado recuperado com cluster ativo validado, destino SQL conferido e health readiness aprovada.'
      Write-Output 'Backend da homologacao recuperado; banco preservado e API pronta.'
      if (-not $SkipBrowser) { Start-Process 'http://127.0.0.1:3001/login' }
      return
    } elseif ($oldApp -and $oldPg) {
      $expectedNode = (Get-Item -LiteralPath $node).FullName
      $expectedPostgres = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath([string]$pg.pgCtlPath))) 'postgres.exe'
      if ([IO.Path]::GetFullPath([string]$oldApp.ExecutablePath) -ne [IO.Path]::GetFullPath($expectedNode) -or
          [string]$oldApp.CommandLine -ne [string]$old.appCommand -or
          [string]$oldApp.CommandLine -notmatch [regex]::Escape('backend-runner.cjs') -or
          [string]$oldApp.CommandLine -notmatch [regex]::Escape([string]$old.appOwner) -or
          [IO.Path]::GetFullPath([string]$oldPg.ExecutablePath) -ne [IO.Path]::GetFullPath($expectedPostgres) -or
          [string]$oldPg.CommandLine -ne [string]$old.pgCommand) {
        Fail 'Um PID registrado pertence a processo de identidade diferente; sessao incerta. Nada foi adotado, encerrado ou removido.'
      }
      $normalizedPgCommand = $oldPg.CommandLine.Replace('/','\')
      if ($normalizedPgCommand -notmatch [regex]::Escape($expectedData) -or
          $normalizedPgCommand -notmatch '(?i)-h\s+"?127\.0\.0\.1' -or $normalizedPgCommand -notmatch '(?i)-p\s+"?55432' -or
          $appListeners.Count -ne 1 -or $appListeners[0].OwningProcess -ne [int]$old.appPid -or $appListeners[0].LocalAddress -ne '127.0.0.1' -or
          $pgListeners.Count -ne 1 -or $pgListeners[0].OwningProcess -ne [int]$old.pgPid -or $pgListeners[0].LocalAddress -ne '127.0.0.1') {
        Fail 'PIDs/portas da sessao nao coincidem com os listeners locais; nenhum processo foi tocado.'
      }
      Set-One 'DB_HOST' '127.0.0.1'; Set-One 'DB_PORT' '55432'; Set-One 'DB_NAME' 'amores_pet_homologacao'; Set-One 'DB_USER' ([string]$pg.user); Set-One 'DB_PASSWORD' ([string]$pg.password)
      Set-One 'HOMOLOGACAO_DATA_DIRECTORY' $expectedData
      $dbIdentity = & $node (Join-Path $PSScriptRoot 'verificar-banco.cjs') 2>&1
      if ($LASTEXITCODE -ne 0) { Write-HomologLog 'Sessao ativa identificada, mas a verificacao SQL do banco falhou.'; Fail 'A sessao pertence ao Amores Pet, mas o banco nao passou na verificacao. Consulte launcher.log e banco-error.log; nada foi encerrado.' }
      try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health/ready' -TimeoutSec 5 } catch { Fail 'A sessao pertence ao Amores Pet, mas o backend ainda nao esta pronto. Consulte launcher.log; nenhum processo foi encerrado.' }
      if ($health.status -ne 'ready') { Fail 'A sessao foi identificada, mas o backend nao confirmou prontidao. Nenhum processo foi encerrado.' }
      Write-HomologLog 'Sessao ativa validada por executaveis, comandos, marcador, listeners, identidade SQL e health readiness.'
      Write-Output 'A sessão de homologação já está ativa e foi validada; nenhuma instância nova foi iniciada.'
      if (-not $SkipBrowser) { Start-Process 'http://127.0.0.1:3001/login' }
      return
    } else {
      Fail 'Sessao parcial: um dos processos registrados ainda existe. Identidade incerta; registro e processos foram preservados.'
    }
  }
  if (PortBusy 3001) { Fail 'A porta 3001 ja esta ocupada. O processo existente nao sera tocado.' }
  if (PortBusy 55432) { Fail 'A porta 55432 ja esta ocupada. O PostgreSQL existente nao sera adotado nem encerrado.' }
  if (Test-Path -LiteralPath (Join-Path $dataPath 'postmaster.pid')) { Fail 'Existe postmaster.pid anterior; o launcher nao apagará nem reutilizara esse estado.' }
  & $pg.pgCtlPath -D $expectedData status *> $null
  if ($LASTEXITCODE -eq 0) { Fail 'O cluster ja estava ativo antes desta sessao; o launcher nao o adotara nem encerrara.' }
  $pgVersion = (& $pg.pgCtlPath --version 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $pgVersion -notmatch 'PostgreSQL\) 17\.') { Fail 'pg_ctl deve ser da versao PostgreSQL 17.' }

  $expectedPostgres = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath([string]$pg.pgCtlPath))) 'postgres.exe'
  $pgStdout = Join-Path $logs 'postgres-stdout.log'; $pgStderr = Join-Path $logs 'postgres-stderr.log'
  $pgArguments = @('-D',$expectedData,'-h','127.0.0.1','-p','55432')
  $pgLaunchProcess = Start-Process -FilePath $expectedPostgres -ArgumentList $pgArguments -WorkingDirectory $runtime -WindowStyle Hidden -PassThru -RedirectStandardOutput $pgStdout -RedirectStandardError $pgStderr
  $pgProcess = $pgLaunchProcess
  $clusterStarted = $true
  $pidFile = Join-Path $dataPath 'postmaster.pid'
  $clusterReady = $false
  for ($i=0; $i -lt 40; $i++) {
    if ($pgProcess.HasExited) { Fail 'O processo PostgreSQL encerrou durante a inicializacao; consulte postgres-stderr.log.' }
    if (Test-Path -LiteralPath $pidFile) {
      $candidate = Get-Content -LiteralPath $pidFile
      if ($candidate.Count -ge 6 -and [int]$candidate[0] -gt 0) {
        $candidateListeners = @(Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue)
        if ($candidateListeners.Count -eq 1 -and $candidateListeners[0].OwningProcess -eq [int]$candidate[0] -and $candidateListeners[0].LocalAddress -eq '127.0.0.1') { $clusterReady = $true; break }
      }
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $clusterReady) { Fail 'O PostgreSQL nao ficou pronto em 20 segundos; consulte postgres-stderr.log.' }
  $pidLines = Get-Content -LiteralPath $pidFile
  $pgPid = [int]$pidLines[0]
  if ($pgPid -ne $pgProcess.Id -or [IO.Path]::GetFullPath([string]$pidLines[1]) -ne $expectedData -or [int]$pidLines[3] -ne 55432 -or ($pidLines[5] -split ',').Trim() -notcontains '127.0.0.1') { Fail 'postmaster.pid nao confirma o cluster isolado esperado.' }
  $pgProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $pgPid" -ErrorAction SilentlyContinue
  $normalizedPgCommand = if ($pgProcess) { $pgProcess.CommandLine.Replace('/','\') } else { '' }
  if (-not $pgProcess -or [IO.Path]::GetFullPath($pgProcess.ExecutablePath) -ne [IO.Path]::GetFullPath($expectedPostgres) -or $normalizedPgCommand -notmatch [regex]::Escape($expectedData) -or $normalizedPgCommand -notmatch '(?i)-h\s+"?127\.0\.0\.1' -or $normalizedPgCommand -notmatch '(?i)-p\s+"?55432') { Fail 'PID/linha de comando do cluster iniciado nao confere.' }
  $pgCommand = $pgProcess.CommandLine
  $null = Check-ClusterProcess $pgPid $pgProcess.CommandLine

  Set-One 'DB_HOST' '127.0.0.1'; Set-One 'DB_PORT' '55432'; Set-One 'DB_NAME' 'amores_pet_homologacao'; Set-One 'DB_USER' ([string]$pg.user); Set-One 'DB_PASSWORD' ([string]$pg.password); Set-One 'DB_SSL' 'disable'
  Set-One 'AMORES_HOMOLOG_DATA_DIRECTORY' $expectedData
  Set-One 'HOMOLOGACAO_DATA_DIRECTORY' $expectedData; Set-One 'HOMOLOGACAO_PG_CTL' ([IO.Path]::GetFullPath([string]$pg.pgCtlPath))
  $verify = & $node (Join-Path $PSScriptRoot 'verificar-banco.cjs') 2>&1
  if ($LASTEXITCODE -ne 0) { $verify | Add-Content -LiteralPath (Join-Path $logs 'banco-error.log'); Fail 'A identidade SQL do banco nao confere. O cluster deste ciclo sera encerrado somente apos nova verificacao.' }
  $verify | Set-Content -LiteralPath (Join-Path $logs 'banco.log') -Encoding UTF8

  Set-One 'PORT' ([string]$app.port); Set-One 'HOST' ([string]$app.host); Set-One 'JWT_SECRET' ([string]$app.jwtSecret)
  Set-One 'CLIENTE_PUBLICO_PEPPER' $clientEmailPepper; Set-One 'AMORES_HOMOLOG_EMAIL_SINK' '1'
  Set-One 'AMORES_PET_HOMOLOGACAO' '1'; Set-One 'SERVIR_FRONTEND_LOCAL' '1'
  Set-One 'FRONTEND_URL' 'http://127.0.0.1:3001'; Set-One 'AMORES_HOMOLOG_RUNTIME' $runtime
  Set-One 'AMORES_HOMOLOG_REPO' $repo; Set-One 'AMORES_HOMOLOG_OWNER_ID' ([guid]::NewGuid().ToString('N'))
  $randomBytes = New-Object byte[] 32
  $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $randomGenerator.GetBytes($randomBytes) } finally { $randomGenerator.Dispose() }
  Set-One 'AMORES_HOMOLOG_STOP_TOKEN' ([Convert]::ToBase64String($randomBytes))
  Remove-Item Env:DATABASE_URL,Env:PGSERVICE,Env:PGOPTIONS -ErrorAction SilentlyContinue
  $owner = $env:AMORES_HOMOLOG_OWNER_ID; $token = $env:AMORES_HOMOLOG_STOP_TOKEN
  $argumentLine = '"' + (Join-Path $PSScriptRoot 'backend-runner.cjs') + '" --owner-id ' + $owner
  $appProcess = Start-Process -FilePath $node -ArgumentList $argumentLine -WorkingDirectory $runtime -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'backend.log') -RedirectStandardError (Join-Path $logs 'backend-error.log')
  $ready = $false
  for ($i=0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 500; if ($appProcess.HasExited) { break }; try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health/ready' -TimeoutSec 2; if ($health.status -eq 'ready') { $ready = $true; break } } catch {} }
  if (-not $ready) { Fail 'O backend nao ficou pronto; consulte backend-error.log.' }
  $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $($appProcess.Id)"
  $expectedExe = (Get-Item -LiteralPath $node).FullName
  if (-not $cim -or [IO.Path]::GetFullPath($cim.ExecutablePath) -ne $expectedExe -or $cim.CommandLine -notmatch [regex]::Escape('backend-runner.cjs') -or $cim.CommandLine -notmatch [regex]::Escape($owner)) { Fail 'Identidade do processo de aplicacao nao comprovada.' }
  $state = [ordered]@{ version=1; appPid=$appProcess.Id; appOwner=$owner; appToken=$token; appExecutable=$expectedExe; appCommand=$cim.CommandLine; appStartedUtc=(Get-Date).ToUniversalTime().ToString('o'); pgStartedByLauncher=$true; pgPid=$pgPid; pgCommand=$pgProcess.CommandLine; pgExecutable=$pgProcess.ExecutablePath; pgCtlPath=[IO.Path]::GetFullPath([string]$pg.pgCtlPath); clusterId=$marker.clusterId; dataDirectory=$expectedData; port=55432 }
  $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
  Set-SecretAcl $statePath
  if (-not $SkipBrowser) { Start-Process 'http://127.0.0.1:3001' }
} catch {
  $message = $_.Exception.Message
  $secrets = @($token,$env:DB_PASSWORD,$env:JWT_SECRET,$env:AMORES_HOMOLOG_STOP_TOKEN)
  if ($pg) { $secrets += @($pg.password,$pg.clusterPassword) }
  if ($app) { $secrets += $app.jwtSecret }
  foreach ($secret in $secrets) {
    if (-not [string]::IsNullOrEmpty([string]$secret)) { $message = $message.Replace([string]$secret, '[oculto]') }
  }
  Write-HomologLog $message
  $diagnostic = "`nDiagnostico local: $logs\launcher.log"
  if ($Quiet) { [Console]::Error.WriteLine($message + $diagnostic); exit 1 } else { [void][Windows.Forms.MessageBox]::Show($message + $diagnostic, 'Amores Pet — Homologação', 'OK', 'Warning') }
  $appStopped = $true
  if ($appProcess -and -not $appProcess.HasExited -and $owner -and $token) {
    try {
      $own = Get-CimInstance Win32_Process -Filter "ProcessId = $($appProcess.Id)" -ErrorAction SilentlyContinue
      if ($own -and $own.CommandLine -match [regex]::Escape('backend-runner.cjs') -and $own.CommandLine -match [regex]::Escape($owner)) {
        Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3001/__amores/stop' -Headers @{ 'X-Amores-Stop' = $token } -TimeoutSec 3 | Out-Null
        for ($i=0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 500; if (-not (Get-CimInstance Win32_Process -Filter "ProcessId = $($appProcess.Id)" -ErrorAction SilentlyContinue)) { break } }
        $appStopped = -not (Get-CimInstance Win32_Process -Filter "ProcessId = $($appProcess.Id)" -ErrorAction SilentlyContinue)
      } else { $appStopped = $false }
    } catch { $appStopped = $false }
  }
  if ($clusterStarted) {
    try {
      if ($appStopped -and $pgPid -and $pgProcess -and $marker) { $null = Check-ClusterProcess $pgPid $pgCommand; $currentMarker = Get-Content -LiteralPath (Join-Path $dataPath '.amores-homologacao-cluster.json') -Raw | ConvertFrom-Json; if ($currentMarker.clusterId -ne $marker.clusterId) { throw 'Marcador mudou; cluster mantido.' }; & $config.postgres.pgCtlPath -D $dataPath -m fast -w stop 2>&1 | Add-Content -LiteralPath (Join-Path $logs 'pg-ctl.log') }
      elseif ($appStopped -and $pgLaunchProcess) {
        $started = Get-CimInstance Win32_Process -Filter "ProcessId = $($pgLaunchProcess.Id)" -ErrorAction SilentlyContinue
        $startedCommand = if ($started) { $started.CommandLine.Replace('/','\') } else { '' }
        if ($started -and [IO.Path]::GetFullPath($started.ExecutablePath) -eq [IO.Path]::GetFullPath($expectedPostgres) -and $startedCommand -match [regex]::Escape($expectedData) -and $startedCommand -match '(?i)-h\s+"?127\.0\.0\.1' -and $startedCommand -match '(?i)-p\s+"?55432') {
          Stop-Process -Id $pgLaunchProcess.Id -ErrorAction Stop
        }
      }
    } catch { }
  }
} finally {
  if ($startLockStream) { $startLockStream.Dispose(); $startLockStream = $null }
  Get-ChildItem Env: | Where-Object { $_.Name -match '^(DB_|PGHOST|PGPORT|PGUSER|PGPASSWORD|DATABASE_URL|PGSERVICE|PGOPTIONS|JWT_SECRET|CLIENTE_PUBLICO_PEPPER|EMAIL_|SMTP_PROVIDER_|HOMOLOGACAO_|AMORES_HOMOLOG_|AMORES_PET_HOMOLOGACAO|SERVIR_FRONTEND_LOCAL|FRONTEND_URL|HOST|PORT$)' } | ForEach-Object { Remove-Item "Env:$($_.Name)" -ErrorAction SilentlyContinue }
  if ($startLockToken -and (Test-Path -LiteralPath $startLockPath -PathType Leaf)) {
    try { $currentLock = Get-Content -LiteralPath $startLockPath -Raw | ConvertFrom-Json; if ($currentLock.token -eq $startLockToken -and [int]$currentLock.pid -eq $PID) { Remove-Item -LiteralPath $startLockPath -Force } } catch { }
  }
}
