param(
  [ValidateSet('DIRECT','EXISTING_POLICY','REMOTE_SIGNED_DEFAULT_PROCESS')]
  [string]$LauncherPolicyMode = 'DIRECT'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Acl-Privada.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Postmaster-Identity.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force

$script:DatabaseName = 'amores_pet_homologacao'
$script:DatabaseUser = 'amores_pet_homologacao_app'
$script:DatabaseHost = '127.0.0.1'
$script:DatabasePort = 55432
$script:MigrationScope = '036,037'
$script:RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:PrivateRoot = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
$script:ConfigPath = Join-Path $script:PrivateRoot 'config.json'
$script:MarkerName = '.amores-homologacao-cluster.json'
$script:TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$script:CurrentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$script:AllowedPrivateSids = @($script:CurrentSid, 'S-1-5-18')
$script:PgEnvironment = @{}
$script:PgPassFile = $null
$script:LockPath = $null
$script:LockToken = [guid]::NewGuid().ToString('N')
$script:OperationDirectory = $null
$script:PreflightDirectory = $null
$script:Pg = $null
$script:DataDirectory = $null
$script:PgCtl = $null
$script:Psql = $null
$script:PgDump = $null
$script:PgRestore = $null
$script:InitDb = $null
$script:PostgresExe = $null
$script:TestClusterStarted = $false
$script:PersistentMigrationAttempted = $false
$script:ExitCode = 0
$script:SafeErrorMessage = $null
$script:CurrentPhase = 'validacao inicial'
$script:TechnicalErrorCode = $null
$script:InternalFailureFunction = 'nao identificada'
$script:InternalFailureLocation = 'nao identificada'
$script:OperationReport = [ordered]@{
  version = 1
  operation = 'Aplicação controlada das migrations 036 e 037'
  startedUtc = (Get-Date).ToUniversalTime().ToString('o')
  database = $script:DatabaseName
  migrations = @('036_autorizacoes_operacionais.sql', '037_notificacoes_super_administrador.sql')
  status = 'iniciado'
  phase = $script:CurrentPhase
  technicalCode = $null
  persistentDdlStarted = $false
  persistentOperationAttempted = $false
  persistentPsqlStarted = $false
  persistentSqlResponseReceived = $false
  persistentOperationState = 'não iniciada'
  launcherPolicyMode = $LauncherPolicyMode
  backup = $null
  backupState = 'não iniciado'
  preflight = 'não executado'
  preflightState = 'não iniciado'
  confirmationPresented = $false
  confirmationAccepted = $false
  migrationStateBefore = 'não verificado'
  migrationStateAfter = 'não verificado'
  backendReadiness = 'não verificada'
  backupCheckpoints = [ordered]@{
    PG_DUMP_INICIADO = $false
    PG_DUMP_CONCLUIDO = $false
    ARQUIVO_GERADO = $false
    CATALOGO_INICIADO = $false
    CATALOGO_VALIDADO = $false
    RESTAURACAO_INICIADA = $false
    PG_RESTORE_CONCLUIDO = $false
    CONTAGEM_TABELAS_VALIDADA = $false
    ESTRUTURAS_COMPARADAS = $false
    DADOS_COMPARADOS = $false
    RESTAURACAO_TESTADA = $false
    PREFLIGHT_APROVADO = $false
  }
  backupCheckpointFailure = $null
  reportPath = $null
  internalFailureFunction = $script:InternalFailureFunction
  internalFailureLocation = $script:InternalFailureLocation
  lastExternalProcess = $null
  error = $null
}

function Get-SanitizedFailureLocation([object]$ErrorRecord) {
  $functionName = 'script'
  $fileName = [IO.Path]::GetFileName($PSCommandPath)
  $lineNumber = 0
  try {
    $invocationInfo = $ErrorRecord.InvocationInfo
    if ($invocationInfo.MyCommand -and $invocationInfo.MyCommand.Name) {
      $candidateName = [string]$invocationInfo.MyCommand.Name
      if ($candidateName -match '^[A-Za-z_][A-Za-z0-9_.-]{0,79}$') { $functionName = $candidateName }
    }
    if ($invocationInfo.ScriptName) { $fileName = [IO.Path]::GetFileName([string]$invocationInfo.ScriptName) }
    $lineNumber = [int]$invocationInfo.ScriptLineNumber
  } catch { }
  if ($lineNumber -gt 0 -and $fileName) { $location = '{0}:linha {1}' -f $fileName,$lineNumber }
  elseif ($fileName) { $location = $fileName }
  else { $location = 'localizacao nao identificada' }
  return [pscustomobject]@{ Function = $functionName; Location = $location }
}

function Fail([string]$Message) {
  $script:SafeErrorMessage = $Message
  if (-not $script:TechnicalErrorCode) { $script:TechnicalErrorCode = 'AP-MIG-VALIDATION' }
  throw $Message
}

function ConvertFrom-PgBoolean([string]$Value) {
  switch -Regex -CaseSensitive ($Value.Trim()) {
    '^(t|true|1|on|yes)$' { return $true }
    '^(f|false|0|off|no)$' { return $false }
    default { Fail 'O PostgreSQL retornou um booleano fora do formato esperado.' }
  }
}

function Set-Phase([string]$Phase) {
  $script:CurrentPhase = $Phase
  $script:OperationReport.phase = $Phase
  $script:OperationReport.technicalCode = $script:TechnicalErrorCode
  if ($script:OperationDirectory) { try { Write-PrivateReport } catch { } }
}

function Set-BackupCheckpoint([string]$Name, [bool]$Completed, [string]$TechnicalCode = '') {
  if (-not $script:OperationReport.backupCheckpoints.Contains($Name)) {
    Fail 'Checkpoint interno de backup desconhecido; operação interrompida.'
  }
  $transition = Test-AmoresPetBackupCheckpointTransition -Name $Name -Completed $Completed `
    -Checkpoints $script:OperationReport.backupCheckpoints
  if (-not $transition.Success) {
    $script:TechnicalErrorCode = [string]$transition.Code
    $detail = if ($transition.Missing) { ' Pré-requisito pendente: ' + [string]$transition.Missing + '.' } else { '' }
    Fail ('Transição de checkpoint recusada.' + $detail)
  }
  $script:OperationReport.backupCheckpoints[$Name] = $Completed
  if ($TechnicalCode) { $script:OperationReport.backupCheckpointFailure = $TechnicalCode }
  if ($script:OperationDirectory) { try { Write-PrivateReport } catch { } }
}

function Assert-NoReparsePoint([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { Fail 'Um caminho esperado da homologação está ausente.' }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    Fail 'Um caminho da configuração ou do cluster é link/junction; destino recusado.'
  }
}

function Assert-PrivateAcl([string]$Path, [switch]$RequireProtected, [string]$Resource = '', [switch]$AllowAdministrators) {
  if ($Resource) {
    $script:CurrentPhase = "validacao ACL: $Resource"
    $script:OperationReport.phase = $script:CurrentPhase
  }
  $assessment = Test-AmoresPetPrivateAcl -Path $Path -CurrentSid $script:CurrentSid `
    -OwnerAllowedSids $script:AllowedPrivateSids -AccessAllowedSids $script:AllowedPrivateSids `
    -RequireProtected:$RequireProtected -AllowAdministrators:$AllowAdministrators
  if (-not $assessment.Success) {
    $script:TechnicalErrorCode = $assessment.TechnicalCode
    Fail $assessment.Message
  }
}

function Set-NewPrivateAcl([string]$Path, [switch]$Directory) {
  # Chamado apenas para diretórios/arquivos recém-criados por esta execução.
  # Nenhuma ACL de configuração ou pasta preexistente é modificada.
  $acl = Get-Acl -LiteralPath $Path
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleAll($rule) }
  $rights = [Security.AccessControl.FileSystemRights]::FullControl
  $inheritance = if ($Directory) {
    [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
  } else { [Security.AccessControl.InheritanceFlags]::None }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
      $identity, $rights, $inheritance, [Security.AccessControl.PropagationFlags]::None,
      [Security.AccessControl.AccessControlType]::Allow))
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
      'NT AUTHORITY\SYSTEM', $rights, $inheritance, [Security.AccessControl.PropagationFlags]::None,
      [Security.AccessControl.AccessControlType]::Allow))
  Set-Acl -LiteralPath $Path -AclObject $acl
  Assert-PrivateAcl $Path -RequireProtected
}

function Assert-ManagedDataDirectory([string]$Candidate) {
  if ([string]::IsNullOrWhiteSpace($Candidate) -or -not [IO.Path]::IsPathRooted($Candidate)) {
    Fail 'O diretório PostgreSQL não é absoluto; destino recusado.'
  }
  $full = [IO.Path]::GetFullPath($Candidate)
  $base = [IO.Path]::GetFullPath((Join-Path $script:PrivateRoot 'postgres\data'))
  $clusters = [IO.Path]::GetFullPath((Join-Path $script:PrivateRoot 'postgres\clusters'))
  $isBase = $full.Equals($base, [StringComparison]::OrdinalIgnoreCase)
  $clusterPattern = '^' + [regex]::Escape($clusters.TrimEnd('\')) + '\\[a-f0-9-]{36}\\data$'
  if (-not $isBase -and $full -notmatch $clusterPattern) {
    Fail 'O diretório PostgreSQL não pertence à allowlist privada da homologação.'
  }
  if ($full.StartsWith($script:TempRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    Fail 'A instância configurada está em TEMP e não é um cluster persistente de homologação.'
  }
  $cursor = $full
  while ($cursor -and $cursor.Length -ge $script:PrivateRoot.Length) {
    if (Test-Path -LiteralPath $cursor) { Assert-NoReparsePoint $cursor }
    if ($cursor.Equals($script:PrivateRoot, [StringComparison]::OrdinalIgnoreCase)) { break }
    $cursor = Split-Path -Parent $cursor
  }
  return $full
}

function Save-And-ClearPgEnvironment {
  foreach ($entry in Get-ChildItem Env:) {
    if ($entry.Name -match '^(PG|PSQL)' -or $entry.Name -eq 'DATABASE_URL') {
      $script:PgEnvironment[$entry.Name] = $entry.Value
      Remove-Item -LiteralPath "Env:$($entry.Name)" -ErrorAction SilentlyContinue
    }
  }
}

function Restore-PgEnvironment {
  foreach ($name in @((Get-ChildItem Env: | Where-Object { $_.Name -match '^(PG|PSQL)' -or $_.Name -eq 'DATABASE_URL' }).Name)) {
    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
  }
  foreach ($name in $script:PgEnvironment.Keys) { Set-Item -LiteralPath "Env:$name" -Value $script:PgEnvironment[$name] }
}

function Set-ExternalProcessDiagnostic([string]$Role, [object]$Result) {
  $script:OperationReport.lastExternalProcess = [ordered]@{
    role = $Role
    started = [bool]$Result.Started
    exitCode = $Result.ExitCode
    exceptionType = $Result.ExceptionType
    hResult = $Result.HResult
    nativeErrorCode = $Result.NativeErrorCode
    failureSummary = $Result.FailureSummary
    outputCaptured = if ($Result.PSObject.Properties['OutputCaptured']) { [bool]$Result.OutputCaptured } else { $true }
    failureCategory = $null
    failureCode = $null
    failureDescription = $null
    sqlState = $null
    privateDetailFile = $null
  }
}

function Save-PrivatePsqlFailureDetails([string]$StandardError) {
  if ([string]::IsNullOrWhiteSpace($StandardError) -or -not $script:OperationDirectory) { return $null }
  $name = 'psql-diagnostic-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.txt'
  $path = Join-Path $script:OperationDirectory $name
  $text = $StandardError
  if ($text.Length -gt 65536) { $text = $text.Substring(0,65536) + "`r`n[detalhe truncado]" }
  $bytes = (New-Object Text.UnicodeEncoding($false, $true)).GetBytes(
    "Detalhe local do psql; nao compartilhar.`r`n" + $text + "`r`n")
  try {
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
    Assert-NoReparsePoint $path
    $assessment = Test-AmoresPetPrivateAcl -Path $path -CurrentSid $script:CurrentSid `
      -OwnerAllowedSids $script:AllowedPrivateSids -AccessAllowedSids $script:AllowedPrivateSids
    if (-not $assessment.Success) { throw 'Private diagnostic ACL validation failed.' }
    return $name
  } catch {
    try { if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force -ErrorAction Stop } } catch { }
    return $null
  }
}

