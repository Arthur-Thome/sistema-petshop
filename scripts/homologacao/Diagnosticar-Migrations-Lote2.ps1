param(
  [ValidateSet('ACESSO','CONEXAO','PROCESSO','AUXILIAR')]
  [string]$SimulateFailure,
  [ValidateSet('EXISTING_POLICY','REMOTE_SIGNED_DEFAULT_PROCESS')]
  [string]$LauncherPolicyMode = 'EXISTING_POLICY'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Acl-Privada.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Postmaster-Identity.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force

$dbName = 'amores_pet_homologacao'
$dbUser = 'amores_pet_homologacao_app'
$dbHost = '127.0.0.1'
$dbPort = 55432
$privateRoot = $null
$reportRoot = $null
$currentSid = $null
$allowedSids = @()
$pgPassFile = $null
$savedPgEnvironment = @{}
$script:SafeFailure = $null
$script:CurrentPhase = 'Inicializacao do auxiliar'
$script:FailureClass = $null
$script:TechnicalCode = $null
$script:ProcessState = 'NAO INICIADO'
$script:ProcessDiagnostic = 'nao aplicavel'
$script:PrivatePsqlDetailName = $null
$script:FailureFunction = 'nao identificada'
$script:FailureLocation = 'nao identificada'
$script:AclResource = 'nao validado'
$script:AclObservation = 'nao consultada'
$script:MigrationState = 'NAO CONSULTADO'
$script:ConnectionState = 'NAO TENTADA'
$script:PriorReportStatus = 'NAO CONSULTADO'
$script:ProcessExitCode = 0

function Set-Phase([string]$Phase) { $script:CurrentPhase = $Phase }

function Stop-Safe([string]$Message, [string]$Category = '', [string]$Code = '') {
  if (-not $Category) {
    if ($Message -match '(?i)ACL|permiss|propriet|identidade da ACL|caminho privado|configuracao privada|LOCALAPPDATA|allowlist|heranca') { $Category = 'ACESSO' }
    elseif ($Message -match '(?i)PSQL|PostgreSQL|porta do banco|conexao|leitura PostgreSQL') { $Category = 'CONEXAO' }
    elseif ($Message -match '(?i)identidade SQL|cluster|processo PostgreSQL|PID file|marcador do cluster') { $Category = 'IDENTIDADE' }
    else { $Category = 'AUXILIAR' }
  }
  if (-not $Code) { $Code = 'AP-DIAG-' + $Category.ToUpperInvariant() + '-VALIDACAO' }
  $script:FailureClass = $Category
  $script:TechnicalCode = $Code
  $script:SafeFailure = $Message
  throw $Message
}

function Get-SafeProperty([object]$Object, [string]$Name) {
  if ($null -eq $Object) { return $null }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return $property.Value
}

function Assert-Path([string]$Path, [string]$Resource = '') {
  try { $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop }
  catch {
    if ($Resource) { $script:CurrentPhase = "Verificacao de existencia: $Resource" }
    if ($Resource) { $script:AclResource = $Resource }
    if ([string]$_.CategoryInfo.Category -eq 'ObjectNotFound') {
      Stop-Safe $(if ($Resource) { "O recurso $Resource esperado esta ausente." } else { 'Um caminho privado esperado esta ausente.' }) 'ACESSO' 'AP-DIAG-RESOURCE-MISSING'
    }
    Stop-Safe $(if ($Resource) { "O recurso $Resource nao pode ser acessado." } else { 'Um caminho privado esperado esta inacessivel.' }) 'ACESSO' 'AP-DIAG-RESOURCE-ACCESS-FAILED'
  }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    if ($Resource) { $script:CurrentPhase = "Verificacao de caminho: $Resource" }
    Stop-Safe $(if ($Resource) { "O recurso $Resource e link/junction; leitura recusada." } else { 'Um caminho privado e link/junction; leitura recusada.' }) 'ACESSO' 'AP-DIAG-RESOURCE-REPARSE-POINT'
  }
}

function Assert-PrivateAcl([string]$Path, [switch]$Protected, [string]$Resource = '', [switch]$AllowAdministrators) {
  if ($Resource) {
    $script:AclResource = $Resource
    $script:CurrentPhase = "Validacao ACL: $Resource"
  }
  $assessment = Test-AmoresPetPrivateAcl -Path $Path -CurrentSid $currentSid `
    -OwnerAllowedSids $allowedSids -AccessAllowedSids $allowedSids `
    -RequireProtected:$Protected -AllowAdministrators:$AllowAdministrators
  if ($Resource) {
    $script:AclObservation = "DACL=$($assessment.TargetAcl); ancestral protegido=$($assessment.ProtectedAncestor); proprietario=$($assessment.Owner); ACEs=$($assessment.Principals); regras=$($assessment.RuleCount); herdadas=$($assessment.InheritedRuleCount)"
  }
  if (-not $assessment.Success) {
    Stop-Safe $assessment.Message 'ACESSO' $assessment.TechnicalCode
  }
}

