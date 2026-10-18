Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Stage = 'Inicializacao'
$script:SafeCode = 'AP-INV-STARTUP'
$script:CurrentSid = $null
$script:PrivateRoot = $null
$script:AllowedSids = @()
$script:CreatedReport = $null
$script:DatabaseReadCompleted = $false
$pg = $null
$config = $null
$report = $null

function Stop-Inventory([string]$Code) {
  $script:SafeCode = $Code
  throw 'INVENTORY_STOP'
}

function Assert-InventoryPath([string]$Path, [string]$Code, [switch]$Directory) {
  try { $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop }
  catch { Stop-Inventory $Code }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Stop-Inventory $Code }
  if ($Directory -and -not $item.PSIsContainer) { Stop-Inventory $Code }
  if (-not $Directory -and $item.PSIsContainer) { Stop-Inventory $Code }
  return $item
}

function Assert-InventoryAcl([string]$Path, [string]$Code, [switch]$Protected, [switch]$AllowAdministrators) {
  try {
    $assessment = Test-AmoresPetPrivateAcl -Path $Path -CurrentSid $script:CurrentSid `
      -OwnerAllowedSids $script:AllowedSids -AccessAllowedSids $script:AllowedSids `
      -RequireProtected:$Protected -AllowAdministrators:$AllowAdministrators
  } catch { Stop-Inventory $Code }
  if (-not $assessment.Success) { Stop-Inventory $Code }
}

function Save-PrivateInventoryReport([object]$Report) {
  $fileName = 'inventario-neon-readonly-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.json'
  $path = Join-Path $script:PrivateRoot $fileName
  $json = $Report | ConvertTo-Json -Depth 20
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json + "`r`n")
  $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
  $script:CreatedReport = $path
  Assert-InventoryPath $path 'AP-INV-REPORT-INVALID'
  Assert-InventoryAcl $path 'AP-INV-REPORT-ACL'
  return $fileName
}

function Invoke-InventoryNode([string]$NodePath, [string]$HelperPath, [string]$Password, [long]$ExpectedStartEpoch, [string]$WorkingDirectory) {
  $inputBytes = $null
  $payload = $null
  $stdout = $null
  $stderr = $null
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = [IO.Path]::GetFullPath($NodePath)
  $startInfo.Arguments = ConvertTo-AmoresPetWindowsArgument ([IO.Path]::GetFullPath($HelperPath))
  $startInfo.WorkingDirectory = [IO.Path]::GetFullPath($WorkingDirectory)
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
  $startInfo.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
  foreach ($key in @($startInfo.EnvironmentVariables.Keys)) {
    if ([string]$key -match '^(?i:PG|PSQL|DB_)' -or [string]$key -in @('DATABASE_URL','NODE_OPTIONS','NODE_PATH')) {
      $startInfo.EnvironmentVariables.Remove([string]$key)
    }
  }
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) { Stop-Inventory 'AP-INV-NODE-LAUNCH' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $payload = @{ password = $Password; expectedStartEpoch = $ExpectedStartEpoch } | ConvertTo-Json -Compress
    $inputBytes = (New-Object Text.UTF8Encoding($false)).GetBytes($payload)
    $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(120000)) {
      try { $process.Kill() } catch { }
      Stop-Inventory 'AP-INV-NODE-TIMEOUT'
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
      $match = [regex]::Match($stderr, '(?m)^INVENTORY_FAILED\|([a-z_]{1,40})\|([A-Z0-9_]{1,40})\s*$')
      if ($match.Success) {
        $script:Stage = $match.Groups[1].Value
        Stop-Inventory ('AP-INV-' + $match.Groups[2].Value)
      }
      Stop-Inventory ('AP-INV-NODE-EXIT-' + [int]$process.ExitCode)
    }
    try { $result = $stdout | ConvertFrom-Json -ErrorAction Stop }
    catch { Stop-Inventory 'AP-INV-NODE-OUTPUT' }
    if ($result.status -cne 'READ_ONLY_OK' -or -not $result.report -or
        $result.report.identity.database -cne 'amores_pet_homologacao' -or
        $result.report.identity.role -cne 'amores_pet_homologacao_app' -or
        [int]$result.report.identity.port -ne 55432) {
      Stop-Inventory 'AP-INV-IDENTITY-OUTPUT'
    }
    return $result.report
  } finally {
    if ($process -and -not $process.HasExited) {
      try { $process.Kill(); $process.WaitForExit(5000) | Out-Null } catch { }
    }
    if ($inputBytes) { [Array]::Clear($inputBytes, 0, $inputBytes.Length) }
    $process.Dispose()
    $Password = ''
    $payload = $null
    $inputBytes = $null
    $stdout = $null
    $stderr = $null
  }
}