function Invoke-Psql([string[]]$Arguments, [switch]$AllowFailure) {
  $effectiveArguments = @('-v','VERBOSITY=verbose') + $Arguments
  $processResult = Invoke-AmoresPetNativeProcess -Executable $script:Psql -Arguments $effectiveArguments
  Set-ExternalProcessDiagnostic 'psql' $processResult
  $isPersistentMigration = $script:CurrentPhase -eq 'aplicacao transacional das migrations autorizadas'
  if ($isPersistentMigration -and $processResult.Started) {
    $script:OperationReport.persistentPsqlStarted = $true
    $script:OperationReport.persistentDdlStarted = $null
    $script:OperationReport.persistentOperationState = 'psql iniciado; resultado da migracao exige verificacao somente leitura'
    try { Write-PrivateReport } catch { }
  } elseif ($isPersistentMigration) {
    $script:OperationReport.persistentDdlStarted = $false
    $script:OperationReport.persistentOperationState = 'psql nao iniciou; nenhum SQL persistente foi enviado'
    try { Write-PrivateReport } catch { }
  }
  if (-not $processResult.Started) {
    $script:TechnicalErrorCode = 'AP-PSQL-LAUNCH-' + $processResult.HResult
    Fail ('psql nao iniciou; classe=' + $processResult.FailureSummary + '; codigo nativo=' +
      $(if ($null -ne $processResult.NativeErrorCode) { [string]$processResult.NativeErrorCode } else { 'nao informado' }))
  }
  $exitCode = [int]$processResult.ExitCode
  if ($isPersistentMigration) {
    $script:OperationReport.persistentSqlResponseReceived = $true
    if ($exitCode -eq 0) {
      $script:OperationReport.persistentOperationState = 'psql retornou sucesso; verificacao do estado final pendente'
    } else {
      $script:OperationReport.persistentOperationState = 'psql retornou erro; estado persistente inconclusivo ate consulta somente leitura'
    }
    try { Write-PrivateReport } catch { }
  }
  if ($exitCode -ne 0 -and -not $AllowFailure) {
    $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $processResult.StandardError -ExitCode $exitCode
    $script:OperationReport.lastExternalProcess.failureCategory = $diagnostic.Category
    $script:OperationReport.lastExternalProcess.failureCode = $diagnostic.Code
    $script:OperationReport.lastExternalProcess.failureDescription = $diagnostic.Description
    $script:OperationReport.lastExternalProcess.sqlState = $diagnostic.SqlState
    $script:OperationReport.lastExternalProcess.failureSummary = $diagnostic.Code
    $safeMessage = $diagnostic.Description
    if ($diagnostic.Category -eq 'PSQL_NAO_CLASSIFICADO' -and $processResult.StandardError) {
      $privateDetail = Save-PrivatePsqlFailureDetails $processResult.StandardError
      if ($privateDetail) {
        $script:OperationReport.lastExternalProcess.privateDetailFile = $privateDetail
        $safeMessage += ' Um detalhe técnico foi preservado na pasta privada da operação para análise local.'
      } else {
        $safeMessage += ' O detalhe bruto não foi exibido nem salvo porque a proteção privada não pôde ser validada.'
      }
    }
    $script:TechnicalErrorCode = $diagnostic.Code
    Fail $safeMessage
  }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = [string]$processResult.StandardOutput; StandardError = [string]$processResult.StandardError }
}

function Invoke-PgTool([string]$Executable, [string[]]$Arguments, [string]$Label, [switch]$AllowFailure, [switch]$NoCapture) {
  $processResult = Invoke-AmoresPetNativeProcess -Executable $Executable -Arguments $Arguments -NoCapture:$NoCapture
  Set-ExternalProcessDiagnostic $Label $processResult
  if ($Label -ceq 'Backup completo da homologação' -and $processResult.Started) {
    Set-BackupCheckpoint 'PG_DUMP_INICIADO' $true
  }
  if ($Label -ceq 'Verificação do backup' -and $processResult.Started) {
    Set-BackupCheckpoint 'CATALOGO_INICIADO' $true
  }
  if ($Label -ceq 'Restauração de validação descartável' -and $processResult.Started) {
    Set-BackupCheckpoint 'RESTAURACAO_INICIADA' $true
  }
  if (-not $processResult.Started) {
    $script:TechnicalErrorCode = 'AP-PGTOOL-LAUNCH-' + $processResult.HResult
    if ($Label -ceq 'Backup completo da homologação') {
      Set-BackupCheckpoint 'PG_DUMP_INICIADO' $false $script:TechnicalErrorCode
    }
    if ($Label -ceq 'Verificação do backup') {
      Set-BackupCheckpoint 'CATALOGO_VALIDADO' $false $script:TechnicalErrorCode
    }
    if ($Label -ceq 'Restauração de validação descartável') {
      Set-BackupCheckpoint 'RESTAURACAO_INICIADA' $false $script:TechnicalErrorCode
      Set-BackupCheckpoint 'PG_RESTORE_CONCLUIDO' $false $script:TechnicalErrorCode
    }
    Fail "$Label nao iniciou; classe=$($processResult.FailureSummary); HRESULT=$($processResult.HResult); erro nativo=$($processResult.NativeErrorCode)."
  }
  $exitCode = [int]$processResult.ExitCode
  if ($Label -ceq 'Backup completo da homologação' -and $exitCode -eq 0) {
    Set-BackupCheckpoint 'PG_DUMP_CONCLUIDO' $true
  }
  if ($Label -ceq 'Backup completo da homologação' -and $exitCode -ne 0) {
    $script:TechnicalErrorCode = "AP-MIG-PG-DUMP-EXIT-$exitCode"
    Set-BackupCheckpoint 'PG_DUMP_CONCLUIDO' $false $script:TechnicalErrorCode
    $summary = Get-AmoresPetProcessOutputFailureSummary $processResult.StandardError
    $script:OperationReport.lastExternalProcess.failureSummary = $summary
    Fail "pg_dump terminou com código $exitCode (diagnóstico=$summary); nenhum backup foi aprovado."
  }
  if ($Label -ceq 'Verificação do backup' -and $exitCode -ne 0) {
    $script:TechnicalErrorCode = "AP-MIG-BACKUP-CATALOG-EXIT-$exitCode"
    $summary = Get-AmoresPetProcessOutputFailureSummary $processResult.StandardError
    $script:OperationReport.lastExternalProcess.failureSummary = $summary
    Set-BackupCheckpoint 'CATALOGO_VALIDADO' $false $script:TechnicalErrorCode
    Fail "pg_restore --list terminou com código $exitCode (diagnóstico=$summary); o catálogo não foi validado."
  }
  if ($Label -ceq 'Restauração de validação descartável' -and $exitCode -eq 0) {
    Set-BackupCheckpoint 'PG_RESTORE_CONCLUIDO' $true
  }
  if ($Label -ceq 'Restauração de validação descartável' -and $exitCode -ne 0) {
    $script:TechnicalErrorCode = "AP-MIG-PG-RESTORE-EXIT-$exitCode"
    $script:OperationReport.lastExternalProcess.failureSummary = Get-AmoresPetProcessOutputFailureSummary $processResult.StandardError
    Set-BackupCheckpoint 'PG_RESTORE_CONCLUIDO' $false $script:TechnicalErrorCode
    Fail "pg_restore encerrou com código $exitCode; restauração incompleta recusada. stderr bruto omitido."
  }
  if ($Label -ceq 'Verificação estrutural da cópia restaurada' -and $exitCode -ne 0) {
    $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $processResult.StandardError -ExitCode $exitCode
    $state = if ($diagnostic.SqlState) { [string]$diagnostic.SqlState } else { 'NAO_IDENTIFICADO' }
    $script:TechnicalErrorCode = "AP-MIG-STRUCTURE-VERIFY-EXIT-$exitCode-SQLSTATE-$state"
    $script:OperationReport.lastExternalProcess.failureCategory = [string]$diagnostic.Category
    $script:OperationReport.lastExternalProcess.failureCode = $script:TechnicalErrorCode
    $script:OperationReport.lastExternalProcess.failureDescription = [string]$diagnostic.Description
    $script:OperationReport.lastExternalProcess.sqlState = $diagnostic.SqlState
    $script:OperationReport.lastExternalProcess.failureSummary = $script:TechnicalErrorCode
    $privateDetail = Save-PrivatePsqlFailureDetails $processResult.StandardError
    if ($privateDetail) { $script:OperationReport.lastExternalProcess.privateDetailFile = $privateDetail }
    $safeDetail = if ($privateDetail) { ' Detalhe PostgreSQL preservado no relatório privado da operação.' } else { ' O detalhe bruto não pôde ser preservado com ACL privada.' }
    Fail ("verificar_estrutura.sql falhou no banco descartável: exit=$exitCode; SQLSTATE=$state; " +
      "diagnóstico=$($diagnostic.Code). Nenhuma operação persistente foi iniciada." + $safeDetail)
  }
  if ($exitCode -ne 0 -and -not $AllowFailure -and
      $Label -cne 'Backup completo da homologação' -and $Label -cne 'Verificação do backup') {
    $script:OperationReport.lastExternalProcess.failureSummary = Get-AmoresPetProcessOutputFailureSummary $processResult.StandardError
    $script:TechnicalErrorCode = "AP-PGTOOL-EXIT-$exitCode"
    Fail "$Label falhou com código $exitCode; resumo=$(Get-AmoresPetProcessOutputFailureSummary $processResult.StandardError); stderr bruto omitido."
  }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = [string]$processResult.StandardOutput; StandardError = [string]$processResult.StandardError }
}

