Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Stage = 'INICIALIZACAO'
$script:Result = 'INCONCLUSIVO'
$script:TechnicalCode = 'AP-SUPER-PROVISION-FAILED'
$script:ExitCode = 0
$script:PrivateRoot = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
$script:ReportPath = $null
$plainPassword = $null
$plainConfirm = $null
$provisionInputJson = $null
$securePassword = $null
$secureConfirm = $null
$config = $null

function Write-PrivateResult([string]$Status, [string]$Code, [string]$Stage) {
  $script:Result = $Status
  $script:TechnicalCode = $Code
  $script:Stage = $Stage
  if (-not $script:ReportPath) { return }
  $report = @(
    'Amores Pet - provisionamento controlado do Super Administrador',
    "Resultado: $Status",
    "Etapa: $Stage",
    "Codigo tecnico: $Code",
    'Destino autorizado: amores_pet_homologacao em 127.0.0.1:55432',
    'Conta: superadmin@homologacao.invalid',
    "Horario: $([DateTimeOffset]::Now.ToString('o'))",
    'Nenhuma senha ou hash e registrada.'
  ) -join "`r`n"
  try { [IO.File]::WriteAllText($script:ReportPath, $report + "`r`n", (New-Object Text.UTF8Encoding($false))) } catch { }
}

function Stop-Local([string]$Message, [string]$Code = 'AP-SUPER-PROVISION-VALIDATION') {
  Write-PrivateResult 'INTERROMPIDO_SEM_CONFIRMACAO_DE_ESCRITA' $Code $script:Stage
  throw $Message
}

function Assert-PrivateResource([string]$Path, [switch]$RequireProtected) {
  $snapshot = Get-AmoresPetPrivateAclSnapshot -Path $Path
  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $result = Test-AmoresPetPrivateAclSnapshot -Snapshot $snapshot -CurrentSid $currentSid `
    -OwnerAllowedSids @($currentSid, 'S-1-5-18') `
    -AccessAllowedSids @($currentSid, 'S-1-5-18') -RequireProtected:$RequireProtected
  if (-not $result.Success) { Stop-Local 'A configuração privada não passou na validação de ACL; nenhuma permissão foi alterada.' 'AP-SUPER-PROVISION-ACL' }
}

function Test-NoReparsePoint([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    Stop-Local 'Um recurso usado na validação é link/junction; a identidade foi recusada.' 'AP-SUPER-PROVISION-REPARSE'
  }
  return $item
}

function Get-RequiredValue($Object, [string]$Name) {
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) {
    Stop-Local 'A configuração privada não contém todos os campos operacionais necessários.' 'AP-SUPER-PROVISION-CONFIG'
  }
  return [string]$property.Value
}