function New-PrivatePassfile([object]$Postgres) {
  $path = Join-Path $privateRoot ('.diagnostico-' + [guid]::NewGuid().ToString('N') + '.pgpass')
  $values = @($dbHost,[string]$dbPort,$dbName,[string]$Postgres.user,[string]$Postgres.password)
  $escaped = foreach ($value in $values) { ([string]$value).Replace('\','\\').Replace(':','\:').Replace("`r",'').Replace("`n",'') }
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes(($escaped -join ':') + "`n")
  try {
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
    Assert-Path $path
    Assert-PrivateAcl $path -Resource 'arquivo temporario de autenticacao'
    return $path
  } catch {
    try { if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue } } catch { }
    throw
  }
}

function Format-Safe([object]$Value) {
  if ($null -eq $Value) { return 'nao informado' }
  $text = ([string]$Value -replace '[\r\n\t]+',' ').Trim()
  $text = $text -replace '(?i)(password|senha|token|secret|segredo|credential|credencial)\s*[:=]\s*[^ ,;]+','$1=[redigido]'
  $text = $text -replace '(?i)(postgres(?:ql)?://)[^\s]+','$1[redigido]'
  $text = $text -replace '[A-Za-z]:\\[^\s]+','[caminho local]'
  $text = $text -replace '[A-Za-z0-9_-]{40,}','[redigido]'
  if ($text.Length -gt 260) { $text = $text.Substring(0,260) + '...' }
  return $text
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

function Set-NewPrivateDirectoryAcl([string]$Path) {
  $acl = Get-Acl -LiteralPath $Path
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleAll($rule) }
  $rights = [Security.AccessControl.FileSystemRights]::FullControl
  $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
    ([Security.Principal.SecurityIdentifier]::new($currentSid)), $rights, $inheritance,
    [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
    ([Security.Principal.SecurityIdentifier]::new('S-1-5-18')), $rights, $inheritance,
    [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
  Set-Acl -LiteralPath $Path -AclObject $acl
}

function Ensure-ReportRoot {
  if (-not $env:LOCALAPPDATA -or -not $currentSid) { throw 'Conta Windows ou LOCALAPPDATA nao disponivel para relatorio privado.' }
  $appRoot = Join-Path $env:LOCALAPPDATA 'AmoresPet'
  $reportRoot = Join-Path $appRoot 'DiagnosticosMigracoes'
  if (Test-Path -LiteralPath $appRoot) { Assert-Path $appRoot }
  else { [void][IO.Directory]::CreateDirectory($appRoot) }
  if (Test-Path -LiteralPath $reportRoot) {
    Assert-Path $reportRoot
    Assert-PrivateAcl $reportRoot -Protected
  } else {
    [void][IO.Directory]::CreateDirectory($reportRoot)
    Set-NewPrivateDirectoryAcl $reportRoot
    Assert-PrivateAcl $reportRoot -Protected
  }
  $script:reportRoot = $reportRoot
  return $reportRoot
}

function Write-DiagnosticReport([string]$Message) {
  $root = Ensure-ReportRoot
  $name = 'Diagnostico-Migrations-Lote2-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.txt'
  $path = Join-Path $root $name
  $lines = @(
    'Amores Pet — diagnóstico somente leitura das migrations 036/037',
    ('Inicio UTC: ' + (Get-Date).ToUniversalTime().ToString('o')),
    ('Resultado: ' + $(if ($script:ProcessExitCode -eq 0) { 'CONSULTA CONCLUIDA' } else { 'INCONCLUSIVO' })),
    ('Categoria: ' + $(if ($script:FailureClass) { $script:FailureClass } else { 'ESTADO' })),
    ('Politica de execucao do atalho: ' + $LauncherPolicyMode),
    ('Recurso ACL: ' + (Format-Safe $script:AclResource)),
    ('Resumo ACL: ' + (Format-Safe $script:AclObservation)),
    ('Etapa: ' + (Format-Safe $script:CurrentPhase)),
    ('Funcao interna: ' + (Format-Safe $script:FailureFunction)),
    ('Localizacao sanitizada: ' + (Format-Safe $script:FailureLocation)),
    ('Codigo tecnico: ' + (Format-Safe $script:TechnicalCode)),
    ('Processo psql: ' + (Format-Safe $script:ProcessState)),
    ('Diagnostico de inicializacao: ' + (Format-Safe $script:ProcessDiagnostic)),
    ('Conexao: ' + (Format-Safe $script:ConnectionState)),
    ('Estado 036/037: ' + (Format-Safe $script:MigrationState)),
    ('Relatorio anterior: ' + (Format-Safe $script:PriorReportStatus)),
    ('Mensagem: ' + (Format-Safe $Message)),
    ('Codigo de saida: ' + $script:ProcessExitCode),
    'Nenhuma migration, DDL ou DML foi executada pelo auxiliar.'
  )
  $bytes = (New-Object Text.UnicodeEncoding($false, $true)).GetBytes(($lines -join "`r`n") + "`r`n")
  $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
  try {
    Assert-Path $path
    Assert-PrivateAcl $path
  } catch {
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    throw
  }
  return $path
}

function Save-PrivatePsqlDiagnostic([string]$StandardError) {
  if ([string]::IsNullOrWhiteSpace($StandardError) -or -not $privateRoot) { return $null }
  $name = 'psql-diagnostic-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.txt'
  $path = Join-Path $privateRoot $name
  $text = $StandardError
  if ($text.Length -gt 65536) { $text = $text.Substring(0,65536) + "`r`n[detalhe truncado]" }
  $bytes = (New-Object Text.UnicodeEncoding($false, $true)).GetBytes(
    "Detalhe local do psql; nao compartilhar.`r`n" + $text + "`r`n")
  try {
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
    Assert-Path $path
    $assessment = Test-AmoresPetPrivateAcl -Path $path -CurrentSid $currentSid `
      -OwnerAllowedSids $allowedSids -AccessAllowedSids $allowedSids
    if (-not $assessment.Success) { throw 'Private diagnostic ACL validation failed.' }
    return $name
  } catch {
    try { if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force -ErrorAction Stop } } catch { }
    return $null
  }
}

function Get-ReadOnlySqlStage([string]$StandardOutput) {
  $stageCode = $null
  foreach ($line in @($StandardOutput -split '\r?\n')) {
    $candidate = ([string]$line).Trim()
    if ($candidate -match '^AP_STAGE=([A-Z_]+)$') { $stageCode = $Matches[1] }
  }
  switch ($stageCode) {
    'IDENTIDADE' { return 'Consulta SQL de identidade do destino' }
    'TABELAS_036' { return 'Consulta SQL das estruturas da migration 036' }
    'FUNCAO_037' { return 'Consulta SQL da funcao da migration 037' }
    'HISTORICO' { return 'Consulta SQL dos metadados de controle de migrations' }
    'BANCOS_CLUSTER' { return 'Consulta SQL da allowlist de bancos do cluster' }
    default { return 'Consulta SQL somente leitura; etapa nao identificada' }
  }
}

function Read-LatestSafeReport {
  Set-Phase 'Leitura do relatorio privado anterior'
  $backupRoot = Join-Path $privateRoot 'migration-backups'
  if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) {
    $script:PriorReportStatus = 'nao encontrado'
    Write-Host 'Relatorio anterior: nao foi encontrado ou a pasta ainda nao existe.'
    return
  }
  Assert-Path $backupRoot
  Assert-PrivateAcl $backupRoot -Protected -Resource 'pasta privada de backups'
  $runs = @(Get-ChildItem -LiteralPath $backupRoot -Directory -ErrorAction Stop |
    Where-Object { $_.Name -match '^migrations-036-037-[0-9]{8}-[0-9]{6}-[a-f0-9]{32}$' } |
    Sort-Object LastWriteTimeUtc -Descending)
  foreach ($run in $runs) {
    $reportPath = Join-Path $run.FullName 'relatorio-migrations-036-037.json'
    if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) { continue }
    Assert-Path $run.FullName
    Assert-PrivateAcl $run.FullName -Protected -Resource 'pasta de uma execucao anterior'
    Assert-Path $reportPath
    Assert-PrivateAcl $reportPath -Resource 'relatorio anterior de migrations'
    $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    $script:PriorReportStatus = 'encontrado; campos sanitizados exibidos'
    $phase = [string](Get-SafeProperty $report 'phase')
    if (-not $phase) {
      $errorText = [string](Get-SafeProperty $report 'error')
      if ($errorText -match '(?i)initdb|cluster descart') { $phase = 'criacao do cluster descartavel (inferida do erro)' }
      elseif ($errorText -match '(?i)pg_restore|restaur') { $phase = 'restauracao do backup (inferida do erro)' }
      elseif ($errorText -match '(?i)pg_dump|backup') { $phase = 'backup (inferida do erro)' }
      elseif (Get-SafeProperty $report 'persistentMigrationAttempted') { $phase = 'tentativa de DDL persistente (inferida do relatorio)' }
      else { $phase = 'fase nao registrada pela versao anterior' }
    }
    Write-Host 'Relatorio privado: encontrado; caminho omitido.'
    Write-Host ('Inicio UTC: ' + (Format-Safe (Get-SafeProperty $report 'startedUtc')))
    Write-Host ('Status: ' + (Format-Safe (Get-SafeProperty $report 'status')))
    Write-Host ('Etapa: ' + (Format-Safe $phase))
    Write-Host ('Codigo tecnico: ' + (Format-Safe (Get-SafeProperty $report 'technicalCode')))
    Write-Host ('Erro sanitizado: ' + (Format-Safe (Get-SafeProperty $report 'error')))
    Write-Host ('Estado registrado antes: ' + (Format-Safe (Get-SafeProperty $report 'migrationStateBefore')))
    Write-Host ('Estado registrado depois: ' + (Format-Safe (Get-SafeProperty $report 'migrationStateAfter')))
    Write-Host ('Pre-validacao: ' + (Format-Safe (Get-SafeProperty $report 'preflight')))
    $ddlStarted = Get-SafeProperty $report 'persistentDdlStarted'
    if ($null -ne $ddlStarted) {
      Write-Host ('DDL persistente iniciado: ' + [bool]$ddlStarted)
    } else {
      Write-Host 'DDL persistente iniciado: nao registrado pela versao anterior.'
    }
    if (Get-SafeProperty $report 'backup') { Write-Host 'Backup descrito no relatorio: presente; caminho e hash omitidos.' }
    else { Write-Host 'Backup descrito no relatorio: ausente ou nao concluido.' }
    return
  }
  $script:PriorReportStatus = 'nenhum relatorio de execucao encontrado'
  Write-Host 'Relatorio anterior: nenhum arquivo de relatorio encontrado nas execucoes privadas.'
}

function Invoke-ReadOnlyState([object]$Postgres, [string]$PsqlPath, [string]$DataDirectory, [string]$ClusterId) {
  Set-Phase 'Validacao de processo, cluster e listener PostgreSQL'
  Assert-Path $DataDirectory -Resource 'diretorio de dados do cluster'
  Assert-PrivateAcl $DataDirectory -Resource 'diretorio de dados do cluster' -AllowAdministrators
  $markerPath = Join-Path $DataDirectory '.amores-homologacao-cluster.json'
  Assert-Path $markerPath -Resource 'marcador de identidade do cluster'
  Assert-PrivateAcl $markerPath -Resource 'marcador de identidade do cluster' -AllowAdministrators
  $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($marker.formato -cne 'amores-pet-homologacao-v1' -or [string]$marker.clusterId -cne $ClusterId) {
    Stop-Safe 'O marcador do cluster diverge da configuracao privada.'
  }
  $versionPath = Join-Path $DataDirectory 'PG_VERSION'
  Assert-Path $versionPath -Resource 'arquivo PG_VERSION do cluster'
  Assert-PrivateAcl $versionPath -Resource 'arquivo PG_VERSION do cluster' -AllowAdministrators
  if ((Get-Content -LiteralPath $versionPath -Raw).Trim() -cne '17') {
    Stop-Safe 'O cluster configurado nao e PostgreSQL 17.'
  }
  $pidPath = Join-Path $DataDirectory 'postmaster.pid'
  Assert-Path $pidPath -Resource 'arquivo postmaster.pid'
  Assert-PrivateAcl $pidPath -Resource 'arquivo postmaster.pid' -AllowAdministrators
  try {
    $postmasterIdentity = Get-AmoresPetPostmasterIdentity -Path $pidPath -ExpectedDataDirectory $DataDirectory `
      -ExpectedPort $dbPort -ExpectedListenAddress $dbHost
  } catch {
    Stop-Safe 'O PID file nao identifica o cluster isolado esperado.'
  }
  $postgresProcessId = [int]$postmasterIdentity.ProcessId
  $pgBin = Split-Path -Parent ([IO.Path]::GetFullPath([string]$Postgres.pgCtlPath))
  $expectedExe = [IO.Path]::GetFullPath((Join-Path $pgBin 'postgres.exe'))
  try {
    $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $postgresProcessId `
      -ExpectedExecutable $expectedExe -ExpectedDataDirectory $DataDirectory `
      -ExpectedListenAddress $dbHost -ExpectedPort $dbPort
  } catch {
    Stop-Safe 'O processo, a linha de comando ou o listener PostgreSQL diverge do cluster isolado.'
  }
  $null = Assert-Path $PsqlPath
  $sql = @'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT 'AP_STAGE=IDENTIDADE';
SELECT 'IDENTIDADE|' || current_database() || '|' || current_user || '|' || session_user || '|' ||
       COALESCE(host(inet_server_addr()),'') || '|' || inet_server_port()::text || '|' ||
       current_setting('server_version_num') || '|' ||
       extract(epoch FROM pg_postmaster_start_time())::bigint::text || '|' ||
       COALESCE((SELECT CASE WHEN rolsuper THEN 'true' ELSE 'false' END FROM pg_roles WHERE rolname=current_user),'missing');
SELECT 'AP_STAGE=TABELAS_036';
SELECT 'TABELAS|' ||
       CASE WHEN COALESCE(to_regclass('public.operation_authorizations') IS NOT NULL,false) THEN 'true' ELSE 'false' END || '|' ||
       CASE WHEN COALESCE(to_regclass('public.permanent_file_deletion_queue') IS NOT NULL,false) THEN 'true' ELSE 'false' END;
SELECT 'AP_STAGE=FUNCAO_037';
SELECT 'FUNCAO|' ||
       CASE WHEN COALESCE(to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)') IS NOT NULL,false) THEN 'true' ELSE 'false' END || '|' ||
       CASE WHEN COALESCE(position('super_administrador' IN pg_get_functiondef(
         to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)'))) > 0,false) THEN 'true' ELSE 'false' END;
SELECT 'AP_STAGE=HISTORICO';
SELECT 'HISTORICO|' ||
       COALESCE((SELECT string_agg(format('%I.%I',schemaname,tablename),',') FROM pg_tables
          WHERE schemaname='public' AND tablename IN ('schema_migrations','migrations','migration_history','schema_version')),'');
SELECT 'AP_STAGE=BANCOS_CLUSTER';
SELECT 'BANCOS|' || (SELECT string_agg(datname, ',' ORDER BY datname) FROM pg_database WHERE NOT datistemplate);
COMMIT;
'@
  $psqlArgs = @('-X','-w','-q','-A','-t','-v','VERBOSITY=verbose','-v','ON_ERROR_STOP=1','-h',$dbHost,'-p',[string]$dbPort,
    '-U',[string]$Postgres.user,'-d',$dbName,'-c',$sql)
  Set-Phase 'Consulta SQL somente leitura das migrations'
  $script:ProcessState = 'NAO INICIADO'
  $script:ConnectionState = 'NAO TENTADA'
  $queryProcess = Invoke-AmoresPetNativeProcess -Executable $PsqlPath -Arguments $psqlArgs
  if (-not $queryProcess.Started) {
    $script:ProcessState = 'FALHA AO INICIAR'
    $nativeCodeText = if ($null -ne $queryProcess.NativeErrorCode) { [string]$queryProcess.NativeErrorCode } else { 'nao informado' }
    $script:ProcessDiagnostic = 'Tipo={0}; HRESULT={1}; Win32={2}; classe={3}' -f $queryProcess.ExceptionType,$queryProcess.HResult,$nativeCodeText,$queryProcess.FailureSummary
    Stop-Safe 'O cliente psql nao iniciou; nenhuma conexao foi tentada.' 'PROCESSO' ('AP-DIAG-PSQL-LAUNCH-HRESULT-' + $queryProcess.HResult)
  }
  $script:ProcessState = 'INICIADO; CODIGO DE SAIDA ' + [string]$queryProcess.ExitCode
  if ($queryProcess.ExitCode -ne 0) {
    $queryFailure = Get-AmoresPetPsqlFailureDiagnostic -StandardError $queryProcess.StandardError -ExitCode $queryProcess.ExitCode
    $script:CurrentPhase = Get-ReadOnlySqlStage ([string]$queryProcess.StandardOutput)
    $script:ConnectionState = if ($queryFailure.Category -in @('PSQL_PERMISSAO_SQL','PSQL_ERRO_SQL')) {
      'RESPOSTA DE ERRO POSTGRESQL RECEBIDA; IDENTIDADE E MIGRACOES NAO VALIDADAS'
    } else { 'NAO VALIDADA; PSQL INICIADO E RETORNOU ERRO' }
    $sqlStateText = if ($queryFailure.SqlState) { $queryFailure.SqlState } else { 'nao informado' }
    $script:ProcessDiagnostic = 'Processo iniciado; exit={0}; categoria={1}; codigo={2}; SQLSTATE={3}; stderr bruto omitido.' -f `
      $queryProcess.ExitCode,$queryFailure.Category,$queryFailure.Code,$sqlStateText
    if ($queryFailure.Category -eq 'PSQL_NAO_CLASSIFICADO' -and $queryProcess.StandardError) {
      $script:PrivatePsqlDetailName = Save-PrivatePsqlDiagnostic $queryProcess.StandardError
      if ($script:PrivatePsqlDetailName) {
        $script:ProcessDiagnostic += ' detalhe privado preservado.'
        Write-Output ('DIAG_PRIVATE_PSQL_DETAIL=' + $script:PrivatePsqlDetailName)
      } else {
        $script:ProcessDiagnostic += ' detalhe privado nao pode ser preservado com ACL validada.'
      }
    }
    Stop-Safe $queryFailure.Description $queryFailure.Category $queryFailure.Code
  }
  $script:ProcessDiagnostic = 'Processo iniciado e finalizado sem erro de lancamento.'
  $script:ConnectionState = 'CONECTADA; IDENTIDADE AINDA NAO VALIDADA'
  $rows = @{}
  foreach ($line in @(([string]$queryProcess.StandardOutput -split '\r?\n'))) {
    $candidate = ([string]$line).Trim()
    if ($candidate -match '^(IDENTIDADE|TABELAS|FUNCAO|HISTORICO|BANCOS)\|') {
      $rowTag = $candidate.Substring(0,$candidate.IndexOf('|'))
      if ($rows.ContainsKey($rowTag)) { Stop-Safe 'A consulta somente leitura retornou linhas duplicadas.' 'CONEXAO' 'AP-DIAG-SQL-OUTPUT-DUPLICATE' }
      $rows[$rowTag] = $candidate
    }
  }
  foreach ($requiredRow in @('IDENTIDADE','TABELAS','FUNCAO','HISTORICO','BANCOS')) {
    if (-not $rows.ContainsKey($requiredRow)) {
      Stop-Safe 'Uma etapa da consulta somente leitura nao retornou resultado identificavel.' 'CONEXAO' 'AP-DIAG-SQL-OUTPUT-MISSING'
    }
  }
  $identityParts = $rows['IDENTIDADE'] -split '\|',9
  $tableParts = $rows['TABELAS'] -split '\|',3
  $functionParts = $rows['FUNCAO'] -split '\|',3
  $historyParts = $rows['HISTORICO'] -split '\|',2
  $databaseParts = $rows['BANCOS'] -split '\|',2
  if ($identityParts.Count -ne 9 -or $tableParts.Count -ne 3 -or $functionParts.Count -ne 3 -or
      $historyParts.Count -ne 2 -or $databaseParts.Count -ne 2) {
    Stop-Safe 'A consulta somente leitura retornou formato inesperado.' 'CONEXAO' 'AP-DIAG-SQL-OUTPUT-FORMAT'
  }
  $startEpoch = [long]0
  if (-not [long]::TryParse($identityParts[7], [ref]$startEpoch) -or
      [math]::Abs([double]($startEpoch - [long]$postmasterIdentity.StartEpoch)) -gt 1) {
    Stop-Safe 'A identidade SQL nao corresponde ao postmaster.pid do cluster validado.' 'IDENTIDADE' 'AP-DIAG-SQL-START-TIME-MISMATCH'
  }
  if ($identityParts[1] -cne $dbName -or $identityParts[2] -cne $dbUser -or $identityParts[3] -cne $dbUser -or
      $identityParts[4] -cne $dbHost -or [int]$identityParts[5] -ne $dbPort -or
      [int]$identityParts[6] -lt 170000 -or [int]$identityParts[6] -ge 180000 -or $identityParts[8] -cne 'false') {
    Stop-Safe 'Identidade SQL nao corresponde a amores_pet_homologacao; estado recusado.' 'IDENTIDADE' 'AP-DIAG-SQL-IDENTITY-MISMATCH'
  }
  $script:ConnectionState = 'CONECTADA; IDENTIDADE VALIDADA'
  if ($databaseParts[1] -cne 'amores_pet_homologacao,postgres') {
    Stop-Safe 'O cluster contem bancos fora da allowlist isolada; estado inconclusivo.' 'IDENTIDADE' 'AP-DIAG-CLUSTER-DATABASE-ALLOWLIST'
  }
  $auth = [bool]::Parse($tableParts[1]); $queue = [bool]::Parse($tableParts[2])
  $function = [bool]::Parse($functionParts[1]); $profile = [bool]::Parse($functionParts[2])
  if ($historyParts[1]) { $state = 'INCONCLUSIVO: existe tabela de controle de migrations nao documentada' }
  elseif (-not $function) { $state = 'INCONCLUSIVO: funcao base ausente; esquema divergente' }
  elseif (-not $auth -and -not $queue -and -not $profile) { $state = 'NAO APLICADAS: 036/037 ausentes no estado atual' }
  elseif ($auth -and $queue -and $profile) { $state = 'APLICADAS: estruturas 036 e funcao 037 presentes' }
  else { $state = 'PARCIAL/DIVERGENTE: nao executar novamente antes de revisao' }
  $script:MigrationState = $state
  $script:FailureClass = 'ESTADO'
  $script:TechnicalCode = 'AP-DIAG-READONLY-OK'
  Write-Host ('Estado atual por consulta somente leitura: ' + $state)
  Write-Host ('Destino comprovado: ' + $identityParts[1] + ' em ' + $identityParts[4] + ':' + $identityParts[5] + '; PostgreSQL ' + [math]::Floor([int]$identityParts[6]/10000))
}

try {
  Set-Phase 'Inicializacao e identificacao da conta Windows'
  if (-not $env:LOCALAPPDATA) { Stop-Safe 'LOCALAPPDATA ausente; configuracao privada nao localizada.' 'ACESSO' 'AP-DIAG-LOCALAPPDATA-MISSING' }
  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $allowedSids = @($currentSid, 'S-1-5-18')
  $privateRoot = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
  Write-Host 'Diagnostico das migrations 036/037; nenhuma alteracao sera executada.' -ForegroundColor Cyan
  if ($SimulateFailure) {
    Set-Phase 'Simulacao controlada de falha; sem acesso a configuracao ou banco'
    switch ($SimulateFailure) {
      'ACESSO' { Stop-Safe 'Falha simulada de acesso; nenhuma configuracao privada foi lida.' 'ACESSO' 'TEST-AP-DIAG-ACCESS' }
      'CONEXAO' { Stop-Safe 'Falha simulada de conexao; nenhuma consulta ao banco foi executada.' 'CONEXAO' 'TEST-AP-DIAG-CONNECTION' }
      'PROCESSO' {
        $script:ProcessState = 'FALHA DE INICIALIZACAO SIMULADA'
        $script:ProcessDiagnostic = 'Simulacao de falha de criacao de processo; nenhum executavel foi iniciado.'
        Stop-Safe 'Falha simulada de inicializacao de processo; nenhuma conexao foi tentada.' 'PROCESSO' 'TEST-AP-DIAG-PROCESS'
      }
      'AUXILIAR' { Stop-Safe 'Falha simulada do auxiliar; nenhuma configuracao privada foi lida.' 'AUXILIAR' 'TEST-AP-DIAG-AUXILIARY' }
    }
  }
  Set-Phase 'Validacao da raiz privada e das ACLs'
  Assert-Path $privateRoot
  Assert-PrivateAcl $privateRoot -Protected -Resource 'raiz privada da homologacao'
  try { Read-LatestSafeReport }
  catch {
    $script:PriorReportStatus = 'inacessivel ou invalido; consulta atual prossegue'
    Set-Phase 'Validacao da raiz privada e das ACLs'
    Write-Host 'Relatorio anterior inacessivel ou invalido; a consulta somente leitura prosseguira.' -ForegroundColor Yellow
  }

  Set-Phase 'Leitura e validacao da configuracao privada'
  $configPath = Join-Path $privateRoot 'config.json'
  Assert-Path $configPath
  Assert-PrivateAcl $configPath -Resource 'configuracao privada da homologacao'
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $pg = $config.postgres
  if ([int]$config.version -ne 1 -or $pg.host -cne $dbHost -or [int]$pg.port -ne $dbPort -or
      $pg.database -cne $dbName -or $pg.user -cne $dbUser -or
      [string]$pg.password -notmatch '^[A-Za-z0-9_-]{32,}$' -or [string]$pg.clusterId -notmatch '^[a-f0-9-]{36}$') {
    Stop-Safe 'Configuracao nao corresponde a allowlist privada da homologacao.' 'CONFIGURACAO' 'AP-DIAG-CONFIG-MISMATCH'
  }
  $dataDirectory = [IO.Path]::GetFullPath([string]$pg.dataDirectory)
  $privatePostgres = [IO.Path]::GetFullPath((Join-Path $privateRoot 'postgres\data'))
  $clusterRoot = [IO.Path]::GetFullPath((Join-Path $privateRoot 'postgres\clusters')).TrimEnd('\') + '\'
  $clusterPattern = '^' + [regex]::Escape($clusterRoot.TrimEnd('\')) + '\\[a-f0-9-]{36}\\data$'
  if (-not $dataDirectory.Equals($privatePostgres,[StringComparison]::OrdinalIgnoreCase) -and $dataDirectory -notmatch $clusterPattern) {
    Stop-Safe 'Diretorio de dados fora da allowlist da homologacao.'
  }
  $cursor = $dataDirectory
  while ($cursor -and $cursor.Length -ge $privateRoot.Length) {
    if (Test-Path -LiteralPath $cursor) { Assert-Path $cursor }
    if ($cursor.Equals([IO.Path]::GetFullPath($privateRoot),[StringComparison]::OrdinalIgnoreCase)) { break }
    $cursor = Split-Path -Parent $cursor
  }
  foreach ($path in @((Join-Path $dataDirectory 'PG_VERSION'),[string]$pg.pgCtlPath,[string]$pg.psqlPath)) { Assert-Path $path }
  $psqlPath = [IO.Path]::GetFullPath([string]$pg.psqlPath)
  if ([IO.Path]::GetDirectoryName($psqlPath) -ine [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath([string]$pg.pgCtlPath))) {
    Stop-Safe 'Ferramentas PostgreSQL apontam para instalacoes diferentes.'
  }
  Set-Phase 'Validacao das ferramentas PostgreSQL'
  if ((Get-Content -LiteralPath (Join-Path $dataDirectory 'PG_VERSION') -Raw).Trim() -cne '17') { Stop-Safe 'Cluster nao e PostgreSQL 17.' 'IDENTIDADE' 'AP-DIAG-POSTGRES-VERSION-MISMATCH' }
  $versionProcess = Invoke-AmoresPetNativeProcess -Executable $psqlPath -Arguments @('--version')
  if (-not $versionProcess.Started) {
    $script:ProcessState = 'FALHA AO INICIAR PSQL --VERSION'
    $nativeCodeText = if ($null -ne $versionProcess.NativeErrorCode) { [string]$versionProcess.NativeErrorCode } else { 'nao informado' }
    $script:ProcessDiagnostic = 'Tipo={0}; HRESULT={1}; Win32={2}; classe={3}' -f $versionProcess.ExceptionType,$versionProcess.HResult,$nativeCodeText,$versionProcess.FailureSummary
    Stop-Safe 'A ferramenta psql nao iniciou; nenhuma conexao foi tentada.' 'PROCESSO' ('AP-DIAG-PSQL-VERSION-LAUNCH-' + $versionProcess.HResult)
  }
  $script:ProcessState = 'PSQL --VERSION INICIADO; CODIGO DE SAIDA ' + [string]$versionProcess.ExitCode
  if ($versionProcess.ExitCode -ne 0) {
    $versionFailure = Get-AmoresPetPsqlFailureDiagnostic -StandardError $versionProcess.StandardError -ExitCode $versionProcess.ExitCode
    $script:ProcessDiagnostic = 'psql --version iniciou; exit={0}; categoria={1}; codigo={2}; stderr bruto omitido.' -f `
      $versionProcess.ExitCode,$versionFailure.Category,$versionFailure.Code
    if ($versionFailure.Category -eq 'PSQL_NAO_CLASSIFICADO' -and $versionProcess.StandardError) {
      $script:PrivatePsqlDetailName = Save-PrivatePsqlDiagnostic $versionProcess.StandardError
      if ($script:PrivatePsqlDetailName) { Write-Output ('DIAG_PRIVATE_PSQL_DETAIL=' + $script:PrivatePsqlDetailName) }
    }
    Stop-Safe $versionFailure.Description $versionFailure.Category $versionFailure.Code
  }
  if (($versionProcess.StandardOutput + $versionProcess.StandardError) -notmatch '\(PostgreSQL\)\s+17(?:\.|\s)') {
    $script:ProcessDiagnostic = 'psql iniciou sem apresentar versao PostgreSQL 17 esperada; texto bruto omitido.'
    Stop-Safe 'O psql configurado nao corresponde a versao maior PostgreSQL 17.' 'AUXILIAR' 'AP-DIAG-PSQL-VERSION-CHECK'
  }
  Set-Phase 'Preparacao da autenticacao PostgreSQL efemera e privada'
  $pgPassFile = New-PrivatePassfile $pg
  foreach ($entry in Get-ChildItem Env:) {
    if ($entry.Name -match '^(PG|PSQL)' -or $entry.Name -eq 'DATABASE_URL') {
      $savedPgEnvironment[$entry.Name] = $entry.Value
      Remove-Item -LiteralPath "Env:$($entry.Name)" -ErrorAction SilentlyContinue
    }
  }
  $env:PGPASSFILE = $pgPassFile
  $env:PGCONNECT_TIMEOUT = '5'
  $env:PGCLIENTENCODING = 'UTF8'
  Set-Phase 'Consulta somente leitura ao estado de 036/037'
  Invoke-ReadOnlyState $pg $psqlPath $dataDirectory ([string]$pg.clusterId)
  Write-Host 'Resultado: consulta finalizada; nenhuma migration, DDL ou DML foi executada.' -ForegroundColor Green
  $script:ProcessExitCode = 0
  $script:FinalMessage = 'Consulta somente leitura concluida.'
  Set-Phase 'Conclusao da consulta somente leitura'
  try { $script:ReportPath = Write-DiagnosticReport $script:FinalMessage }
  catch { Stop-Safe 'A consulta terminou, mas o relatorio local sanitizado nao pode ser salvo.' 'AUXILIAR' 'AP-DIAG-REPORT-WRITE' }
  Write-Output ('DIAG_REPORT=' + $script:ReportPath)
  Write-Host 'Categoria: ESTADO'
  Write-Host ('Etapa: ' + $script:CurrentPhase)
  Write-Host ('Codigo tecnico: ' + $script:TechnicalCode)
  Write-Host ('Conexao: ' + $script:ConnectionState)
  Write-Host ('Estado 036/037: ' + $script:MigrationState)
  Write-Host 'Relatorio local: %LOCALAPPDATA%\AmoresPet\DiagnosticosMigracoes\Diagnostico-Migrations-Lote2-*.txt'
} catch {
  $failureLocation = Get-SanitizedFailureLocation $_
  $script:FailureFunction = $failureLocation.Function
  $script:FailureLocation = $failureLocation.Location
  $message = if ($script:SafeFailure) { $script:SafeFailure } else { 'Falha inesperada; detalhes internos omitidos para proteger dados privados.' }
  if (-not $script:FailureClass) {
    if ($script:CurrentPhase -match '(?i)ACL|raiz privada|configuracao privada|conta Windows') { $script:FailureClass = 'ACESSO' }
    elseif ($script:CurrentPhase -match '(?i)PostgreSQL|consulta|conexao') { $script:FailureClass = 'CONEXAO' }
    else { $script:FailureClass = 'AUXILIAR' }
  }
  if (-not $script:TechnicalCode) {
    $errorId = [string]$_.FullyQualifiedErrorId -replace '[^A-Za-z0-9_.-]', ''
    if ($errorId.Length -gt 80) { $errorId = $errorId.Substring(0,80) }
    if ($errorId) { $script:TechnicalCode = 'AP-DIAG-PS-' + $errorId }
    else { $script:TechnicalCode = 'AP-DIAG-PS-HRESULT-0x{0:X8}' -f [int]$_.Exception.HResult }
  }
  $script:ProcessExitCode = 1
  $script:FinalMessage = $message
  Write-Host 'Diagnostico INCONCLUSIVO; nao representa estado das migrations.' -ForegroundColor Yellow
  Write-Host ('Categoria: ' + $script:FailureClass)
  Write-Host ('Etapa: ' + (Format-Safe $script:CurrentPhase))
  Write-Host ('Funcao interna: ' + (Format-Safe $script:FailureFunction))
  Write-Host ('Localizacao sanitizada: ' + (Format-Safe $script:FailureLocation))
  Write-Host ('Codigo tecnico: ' + (Format-Safe $script:TechnicalCode))
  Write-Host ('Processo psql: ' + (Format-Safe $script:ProcessState))
  Write-Host ('Diagnostico de inicializacao: ' + (Format-Safe $script:ProcessDiagnostic))
  Write-Host ('Conexao: ' + (Format-Safe $script:ConnectionState))
  Write-Host ('Estado 036/037: ' + (Format-Safe $script:MigrationState))
  Write-Host ('Erro sanitizado: ' + (Format-Safe $message)) -ForegroundColor Yellow
  Write-Host 'Nenhuma alteracao de banco foi executada pelo auxiliar.'
  try {
    $script:ReportPath = Write-DiagnosticReport $message
    Write-Output ('DIAG_REPORT=' + $script:ReportPath)
    Write-Host 'Relatorio local: %LOCALAPPDATA%\AmoresPet\DiagnosticosMigracoes\Diagnostico-Migrations-Lote2-*.txt'
  } catch { Write-Host 'Relatorio local nao pode ser criado; a mensagem sanitizada permanece nesta saida.' -ForegroundColor Yellow }
} finally {
  try {
    foreach ($name in @((Get-ChildItem Env: | Where-Object { $_.Name -match '^(PG|PSQL)' -or $_.Name -eq 'DATABASE_URL' }).Name)) {
      Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }
    foreach ($name in $savedPgEnvironment.Keys) { Set-Item -LiteralPath "Env:$name" -Value $savedPgEnvironment[$name] }
  } catch { Write-Host 'Aviso: a restauracao do ambiente de processo nao foi confirmada.' -ForegroundColor Yellow }
  try {
    if ($pgPassFile -and (Test-Path -LiteralPath $pgPassFile -PathType Leaf)) {
      Assert-Path $pgPassFile
      $resolved = [IO.Path]::GetFullPath($pgPassFile)
      if ($resolved.StartsWith([IO.Path]::GetFullPath($privateRoot).TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase) -and
          [IO.Path]::GetFileName($resolved) -match '^\.diagnostico-[a-f0-9]{32}\.pgpass$') { Remove-Item -LiteralPath $resolved -Force }
    }
  } catch { Write-Host 'Arquivo temporario permanece dentro da pasta privada; nao altere ACLs.' -ForegroundColor Yellow }
}

exit $script:ProcessExitCode