function Invoke-LiveQuery([string]$Sql) {
  $psqlArgs = @('-X','-w','-q','-A','-t','-F','|','-v','ON_ERROR_STOP=1',
    '-h',$script:DatabaseHost,'-p',[string]$script:DatabasePort,
    '-U',[string]$script:Pg.user,'-d',$script:DatabaseName,'-c',$Sql)
  $result = Invoke-Psql $psqlArgs
  return $result.Output.Trim()
}

function Invoke-TempQuery([string]$Sql, [string]$TempDatabase, [int]$TempPort) {
  $psqlArgs = @('-X','-w','-q','-A','-t','-F','|','-v','ON_ERROR_STOP=1',
    '-h','127.0.0.1','-p',[string]$TempPort,'-U','postgres','-d',$TempDatabase,'-c',$Sql)
  $result = Invoke-Psql $psqlArgs
  return $result.Output.Trim()
}

function Get-Identity([switch]$Temporary, [string]$TempDatabase, [int]$TempPort,
    [string]$ExpectedDataDirectory) {
  $sql = @"
SELECT current_database() || '|' || current_user || '|' || session_user || '|' ||
       COALESCE(host(inet_server_addr()), '') || '|' || inet_server_port()::text || '|' ||
       current_setting('server_version_num') || '|' ||
       extract(epoch FROM pg_postmaster_start_time())::bigint::text || '|' ||
       COALESCE((SELECT CASE WHEN rolsuper THEN 'true' ELSE 'false' END FROM pg_roles WHERE rolname = current_user), 'missing')
"@
  if ($Temporary) { $line = Invoke-TempQuery $sql $TempDatabase $TempPort }
  else { $line = Invoke-LiveQuery $sql }
  $parts = $line -split '\|', 8
  if ($parts.Count -ne 8) { Fail 'A identidade SQL retornou formato inesperado; destino recusado.' }
  $identityPort = if ($Temporary) { $TempPort } else { $script:DatabasePort }
  $dataDirectory = if ($Temporary) { $ExpectedDataDirectory } else { $script:DataDirectory }
  if ([string]::IsNullOrWhiteSpace($dataDirectory)) { Fail 'O diretório local do cluster não foi informado; destino recusado.' }
  $startEpoch = [long]0
  if (-not [long]::TryParse($parts[6], [ref]$startEpoch)) { Fail 'O horário de início SQL do cluster é inválido; destino recusado.' }
  try {
    $postmasterIdentity = Get-AmoresPetPostmasterIdentity -Path (Join-Path $dataDirectory 'postmaster.pid') -ExpectedDataDirectory $dataDirectory -ExpectedPort $identityPort -ExpectedListenAddress '127.0.0.1' -ExpectedStartEpoch $startEpoch
  } catch {
    Fail 'A identidade SQL não corresponde ao postmaster.pid do cluster esperado; destino recusado.'
  }
  return [pscustomobject]@{
    Database = $parts[0]; User = $parts[1]; SessionUser = $parts[2];
    Address = $parts[3]; Port = [int]$parts[4]; DataDirectory = $postmasterIdentity.DataDirectory;
    VersionNum = [int]$parts[5]; StartEpoch = $startEpoch; IsSuperuser = ConvertFrom-PgBoolean $parts[7]
  }
}

function Assert-LiveIdentity {
  $identity = Get-Identity
  if ($identity.Database -cne $script:DatabaseName -or $identity.User -cne $script:DatabaseUser -or
      $identity.SessionUser -cne $script:DatabaseUser -or $identity.Address -cne $script:DatabaseHost -or
      $identity.Port -ne $script:DatabasePort -or
      -not $identity.DataDirectory.Equals($script:DataDirectory, [StringComparison]::OrdinalIgnoreCase) -or
      $identity.VersionNum -lt 170000 -or $identity.VersionNum -ge 180000 -or $identity.IsSuperuser) {
    Fail 'A identidade SQL não corresponde ao cluster não privilegiado da homologação; nada foi alterado.'
  }
  try {
    $postmasterIdentity = Get-AmoresPetPostmasterIdentity -Path (Join-Path $script:DataDirectory 'postmaster.pid') `
      -ExpectedDataDirectory $script:DataDirectory -ExpectedPort $script:DatabasePort `
      -ExpectedListenAddress $script:DatabaseHost -ExpectedStartEpoch ([long]$identity.StartEpoch)
  } catch {
    Fail 'O PID file do PostgreSQL não corresponde à identidade SQL; nada foi alterado.'
  }
  $postgresProcessId = [int]$postmasterIdentity.ProcessId
  $expectedExe = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $script:PgCtl) 'postgres.exe'))
  try {
    $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $postgresProcessId `
      -ExpectedExecutable $expectedExe -ExpectedDataDirectory $script:DataDirectory `
      -ExpectedListenAddress $script:DatabaseHost -ExpectedPort $script:DatabasePort
  } catch {
    Fail 'O processo, a linha de comando ou o listener PostgreSQL não corresponde à sessão isolada.'
  }
  $databaseNames = Invoke-LiveQuery "SELECT string_agg(datname, ',' ORDER BY datname) FROM pg_database WHERE NOT datistemplate"
  if ($databaseNames -cne 'amores_pet_homologacao,postgres') {
    Fail 'O cluster contém bancos não previstos pela homologação isolada; destino recusado.'
  }
  return $identity
}