function Assert-PostgresIdentity($Config) {
  $pg = $Config.postgres
  if ([int]$Config.version -ne 1 -or [string]$pg.host -ne '127.0.0.1' -or [int]$pg.port -ne 55432 -or
    [string]$pg.database -ne 'amores_pet_homologacao' -or [string]$pg.user -ne 'amores_pet_homologacao_app') {
    Stop-Local 'A configuração não corresponde ao destino estritamente autorizado.' 'AP-SUPER-PROVISION-DESTINATION'
  }
  foreach ($name in @('password', 'dataDirectory', 'pgCtlPath', 'psqlPath')) { $null = Get-RequiredValue $pg $name }
  $dataDirectory = [IO.Path]::GetFullPath([string]$pg.dataDirectory)
  $bin = [IO.Path]::GetDirectoryName([string]$pg.pgCtlPath)
  $expectedPgCtl = Join-Path $bin 'pg_ctl.exe'
  $expectedPostgres = Join-Path $bin 'postgres.exe'
  $expectedPsql = Join-Path $bin 'psql.exe'
  if ([IO.Path]::GetFullPath([string]$pg.pgCtlPath) -ne [IO.Path]::GetFullPath($expectedPgCtl) -or
    [IO.Path]::GetFullPath([string]$pg.psqlPath) -ne [IO.Path]::GetFullPath($expectedPsql) -or
    -not (Test-Path -LiteralPath $expectedPostgres -PathType Leaf) -or
    -not (Test-Path -LiteralPath $expectedPsql -PathType Leaf)) {
    Stop-Local 'Os executáveis PostgreSQL não pertencem ao mesmo diretório verificado.' 'AP-SUPER-PROVISION-PGTOOLS'
  }
  $versionFile = Join-Path $dataDirectory 'PG_VERSION'
  $pidFile = Join-Path $dataDirectory 'postmaster.pid'
  $markerFile = Join-Path $dataDirectory '.amores-homologacao-cluster.json'
  foreach ($path in @($dataDirectory, $versionFile, $pidFile, $markerFile)) { $null = Test-NoReparsePoint $path }
  if ((Get-Content -LiteralPath $versionFile -Raw).Trim() -ne '17') {
    Stop-Local 'O cluster indicado não está na versão PostgreSQL 17 autorizada.' 'AP-SUPER-PROVISION-PGVERSION'
  }
  Assert-PrivateResource $dataDirectory
  Assert-PrivateResource $versionFile
  Assert-PrivateResource $pidFile
  Assert-PrivateResource $markerFile
  $marker = Get-Content -LiteralPath $markerFile -Raw | ConvertFrom-Json
  if ($marker.formato -ne 'amores-pet-homologacao-v1' -or [string]$marker.clusterId -notmatch '^[a-f0-9-]{36}$' -or
    ($pg.clusterId -and [string]$pg.clusterId -ne [string]$marker.clusterId)) {
    Stop-Local 'O marcador de propriedade do cluster está ausente ou divergente.' 'AP-SUPER-PROVISION-CLUSTER-MARKER'
  }
  $pidLines = @(Get-Content -LiteralPath $pidFile)
  $postmasterStartEpoch = [long]0
  $validStartEpoch = $pidLines.Count -ge 6 -and
    [long]::TryParse([string]$pidLines[2], [ref]$postmasterStartEpoch) -and $postmasterStartEpoch -gt 0
  if (-not $validStartEpoch -or [int]$pidLines[0] -le 0 -or
    [IO.Path]::GetFullPath([string]$pidLines[1]) -ne $dataDirectory -or [int]$pidLines[3] -ne 55432) {
    Stop-Local 'O arquivo de identidade PostgreSQL não corresponde ao cluster autorizado.' 'AP-SUPER-PROVISION-PID'
  }
  $postmasterProcessId = [int]$pidLines[0]
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $postmasterProcessId" -ErrorAction Stop
  if (-not $process -or [IO.Path]::GetFullPath([string]$process.ExecutablePath) -ne [IO.Path]::GetFullPath($expectedPostgres)) {
    Stop-Local 'O processo PostgreSQL não corresponde ao executável do cluster privado.' 'AP-SUPER-PROVISION-PROCESS'
  }
  $normalizedCommandLine = ([string]$process.CommandLine).Replace('/', '\')
  if ($normalizedCommandLine -notmatch [regex]::Escape($dataDirectory) -or
    $normalizedCommandLine -notmatch '(?i)(?:-p\s+"?55432|port=55432)' -or
    $normalizedCommandLine -notmatch '(?i)(?:-h\s+"?127\.0\.0\.1|listen_addresses\s*=\s*''127\.0\.0\.1'')') {
    Stop-Local 'Os argumentos do processo não comprovam o diretório, a porta e o listener autorizados.' 'AP-SUPER-PROVISION-PROCESS-ARGS'
  }
  $listeners = @(Get-NetTCPConnection -LocalPort 55432 -State Listen -ErrorAction Stop)
  if (-not ($listeners | Where-Object { [int]$_.OwningProcess -eq $postmasterProcessId -and $_.LocalAddress -eq '127.0.0.1' })) {
    Stop-Local 'O listener local não pertence ao processo PostgreSQL do cluster autorizado.' 'AP-SUPER-PROVISION-LISTENER'
  }
  $dataDirectory
}

function Quote-Argument([string]$Value) { return '"' + $Value.Replace('"', '\"') + '"' }

function Invoke-Provisioner($NodePath, $HelperPath, $Pg, $DataDirectory, $InputJson, [ValidateSet('create','preflight')][string]$Mode = 'create') {
  $startInfo = New-Object Diagnostics.ProcessStartInfo
  $startInfo.FileName = $NodePath
  $startInfo.Arguments = (Quote-Argument $HelperPath)
  if ($Mode -eq 'preflight') { $startInfo.Arguments += ' --preflight' }
  $startInfo.WorkingDirectory = (Split-Path -Parent (Split-Path -Parent $HelperPath))
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $envVars = $startInfo.EnvironmentVariables
  foreach ($key in @($envVars.Keys)) {
    if ($key -match '^(PG|PSQL|DB_|DATABASE_URL|EMAIL_|SMTP_|JWT_|CLIENTE_|AMORES_|NODE_OPTIONS|NODE_PATH|NPM_CONFIG_|npm_config_)') {
      $envVars.Remove($key)
    }
  }
  $envVars['NODE_ENV'] = 'development'
  $envVars['DB_HOST'] = '127.0.0.1'
  $envVars['DB_PORT'] = '55432'
  $envVars['DB_NAME'] = 'amores_pet_homologacao'
  $envVars['DB_USER'] = 'amores_pet_homologacao_app'
  $envVars['DB_PASSWORD'] = [string]$Pg.password
  $envVars['DB_SSL'] = 'disable'
  $envVars['AMORES_EXPECTED_DATA_DIRECTORY'] = $DataDirectory
  $envVars['AMORES_WINDOWS_USER'] = [Security.Principal.WindowsIdentity]::GetCurrent().Name

  $process = New-Object Diagnostics.Process
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) { throw 'PROCESS_START_FAILED' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if ($null -ne $InputJson) { $process.StandardInput.WriteLine($InputJson) }
    $process.StandardInput.Close()
    $process.WaitForExit()
    $stdoutText = $stdoutTask.GetAwaiter().GetResult()
    $stderrText = $stderrTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
      $technical = 'AP-SUPER-PROVISION-FAILED'
      if ($stderrText -match '^(AP-SUPER-PROVISION-SQL-[A-Z-]+):.*SQLSTATE ([0-9A-Z]{5})') {
        $technical = $Matches[1] + '-' + $Matches[2]
      } elseif ($stderrText -match '^(DUPLICATE_EMAIL|[A-Z0-9_-]{4,64}):') {
        $technical = $Matches[1]
      }
      return [pscustomobject]@{ Success = $false; TechnicalCode = $technical; Output = '' }
    }
    try {
      $parsed = $stdoutText.Trim() | ConvertFrom-Json
      if ($Mode -eq 'preflight' -and ($parsed.status -ne 'PREFLIGHT_OK' -or $parsed.banco -ne 'amores_pet_homologacao' -or
        $parsed.destino -ne '127.0.0.1:55432' -or $parsed.email -ne 'superadmin@homologacao.invalid' -or
        $parsed.emailRegistrado -ne $false -or $parsed.adminPerfil -ne 'administrador')) {
        return [pscustomobject]@{ Success = $false; TechnicalCode = 'AP-SUPER-PROVISION-PREFLIGHT-INVALID'; Output = '' }
      }
      if ($Mode -eq 'create' -and ($parsed.status -ne 'CRIADA' -or $parsed.banco -ne 'amores_pet_homologacao' -or
        $parsed.destino -ne '127.0.0.1:55432' -or $parsed.email -ne 'superadmin@homologacao.invalid' -or
        $parsed.perfil -ne 'super_administrador' -or $parsed.ativo -ne $true -or $parsed.adminExistenteInalterado -ne $true)) {
        return [pscustomobject]@{ Success = $false; TechnicalCode = 'AP-SUPER-PROVISION-RESULT-INVALID'; Output = '' }
      }
      return [pscustomobject]@{ Success = $true; TechnicalCode = 'AP-SUPER-PROVISION-OK'; Output = $parsed }
    } catch { return [pscustomobject]@{ Success = $false; TechnicalCode = 'AP-SUPER-PROVISION-RESULT-INVALID'; Output = '' } }
  } finally {
    $envVars['DB_PASSWORD'] = ''
    $process.Dispose()
  }
}