try {
  Import-Module (Join-Path $PSScriptRoot 'Acl-Privada.psm1') -Force -ErrorAction Stop
  Import-Module (Join-Path $PSScriptRoot 'Postmaster-Identity.psm1') -Force -ErrorAction Stop
  Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force -ErrorAction Stop
  Import-Module (Join-Path $PSScriptRoot 'Inventario-Arquivos.psm1') -Force -ErrorAction Stop
  $script:Stage = 'Validacao de conta Windows e politica de execucao'
  $windowsIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $script:CurrentSid = $windowsIdentity.User.Value
  $script:AllowedSids = @($script:CurrentSid, 'S-1-5-18')
  $principal = [Security.Principal.WindowsPrincipal]::new($windowsIdentity)
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Stop-Inventory 'AP-INV-ELEVATED' }
  if (-not $env:LOCALAPPDATA) { Stop-Inventory 'AP-INV-LOCALAPPDATA' }

  $script:Stage = 'Validacao da raiz privada e ACL'
  $script:PrivateRoot = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
  Assert-InventoryPath $script:PrivateRoot 'AP-INV-PRIVATE-ROOT' -Directory | Out-Null
  Assert-InventoryAcl $script:PrivateRoot 'AP-INV-PRIVATE-ROOT-ACL' -Protected
  $configPath = Join-Path $script:PrivateRoot 'config.json'
  Assert-InventoryPath $configPath 'AP-INV-CONFIG' | Out-Null
  Assert-InventoryAcl $configPath 'AP-INV-CONFIG-ACL'
  $config = Get-Content -LiteralPath $configPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  $pg = $config.postgres
  if ([int]$config.version -ne 1 -or $pg.host -cne '127.0.0.1' -or [int]$pg.port -ne 55432 -or
      $pg.database -cne 'amores_pet_homologacao' -or $pg.user -cne 'amores_pet_homologacao_app' -or
      [string]$pg.password -notmatch '^[A-Za-z0-9_-]{32,}$' -or
      [string]$pg.clusterId -notmatch '^[a-f0-9-]{36}$') { Stop-Inventory 'AP-INV-CONFIG-MISMATCH' }

  $script:Stage = 'Validacao do diretorio de dados e marcador local'
  $dataDirectory = [IO.Path]::GetFullPath([string]$pg.dataDirectory)
  $fixedData = [IO.Path]::GetFullPath((Join-Path $script:PrivateRoot 'postgres\data'))
  $clusterRoot = [IO.Path]::GetFullPath((Join-Path $script:PrivateRoot 'postgres\clusters')).TrimEnd('\') + '\'
  $clusterPattern = '^' + [regex]::Escape($clusterRoot.TrimEnd('\')) + '\\[a-f0-9-]{36}\\data$'
  if (-not $dataDirectory.Equals($fixedData, [StringComparison]::OrdinalIgnoreCase) -and $dataDirectory -notmatch $clusterPattern) {
    Stop-Inventory 'AP-INV-DATADIR-ALLOWLIST'
  }
  $cursor = $dataDirectory
  while ($cursor -and $cursor.Length -ge $script:PrivateRoot.Length) {
    Assert-InventoryPath $cursor 'AP-INV-DATADIR-PATH' -Directory | Out-Null
    if ($cursor.Equals([IO.Path]::GetFullPath($script:PrivateRoot), [StringComparison]::OrdinalIgnoreCase)) { break }
    $cursor = Split-Path -Parent $cursor
  }
  Assert-InventoryAcl $dataDirectory 'AP-INV-DATADIR-ACL' -AllowAdministrators
  $versionPath = Join-Path $dataDirectory 'PG_VERSION'
  Assert-InventoryPath $versionPath 'AP-INV-PG-VERSION' | Out-Null
  Assert-InventoryAcl $versionPath 'AP-INV-PG-VERSION-ACL' -AllowAdministrators
  if ((Get-Content -LiteralPath $versionPath -Raw).Trim() -cne '17') { Stop-Inventory 'AP-INV-PG-MAJOR' }
  $markerPath = Join-Path $dataDirectory '.amores-homologacao-cluster.json'
  Assert-InventoryPath $markerPath 'AP-INV-MARKER' | Out-Null
  Assert-InventoryAcl $markerPath 'AP-INV-MARKER-ACL' -AllowAdministrators
  $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($marker.formato -cne 'amores-pet-homologacao-v1' -or [string]$marker.clusterId -cne [string]$pg.clusterId) {
    Stop-Inventory 'AP-INV-MARKER-MISMATCH'
  }
  $pidPath = Join-Path $dataDirectory 'postmaster.pid'
  Assert-InventoryPath $pidPath 'AP-INV-PID' | Out-Null
  Assert-InventoryAcl $pidPath 'AP-INV-PID-ACL' -AllowAdministrators

  $script:Stage = 'Validacao do processo, cluster e listener PostgreSQL'
  $pgBin = Split-Path -Parent ([IO.Path]::GetFullPath([string]$pg.pgCtlPath))
  $postgresExe = [IO.Path]::GetFullPath((Join-Path $pgBin 'postgres.exe'))
  Assert-InventoryPath $postgresExe 'AP-INV-POSTGRES-EXE' | Out-Null
  $postmaster = Get-AmoresPetPostmasterIdentity -Path $pidPath -ExpectedDataDirectory $dataDirectory `
    -ExpectedPort 55432 -ExpectedListenAddress '127.0.0.1'
  $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $postmaster.ProcessId `
    -ExpectedExecutable $postgresExe -ExpectedDataDirectory $dataDirectory `
    -ExpectedListenAddress '127.0.0.1' -ExpectedPort 55432

  $script:Stage = 'Validacao do Node.js e do driver local'
  $backendRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\backend'))
  $helperPath = Join-Path $backendRoot 'src\database\inventariarHomologacaoNeon.cjs'
  $pgDriver = Join-Path $backendRoot 'node_modules\pg\package.json'
  Assert-InventoryPath $helperPath 'AP-INV-HELPER' | Out-Null
  Assert-InventoryPath $pgDriver 'AP-INV-PG-DRIVER' | Out-Null
  $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $nodePath = [IO.Path]::GetFullPath([string]$nodeCommand.Source)
  $nodeVersion = Invoke-AmoresPetNativeProcess -Executable $nodePath -Arguments @('--version')
  if (-not $nodeVersion.Started -or $nodeVersion.ExitCode -ne 0 -or ($nodeVersion.StandardOutput -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+')) {
    Stop-Inventory 'AP-INV-NODE-VERSION'
  }

  $script:Stage = 'Consultas PostgreSQL somente de leitura'
  $report = Invoke-InventoryNode -NodePath $nodePath -HelperPath $helperPath `
    -Password ([string]$pg.password) -ExpectedStartEpoch ([long]$postmaster.StartEpoch) -WorkingDirectory $backendRoot
  $script:DatabaseReadCompleted = $true
  $script:Stage = 'Resumo de arquivos externos ao PostgreSQL'
  $storageEnvironment = @{}
  foreach ($storageKey in @('FILE_STORAGE_MODE', 'SITE_GALLERY_STORAGE_DIR', 'PET_PHOTO_BUCKET', 'SITE_GALLERY_BUCKET', 'AWS_ENDPOINT_URL_S3', 'AWS_REGION')) {
    $storageValue = [Environment]::GetEnvironmentVariable($storageKey, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($storageValue)) { $storageEnvironment[$storageKey] = $storageValue }
  }
  $defaultGalleryPath = Join-Path $backendRoot 'storage\site-gallery'
  $storageSettings = Get-AmoresPetStorageSettings -Environment $storageEnvironment `
    -RuntimeDirectory (Join-Path $script:PrivateRoot 'runtime') -DefaultGalleryDirectory $defaultGalleryPath
  if (-not $storageSettings.valid) { Stop-Inventory $storageSettings.failure_code }

  $petPhotoSummary = Get-AmoresPetAssetSummary (Join-Path $backendRoot 'src\uploads\pets')
  $defaultGallerySummary = Get-AmoresPetAssetSummary $defaultGalleryPath
  if (-not $petPhotoSummary.complete) { Stop-Inventory $petPhotoSummary.failure_code }
  if (-not $defaultGallerySummary.complete) { Stop-Inventory $defaultGallerySummary.failure_code }

  $customGallerySummary = $null
  $customGalleryIsDistinct = $false
  if ($storageSettings.custom_gallery_configured) {
    $customGalleryIsDistinct = -not $storageSettings.custom_gallery_directory.Equals(
      $storageSettings.default_gallery_directory, [StringComparison]::OrdinalIgnoreCase)
    if ($customGalleryIsDistinct) {
      $customGallerySummary = Get-AmoresPetAssetSummary $storageSettings.custom_gallery_directory
      if (-not $customGallerySummary.complete) { Stop-Inventory $customGallerySummary.failure_code }
    } else { $customGallerySummary = $defaultGallerySummary }
  }

  $externalFiles = [ordered]@{
    complete = $true
    pet_photo_uploads = $petPhotoSummary
    site_gallery_default = $defaultGallerySummary
    site_gallery_custom = [ordered]@{
      configured = [bool]$storageSettings.custom_gallery_configured
      distinct_from_default = [bool]$customGalleryIsDistinct
      summary = $customGallerySummary
    }
    storage = [ordered]@{
      mode = $storageSettings.mode
      remote_object_storage_enabled = ($storageSettings.mode -eq 's3')
      endpoint_configured = [bool]$storageSettings.s3_endpoint_configured
      region_configured = [bool]$storageSettings.s3_region_configured
      pet_bucket_configured = [bool]$storageSettings.pet_bucket_configured
      gallery_bucket_configured = [bool]$storageSettings.gallery_bucket_configured
      remote_objects = 'nao inventariados; nenhuma conexao externa foi realizada'
    }
  }
  $null = $report | Add-Member -MemberType NoteProperty -Name external_files -Value $externalFiles -ErrorAction Stop
  $source = [ordered]@{
    host = '127.0.0.1'; port = 55432; database = 'amores_pet_homologacao'
    local_cluster_process_validated = $true; local_cluster_start_epoch_matches = $true
    ssl = 'loopback local; sem conexao externa'
  }
  $null = $report | Add-Member -MemberType NoteProperty -Name source -Value $source -ErrorAction Stop
  $script:Stage = 'Gravacao e validacao ACL do relatorio privado'
  $reportName = Save-PrivateInventoryReport $report

  $counts = $report.objetos
  Write-Host 'Inventario PostgreSQL local e arquivos locais concluido; somente consultas de leitura e metadados.' -ForegroundColor Green
  Write-Host ('Destino comprovado: amores_pet_homologacao em 127.0.0.1:55432; PostgreSQL ' + $report.identity.server_version)
  Write-Host ('Tamanho: ' + $counts.database_pretty + '; tabelas=' + $counts.tables + '; views=' + $counts.views +
    '; funcoes/procedures=' + $counts.functions_and_procedures + '; indices=' + $counts.indexes + '; sequencias=' + $counts.sequences)
  Write-Host ('Migrations 035=' + [string]$report.migrations.state.migration_035_physical_tables +
    '/' + [string]$report.migrations.state.migration_035_compatibility_views +
    '; 036=' + [string]$report.migrations.state.migration_036_authorizations_table +
    '/' + [string]$report.migrations.state.migration_036_file_deletion_queue +
    '; 037=' + [string]$report.migrations.state.migration_037_notification_function +
    '/' + [string]$report.migrations.state.migration_037_super_admin_recipient)
  Write-Host ('Relatorio privado: %LOCALAPPDATA%\AmoresPet\Homologacao\' + $reportName)
  Write-Host ('Arquivos: pets=' + $petPhotoSummary.files + ' (' + $petPhotoSummary.total_bytes + ' bytes); galeria padrao=' + $defaultGallerySummary.files + ' (' + $defaultGallerySummary.total_bytes + ' bytes); galeria personalizada=' + [string]$storageSettings.custom_gallery_configured)
  Write-Host ('Armazenamento: modo=' + $storageSettings.mode + '; endpoint S3 configurado=' + [string]$storageSettings.s3_endpoint_configured + '; buckets de pets/galeria configurados=' + [string]$storageSettings.pet_bucket_configured + '/' + [string]$storageSettings.gallery_bucket_configured + '; objetos remotos nao consultados')
  Write-Host 'Nenhuma conexao ao Neon, armazenamento remoto, escrita no banco, migration ou alteracao de ACL foi executada.'
  Write-Host 'Pressione Enter para abrir o relatorio sanitizado no Bloco de Notas.'
  [void](Read-Host)
  $notepad = Join-Path $env:SystemRoot 'System32\notepad.exe'
  if (Test-Path -LiteralPath $notepad -PathType Leaf) { Start-Process -FilePath $notepad -ArgumentList (ConvertTo-AmoresPetWindowsArgument $script:CreatedReport) -Wait }
} catch {
  $stage = $script:Stage
  $code = $script:SafeCode
  $failureType = $_.Exception.GetType().Name
  $location = 'nao identificada'
  try {
    $line = [int]$_.InvocationInfo.ScriptLineNumber
    $file = [IO.Path]::GetFileName([string]$_.InvocationInfo.ScriptName)
    if ($line -gt 0 -and $file -match '^[A-Za-z0-9_.-]{1,80}$') { $location = ($file + ':' + $line) }
  } catch { }
  if ($_.Exception.Message -ne 'INVENTORY_STOP') { $code = 'AP-INV-UNEXPECTED' }
  Write-Host 'Inventario interrompido; nenhuma escrita em banco foi iniciada.' -ForegroundColor Yellow
  Write-Host ('Etapa: ' + $stage)
  Write-Host ('Codigo tecnico: ' + $code)
  if ($failureType -match '^[A-Za-z0-9_.]{1,80}$') { Write-Host ('Tipo interno: ' + $failureType) }
  Write-Host ('Localizacao sanitizada: ' + $location)
  if ($script:DatabaseReadCompleted) {
    Write-Host 'Estado do PostgreSQL: consulta somente de leitura concluida; inventario geral interrompido nesta etapa.'
  } else {
    Write-Host 'Estado do banco: NAO CONSULTADO ou coleta incompleta.'
  }
  if ($script:CreatedReport -and (Test-Path -LiteralPath $script:CreatedReport -PathType Leaf)) {
    try { Remove-Item -LiteralPath $script:CreatedReport -Force -ErrorAction Stop } catch { }
  }
  Write-Host 'Pressione Enter para fechar.'
  [void](Read-Host)
  return
} finally {
  if ($pg) { $pg.password = ''; $pg.clusterPassword = ''; $pg = $null }
  if ($config -and $config.app) {
    $config.app.jwtSecret = ''
    $config.app.clientePublicoPepper = ''
  }
  if ($config -and $config.smtpProvider) {
    $config.smtpProvider.user = ''
    $config.smtpProvider.password = ''
  }
  $config = $null
  $report = $null
}