function Get-MigrationState {
  $sql = @'
SELECT CASE WHEN COALESCE(to_regclass('public.operation_authorizations') IS NOT NULL, false) THEN 'true' ELSE 'false' END || '|' ||
       CASE WHEN COALESCE(to_regclass('public.permanent_file_deletion_queue') IS NOT NULL, false) THEN 'true' ELSE 'false' END || '|' ||
       CASE WHEN COALESCE(position('super_administrador' IN pg_get_functiondef(
         to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)'))) > 0, false) THEN 'true' ELSE 'false' END || '|' ||
       CASE WHEN COALESCE(to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)') IS NOT NULL, false) THEN 'true' ELSE 'false' END || '|' ||
       COALESCE((SELECT string_agg(format('%I.%I', schemaname, tablename), ',')
                   FROM pg_tables WHERE schemaname = 'public'
                    AND tablename IN ('schema_migrations','migrations','migration_history','schema_version')), '')
'@
  $line = Invoke-LiveQuery $sql
  $parts = $line -split '\|', 5
  if ($parts.Count -ne 5) { Fail 'O estado das migrations retornou formato inesperado.' }
  if ($parts[4]) { Fail 'Foi encontrado controle de migrations não documentado; o estado não será inferido.' }
  if ($parts[3] -cne 'true') { Fail 'A função base de notificações esperada não existe.' }
  $auth = ConvertFrom-PgBoolean $parts[0]; $queue = ConvertFrom-PgBoolean $parts[1]; $notify = ConvertFrom-PgBoolean $parts[2]
  if (-not $auth -and -not $queue -and -not $notify) { return 'pendente' }
  if ($auth -and $queue -and $notify) { return 'presente' }
  Fail 'O esquema mostra aplicação parcial ou divergente das migrations 036/037; nenhuma migration será executada.'
}

function Assert-LivePrerequisites {
  $sql = @'
SELECT CASE WHEN has_schema_privilege(current_user, 'public', 'CREATE') THEN 'true' ELSE 'false' END || '|' ||
       CASE WHEN has_table_privilege(current_user, 'public.usuarios', 'REFERENCES') THEN 'true' ELSE 'false' END || '|' ||
       CASE WHEN (SELECT pg_get_userbyid(proowner) = current_user
          FROM pg_proc WHERE oid = to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)')) THEN 'true' ELSE 'false' END || '|' ||
       (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
          AND pid <> pg_backend_pid())::text || '|' ||
       (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND (state IS DISTINCT FROM 'idle' OR xact_start IS NOT NULL))::text
'@
  $parts = (Invoke-LiveQuery $sql) -split '\|', 5
  if ($parts.Count -ne 5) { Fail 'A verificacao de privilegios retornou formato inesperado.' }
  if (-not (ConvertFrom-PgBoolean $parts[0]) -or -not (ConvertFrom-PgBoolean $parts[1]) -or -not (ConvertFrom-PgBoolean $parts[2])) {
    Fail 'O usuário não possui os privilégios mínimos para as migrations; nenhuma elevação administrativa será tentada.'
  }
  if ([int]$parts[4] -gt 0) {
    Fail 'Há conexões ativas ou transações abertas no banco de homologação; encerre o uso e execute novamente.'
  }
  return [pscustomobject]@{ OtherSessions = [int]$parts[3]; ActiveOrOpenTransactions = [int]$parts[4] }
}

function New-PrivateDirectory([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    Assert-NoReparsePoint $Path
    Assert-PrivateAcl $Path -RequireProtected
    return
  }
  [void][IO.Directory]::CreateDirectory($Path)
  Set-NewPrivateAcl $Path -Directory
}

function New-PrivatePassfile {
  $file = Join-Path $script:PrivateRoot ('.migration-' + [guid]::NewGuid().ToString('N') + '.pgpass')
  $escape = { param([string]$Value) $Value.Replace('\','\\').Replace(':','\:').Replace("`r",'').Replace("`n",'') }
  $escapedValues = @()
  foreach ($value in @($script:DatabaseHost,[string]$script:DatabasePort,$script:DatabaseName,[string]$script:Pg.user,[string]$script:Pg.password)) {
    $escapedValues += (& $escape ([string]$value))
  }
  $line = ($escapedValues -join ':') + "`n"
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($line)
  $stream = [IO.File]::Open($file, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
  Assert-NoReparsePoint $file
  Assert-PrivateAcl $file
  return $file
}

function Acquire-OperationLock {
  $script:LockPath = Join-Path $script:PrivateRoot 'migration-lote2.lock'
  try {
    $stream = [IO.File]::Open($script:LockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $record = [ordered]@{ version = 1; pid = $PID; token = $script:LockToken; startedUtc = (Get-Date).ToUniversalTime().ToString('o') } |
      ConvertTo-Json -Compress
    $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($record)
    $stream.Write($bytes, 0, $bytes.Length); $stream.Flush(); $stream.Dispose()
    Assert-PrivateAcl $script:LockPath
  } catch {
    if (Test-Path -LiteralPath $script:LockPath) { Fail 'Outro executor está ativo ou existe uma trava anterior; ela foi preservada para diagnóstico.' }
    Fail 'Não foi possível obter uma trava local exclusiva; nenhuma migration foi iniciada.'
  }
}

function Release-OperationLock {
  if (-not $script:LockPath -or -not (Test-Path -LiteralPath $script:LockPath -PathType Leaf)) { return }
  try {
    Assert-NoReparsePoint $script:LockPath
    $record = Get-Content -LiteralPath $script:LockPath -Raw | ConvertFrom-Json
    if ($record.token -ceq $script:LockToken -and [int]$record.pid -eq $PID) {
      Remove-Item -LiteralPath $script:LockPath -Force
    }
  } catch { }
}

function Get-TableCountSnapshot([switch]$Temporary, [string]$TempDatabase, [int]$TempPort) {
  $sql = Get-AmoresPetNumericTableSnapshotSql
  if ($Temporary) {
    $psqlArgs = @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$TempPort,
      '-U','postgres','-d',$TempDatabase,'-c',$sql)
  } else {
    $psqlArgs = @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',$script:DatabaseHost,
      '-p',[string]$script:DatabasePort,'-U',[string]$script:Pg.user,'-d',$script:DatabaseName,'-c',$sql)
  }
  $result = Invoke-Psql $psqlArgs
  $assessment = ConvertFrom-AmoresPetNumericTableSnapshot -StandardOutput $result.Output `
    -StandardError $result.StandardError -ExitCode $result.ExitCode
  if (-not $assessment.Success) {
    $script:TechnicalErrorCode = [string]$assessment.Code
    Fail ([string]$assessment.Description + ' Etapa: contagem numérica de tabelas; nenhum dado de tabela foi exibido.')
  }
  return $assessment.Snapshot
}

function Assert-SnapshotsEqual($Before, $After, [switch]$AllowNewMigrationTables, [switch]$RecordPreflightCheckpoints) {
  $structureProperties = @('TableCount','StructureFingerprintA','StructureFingerprintB')
  foreach ($propertyName in $structureProperties) {
    $beforeValue = $Before.PSObject.Properties[$propertyName]
    $afterValue = $After.PSObject.Properties[$propertyName]
    if (-not $beforeValue -or -not $afterValue -or [decimal]$beforeValue.Value -ne [decimal]$afterValue.Value) {
      Fail 'A estrutura das tabelas preexistentes divergiu entre as verificações.'
    }
  }
  if ($RecordPreflightCheckpoints) { Set-BackupCheckpoint 'ESTRUTURAS_COMPARADAS' $true }

  $dataProperties = @('RowCount','DataFingerprintA','DataFingerprintB')
  foreach ($propertyName in $dataProperties) {
    $beforeValue = $Before.PSObject.Properties[$propertyName]
    $afterValue = $After.PSObject.Properties[$propertyName]
    if (-not $beforeValue -or -not $afterValue -or [decimal]$beforeValue.Value -ne [decimal]$afterValue.Value) {
      Fail 'Os dados preexistentes divergiram entre as verificações.'
    }
  }
  if ($RecordPreflightCheckpoints) { Set-BackupCheckpoint 'DADOS_COMPARADOS' $true }

  if ($AllowNewMigrationTables) {
    if ([long]$After.MigrationTableCount -ne 2 -or [decimal]$After.MigrationRowCount -ne 0) {
      Fail 'As tabelas criadas pelas migrations estão ausentes ou não estão vazias.'
    }
  }
}

function New-MigrationStage([string]$Directory, [string]$Mode, [string]$ExpectedDatabase,
    [int]$ExpectedPort, [string]$ExpectedUser, [string]$ExpectedDataDirectory) {
  $migrations = Join-Path $Directory 'migrations'
  [void][IO.Directory]::CreateDirectory($migrations)
  $sourceDirectory = Join-Path $script:RepoRoot 'backend\src\database\migrations'
  foreach ($file in @('036_autorizacoes_operacionais.sql','037_notificacoes_super_administrador.sql')) {
    $source = Join-Path $sourceDirectory $file
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { Fail "Migration autorizada ausente: $file." }
    $approvedHashes = @{
      '036_autorizacoes_operacionais.sql' = '9b80506aff0e1df485c73c0aa265db30c7f9ea4ecdece9d52b7e070ae9b31ee9'
      '037_notificacoes_super_administrador.sql' = 'e4826196675320b3edbd39882072fdbde9bd997aeb6e7b42f029fe8cdfadf757'
    }
    $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sourceHash -cne $approvedHashes[$file]) {
      Fail "A migration $file diverge do conteudo autorizado; nenhum SQL sera executado."
    }
    $content = [IO.File]::ReadAllText($source)
    $sourceGuard = '\ir ../confirmar_destino.sql'
    if ([regex]::Matches($content, [regex]::Escape($sourceGuard)).Count -ne 1) {
      Fail "A migration $file mudou seu guard; nenhuma cópia operacional será criada."
    }
    $staged = $content.Replace($sourceGuard, '\ir ../confirmar-homologacao-lote2.sql')
    [IO.File]::WriteAllText((Join-Path $migrations $file), $staged, (New-Object Text.UTF8Encoding($false)))
  }
  $guard = @'
\set ON_ERROR_STOP on
SELECT
  :'operation_scope' = '036,037'
  AND (
    (:'operation_mode' = 'persistent'
      AND current_database() = 'amores_pet_homologacao'
      AND :'expected_database' = 'amores_pet_homologacao'
      AND :'expected_user' = 'amores_pet_homologacao_app'
      AND :'expected_host' = '127.0.0.1'
      AND :'expected_port' = '55432'
      AND :'expected_cluster_id' ~ '^[a-f0-9-]{36}$')
    OR
    (:'operation_mode' = 'preflight'
      AND current_database() = :'expected_database'
      AND current_database() ~ '^amores_pet_preflight_[a-f0-9]{32}$'
      AND :'expected_user' = 'postgres')
  )
  AND current_database() = :'expected_database'
  AND current_user = :'expected_user'
  AND inet_server_addr() = :'expected_host'::inet
  AND inet_server_port() = :'expected_port'::integer
  AND abs(extract(epoch FROM pg_postmaster_start_time())::bigint - :'expected_start_epoch'::bigint) <= 1
  AND current_setting('server_version_num')::integer >= 170000
  AND current_setting('server_version_num')::integer < 180000
  AS migration_target_confirmed \gset
\if :migration_target_confirmed
  \echo Destino operacional confirmado para migrations 036/037.
\else
  DO $$ BEGIN RAISE EXCEPTION 'Destino recusado pelo guard operacional 036/037'; END $$;
\endif
'@
  [IO.File]::WriteAllText((Join-Path $Directory 'confirmar-homologacao-lote2.sql'), $guard, (New-Object Text.UTF8Encoding($false)))
  $wrapper = @'
\set ON_ERROR_STOP on
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
\ir migrations/036_autorizacoes_operacionais.sql
\ir migrations/037_notificacoes_super_administrador.sql
'@
  [IO.File]::WriteAllText((Join-Path $Directory 'aplicar-036-037.sql'), $wrapper, (New-Object Text.UTF8Encoding($false)))
  try {
    $stagePostmaster = Get-AmoresPetPostmasterIdentity -Path (Join-Path $ExpectedDataDirectory 'postmaster.pid') -ExpectedDataDirectory $ExpectedDataDirectory -ExpectedPort $ExpectedPort -ExpectedListenAddress '127.0.0.1'
  } catch {
    Fail 'O postmaster.pid local não corresponde ao cluster que receberia as migrations.'
  }
  $identityArgs = @('-v','operation_scope=036,037','-v',"operation_mode=$Mode",
    '-v',"expected_database=$ExpectedDatabase",'-v','expected_host=127.0.0.1',
    '-v',"expected_port=$ExpectedPort",'-v',"expected_user=$ExpectedUser",
    '-v',"expected_start_epoch=$($stagePostmaster.StartEpoch)")
  if ($Mode -eq 'persistent') { $identityArgs += @('-v',"expected_cluster_id=$($script:Pg.clusterId)") }
  else { $identityArgs += @('-v','expected_cluster_id=00000000-0000-0000-0000-000000000000') }
  return $identityArgs
}

function Get-FreeLoopbackPort {
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    try {
      $listener.Start()
      $candidate = [int]$listener.LocalEndpoint.Port
      if ($candidate -notin @(3001,5432,55432)) { return $candidate }
    } finally { $listener.Stop() }
  }
  Fail 'Não foi possível reservar uma porta temporária distinta das portas da aplicação e do PostgreSQL.'
}

function Assert-TemporaryCluster([string]$DataDirectory, [int]$Port, [int]$ExpectedPid) {
  $pidPath = Join-Path $DataDirectory 'postmaster.pid'
  if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf)) { Fail 'O cluster descartável não criou PID file.' }
  $lines = Get-Content -LiteralPath $pidPath
  if ($lines.Count -lt 6 -or [int]$lines[0] -ne $ExpectedPid -or
      -not [IO.Path]::GetFullPath([string]$lines[1]).Equals([IO.Path]::GetFullPath($DataDirectory), [StringComparison]::OrdinalIgnoreCase) -or
      [int]$lines[3] -ne $Port -or ($lines[5] -split ',').Trim() -notcontains '127.0.0.1') {
    Fail 'O PID file não corresponde ao cluster descartável criado pelo executor.'
  }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ExpectedPid" -ErrorAction SilentlyContinue
  if (-not $process -or [IO.Path]::GetFullPath($process.ExecutablePath) -ine [IO.Path]::GetFullPath($script:PostgresExe)) {
    Fail 'O processo do cluster descartável não foi comprovado.'
  }
  $command = $process.CommandLine.Replace('/','\')
  if ($command -notmatch [regex]::Escape([IO.Path]::GetFullPath($DataDirectory)) -or
      $command -notmatch '(?i)-h\s+"?127\.0\.0\.1' -or
      $command -notmatch ('(?i)-p\s+"?' + [regex]::Escape([string]$Port) + '(?:\s|"|$)')) {
    Fail 'A linha de comando do cluster temporario nao corresponde ao destino isolado.'
  }
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  if ($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $ExpectedPid -or $listeners[0].LocalAddress -cne '127.0.0.1') {
    Fail 'O listener do cluster descartável não pertence ao processo criado.'
  }
}

function Test-BackupAndMigrations([string]$BackupPath, [string]$OperationDirectory) {
  Set-Phase 'preparacao do cluster descartavel para restauracao'
  $backupSize = (Get-Item -LiteralPath $BackupPath).Length
  if ($backupSize -le 0) { Fail 'O backup está vazio.' }

  $testId = [guid]::NewGuid().ToString('N')
  $testRoot = Join-Path $script:TempRoot "amores-pet-migration-preflight-$testId"
  $script:PreflightDirectory = $testRoot
  if (Test-Path -LiteralPath $testRoot) { Fail 'O diretório aleatório de pré-validação já existe.' }
  [void][IO.Directory]::CreateDirectory($testRoot)
  Set-NewPrivateAcl $testRoot -Directory
  $data = Join-Path $testRoot 'data'
  $stage = Join-Path $testRoot 'stage'
  [void][IO.Directory]::CreateDirectory($stage)
  Set-NewPrivateAcl $stage -Directory
  $tempDatabase = "amores_pet_preflight_$testId"
  $tempPort = Get-FreeLoopbackPort

  Set-Phase 'initdb do cluster descartavel'
  $null = Invoke-PgTool $script:InitDb @('-D',$data,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8') 'Criação do cluster descartável'
  $script:TestClusterStarted = $true
  $pgCtlLog = Join-Path $testRoot 'postgres.log'
  Set-Phase 'inicializacao do cluster descartavel'
  $start = Invoke-PgTool $script:PgCtl @('-D',$data,'-o',"-h 127.0.0.1 -p $tempPort",'-l',$pgCtlLog,'-w','-t','30','start') 'Inicialização do cluster descartável' -NoCapture
  $script:TestClusterStarted = $true
  $pidLines = Get-Content -LiteralPath (Join-Path $data 'postmaster.pid')
  $tempPid = [int]$pidLines[0]
  Assert-TemporaryCluster $data $tempPort $tempPid

  Set-Phase 'criacao do banco descartavel de pre-validacao'
  $createRole = 'CREATE ROLE amores_pet_homologacao_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
  $createArgs = @('-X','-w','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$tempPort,'-U','postgres','-d','postgres','-c',$createRole)
  $null = Invoke-Psql $createArgs
  $createDatabase = "CREATE DATABASE $tempDatabase OWNER amores_pet_homologacao_app ENCODING 'UTF8' TEMPLATE template0"
  $createDatabaseArgs = @('-X','-w','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$tempPort,'-U','postgres','-d','postgres','-c',$createDatabase)
  $null = Invoke-Psql $createDatabaseArgs
  Set-Phase 'restauracao do backup em banco descartavel'
  $restoreArgs = @('--exit-on-error','--no-owner','--no-privileges','-h','127.0.0.1','-p',[string]$tempPort,
    '-U','postgres','-d',$tempDatabase,$BackupPath)
  $null = Invoke-PgTool $script:PgRestore $restoreArgs 'Restauração de validação descartável'
  $dbNames = Invoke-TempQuery "SELECT string_agg(datname, ',' ORDER BY datname) FROM pg_database WHERE NOT datistemplate" $tempDatabase $tempPort
  if ($dbNames -cne "$tempDatabase,postgres" -or $dbNames -match 'sistema_petshop|amores_pet_homologacao') {
    Fail 'A instância de restauração descartável contém nomes de bancos não previstos.'
  }
  $tempIdentity = Get-Identity -Temporary -TempDatabase $tempDatabase -TempPort $tempPort -ExpectedDataDirectory $data
  if ($tempIdentity.Database -cne $tempDatabase -or $tempIdentity.User -cne 'postgres' -or
      $tempIdentity.Address -cne '127.0.0.1' -or $tempIdentity.Port -ne $tempPort -or
      -not $tempIdentity.DataDirectory.Equals([IO.Path]::GetFullPath($data), [StringComparison]::OrdinalIgnoreCase) -or
      $tempIdentity.VersionNum -lt 170000 -or $tempIdentity.VersionNum -ge 180000) {
    Fail 'A identidade do cluster de restauração descartável não confere.'
  }
  $before = Get-TableCountSnapshot -Temporary -TempDatabase $tempDatabase -TempPort $tempPort
  Set-BackupCheckpoint 'CONTAGEM_TABELAS_VALIDADA' $true
  Set-Phase 'aplicacao de 036/037 na copia descartavel'
  $tempArgs = New-MigrationStage $stage 'preflight' $tempDatabase $tempPort 'postgres' $data
  $applyArgs = @('-X','-w','-q','-1','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$tempPort,
    '-U','postgres','-d',$tempDatabase) + $tempArgs + @('-f',(Join-Path $stage 'aplicar-036-037.sql'))
  $null = Invoke-Psql $applyArgs
  Set-Phase 'verificacao estrutural da copia descartavel'
  $null = Invoke-PgTool $script:Psql @('-X','-w','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$tempPort,
    '-U','postgres','-d',$tempDatabase,'-f',(Join-Path $script:RepoRoot 'backend\src\database\verificar_estrutura.sql')) 'Verificação estrutural da cópia restaurada'
  $after = Get-TableCountSnapshot -Temporary -TempDatabase $tempDatabase -TempPort $tempPort
  Assert-SnapshotsEqual $before $after -AllowNewMigrationTables -RecordPreflightCheckpoints
  Set-BackupCheckpoint 'RESTAURACAO_TESTADA' $true
  Set-BackupCheckpoint 'PREFLIGHT_APROVADO' $true
  $script:OperationReport.preflight = 'backup restaurado; migrations 036/037 aplicadas e verificador estrutural aprovado em cluster descartável'

  $status = Invoke-PgTool $script:PgCtl @('-D',$data,'status') 'Identificação do cluster descartável' -AllowFailure
  if ($status.ExitCode -eq 0) {
    Assert-TemporaryCluster $data $tempPort $tempPid
    $null = Invoke-PgTool $script:PgCtl @('-D',$data,'-m','fast','-w','-t','30','stop') 'Encerramento do cluster descartável'
  }
  $script:TestClusterStarted = $false
  if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) { Fail 'O cluster descartável não confirmou encerramento; pasta preservada.' }
  return [pscustomobject]@{ Directory = $testRoot; Database = $tempDatabase; Port = $tempPort; Before = $before; After = $after }
}

function Remove-PreflightDirectory {
  if (-not $script:PreflightDirectory -or -not (Test-Path -LiteralPath $script:PreflightDirectory)) { return }
  $full = [IO.Path]::GetFullPath($script:PreflightDirectory)
  $tempPrefix = $script:TempRoot.TrimEnd('\') + '\'
  if (-not $full.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetFileName($full) -notmatch '^amores-pet-migration-preflight-[a-f0-9]{32}$') {
    Fail 'O caminho descartável não passou na validação de limpeza; conteúdo preservado.'
  }
  if (Test-Path -LiteralPath (Join-Path $full 'data\postmaster.pid')) {
    $data = Join-Path $full 'data'
    $status = Invoke-PgTool $script:PgCtl @('-D',$data,'status') 'Confirmação de encerramento do cluster' -AllowFailure
    if ($status.ExitCode -eq 0) { Fail 'O cluster descartável ainda está ativo; conteúdo preservado.' }
    Fail 'Há PID file após a tentativa de encerramento; conteúdo descartável preservado.'
  }
  Assert-NoReparsePoint $full
  Remove-Item -LiteralPath $full -Recurse -Force
  $script:PreflightDirectory = $null
}

function Test-BackendReadiness {
  try {
  $statePath = Join-Path $script:PrivateRoot 'launcher-state.json'
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { return 'SQL e esquema prontos; backend local não estava registrado para verificação HTTP' }
  Assert-NoReparsePoint $statePath
  Assert-PrivateAcl $statePath
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if ([string]$state.clusterId -cne [string]$script:Pg.clusterId -or
      [IO.Path]::GetFullPath([string]$state.dataDirectory) -ine $script:DataDirectory -or [int]$state.port -ne $script:DatabasePort) {
    return 'SQL e esquema prontos; registro do backend não corresponde ao cluster validado'
  }
  $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $node) { return 'SQL e esquema prontos; Node.js indisponível para confirmar o backend' }
  $appProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$state.appPid)" -ErrorAction SilentlyContinue
  if (-not $appProcess -or [IO.Path]::GetFullPath($appProcess.ExecutablePath) -ine [IO.Path]::GetFullPath($node) -or
      $appProcess.CommandLine -cne [string]$state.appCommand -or $appProcess.CommandLine -notmatch 'backend-runner\.cjs') {
    return 'SQL e esquema prontos; processo do backend não pôde ser comprovado'
  }
  $appListeners = @(Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue)
  if ($appListeners.Count -ne 1 -or $appListeners[0].OwningProcess -ne [int]$state.appPid -or $appListeners[0].LocalAddress -cne '127.0.0.1') {
    return 'SQL e esquema prontos; listener do backend não corresponde ao processo registrado'
  }
  try {
    $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health/ready' -TimeoutSec 5
    if ($ready.status -eq 'ready') { return 'backend local identificado e /health/ready aprovado' }
  } catch { }
  return 'SQL e esquema prontos; backend identificado, mas /health/ready não aprovou'
  } catch {
    return 'SQL e esquema prontos; a verificacao HTTP do backend ficou inconclusiva'
  }
}

function Get-SanitizedOperationSummary([object]$Report, [string]$SensitiveValue) {
  $safeMessage = [string]$Report.error
  if (-not [string]::IsNullOrEmpty($SensitiveValue)) { $safeMessage = $safeMessage.Replace($SensitiveValue, '[oculto]') }
  $safeMessage = $safeMessage -replace '(?i)(password|senha|token|secret|segredo|credential|credencial)\s*[:=]\s*[^\s,;|]+', '$1=[redigido]'
  $safeMessage = $safeMessage -replace '(?i)postgres(ql)?://[^\s]+', 'postgres[redigido]'
  $safeMessage = $safeMessage -replace '(?i)[A-Z]:\\[^\s]+', '[caminho local]'
  if ($safeMessage.Length -gt 400) { $safeMessage = $safeMessage.Substring(0,400) + '...' }
  $ddlState = if ($Report.persistentDdlStarted -eq $true) { 'CONFIRMADO' }
    elseif ($Report.persistentDdlStarted -eq $false) { 'NAO CONFIRMADO' }
    else { 'INCONCLUSIVO' }
  $catalogState = if ($Report.backup) { [string]$Report.backup.pgRestoreList } else { 'nao validado' }
  $safeLines = @(
    'Amores Pet — aplicacao controlada das migrations 036/037'
    'Status: ' + [string]$Report.status
    'Etapa: ' + [string]$Report.phase
    'Codigo tecnico: ' + [string]$Report.technicalCode
    'Causa: ' + $safeMessage
    'Estado 036/037 antes: ' + [string]$Report.migrationStateBefore
    'Estado 036/037 depois: ' + [string]$Report.migrationStateAfter
    'Backup: ' + [string]$Report.backupState
    'Checkpoints do backup: ' + (($Report.backupCheckpoints | ConvertTo-Json -Compress) -replace '"','')
    'Falha de checkpoint: ' + [string]$Report.backupCheckpointFailure
    'Catalogo do backup: ' + $catalogState
    'Preflight descartavel: ' + [string]$Report.preflightState
    'Confirmacao local apresentada: ' + [string]$Report.confirmationPresented
    'Confirmacao local aceita: ' + [string]$Report.confirmationAccepted
    'Tentativa de operacao persistente: ' + [string]$Report.persistentOperationAttempted
    'Processo psql persistente iniciado: ' + [string]$Report.persistentPsqlStarted
    'DDL persistente: ' + $ddlState
    'Resultado persistente: ' + [string]$Report.persistentOperationState
    'Falha interna: ' + [string]$Report.internalFailureFunction + ' | ' + [string]$Report.internalFailureLocation
    'Modo de politica do lancador: ' + [string]$Report.launcherPolicyMode
  )
  return ($safeLines -join "`r`n") + "`r`n"
}

function Write-PrivateReport {
  if (-not $script:OperationDirectory -or -not (Test-Path -LiteralPath $script:OperationDirectory)) { return }
  $reportPath = Join-Path $script:OperationDirectory 'relatorio-migrations-036-037.json'
  $script:OperationReport.reportPath = $reportPath
  if (Test-Path -LiteralPath $reportPath) {
    Assert-NoReparsePoint $reportPath
    Assert-PrivateAcl $reportPath
  }
  $json = $script:OperationReport | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($reportPath, $json + "`n", (New-Object Text.UTF8Encoding($false)))
  Assert-PrivateAcl $reportPath
  $safeReportPath = Join-Path $script:OperationDirectory 'relatorio-sanitizado.txt'
  if (Test-Path -LiteralPath $safeReportPath) {
    Assert-NoReparsePoint $safeReportPath
    Assert-PrivateAcl $safeReportPath
  }
  $safeMessageSecret = if ($script:Pg) { [string]$script:Pg.password } else { '' }
  $summary = Get-SanitizedOperationSummary -Report $script:OperationReport -SensitiveValue $safeMessageSecret
  [IO.File]::WriteAllText($safeReportPath, $summary, (New-Object Text.UTF8Encoding($false)))
  Assert-PrivateAcl $safeReportPath
}

function Show-Result([string]$Message, [bool]$Success) {
  if ($Success) { Write-Host $Message -ForegroundColor Green }
  else { Write-Host $Message -ForegroundColor Yellow }
}

try {
  Set-Phase 'validacao da conta e da configuracao privada'
  $windowsPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
  if ($windowsPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail 'Execute este atalho em PowerShell nao elevado; a conta da aplicacao deve usar somente seus privilegios locais.'
  }
  if (-not $env:LOCALAPPDATA) { Fail 'LOCALAPPDATA não está definido; não é possível localizar a configuração privada.' }
  if (-not (Test-Path -LiteralPath $script:PrivateRoot -PathType Container)) { Fail 'Pasta privada de homologação ausente.' }
  Assert-NoReparsePoint $script:PrivateRoot
  Assert-PrivateAcl $script:PrivateRoot -RequireProtected
  $backupParent = Join-Path $script:PrivateRoot 'migration-backups'
  New-PrivateDirectory $backupParent
  $repoPrefix = $script:RepoRoot.TrimEnd('\') + '\'
  if ([IO.Path]::GetFullPath($backupParent).StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Fail 'O destino do relatório e backup está dentro do repositório Git; operação recusada.'
  }
  $runName = 'migrations-036-037-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N')
  $script:OperationDirectory = Join-Path $backupParent $runName
  if (Test-Path -LiteralPath $script:OperationDirectory) { Fail 'A pasta privada aleatória da operação já existe.' }
  [void][IO.Directory]::CreateDirectory($script:OperationDirectory)
  Set-NewPrivateAcl $script:OperationDirectory -Directory
  Write-PrivateReport
  if (-not (Test-Path -LiteralPath $script:ConfigPath -PathType Leaf)) { Fail 'Configuração privada da homologação ausente.' }
  Assert-NoReparsePoint $script:ConfigPath
  Assert-PrivateAcl $script:ConfigPath
  Save-And-ClearPgEnvironment
  $config = Get-Content -LiteralPath $script:ConfigPath -Raw | ConvertFrom-Json
  if ([int]$config.version -ne 1 -or -not $config.postgres) { Fail 'Configuração privada incompatível; nenhuma conexão foi aberta.' }
  $script:Pg = $config.postgres
  if ($script:Pg.host -cne $script:DatabaseHost -or [int]$script:Pg.port -ne $script:DatabasePort -or
      $script:Pg.database -cne $script:DatabaseName -or $script:Pg.user -cne $script:DatabaseUser -or
      [string]$script:Pg.password -notmatch '^[A-Za-z0-9_-]{32,}$' -or
      [string]::IsNullOrWhiteSpace([string]$script:Pg.clusterId) -or
      [string]$script:Pg.clusterId -notmatch '^[a-f0-9-]{36}$') {
    Fail 'A configuração não corresponde ao perfil fixo e isolado da homologação.'
  }
  $script:DataDirectory = Assert-ManagedDataDirectory ([string]$script:Pg.dataDirectory)
  Assert-PrivateAcl $script:DataDirectory -Resource 'diretorio de dados do cluster' -AllowAdministrators
  $versionPath = Join-Path $script:DataDirectory 'PG_VERSION'
  Assert-NoReparsePoint $versionPath
  Assert-PrivateAcl $versionPath -Resource 'arquivo PG_VERSION do cluster' -AllowAdministrators
  if ((Get-Content -LiteralPath $versionPath -Raw).Trim() -cne '17') {
    Fail 'O diretório do cluster não pertence ao PostgreSQL 17.'
  }
  $markerPath = Join-Path $script:DataDirectory $script:MarkerName
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { Fail 'Marcador de identidade do cluster ausente.' }
  Assert-NoReparsePoint $markerPath
  Assert-PrivateAcl $markerPath -Resource 'marcador de identidade do cluster' -AllowAdministrators
  $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($marker.formato -cne 'amores-pet-homologacao-v1' -or [string]$marker.clusterId -cne [string]$script:Pg.clusterId) {
    Fail 'Marcador e configuração apontam para clusters diferentes.'
  }

  $script:PgCtl = [IO.Path]::GetFullPath([string]$script:Pg.pgCtlPath)
  $script:Psql = [IO.Path]::GetFullPath([string]$script:Pg.psqlPath)
  if ([IO.Path]::GetDirectoryName($script:PgCtl) -ine [IO.Path]::GetDirectoryName($script:Psql)) {
    Fail 'pg_ctl e psql não pertencem à mesma instalação PostgreSQL.'
  }
  $pgBin = Split-Path -Parent $script:PgCtl
  $script:PgDump = Join-Path $pgBin 'pg_dump.exe'
  $script:PgRestore = Join-Path $pgBin 'pg_restore.exe'
  $script:InitDb = Join-Path $pgBin 'initdb.exe'
  $script:PostgresExe = Join-Path $pgBin 'postgres.exe'
  foreach ($tool in @($script:PgCtl,$script:Psql,$script:PgDump,$script:PgRestore,$script:InitDb,$script:PostgresExe)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { Fail 'Uma ferramenta PostgreSQL necessária está ausente.' }
  }
  foreach ($tool in @($script:PgCtl,$script:Psql,$script:PgDump,$script:PgRestore,$script:InitDb)) {
    $version = Invoke-PgTool $tool @('--version') 'Verificação da versão PostgreSQL'
    if ($version.Output -notmatch '\(PostgreSQL\)\s+17(?:\.|\s)') { Fail 'Todas as ferramentas devem pertencer ao PostgreSQL 17.' }
  }

  Set-Phase 'aquisicao do bloqueio operacional'
  Acquire-OperationLock
  $backupPath = Join-Path $script:OperationDirectory 'amores_pet_homologacao.custom'
  Set-Phase 'identificacao do cluster e leitura do estado das migrations'
  $passfile = New-PrivatePassfile
  $script:PgPassFile = $passfile
  $env:PGPASSFILE = $passfile
  $env:PGCONNECT_TIMEOUT = '5'
  $env:PGCLIENTENCODING = 'UTF8'
  $env:PGAPPNAME = 'amorespet-migrations-036-037'

  $null = Invoke-PgTool $script:PgCtl @('-D',$script:DataDirectory,'status') 'Comprovação do cluster persistente'
  $identity = Assert-LiveIdentity
  $script:OperationReport.host = $identity.Address
  $script:OperationReport.port = $identity.Port
  $script:OperationReport.user = $identity.User
  $script:OperationReport.clusterId = [string]$script:Pg.clusterId
  $script:OperationReport.serverVersion = [math]::Floor($identity.VersionNum / 10000)
  $script:OperationReport.dataDirectory = $script:DataDirectory
  $preState = Get-MigrationState
  $script:OperationReport.migrationStateBefore = $preState
  $sessionCheck = Assert-LivePrerequisites
  $script:OperationReport.otherDatabaseSessions = $sessionCheck.OtherSessions
  if ($preState -eq 'presente') {
    $null = Invoke-PgTool $script:Psql @('-X','-w','-q','-v','ON_ERROR_STOP=1','-h',$script:DatabaseHost,
      '-p',[string]$script:DatabasePort,'-U',[string]$script:Pg.user,'-d',$script:DatabaseName,
      '-f',(Join-Path $script:RepoRoot 'backend\src\database\verificar_estrutura.sql')) 'Verificação estrutural do banco'
    $script:OperationReport.status = 'já aplicado; nenhuma alteração realizada'
    $script:OperationReport.migrationStateAfter = 'presente e validado'
    $script:OperationReport.backendReadiness = Test-BackendReadiness
    Write-PrivateReport
    Show-Result 'As estruturas 036/037 já estão presentes e válidas. Nenhuma migration foi reaplicada.' $true
    return
  }

  Set-Phase 'preparacao do backup privado'

  Set-Phase 'geracao do backup completo'
  $script:OperationReport.backupState = 'geracao iniciada; resultado ainda nao confirmado'
  Write-PrivateReport
  $dumpArgs = @('--format=custom','--verbose','--no-password','--host',$script:DatabaseHost,'--port',[string]$script:DatabasePort,
    '--username',[string]$script:Pg.user,'--dbname',$script:DatabaseName,'--file',$backupPath)
  $null = Invoke-PgTool $script:PgDump $dumpArgs 'Backup completo da homologação'
  if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) { Fail 'pg_dump não produziu o backup esperado.' }
  Set-NewPrivateAcl $backupPath
  $backupItem = Get-Item -LiteralPath $backupPath
  if ($backupItem.Length -le 0) {
    $script:TechnicalErrorCode = 'AP-MIG-BACKUP-EMPTY'
    Fail 'pg_dump retornou sucesso, mas o arquivo de backup está vazio.'
  }
  Set-BackupCheckpoint 'ARQUIVO_GERADO' $true
  $backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $script:OperationReport.backupState = 'gerado; ACL privada validada; catalogo pendente'
  $script:OperationReport.backup = [ordered]@{
    path = $backupPath
    createdUtc = $backupItem.LastWriteTimeUtc.ToString('o')
    sizeBytes = $backupItem.Length
    sha256 = $backupHash
    pgRestoreList = 'pendente'
    acl = 'privada; somente conta executora e SYSTEM'
  }
  Write-PrivateReport
  $catalog = Invoke-PgTool $script:PgRestore @('--list',$backupPath) 'Verificação do backup'
  $catalogAssessment = Test-AmoresPetCustomArchiveCatalog -CatalogOutput $catalog.Output -ArchiveSize ([long]$backupItem.Length)
  if (-not $catalogAssessment.Success) {
    $script:TechnicalErrorCode = [string]$catalogAssessment.Code
    Set-BackupCheckpoint 'CATALOGO_VALIDADO' $false $script:TechnicalErrorCode
    Fail 'pg_restore --list terminou sem erro, mas o catálogo não contém os campos de formato esperados; saída do validador não foi aceita.'
  }
  Set-BackupCheckpoint 'CATALOGO_VALIDADO' $true
  $script:OperationReport.backupState = 'gerado; catalogo validado; ACL privada validada'
  $script:OperationReport.backup.pgRestoreList = 'válido'
  Write-PrivateReport

  $script:TestClusterStarted = $false
  Set-Phase 'criacao do cluster PostgreSQL descartavel'
  $script:OperationReport.preflightState = 'iniciado; resultado ainda nao confirmado'
  Write-PrivateReport
  $preflight = Test-BackupAndMigrations $backupPath $script:OperationDirectory
  $script:OperationReport.preflightState = 'migrations 036/037 e verificacao estrutural aprovadas; encerramento do cluster pendente'
  Write-PrivateReport
  Remove-PreflightDirectory
  $script:OperationReport.preflightState = 'aprovado; cluster descartavel removido'
  $script:OperationReport.preflight = 'backup restaurado em PostgreSQL 17 descartável; 036/037 e verificar_estrutura.sql aprovados; cluster removido'

  # Reconfirma destino, estado e concorrência imediatamente antes de pedir a confirmação local.
  $identity = Assert-LiveIdentity
  if ((Get-MigrationState) -cne 'pendente') { Fail 'O estado do esquema mudou durante o preflight; nenhuma migration persistente foi iniciada.' }
  $sessionCheck = Assert-LivePrerequisites
  $script:OperationReport.confirmationTarget = [ordered]@{
    database = $script:DatabaseName; host = $identity.Address; port = $identity.Port
    user = $identity.User; clusterId = [string]$script:Pg.clusterId
    migrations = $script:OperationReport.migrations
  }
  Write-Host ''
  Set-Phase 'aguardando confirmacao local; banco persistente ainda sem DDL'
  Write-Host 'CONFIRMAÇÃO LOCAL NECESSÁRIA — primeira alteração do banco persistente' -ForegroundColor Yellow
  Write-Host "Banco: $($identity.Database)"
  Write-Host "Host/porta: $($identity.Address):$($identity.Port)"
  Write-Host "Usuário: $($identity.User)"
  Write-Host "Cluster: $($script:Pg.clusterId)"
  Write-Host 'Migrations: 036_autorizacoes_operacionais.sql e 037_notificacoes_super_administrador.sql'
  Write-Host "Backup privado validado: $backupPath"
  $script:OperationReport.confirmationPresented = $true
  Write-PrivateReport
  $confirmation = Read-Host 'Digite exatamente APLICAR 036 037 amores_pet_homologacao'
  if ($confirmation -cne 'APLICAR 036 037 amores_pet_homologacao') {
    $script:OperationReport.status = 'cancelado localmente; banco persistente sem alterações'
    $script:OperationReport.error = 'A confirmação digitada não correspondeu.'
    Write-PrivateReport
    Show-Result "Execução cancelada. O backup validado foi preservado em: $backupPath" $false
    return
  }
  $script:OperationReport.confirmationAccepted = $true
  Write-PrivateReport

  $null = Assert-LiveIdentity
  if ((Get-MigrationState) -cne 'pendente') { Fail 'O estado do esquema mudou após a confirmação; migrations não iniciadas.' }
  $sessionCheck = Assert-LivePrerequisites
  $before = Get-TableCountSnapshot
  $script:OperationReport.status = 'aplicando em transação única; resultado ainda não confirmado'
  Set-Phase 'aplicacao transacional das migrations autorizadas'
  Write-PrivateReport

  $liveStage = Join-Path $script:OperationDirectory 'staged'
  [void][IO.Directory]::CreateDirectory($liveStage)
  Set-NewPrivateAcl $liveStage -Directory
  $liveArgs = New-MigrationStage $liveStage 'persistent' $script:DatabaseName $script:DatabasePort $script:DatabaseUser $script:DataDirectory
  $null = Assert-LiveIdentity
  if ((Get-MigrationState) -cne 'pendente') { Fail 'O estado do esquema mudou antes do DDL; migrations nao iniciadas.' }
  $sessionCheck = Assert-LivePrerequisites
  $psqlArgs = @('-X','-w','-q','-1','-v','ON_ERROR_STOP=1','-h',$script:DatabaseHost,
    '-p',[string]$script:DatabasePort,'-U',[string]$script:Pg.user,'-d',$script:DatabaseName) +
    $liveArgs + @('-f',(Join-Path $liveStage 'aplicar-036-037.sql'))
  $script:PersistentMigrationAttempted = $true
  $script:OperationReport.persistentOperationAttempted = $true
  $script:OperationReport.persistentOperationState = 'lancamento do psql solicitado; execucao ainda nao comprovada'
  Write-PrivateReport
  $null = Invoke-Psql $psqlArgs

  Set-Phase 'verificacao pos-migration somente leitura'
  $postState = Get-MigrationState
  $script:OperationReport.migrationStateAfter = $postState
  if ($postState -ceq 'presente') {
    $script:OperationReport.persistentDdlStarted = $true
    $script:OperationReport.persistentOperationState = '036/037 presentes apos resposta SQL; aplicacao confirmada por leitura'
  } elseif ($postState -ceq 'pendente') {
    $script:OperationReport.persistentDdlStarted = $false
    $script:OperationReport.persistentOperationState = '036/037 continuam ausentes apos resposta SQL'
  } else {
    $script:OperationReport.persistentDdlStarted = $null
    $script:OperationReport.persistentOperationState = 'estado parcial ou desconhecido; verificacao adicional somente leitura necessaria'
  }
  Write-PrivateReport
  if ($postState -cne 'presente') { Fail 'A transação terminou, mas o estado final não confirma ambas as migrations.' }
  $null = Invoke-PgTool $script:Psql @('-X','-w','-q','-v','ON_ERROR_STOP=1','-h',$script:DatabaseHost,
    '-p',[string]$script:DatabasePort,'-U',[string]$script:Pg.user,'-d',$script:DatabaseName,
    '-f',(Join-Path $script:RepoRoot 'backend\src\database\verificar_estrutura.sql')) 'Verificação estrutural pós-migration'
  $after = Get-TableCountSnapshot
  Assert-SnapshotsEqual $before $after -AllowNewMigrationTables
  $script:OperationReport.migrationStateAfter = '036 e 037 confirmadas; tabelas e função verificadas; contagens preexistentes preservadas'
  $script:OperationReport.status = 'aplicado e validado'
  $script:OperationReport.backendReadiness = Test-BackendReadiness
  Write-PrivateReport
  Show-Result 'Migrations 036 e 037 aplicadas e verificadas. O backup privado foi preservado.' $true
  Write-Host "Relatório técnico: $($script:OperationReport.reportPath)"
  Write-Host "Backup: $backupPath"
} catch {
  $failureLocation = Get-SanitizedFailureLocation $_
  $script:InternalFailureFunction = $failureLocation.Function
  $script:InternalFailureLocation = $failureLocation.Location
  $script:OperationReport.internalFailureFunction = $script:InternalFailureFunction
  $script:OperationReport.internalFailureLocation = $script:InternalFailureLocation
  if (-not $script:TechnicalErrorCode) {
    $errorId = [string]$_.FullyQualifiedErrorId -replace '[^A-Za-z0-9_.-]', ''
    if ($errorId.Length -gt 80) { $errorId = $errorId.Substring(0,80) }
    if ($errorId) { $script:TechnicalErrorCode = "AP-PS-$errorId" }
    else { $script:TechnicalErrorCode = 'AP-POWERSHELL-HRESULT-0x{0:X8}' -f [int]$_.Exception.HResult }
  }
  $message = [string]$script:SafeErrorMessage
  if ([string]::IsNullOrWhiteSpace($message)) {
    $message = 'Erro interno no executor. Nenhum detalhe bruto foi exibido para proteger a configuracao privada.'
  }
  foreach ($secret in @([string]$script:Pg.password)) {
    if (-not [string]::IsNullOrEmpty($secret)) { $message = $message.Replace($secret, '[oculto]') }
  }
  $script:OperationReport.status = if ($script:OperationReport.persistentPsqlStarted) { 'resultado exige verificacao somente leitura; sem rollback automatico' }
    elseif ($script:OperationReport.persistentOperationAttempted) { 'psql nao iniciou; nenhum SQL persistente foi enviado' }
    else { 'interrompido antes da alteracao persistente' }
  $script:OperationReport.phase = $script:CurrentPhase
  $script:OperationReport.technicalCode = if ($script:TechnicalErrorCode) { $script:TechnicalErrorCode } else { 'AP-POWERSHELL-UNEXPECTED' }
  if ($script:OperationReport.persistentOperationAttempted -and -not $script:OperationReport.persistentPsqlStarted) {
    $script:OperationReport.persistentDdlStarted = $false
  }
  $script:OperationReport.error = $message
  try { Write-PrivateReport } catch { }
  Show-Result "Etapa: $($script:CurrentPhase) | Código: $($script:OperationReport.technicalCode) | $message" $false
  Write-Host "Funcao interna: $($script:InternalFailureFunction) | Localizacao sanitizada: $($script:InternalFailureLocation)"
  if (-not $script:OperationReport.persistentOperationAttempted) { Write-Host 'Banco persistente: nenhuma tentativa de SQL foi iniciada.' -ForegroundColor Green }
  elseif (-not $script:OperationReport.persistentPsqlStarted) { Write-Host 'Banco persistente: o processo psql não iniciou; nenhum SQL foi enviado.' -ForegroundColor Green }
  else { Write-Host 'Banco persistente: o processo psql iniciou; consulte o estado somente por leitura antes de qualquer nova ação.' -ForegroundColor Yellow }
  if ($script:OperationReport.reportPath) { Write-Host "Relatório privado: $($script:OperationReport.reportPath)" }
  if ($script:OperationReport.backup) { Write-Host "Backup preservado: $($script:OperationReport.backup.path)" }
  if ($script:PersistentMigrationAttempted) { Write-Host 'Não restaure o banco automaticamente; consulte o estado registrado antes de qualquer nova ação.' -ForegroundColor Yellow }
  $script:ExitCode = 1
} finally {
  if ($script:TestClusterStarted -and $script:PreflightDirectory) {
    $tempData = Join-Path $script:PreflightDirectory 'data'
    try {
      $status = Invoke-PgTool $script:PgCtl @('-D',$tempData,'status') 'Verificação final do cluster temporário' -AllowFailure
      if ($status.ExitCode -eq 0 -and (Test-Path -LiteralPath (Join-Path $tempData 'postmaster.pid'))) {
        $lines = Get-Content -LiteralPath (Join-Path $tempData 'postmaster.pid')
        Assert-TemporaryCluster $tempData ([int]$lines[3]) ([int]$lines[0])
        $null = Invoke-PgTool $script:PgCtl @('-D',$tempData,'-m','fast','-w','-t','30','stop') 'Encerramento final do cluster temporário'
      }
    } catch { }
  }
  if ($script:PreflightDirectory) {
    try { Remove-PreflightDirectory } catch { Write-Host "Ambiente descartável preservado para diagnóstico: $($script:PreflightDirectory)" -ForegroundColor Yellow }
  }
  if ($script:PgPassFile -and (Test-Path -LiteralPath $script:PgPassFile -PathType Leaf)) {
    try {
      Assert-NoReparsePoint $script:PgPassFile
      $resolvedPass = [IO.Path]::GetFullPath($script:PgPassFile)
      if ($resolvedPass.StartsWith([IO.Path]::GetFullPath($script:PrivateRoot).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -and
          [IO.Path]::GetFileName($resolvedPass) -match '^\.migration-[a-f0-9]{32}\.pgpass$') {
        Remove-Item -LiteralPath $resolvedPass -Force
      }
    } catch { Write-Host 'O arquivo temporário de autenticação permanece protegido na pasta privada; remova-o manualmente após revisar o relatório.' -ForegroundColor Yellow }
  }
  Restore-PgEnvironment
  Release-OperationLock
}

if ($script:ExitCode -ne 0) { exit $script:ExitCode }