try {
  $script:Stage = 'CARREGAMENTO_MODULO_ACL'
  $script:TechnicalCode = 'AP-SUPER-PROVISION-ACL-MODULE-LOAD'
  $aclModulePath = Join-Path $PSScriptRoot 'Acl-Privada.psm1'
  if (-not (Test-Path -LiteralPath $aclModulePath -PathType Leaf)) {
    Stop-Local 'O módulo de validação privada da ACL não foi encontrado junto ao provisionador.' 'AP-SUPER-PROVISION-ACL-MODULE-MISSING'
  }
  try {
    $aclModule = Import-Module -Name $aclModulePath -Force -PassThru -ErrorAction Stop
  } catch {
    Stop-Local 'O módulo privado de validação ACL não pode ser carregado pelo Windows PowerShell.' 'AP-SUPER-PROVISION-ACL-MODULE-LOAD'
  }
  $requiredAclFunctions = @(
    'ConvertTo-AmoresPetSid',
    'Get-AmoresPetPrivateAclSnapshot',
    'Test-AmoresPetPrivateAclSnapshot',
    'Test-AmoresPetPrivateAcl'
  )
  foreach ($functionName in $requiredAclFunctions) {
    $exported = $aclModule.ExportedFunctions.ContainsKey($functionName)
    $resolved = Get-Command -Name $functionName -CommandType Function -ErrorAction SilentlyContinue
    if (-not $exported -or -not $resolved -or $resolved.ModuleName -ne $aclModule.Name) {
      Stop-Local 'O módulo ACL não exportou todas as funções requeridas pelo provisionador.' 'AP-SUPER-PROVISION-ACL-MODULE-CONTRACT'
    }
  }
  $script:TechnicalCode = 'AP-SUPER-PROVISION-FAILED'

  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { Stop-Local 'LOCALAPPDATA indisponível.' 'AP-SUPER-PROVISION-LOCALAPPDATA' }
  if ($env:DATABASE_URL) { Stop-Local 'DATABASE_URL herdada está definida; o destino não será inferido.' 'AP-SUPER-PROVISION-ENV' }
  $repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
  $helperPath = Join-Path $repoRoot 'backend\src\database\criarSuperAdministradorHomologacao.cjs'
  $nodeCommand = Get-Command node.exe -ErrorAction Stop
  $nodePath = [IO.Path]::GetFullPath($nodeCommand.Source)
  if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) { Stop-Local 'O provisionador de criação não foi encontrado.' 'AP-SUPER-PROVISION-HELPER' }

  $script:Stage = 'VALIDACAO_ACL_E_CONFIGURACAO'
  $privateRoot = Test-NoReparsePoint $script:PrivateRoot
  Assert-PrivateResource $script:PrivateRoot
  $configPath = Join-Path $script:PrivateRoot 'config.json'
  $null = Test-NoReparsePoint $configPath
  Assert-PrivateResource $configPath
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $dataDirectory = Assert-PostgresIdentity $config

  $logDirectory = Join-Path $script:PrivateRoot 'logs'
  if (-not (Test-Path -LiteralPath $logDirectory -PathType Container)) {
    Stop-Local 'O diretório privado de relatórios não existe; nenhuma permissão será alterada.' 'AP-SUPER-PROVISION-REPORT-DIR'
  }
  Assert-PrivateResource $logDirectory
  $script:ReportPath = Join-Path $logDirectory ('provisionar-superadmin-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.txt')
  $reportStream = [IO.File]::Open($script:ReportPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $reportStream.Dispose()
  try { Assert-PrivateResource $script:ReportPath } catch {
    Remove-Item -LiteralPath $script:ReportPath -Force -ErrorAction SilentlyContinue
    $script:ReportPath = $null
    throw
  }
  Write-PrivateResult 'PREPARADO_SEM_ALTERACAO_NO_BANCO' 'AP-SUPER-PROVISION-READY' 'AGUARDANDO_CONFIRMACAO_LOCAL'

  $script:Stage = 'PREFLIGHT_SQL_SOMENTE_LEITURA'
  $preflight = Invoke-Provisioner $nodePath $helperPath $config.postgres $dataDirectory $null 'preflight'
  if (-not $preflight.Success) {
    if ($preflight.TechnicalCode -eq 'DUPLICATE_EMAIL') {
      Write-PrivateResult 'CONTA_JA_EXISTE_SEM_ALTERACAO' 'DUPLICATE_EMAIL' $script:Stage
      Write-Host 'A conta superadmin@homologacao.invalid já existe no banco autorizado; nenhuma alteração foi feita.'
      throw 'A consulta somente de leitura encontrou a conta existente. O provisionamento foi interrompido sem escrita.'
    }
    Write-PrivateResult 'INTERROMPIDO_SEM_ESCRITA' $preflight.TechnicalCode $script:Stage
    throw 'A validação SQL de pré-criação não foi aprovada. Nenhuma escrita foi iniciada.'
  }

  $script:Stage = 'VALIDACAO_LOCAL_E_CONSENTIMENTO'
  Write-Host ''
  Write-Host 'Destino verificado: amores_pet_homologacao em 127.0.0.1:55432'
  Write-Host 'Nova conta: Super Administrador Homologação <superadmin@homologacao.invalid> (ativa)'
  Write-Host 'A conta admin@homologacao.invalid será apenas verificada e permanecerá Administrador.'
  Write-Host 'Nenhum banco principal, migration ou outro usuário será alterado.'
  $operator = (Read-Host 'Nome do responsável local pela criação').Trim()
  $confirmation = Read-Host 'Para autorizar esta única criação, digite CRIAR SUPER superadmin@homologacao.invalid EM amores_pet_homologacao 127.0.0.1:55432'
  if ($confirmation -cne 'CRIAR SUPER superadmin@homologacao.invalid EM amores_pet_homologacao 127.0.0.1:55432') {
    Stop-Local 'Confirmação local não corresponde; nenhuma alteração foi feita.' 'AP-SUPER-PROVISION-CANCELLED'
  }
  $securePassword = Read-Host 'Defina a senha da nova conta (entrada oculta)' -AsSecureString
  $secureConfirm = Read-Host 'Confirme a senha da nova conta (entrada oculta)' -AsSecureString
  $passwordPointer = [IntPtr]::Zero
  $confirmPointer = [IntPtr]::Zero
  $plainPassword = $null
  $plainConfirm = $null
  try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $confirmPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConfirm)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $plainConfirm = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPointer)
    if ($plainPassword -cne $plainConfirm) { Stop-Local 'As senhas locais não coincidem; nenhuma alteração foi feita.' 'AP-SUPER-PROVISION-PASSWORD-MISMATCH' }
    $provisionInputJson = @{
      confirmacao = $confirmation
      operador = $operator
      password = $plainPassword
      passwordConfirm = $plainConfirm
    } | ConvertTo-Json -Compress
  } finally {
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    if ($confirmPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPointer) }
    $securePassword.Dispose(); $secureConfirm.Dispose()
  }

  $script:Stage = 'CRIACAO_TRANSACIONAL'
  $result = Invoke-Provisioner $nodePath $helperPath $config.postgres $dataDirectory $provisionInputJson
  $provisionInputJson = $null; $plainPassword = $null; $plainConfirm = $null
  if (-not $result.Success) {
    Write-PrivateResult 'FALHA_SEM_CONFIRMACAO_DE_CRIACAO' $result.TechnicalCode $script:Stage
    throw 'A criação não foi confirmada. Consulte o relatório local privado para o código técnico.'
  }
  $summary = $result.Output
  Write-PrivateResult 'CRIADA_E_VALIDADA' 'AP-SUPER-PROVISION-OK' 'VERIFICACAO_POS_CRIACAO'
  Write-Host ''
  Write-Host 'Conta criada e validada no banco de homologação.'
  Write-Host "ID: $($summary.id); e-mail: $($summary.email); perfil: Super Administrador; status: ativo."
  Write-Host 'admin@homologacao.invalid permanece Administrador e inalterado.'
  Write-Host "Relatório sanitizado: $script:ReportPath"
} catch {
  $script:ExitCode = 1
  if ($script:Result -eq 'INCONCLUSIVO') {
    Write-PrivateResult 'INTERROMPIDO' $script:TechnicalCode $script:Stage
  }
  Write-Host "`n$($_.Exception.Message)"
  if ($script:ReportPath) { Write-Host "Relatório local sanitizado: $script:ReportPath" }
} finally {
  $plainPassword = $null
  $plainConfirm = $null
  $provisionInputJson = $null
  $securePassword = $null
  $secureConfirm = $null
  $config = $null
  Write-Host ''
  [void](Read-Host 'Pressione Enter para fechar esta janela')
}
exit $script:ExitCode
