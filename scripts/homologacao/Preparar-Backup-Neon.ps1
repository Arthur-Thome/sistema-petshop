param([switch]$NoPause)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Phase = 'Inicializacao'
$script:Code = 'AP-NEON-BACKUP-STARTUP'
$script:RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:PrivateRoot = $null
$script:ConfigPath = $null
$script:OperationDirectory = $null
$script:ReportPath = $null
$script:SafeReportPath = $null
$script:CurrentSid = $null
$script:AllowedSids = @()
$script:Pg = $null
$script:PgCtl = $null
$script:Psql = $null
$script:PgDump = $null
$script:PgRestore = $null
$script:InitDb = $null
$script:PostgresExe = $null
$script:PassFile = $null
$script:SavedPgEnvironment = @{}
$script:TempDataDirectory = $null
$script:TempPort = 0
$script:TempDatabaseC = $null
$script:TempDatabaseBuiltin = $null
$script:TempDatabaseSchemaReference = $null
$script:SchemaReferencePath = $null
$script:TempClusterStarted = $false
$script:TempClusterStopped = $false
$script:SourceSchemaCanonicalText = $null
$script:ExpectedSchemaCanonicalText = $null
$script:LastSchemaCanonicalText = $null
$script:Report = [ordered]@{
  format = 'amores-pet-neon-backup-v1'
  status = 'INICIADO'
  phase = 'Inicializacao'
  technical_code = 'AP-NEON-BACKUP-STARTUP'
  source = [ordered]@{ database = 'amores_pet_homologacao'; host = '127.0.0.1'; port = 55432; role = 'amores_pet_homologacao_app'; postgres_major = 17; cluster_validated = $false }
  source_changed = $false
  sistema_petshop_connected = $false
  neon_connected = $false
  persistent_ddl_started = $false
  backup = [ordered]@{ pg_dump_started = $false; pg_dump_completed = $false; created = $false; format = 'custom'; size_bytes = $null; sha256 = $null; catalog_validated = $false; private_acl_validated = $false }
  assets = [ordered]@{ created = $false; files = $null; total_bytes = $null; sha256 = $null; references_validated = $false; private_acl_validated = $false }
  source_snapshot = $null
  schema_reference = [ordered]@{ generated = $false; size_bytes = $null; sha256 = $null; restored = $false; metadata_compared = $false; fingerprint_compared = $false }
  restore_libc = [ordered]@{ started = $false; completed = $false; compared = $false; collation = 'C/libc' }
  restore_neon_collation = [ordered]@{ started = $false; completed = $false; compared = $false; collation = 'C.UTF-8/builtin' }
  migration_signatures = [ordered]@{ migration_035 = $false; migration_036 = $false; migration_037 = $false }
  preflight = [ordered]@{ restore_tested = $false; structures_compared = $false; data_compared = $false; sequence_states_compared = $false; relational_integrity_validated = $false; approved = $false }
  temporary_cluster = [ordered]@{ created = $false; started = $false; identity_validated = $false; stopped = $false; removed = $false }
  error = $null
  acl_resource = $null
  acl_technical_code = $null
  acl_validated = $null
  internal_failure_type = $null
  internal_failure_hresult = $null
  failure_location = $null
  schema_fingerprint_diff = $null
  function_fingerprint_diff = $null
}

function Set-Phase([string]$Name) {
  $script:Phase = $Name
  $script:Report.phase = $Name
  if ($script:ReportPath -and $script:OperationDirectory) { Write-PrivateReport }
}

function Stop-Backup([string]$TechnicalCode, [string]$Message) {
  $script:Code = $TechnicalCode
  $script:Report.technical_code = $TechnicalCode
  $script:Report.error = $Message
  if (-not $script:Report.failure_location) {
    $frame = @(Get-PSCallStack | Where-Object { $_.FunctionName -ne 'Stop-Backup' -and $_.ScriptName -match 'Preparar-Backup-Neon\.ps1$' } | Select-Object -First 1)
    if ($frame.Count -gt 0 -and [int]$frame[0].ScriptLineNumber -gt 0) {
      $script:Report.failure_location = 'Preparar-Backup-Neon.ps1:' + [string]$frame[0].ScriptLineNumber
    }
  }
  throw 'AP-NEON-BACKUP-STOP'
}

function Assert-NoReparsePoint([string]$Path, [string]$TechnicalCode = 'AP-NEON-PATH-INVALID') {
  try { $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop }
  catch { Stop-Backup $TechnicalCode 'Um caminho necessário não existe ou não pôde ser lido.' }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    Stop-Backup $TechnicalCode 'Um caminho de configuração ou backup é link/junction; operação recusada.'
  }
}

function Assert-PrivateAcl([string]$Path, [switch]$RequireProtected, [switch]$AllowAdministrators,
    [string]$Code = 'AP-NEON-ACL-INVALID', [string]$Resource = 'recurso-privado') {
  $script:Report.acl_resource = $Resource
  try {
    $assessment = Test-AmoresPetPrivateAcl -Path $Path -CurrentSid $script:CurrentSid `
      -OwnerAllowedSids $script:AllowedSids -AccessAllowedSids $script:AllowedSids `
      -RequireProtected:$RequireProtected -AllowAdministrators:$AllowAdministrators
  } catch {
    $script:Report.acl_technical_code = 'AP-DIAG-ACL-QUERY-FAILED'
    $script:Report.acl_validated = $false
    Stop-Backup $Code ('A consulta somente de leitura da ACL falhou no recurso ' + $Resource + '; nenhuma permissão foi alterada.')
  }
  $script:Report.acl_technical_code = [string]$assessment.TechnicalCode
  $script:Report.acl_validated = [bool]$assessment.Success
  if (-not $assessment.Success) {
    Stop-Backup $Code ('ACL inválida no recurso ' + $Resource + '; regra=' + [string]$assessment.TechnicalCode + '; nenhuma ACL existente foi alterada.')
  }
}

function New-PrivateDirectory([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    Assert-NoReparsePoint $Path
    Assert-PrivateAcl $Path -Resource 'diretorio-privado-existente'
    return
  }
  [void][IO.Directory]::CreateDirectory($Path)
  Assert-NoReparsePoint $Path
  Assert-PrivateAcl $Path -Resource 'diretorio-privado-novo-herdado'
}

function Save-And-ClearPgEnvironment {
  foreach ($entry in Get-ChildItem Env:) {
    if ($entry.Name -match '^(PG|PSQL)' -or $entry.Name -eq 'DATABASE_URL') {
      $script:SavedPgEnvironment[$entry.Name] = $entry.Value
      Remove-Item -LiteralPath "Env:$($entry.Name)" -ErrorAction SilentlyContinue
    }
  }
}

function Restore-PgEnvironment {
  foreach ($entry in Get-ChildItem Env:) {
    if ($entry.Name -match '^(PG|PSQL)' -or $entry.Name -eq 'DATABASE_URL') {
      Remove-Item -LiteralPath "Env:$($entry.Name)" -ErrorAction SilentlyContinue
    }
  }
  foreach ($name in $script:SavedPgEnvironment.Keys) {
    Set-Item -LiteralPath "Env:$name" -Value $script:SavedPgEnvironment[$name]
  }
  $script:SavedPgEnvironment.Clear()
}

function Write-PrivateReport {
  if (-not $script:ReportPath -or -not $script:OperationDirectory) { return }
  $script:Report.phase = $script:Phase
  $script:Report.technical_code = $script:Code
  if (Test-Path -LiteralPath $script:ReportPath -PathType Leaf) {
    Assert-NoReparsePoint $script:ReportPath
    Assert-PrivateAcl $script:ReportPath
  } else {
    $stream = [IO.File]::Open($script:ReportPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Dispose()
    Assert-PrivateAcl $script:ReportPath
  }
  $json = $script:Report | ConvertTo-Json -Depth 12
  [IO.File]::WriteAllText($script:ReportPath, $json + "`r`n", (New-Object Text.UTF8Encoding($false)))
  Assert-PrivateAcl $script:ReportPath

  $safeLines = @(
    'Amores Pet — preparação privada do backup para Neon'
    'Status: ' + [string]$script:Report.status
    'Etapa: ' + [string]$script:Report.phase
    'Código técnico: ' + [string]$script:Report.technical_code
    'Origem: amores_pet_homologacao em 127.0.0.1:55432; PostgreSQL 17'
    'pg_dump iniciado/concluido: ' + [string]$script:Report.backup.pg_dump_started + '/' + [string]$script:Report.backup.pg_dump_completed
    'Backup custom criado: ' + [string]$script:Report.backup.created
    'Backup bytes: ' + [string]$script:Report.backup.size_bytes
    'Backup SHA-256: ' + [string]$script:Report.backup.sha256
    'Catálogo validado: ' + [string]$script:Report.backup.catalog_validated
    'ACL privada do backup: ' + [string]$script:Report.backup.private_acl_validated
    'Arquivos externos copiados: ' + [string]$script:Report.assets.files
    'Bytes de arquivos externos: ' + [string]$script:Report.assets.total_bytes
    'SHA-256 de arquivos externos: ' + [string]$script:Report.assets.sha256
    'Referências banco/arquivos conferidas: ' + [string]$script:Report.assets.references_validated
    'Assinaturas 035/036/037: ' + [string]$script:Report.migration_signatures.migration_035 + '/' + [string]$script:Report.migration_signatures.migration_036 + '/' + [string]$script:Report.migration_signatures.migration_037
    'Schema de referência descartável: gerado=' + [string]$script:Report.schema_reference.generated + '; restaurado=' + [string]$script:Report.schema_reference.restored + '; metadata=' + [string]$script:Report.schema_reference.metadata_compared + '; fingerprint=' + [string]$script:Report.schema_reference.fingerprint_compared
    'Restore PostgreSQL C/libc: ' + [string]$script:Report.restore_libc.completed
    'Restore PostgreSQL C.UTF-8/builtin: ' + [string]$script:Report.restore_neon_collation.completed
    'Estruturas comparadas: ' + [string]$script:Report.preflight.structures_compared
    'Dados comparados: ' + [string]$script:Report.preflight.data_compared
    'Estados das sequences comparados: ' + [string]$script:Report.preflight.sequence_states_compared
    'Integridade relacional: ' + [string]$script:Report.preflight.relational_integrity_validated
    'Preflight aprovado: ' + [string]$script:Report.preflight.approved
    'Banco local alterado: ' + [string]$script:Report.source_changed
    'sistema_petshop conectado: ' + [string]$script:Report.sistema_petshop_connected
    'Neon conectado: ' + [string]$script:Report.neon_connected
    'DDL persistente iniciado: ' + [string]$script:Report.persistent_ddl_started
    'Falha: ' + [string]$script:Report.error
    'ACL: ' + [string]$script:Report.acl_resource + '; regra=' + [string]$script:Report.acl_technical_code + '; valida=' + [string]$script:Report.acl_validated
    'Tipo interno: ' + [string]$script:Report.internal_failure_type
    'HRESULT: ' + [string]$script:Report.internal_failure_hresult
    'Localização: ' + [string]$script:Report.failure_location
    'Diagnóstico fingerprint estrutural: ' + [string]$script:Report.schema_fingerprint_diff
    'Diagnóstico de funções (somente categorias e contagens): ' + [string]$script:Report.function_fingerprint_diff
    'Relatório privado: %LOCALAPPDATA%\AmoresPet\Homologacao\neon-backups\<execução>\relatorio-sanitizado.txt'
  )
  [IO.File]::WriteAllText($script:SafeReportPath, ($safeLines -join "`r`n") + "`r`n", (New-Object Text.UTF8Encoding($true)))
  Assert-PrivateAcl $script:SafeReportPath
}

function Invoke-PgTool([string]$Executable, [string[]]$Arguments, [string]$Label, [switch]$NoCapture) {
  $result = Invoke-AmoresPetNativeProcess -Executable $Executable -Arguments $Arguments -NoCapture:$NoCapture
  if (-not $result.Started) {
    $code = 'AP-NEON-PROCESS-' + [string]$result.FailureSummary
    Stop-Backup $code ($Label + ' não pôde ser iniciado; classe técnica=' + [string]$result.FailureSummary + '; erro nativo=' + [string]$result.NativeErrorCode + '.')
  }
  if ([int]$result.ExitCode -ne 0) {
    if ([IO.Path]::GetFileName($Executable) -ieq 'psql.exe') {
      $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $result.StandardError -ExitCode ([int]$result.ExitCode)
      Stop-Backup ([string]$diagnostic.Code) ($Label + ' foi recusado pelo PostgreSQL; categoria=' + [string]$diagnostic.Category + '; SQLSTATE=' + [string]$diagnostic.SqlState + '.')
    }
    $summary = Get-AmoresPetProcessOutputFailureSummary ([string]$result.StandardError)
    $prefix = switch ([IO.Path]::GetFileName($Executable).ToLowerInvariant()) {
      'pg_dump.exe' { 'AP-NEON-PG-DUMP-EXIT-' }
      'pg_restore.exe' { 'AP-NEON-PG-RESTORE-EXIT-' }
      'initdb.exe' { 'AP-NEON-INITDB-EXIT-' }
      'pg_ctl.exe' { 'AP-NEON-PG-CTL-EXIT-' }
      default { 'AP-NEON-PG-TOOL-EXIT-' }
    }
    Stop-Backup ($prefix + [string]$result.ExitCode) ($Label + ' terminou com código ' + [string]$result.ExitCode + '; resumo=' + $summary + '; stderr bruto omitido.')
  }
  return $result
}

function Invoke-SourcePsql([string]$Sql, [string]$Label) {
  return Invoke-PgTool $script:Psql @('-X','-w','-q','-A','-t','-F','|','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-h','127.0.0.1','-p','55432','-U','amores_pet_homologacao_app','-d','amores_pet_homologacao','-c',$Sql) $Label
}

function Invoke-TemporaryPsql([string]$Database, [string]$Sql, [string]$Label) {
  return Invoke-PgTool $script:Psql @('-X','-w','-q','-A','-t','-F','|','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-h','127.0.0.1','-p',[string]$script:TempPort,'-U','postgres','-d',$Database,'-c',$Sql) $Label
}

function New-PrivatePassfile {
  $path = Join-Path $script:OperationDirectory ('.source-' + [guid]::NewGuid().ToString('N') + '.pgpass')
  $escape = { param([string]$Value) $Value.Replace('\','\\').Replace(':','\:').Replace("`r",'').Replace("`n",'') }
  $parts = @('127.0.0.1','55432','amores_pet_homologacao','amores_pet_homologacao_app',[string]$script:Pg.password)
  $encoded = @($parts | ForEach-Object { & $escape ([string]$_) }) -join ':'
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($encoded + "`n")
  $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
  Assert-NoReparsePoint $path
  Assert-PrivateAcl $path
  return $path
}

function Assert-ManagedSourceDirectory([string]$Candidate) {
  if ([string]::IsNullOrWhiteSpace($Candidate) -or -not [IO.Path]::IsPathRooted($Candidate)) {
    Stop-Backup 'AP-NEON-SOURCE-DATADIR' 'O diretório do cluster de origem não é absoluto.'
  }
  $full = [IO.Path]::GetFullPath($Candidate)
  $expected = [IO.Path]::GetFullPath((Join-Path $script:PrivateRoot 'postgres\data'))
  $clusters = [IO.Path]::GetFullPath((Join-Path $script:PrivateRoot 'postgres\clusters'))
  $clusterPattern = '^' + [regex]::Escape($clusters.TrimEnd('\')) + '\\[a-f0-9-]{36}\\data$'
  if (-not $full.Equals($expected, [StringComparison]::OrdinalIgnoreCase) -and $full -notmatch $clusterPattern) {
    Stop-Backup 'AP-NEON-SOURCE-DATADIR' 'O diretório do cluster não pertence à allowlist privada da homologação.'
  }
  $cursor = $full
  while ($cursor -and $cursor.Length -ge $script:PrivateRoot.Length) {
    Assert-NoReparsePoint $cursor 'AP-NEON-SOURCE-PATH'
    if ($cursor.Equals($script:PrivateRoot, [StringComparison]::OrdinalIgnoreCase)) { break }
    $cursor = Split-Path -Parent $cursor
  }
  return $full
}

function Assert-LiveSourceIdentity {
  $sql = @'
SELECT current_database() || '|' || current_user || '|' || session_user || '|' ||
       COALESCE(host(inet_server_addr()), '') || '|' || inet_server_port()::text || '|' ||
       current_setting('server_version_num') || '|' || extract(epoch FROM pg_postmaster_start_time())::bigint::text || '|' ||
       CASE WHEN (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN 'true' ELSE 'false' END || '|' ||
       CASE WHEN pg_is_in_recovery() THEN 'true' ELSE 'false' END || '|' || current_setting('TimeZone')
'@
  $line = (Invoke-SourcePsql $sql 'Identidade SQL da origem').StandardOutput.Trim()
  $parts = $line -split '\|', 10
  if ($parts.Count -ne 10) { Stop-Backup 'AP-NEON-SOURCE-IDENTITY-FORMAT' 'A identidade SQL da origem retornou formato inesperado.' }
  $serverVersion = 0
  $startEpoch = [long]0
  $serverPort = 0
  if (-not [int]::TryParse($parts[5], [ref]$serverVersion) -or
      -not [long]::TryParse($parts[6], [ref]$startEpoch) -or
      -not [int]::TryParse($parts[4], [ref]$serverPort)) {
    Stop-Backup 'AP-NEON-SOURCE-IDENTITY-FORMAT' 'Um campo numérico da identidade SQL é inválido.'
  }
  if ($parts[0] -cne 'amores_pet_homologacao' -or $parts[1] -cne 'amores_pet_homologacao_app' -or
      $parts[2] -cne 'amores_pet_homologacao_app' -or $parts[3] -cne '127.0.0.1' -or $serverPort -ne 55432 -or
      $serverVersion -lt 170000 -or $serverVersion -ge 180000 -or $parts[7] -cne 'false' -or
      $parts[8] -cne 'false' -or $parts[9] -cne 'America/Sao_Paulo') {
    Stop-Backup 'AP-NEON-SOURCE-IDENTITY-MISMATCH' 'A conexão não corresponde ao banco, role, cluster, versão e fuso autorizados.'
  }

  $pidPath = Join-Path $script:DataDirectory 'postmaster.pid'
  Assert-NoReparsePoint $pidPath 'AP-NEON-PID-INVALID'
  Assert-PrivateAcl $pidPath -AllowAdministrators -Code 'AP-NEON-PID-ACL'
  try {
    $postmaster = Get-AmoresPetPostmasterIdentity -Path $pidPath -ExpectedDataDirectory $script:DataDirectory `
      -ExpectedPort 55432 -ExpectedListenAddress '127.0.0.1' -ExpectedStartEpoch $startEpoch
  } catch { Stop-Backup 'AP-NEON-POSTMASTER-MISMATCH' 'postmaster.pid não corresponde à identidade SQL consultada.' }
  $expectedExe = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $script:PgCtl) 'postgres.exe'))
  try {
    $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $postmaster.ProcessId `
      -ExpectedExecutable $expectedExe -ExpectedDataDirectory $script:DataDirectory `
      -ExpectedListenAddress '127.0.0.1' -ExpectedPort 55432
  } catch { Stop-Backup 'AP-NEON-PROCESS-LISTENER-MISMATCH' 'Processo ou listener não corresponde ao cluster isolado autorizado.' }

  $active = (Invoke-SourcePsql @'
SELECT count(*)::text FROM pg_stat_activity
WHERE datname=current_database() AND pid<>pg_backend_pid()
  AND (state IS DISTINCT FROM 'idle' OR xact_start IS NOT NULL)
'@ 'Verificação de transações ativas').StandardOutput.Trim()
  if ($active -cne '0') { Stop-Backup 'AP-NEON-SOURCE-BUSY' 'Há transação ativa no banco de origem; backup e arquivos não serão capturados neste momento.' }

  return [pscustomobject]@{ VersionNum = $serverVersion; StartEpoch = $startEpoch; TimeZone = $parts[9]; ProcessId = [int]$postmaster.ProcessId }
}

function Get-NeonDataSnapshotSql {
  return @'
DO $snapshot$
DECLARE
  item record;
  table_rows bigint;
  fingerprint_a numeric;
  fingerprint_b numeric;
  fingerprint_c numeric;
  total_tables bigint := 0;
  total_rows numeric := 0;
  data_a numeric := 0;
  data_b numeric := 0;
  digest_text text;
  table_key text;
  hash_piece bigint;
  prime_value CONSTANT numeric := 2305843009213693951;
BEGIN
  FOR item IN
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema'
    ORDER BY schemaname COLLATE "C", tablename COLLATE "C"
  LOOP
    EXECUTE format($query$
      SELECT count(*)::bigint,
        COALESCE(mod(sum(('x' || substr(row_md5,1,15))::bit(60)::bigint::numeric), 2305843009213693951),0),
        COALESCE(mod(sum(('x' || substr(row_md5,16,15))::bit(60)::bigint::numeric), 2305843009213693951),0),
        COALESCE(mod(sum(mod(('x' || substr(row_md5,1,15))::bit(60)::bigint::numeric *
                             ('x' || substr(row_md5,16,15))::bit(60)::bigint::numeric, 2305843009213693951)), 2305843009213693951),0)
      FROM (SELECT md5($1 || to_jsonb(row_value)::text) AS row_md5 FROM %I.%I AS row_value) AS hashed_rows
    $query$, item.schemaname, item.tablename)
      INTO table_rows, fingerprint_a, fingerprint_b, fingerprint_c
      USING item.schemaname || '.' || item.tablename || ':';
    total_tables := total_tables + 1;
    total_rows := total_rows + table_rows;
    table_key := item.schemaname || '.' || item.tablename || ':' || table_rows::text || ':' ||
      fingerprint_a::text || ':' || fingerprint_b::text || ':' || fingerprint_c::text;
    digest_text := md5(table_key);
    hash_piece := ('x' || substr(digest_text,1,15))::bit(60)::bigint;
    data_a := mod(data_a * 65599 + hash_piece::numeric, prime_value);
    hash_piece := ('x' || substr(digest_text,16,15))::bit(60)::bigint;
    data_b := mod(data_b * 65599 + hash_piece::numeric, prime_value);
  END LOOP;
  RAISE WARNING 'NEON_DATA_SNAPSHOT=%|%|%|%|%', total_tables, total_rows, data_a, data_b, prime_value;
END
$snapshot$;
'@
}

function Get-NeonSequenceSnapshotSql {
  return @'
DO $sequence_snapshot$
DECLARE
  item record;
  sequence_state text;
  sequence_entries text[] := ARRAY[]::text[];
BEGIN
  FOR item IN
    SELECT schemaname, sequencename
    FROM pg_sequences
    WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema'
    ORDER BY schemaname COLLATE "C", sequencename COLLATE "C"
  LOOP
    IF NOT has_sequence_privilege(current_user, format('%I.%I', item.schemaname, item.sequencename), 'SELECT') THEN
      RAISE EXCEPTION 'sequence state not readable';
    END IF;
    EXECUTE format('SELECT last_value::text || '':'' || is_called::text FROM %I.%I', item.schemaname, item.sequencename)
      INTO sequence_state;
    sequence_entries := array_append(sequence_entries, item.schemaname || '.' || item.sequencename || ':' || sequence_state);
  END LOOP;
  RAISE WARNING 'NEON_SEQUENCE_SNAPSHOT=%|%', cardinality(sequence_entries), md5(array_to_string(sequence_entries, E'\n'));
END
$sequence_snapshot$;
'@
}

function Get-StructuredSnapshot([object]$Process, [string]$Marker, [int]$Fields, [string]$Label) {
  if ([string]$Process.StandardOutput -ne '') { Stop-Backup 'AP-NEON-SNAPSHOT-OUTPUT' ($Label + ' retornou saída fora do formato estruturado esperado.') }
  $markerCount = [regex]::Matches([string]$Process.StandardError,[regex]::Escape($Marker)).Count
  if ($markerCount -ne 1) {
    $code = if ($markerCount -eq 0) { 'AP-NEON-SNAPSHOT-MISSING' } else { 'AP-NEON-SNAPSHOT-MULTIPLE' }
    Stop-Backup $code ($Label + ' não retornou exatamente um snapshot estruturado.')
  }
  $pattern = '(?m)^.*?' + [regex]::Escape($Marker) + '(?<payload>(?:[0-9]+|[a-f0-9]{32})(?:\|(?:[0-9]+|[a-f0-9]{32})){'+($Fields - 1)+'})[ \t]*\r?$'
  $matches = [regex]::Matches([string]$Process.StandardError,$pattern)
  if ($matches.Count -ne 1) { Stop-Backup 'AP-NEON-SNAPSHOT-FORMAT' ($Label + ' retornou um snapshot com formato inesperado.') }
  return @($matches[0].Groups['payload'].Value.Split('|'))
}

function Get-DataSnapshot([string]$Database, [switch]$Temporary) {
  $sql = "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'America/Sao_Paulo';`n" + (Get-NeonDataSnapshotSql) + "`nCOMMIT;"
  $process = if ($Temporary) { Invoke-TemporaryPsql $Database $sql 'Fingerprint completo dos dados restaurados' }
    else { Invoke-SourcePsql $sql 'Fingerprint completo dos dados da origem' }
  $values = Get-StructuredSnapshot -Process $process -Marker 'NEON_DATA_SNAPSHOT=' -Fields 5 -Label 'Fingerprint completo dos dados'
  $tableCount = [long]0; $rowCount = [decimal]0; $fingerprintA = [long]0; $fingerprintB = [long]0
  if (-not [long]::TryParse($values[0], [ref]$tableCount) -or
      -not [decimal]::TryParse($values[1], [Globalization.NumberStyles]::Integer, [Globalization.CultureInfo]::InvariantCulture, [ref]$rowCount) -or
      -not [long]::TryParse($values[2], [ref]$fingerprintA) -or -not [long]::TryParse($values[3], [ref]$fingerprintB)) {
    Stop-Backup 'AP-NEON-SNAPSHOT-NONNUMERIC' 'O fingerprint completo retornou campo não numérico.'
  }
  return [pscustomobject]@{ TableCount = $tableCount; RowCount = $rowCount; FingerprintA = $fingerprintA; FingerprintB = $fingerprintB }
}

function Get-SequenceSnapshot([string]$Database, [switch]$Temporary) {
  $sql = "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;`n" + (Get-NeonSequenceSnapshotSql) + "`nCOMMIT;"
  $process = if ($Temporary) { Invoke-TemporaryPsql $Database $sql 'Fingerprint dos estados das sequences restauradas' }
    else { Invoke-SourcePsql $sql 'Fingerprint dos estados das sequences da origem' }
  $values = Get-StructuredSnapshot -Process $process -Marker 'NEON_SEQUENCE_SNAPSHOT=' -Fields 2 -Label 'Fingerprint de sequences'
  $count = [long]0
  if (-not [long]::TryParse($values[0], [ref]$count) -or $values[1] -notmatch '^[a-f0-9]{32}$') {
    Stop-Backup 'AP-NEON-SEQUENCE-SNAPSHOT-FORMAT' 'O fingerprint das sequences retornou formato inválido.'
  }
  return [pscustomobject]@{ Count = $count; Fingerprint = [string]$values[1] }
}

function Get-SourceMetadataSql {
  return @'
SELECT jsonb_build_object(
  'encoding', pg_encoding_to_char(d.encoding),
  'collation', d.datcollate,
  'ctype', d.datctype,
  'locale_provider', CASE d.datlocprovider WHEN 'c' THEN 'libc' WHEN 'b' THEN 'builtin' WHEN 'i' THEN 'icu' ELSE 'unknown' END,
  'locale', COALESCE(d.datlocale,''),
  'timezone', current_setting('TimeZone'),
  'database_bytes', pg_database_size(d.oid),
  'schemas', (SELECT count(*) FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),
  'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p')),
  'views', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind='v'),
  'indexes', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('i','I')),
  'sequences', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind='S'),
  'foreign_keys', (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.contype='f'),
  'foreign_keys_unvalidated', (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.contype='f' AND NOT c.convalidated),
  'triggers', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND NOT t.tgisinternal),
  'triggers_disabled', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND NOT t.tgisinternal AND t.tgenabled='D'),
  'functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),
  'security_definer_functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND p.prosecdef),
  'extensions', COALESCE((SELECT string_agg(extname || '=' || extversion, ',' ORDER BY extname) FROM pg_extension),''),
  'migration_035_tables', (SELECT count(*)=3 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('atendimentos','atendimento_servicos','pagamentos_atendimentos') AND relkind='r'),
  'migration_035_views', (SELECT count(*)=3 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('banho_tosa','banho_tosa_servicos','pagamentos_banho_tosa') AND relkind='v'),
  'migration_036_authorizations', to_regclass('public.operation_authorizations') IS NOT NULL,
  'migration_036_file_queue', to_regclass('public.permanent_file_deletion_queue') IS NOT NULL,
  'migration_037_function', to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)') IS NOT NULL,
  'migration_037_super_admin', COALESCE(position('super_administrador' IN pg_get_functiondef(to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)')))>0,FALSE),
  'app_role_superuser', (SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
  'app_role_database_owner', pg_get_userbyid(d.datdba)=current_user,
  'app_role_public_schema_owner', (SELECT pg_get_userbyid(nspowner)=current_user FROM pg_namespace WHERE nspname='public'),
  'app_role_owned_objects', (SELECT count(*) FROM (
     SELECT relowner AS owner_id FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
     UNION ALL SELECT proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
   ) owners WHERE owner_id=(SELECT oid FROM pg_roles WHERE rolname=current_user)),
  'app_role_connect', has_database_privilege(current_user,d.oid,'CONNECT'),
  'app_role_schema_usage', has_schema_privilege(current_user,'public','USAGE'),
  'app_role_schema_create', has_schema_privilege(current_user,'public','CREATE'),
  'app_role_tables_select', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND has_table_privilege(current_user,c.oid,'SELECT')),
  'app_role_sequences_usage', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE'))
)::text
FROM pg_database d WHERE d.datname=current_database();
'@
}

function Get-SourceMetadata([string]$Database, [switch]$Temporary) {
  $sql = "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;`n" + (Get-SourceMetadataSql) + "`nCOMMIT;"
  $process = if ($Temporary) { Invoke-TemporaryPsql $Database $sql 'Metadados da cópia restaurada' }
    else { Invoke-SourcePsql $sql 'Metadados da origem' }
  $output = ([string]$process.StandardOutput).Trim()
  try { return $output | ConvertFrom-Json -ErrorAction Stop }
  catch { Stop-Backup 'AP-NEON-METADATA-FORMAT' 'A consulta de metadados retornou formato inesperado.' }
}

function Get-SequenceMetadataSql {
  return @'
SELECT COALESCE(jsonb_agg(jsonb_build_object('schema', schemaname, 'name', sequencename,
  'type', data_type, 'start', start_value, 'min', min_value, 'max', max_value,
  'increment', increment_by, 'cycle', cycle) ORDER BY schemaname COLLATE "C", sequencename COLLATE "C"),'[]'::jsonb)::text
FROM pg_sequences
WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema'
'@
}

function Get-SequenceMetadata([string]$Database, [switch]$Temporary) {
  $process = if ($Temporary) { Invoke-TemporaryPsql $Database (Get-SequenceMetadataSql) 'Metadados das sequences restauradas' }
    else { Invoke-SourcePsql (Get-SequenceMetadataSql) 'Metadados das sequences da origem' }
  try { return ([string]$process.StandardOutput).Trim() | ConvertFrom-Json -ErrorAction Stop }
  catch { Stop-Backup 'AP-NEON-SEQUENCE-METADATA' 'Metadados das sequences retornaram formato inesperado.' }
}

function Get-FunctionDefinitionFingerprintSql {
  return @'
SET search_path = pg_catalog, public;
SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
  'identity', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
  'arguments', pg_get_function_arguments(p.oid),
  'result', pg_get_function_result(p.oid),
  'language', l.lanname,
  'kind', p.prokind,
  'body_md5', md5(p.prosrc),
  'binary', p.probin,
  'volatility', p.provolatile,
  'strict', p.proisstrict,
  'security_definer', p.prosecdef,
  'leakproof', p.proleakproof,
  'parallel', p.proparallel,
  'returns_set', p.proretset,
  'config', COALESCE(to_jsonb(p.proconfig),'null'::jsonb),
  'cost', p.procost,
  'rows', p.prorows,
  'variadic', CASE WHEN p.provariadic=0 THEN '' ELSE p.provariadic::regtype::text END,
  'support', CASE WHEN p.prosupport=0 THEN '' ELSE p.prosupport::regprocedure::text END
) ORDER BY n.nspname COLLATE "C", p.proname COLLATE "C", pg_get_function_identity_arguments(p.oid) COLLATE "C")::text,'[]'))
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_language l ON l.oid=p.prolang
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND p.prokind IN ('f','p')
'@
}

function Get-FunctionDefinitionFingerprint([string]$Database, [switch]$Temporary) {
  $sql = Get-FunctionDefinitionFingerprintSql
  $process = if ($Temporary) { Invoke-TemporaryPsql $Database $sql 'Fingerprint das definições de funções restauradas' }
    else { Invoke-SourcePsql $sql 'Fingerprint das definições de funções da origem' }
  $value = ([string]$process.StandardOutput).Trim()
  if ($value -notmatch '^[a-f0-9]{32}$') { Stop-Backup 'AP-NEON-FUNCTION-FINGERPRINT-FORMAT' 'O fingerprint das funções retornou formato inválido.' }
  return $value
}

function Get-FunctionDefinitionComponentSnapshotSql {
  return @'
SET search_path = pg_catalog, public;
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id', md5(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'),
  'identity', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
  'body_length', char_length(COALESCE(p.prosrc,'')),
  'arguments', md5(COALESCE(pg_get_function_arguments(p.oid),'')),
  'result', md5(COALESCE(pg_get_function_result(p.oid),'')),
  'language', md5(l.lanname),
  'kind', md5(p.prokind::text),
  'body', md5(COALESCE(p.prosrc,'')),
  'binary', md5(COALESCE(p.probin,'')),
  'volatility', md5(p.provolatile::text),
  'strict', md5(p.proisstrict::text),
  'security_definer', md5(p.prosecdef::text),
  'leakproof', md5(p.proleakproof::text),
  'parallel', md5(p.proparallel::text),
  'returns_set', md5(p.proretset::text),
  'config', md5(COALESCE(p.proconfig::text,'')),
  'cost', md5(p.procost::text),
  'rows', md5(p.prorows::text),
  'variadic', md5(CASE WHEN p.provariadic=0 THEN '' ELSE p.provariadic::regtype::text END),
  'support', md5(CASE WHEN p.prosupport=0 THEN '' ELSE p.prosupport::regprocedure::text END)
) ORDER BY n.nspname COLLATE "C", p.proname COLLATE "C", pg_get_function_identity_arguments(p.oid) COLLATE "C"),'[]'::jsonb)::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_language l ON l.oid=p.prolang
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND p.prokind IN ('f','p');
'@
}

function Get-FunctionDefinitionComponentSnapshot([string]$Database, [switch]$Temporary) {
  $sql = Get-FunctionDefinitionComponentSnapshotSql
  $process = if ($Temporary) { Invoke-TemporaryPsql $Database $sql 'Diagnóstico sanitizado de componentes de funções restauradas' }
    else { Invoke-SourcePsql $sql 'Diagnóstico sanitizado de componentes de funções da origem' }
  try {
    $items = @(([string]$process.StandardOutput).Trim() | ConvertFrom-Json -ErrorAction Stop)
    return $items
  }
  catch { Stop-Backup 'AP-NEON-FUNCTION-DIAGNOSTIC-FORMAT' 'O diagnóstico interno das funções retornou formato inválido.' }
}

function Compare-FunctionDefinitionComponents([object[]]$Expected, [object[]]$Actual) {
  $fields = @('arguments','result','language','kind','body','binary','volatility','strict','security_definer','leakproof','parallel','returns_set','config','cost','rows','variadic','support')
  $expectedById = @{}; foreach ($item in $Expected) { $expectedById[[string]$item.id] = $item }
  $actualById = @{}; foreach ($item in $Actual) { $actualById[[string]$item.id] = $item }
  $counts = @{ FUNCTION_SET = 0 }; foreach ($field in $fields) { $counts[$field] = 0 }
  $bodyDetails = @()
  foreach ($id in $expectedById.Keys) {
    if (-not $actualById.ContainsKey($id)) { $counts.FUNCTION_SET++; continue }
    foreach ($field in $fields) {
      if ([string]$expectedById[$id].$field -cne [string]$actualById[$id].$field) {
        $counts[$field]++
        if ($field -ceq 'body') {
          $bodyDetails += ([string]$expectedById[$id].identity + ':chars=' + [string]$expectedById[$id].body_length + '/' + [string]$actualById[$id].body_length)
        }
      }
    }
  }
  foreach ($id in $actualById.Keys) { if (-not $expectedById.ContainsKey($id)) { $counts.FUNCTION_SET++ } }
  $parts = @()
  foreach ($field in @('FUNCTION_SET') + $fields) { if ($counts[$field] -gt 0) { $parts += ($field + '=' + [string]$counts[$field]) } }
  if ($bodyDetails.Count -gt 0) { $parts += ('corpos=' + ($bodyDetails -join '; ')) }
  if ($parts.Count -eq 0) { return 'componentes_sem_diferenca; fingerprint_aggregate_inconsistente' }
  return ($parts -join '; ')
}

function Get-MigrationAssertions([object]$Metadata) {
  $m035 = [bool]$Metadata.migration_035_tables -and [bool]$Metadata.migration_035_views
  $m036 = [bool]$Metadata.migration_036_authorizations -and [bool]$Metadata.migration_036_file_queue
  $m037 = [bool]$Metadata.migration_037_function -and [bool]$Metadata.migration_037_super_admin
  $script:Report.migration_signatures.migration_035 = $m035
  $script:Report.migration_signatures.migration_036 = $m036
  $script:Report.migration_signatures.migration_037 = $m037
  if (-not $m035 -or -not $m036 -or -not $m037) {
    Stop-Backup 'AP-NEON-MIGRATION-SIGNATURE-MISMATCH' 'As assinaturas SQL das migrations 035, 036 e 037 não estão completas.'
  }
}

function Normalize-SchemaDumpForFingerprint([AllowEmptyString()][string]$Text) {
  $normalized = [regex]::Replace([string]$Text,
    '(?m)^(\\(?:un)?restrict)[ \t]+\S+[ \t]*\r?$', '$1 __AMORES_PET_PG_DUMP_RESTRICT_KEY__')
  $normalized = [regex]::Replace($normalized,
    '(?m)^(-- Name: .*?; Owner:) [^\r\n]*$', '$1 __OWNER_MAPPING_OMITTED__')
  return $normalized.Replace("`r`n","`n")
}

function Get-SchemaFingerprintDifferenceSummary([AllowEmptyString()][string]$Expected, [AllowEmptyString()][string]$Actual) {
  $expectedLines = @($Expected -split "`n")
  $actualLines = @($Actual -split "`n")
  $differences = @(Compare-Object -ReferenceObject $expectedLines -DifferenceObject $actualLines)
  $sourceOnly = @($differences | Where-Object { $_.SideIndicator -eq '<=' }).Count
  $restoreOnly = @($differences | Where-Object { $_.SideIndicator -eq '=>' }).Count
  $sourceNeed = @{}
  $restoreNeed = @{}
  foreach ($difference in $differences) {
    $targetMap = if ($difference.SideIndicator -eq '<=') { $sourceNeed } else { $restoreNeed }
    $lineKey = [string]$difference.InputObject
    if (-not $targetMap.ContainsKey($lineKey)) { $targetMap[$lineKey] = 0 }
    $targetMap[$lineKey]++
  }
  $sourceObjectTypes = @{}
  $currentSourceType = 'SECTION'
  foreach ($line in $Expected -split "`n") {
    if ($line -match '^-- Name: .*?;\s*Type:\s*(?<type>[^;]+);') { $currentSourceType = $Matches['type'].Trim().ToUpperInvariant() }
    $lineKey = [string]$line
    if ($sourceNeed.ContainsKey($lineKey) -and $sourceNeed[$lineKey] -gt 0) {
      if (-not $sourceObjectTypes.ContainsKey($currentSourceType)) { $sourceObjectTypes[$currentSourceType] = 0 }
      $sourceObjectTypes[$currentSourceType]++
      $sourceNeed[$lineKey]--
    }
  }
  $restoreObjectTypes = @{}
  $currentRestoreType = 'SECTION'
  foreach ($line in $Actual -split "`n") {
    if ($line -match '^-- Name: .*?;\s*Type:\s*(?<type>[^;]+);') { $currentRestoreType = $Matches['type'].Trim().ToUpperInvariant() }
    $lineKey = [string]$line
    if ($restoreNeed.ContainsKey($lineKey) -and $restoreNeed[$lineKey] -gt 0) {
      if (-not $restoreObjectTypes.ContainsKey($currentRestoreType)) { $restoreObjectTypes[$currentRestoreType] = 0 }
      $restoreObjectTypes[$currentRestoreType]++
      $restoreNeed[$lineKey]--
    }
  }
  $sourceTypesText = @($sourceObjectTypes.Keys | Sort-Object | ForEach-Object { $_ + ':' + $sourceObjectTypes[$_] }) -join ','
  $restoreTypesText = @($restoreObjectTypes.Keys | Sort-Object | ForEach-Object { $_ + ':' + $restoreObjectTypes[$_] }) -join ','
  $classes = @($differences | ForEach-Object {
      $line = ([string]$_.InputObject).TrimStart()
      if (-not $line) { 'EMPTY' }
      elseif ($line.StartsWith('--')) { 'COMMENT_METADATA' }
      elseif ($line.StartsWith('\')) { 'PSQL_DIRECTIVE' }
      elseif ($line -match '(?i)^CREATE\s+(?:OR\s+REPLACE\s+)?(MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE|TABLE|VIEW|SEQUENCE|INDEX|TYPE|DOMAIN|SCHEMA|TRIGGER|EXTENSION|COLLATION|POLICY|RULE|AGGREGATE)\b') {
        'CREATE_' + ($Matches[1] -replace '\s+','_').ToUpperInvariant()
      }
      elseif ($line -match '(?i)^(SET|SELECT|ALTER|COMMENT|GRANT|REVOKE|COPY|INSERT|UPDATE|DELETE|LANGUAGE|AS|RETURNS|BEGIN|END|WITH|EXECUTE)\b') {
        $Matches[1].ToUpperInvariant()
      } else { 'OTHER_SQL' }
    })
  $classCounts = @($classes | Group-Object | Sort-Object Name | ForEach-Object { $_.Name + ':' + $_.Count })
  $sourceDiffLines = @($differences | Where-Object { $_.SideIndicator -eq '<=' } | ForEach-Object { [string]$_.InputObject })
  $restoreDiffLines = @($differences | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { [string]$_.InputObject })
  $sourceIdentifiersMasked = @($sourceDiffLines | ForEach-Object { [regex]::Replace($_,'"(?:""|[^"])*"','<QIDENT>') } | Sort-Object)
  $restoreIdentifiersMasked = @($restoreDiffLines | ForEach-Object { [regex]::Replace($_,'"(?:""|[^"])*"','<QIDENT>') } | Sort-Object)
  $identifiersNormalizedEqual = @(Compare-Object -ReferenceObject $sourceIdentifiersMasked -DifferenceObject $restoreIdentifiersMasked -CaseSensitive).Count -eq 0
  $sourceShapeMasked = @($sourceDiffLines | ForEach-Object {
      $shape = [regex]::Replace($_,'"(?:""|[^"])*"','<QIDENT>')
      $shape = [regex]::Replace($shape,"'(?:''|[^'])*'",'<LITERAL>')
      [regex]::Replace($shape,'\b[0-9]+\b','<NUMBER>')
    } | Sort-Object)
  $restoreShapeMasked = @($restoreDiffLines | ForEach-Object {
      $shape = [regex]::Replace($_,'"(?:""|[^"])*"','<QIDENT>')
      $shape = [regex]::Replace($shape,"'(?:''|[^'])*'",'<LITERAL>')
      [regex]::Replace($shape,'\b[0-9]+\b','<NUMBER>')
    } | Sort-Object)
  $valuesAndIdentifiersNormalizedEqual = @(Compare-Object -ReferenceObject $sourceShapeMasked -DifferenceObject $restoreShapeMasked -CaseSensitive).Count -eq 0
  $keywordSet = @{}; foreach ($word in @('CREATE','TABLE','INDEX','CONSTRAINT','CHECK','NOT','NULL','DEFAULT','PRIMARY','KEY','REFERENCES','UNIQUE','FOREIGN','AND','OR','IS','IN','LIKE','BETWEEN','ARRAY','ANY','ALL','COLLATE','USING','WHERE','ON','WITH','NO','ACTION','SET','CASCADE','RESTRICT','DEFERRABLE','INITIALLY','IMMEDIATE','VALID','GENERATED','ALWAYS','IDENTITY','INTEGER','BIGINT','SMALLINT','TEXT','VARCHAR','CHARACTER','VARYING','BOOLEAN','TIMESTAMP','DATE','NUMERIC','FALSE','TRUE','LENGTH','CHAR_LENGTH','OCTET_LENGTH','LOWER','UPPER','BTRIM','COALESCE','JSONB_TYPEOF','REGEXP_REPLACE','REGEXP_MATCHES')) { $keywordSet[$word] = $true }
  $safeShapeEvaluator = [System.Text.RegularExpressions.MatchEvaluator]{
    param($match)
    $word = $match.Value.ToUpperInvariant()
    if ($keywordSet.ContainsKey($word)) { return $word }
    return '<IDENT>'
  }
  $safeShapes = @{}
  foreach ($entry in @(@{ Name='SOURCE'; Lines=$sourceDiffLines },@{ Name='RESTORE'; Lines=$restoreDiffLines })) {
    $safeShapes[$entry.Name] = @($entry.Lines | ForEach-Object {
        $shape = [regex]::Replace([string]$_,'"(?:""|[^"])*"','<QIDENT>')
        $shape = [regex]::Replace($shape,"'(?:''|[^'])*'",'<LITERAL>')
        $shape = [regex]::Replace($shape,'\b[0-9]+\b','<NUMBER>')
        $shape = [regex]::Replace($shape,'\b[A-Za-z_][A-Za-z0-9_$]*\b',$safeShapeEvaluator)
        ($shape -replace '\s+',' ').Trim()
      } | Sort-Object -Unique | Select-Object -First 4)
  }
  $safeSourceShapesText = @($safeShapes['SOURCE']) -join ','
  $safeRestoreShapesText = @($safeShapes['RESTORE']) -join ','
  $clauses = @($differences | ForEach-Object {
      $line = [string]$_.InputObject
      if ($line -match '(?i)\bOWNED\s+BY\b') { 'SEQUENCE_OWNERSHIP' }
      elseif ($line -match '(?i)\bOWNER\b') { 'OWNER_ATTRIBUTE' }
      elseif ($line -match '(?i)\bCOLLATE\b') { 'COLLATION' }
      elseif ($line -match '(?i)\bnextval\s*\(') { 'SEQUENCE_DEFAULT' }
      elseif ($line -match '(?i)\bTABLESPACE\b') { 'TABLESPACE' }
      elseif ($line -match '(?i)\bDEFAULT\b') { 'DEFAULT_EXPRESSION' }
      elseif ($line -match '(?i)\bNOT\s+NULL\b') { 'NOT_NULL' }
      elseif ($line -match '(?i)\bPRIMARY\s+KEY\b') { 'PRIMARY_KEY' }
      elseif ($line -match '(?i)\bFOREIGN\s+KEY\b') { 'FOREIGN_KEY' }
      elseif ($line -match '(?i)\bUNIQUE\b') { 'UNIQUE' }
      elseif ($line -match '(?i)\bCHECK\b') { 'CHECK' }
      elseif ($line -match '(?i)\bGENERATED\b|\bIDENTITY\b') { 'IDENTITY' }
      elseif ($line -match '(?i)\bUSING\b|\bINCLUDE\b') { 'INDEX_CLAUSE' }
      elseif ($line.TrimStart() -match '^"') { 'QUOTED_COLUMN_DEFINITION' }
      else { 'UNCLASSIFIED_DDL_LINE' }
    } | Group-Object | Sort-Object Name | ForEach-Object { $_.Name + ':' + $_.Count })
  return ('SOURCE_ONLY=' + $sourceOnly + '; RESTORE_ONLY=' + $restoreOnly + '; CLASSES=' + ($classCounts -join ',') +
    '; SOURCE_OBJECT_TYPES=' + $sourceTypesText + '; RESTORE_OBJECT_TYPES=' + $restoreTypesText + '; CLAUSES=' + ($clauses -join ',') +
    '; IDENTIFIERS_NORMALIZED_EQUAL=' + [string]$identifiersNormalizedEqual + '; VALUES_AND_IDENTIFIERS_NORMALIZED_EQUAL=' + [string]$valuesAndIdentifiersNormalizedEqual +
    '; SAFE_SOURCE_SHAPES=' + $safeSourceShapesText + '; SAFE_RESTORE_SHAPES=' + $safeRestoreShapesText)
}

function Get-SchemaFingerprint([string]$Database, [switch]$Temporary) {
  $pgDumpArguments = @('--format=plain','--schema-only','--no-owner','--no-privileges','--no-tablespaces','--quote-all-identifiers',
    '--no-password','--file=-','--host',$(if ($Temporary) { '127.0.0.1' } else { '127.0.0.1' }),
    '--port',$(if ($Temporary) { [string]$script:TempPort } else { '55432' }),
    '--username',$(if ($Temporary) { 'postgres' } else { 'amores_pet_homologacao_app' }),
    '--dbname',$Database)
  $result = Invoke-PgTool $script:PgDump $pgDumpArguments 'Fingerprint do esquema PostgreSQL'
  if (-not $Temporary -and -not $script:SchemaReferencePath) {
    $script:SchemaReferencePath = Join-Path $script:OperationDirectory 'schema-reference.sql'
    # On Windows, pg_dump stdout uses text-mode CRLF translation. Remove only
    # the transport CR from CRLF before writing the private SQL file; a source
    # CRLF inside a function body arrives as CRCRLF and remains CRLF here.
    $schemaReferenceText = ([string]$result.StandardOutput).Replace("`r`n","`n")
    $schemaBytes = (New-Object Text.UTF8Encoding($false)).GetBytes($schemaReferenceText)
    $schemaStream = [IO.File]::Open($script:SchemaReferencePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $schemaStream.Write($schemaBytes,0,$schemaBytes.Length); $schemaStream.Flush() } finally { $schemaStream.Dispose(); [Array]::Clear($schemaBytes,0,$schemaBytes.Length) }
    Assert-NoReparsePoint $script:SchemaReferencePath 'AP-NEON-SCHEMA-REFERENCE-PATH'
    Assert-PrivateAcl $script:SchemaReferencePath -Code 'AP-NEON-SCHEMA-REFERENCE-ACL' -Resource 'schema-reference-sql'
    $schemaItem = Get-Item -LiteralPath $script:SchemaReferencePath -Force
    if ([long]$schemaItem.Length -le 0) { Stop-Backup 'AP-NEON-SCHEMA-REFERENCE-EMPTY' 'O dump de esquema de referência ficou vazio.' }
    $script:Report.schema_reference.generated = $true
    $script:Report.schema_reference.size_bytes = [long]$schemaItem.Length
    $script:Report.schema_reference.sha256 = (Get-FileHash -LiteralPath $script:SchemaReferencePath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-PrivateReport
  }
  $text = ([string]$result.StandardOutput -replace '(?m)^-- Dumped from database version[^\r\n]*\r?\n','' -replace '(?m)^-- Dumped by pg_dump version[^\r\n]*\r?\n','')
  $text = Normalize-SchemaDumpForFingerprint $text
  if ($Temporary) { $script:LastSchemaCanonicalText = $text } else { $script:SourceSchemaCanonicalText = $text; $script:ExpectedSchemaCanonicalText = $text }
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($text)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose(); [Array]::Clear($bytes,0,$bytes.Length); $text = $null }
}

function Get-PhotoReferences {
  $sql = "SELECT COALESCE(jsonb_agg(DISTINCT foto ORDER BY foto) FILTER (WHERE foto IS NOT NULL AND btrim(foto)<>''),'[]'::jsonb)::text FROM public.pets"
  $value = ([string](Invoke-SourcePsql $sql 'Contagem das referências locais de fotos').StandardOutput).Trim()
  try { return @($value | ConvertFrom-Json -ErrorAction Stop) }
  catch { Stop-Backup 'AP-NEON-PHOTO-REFERENCE-FORMAT' 'As referências de fotos não puderam ser validadas sem exibir valores.' }
}

function Get-GalleryReferences {
  $sql = "SELECT COALESCE(jsonb_agg(DISTINCT arquivo_nome ORDER BY arquivo_nome),'[]'::jsonb)::text FROM public.site_galeria"
  $value = ([string](Invoke-SourcePsql $sql 'Contagem das referências da galeria').StandardOutput).Trim()
  try { return @($value | ConvertFrom-Json -ErrorAction Stop) }
  catch { Stop-Backup 'AP-NEON-GALLERY-REFERENCE-FORMAT' 'As referências da galeria não puderam ser validadas sem exibir valores.' }
}

function Assert-FileReferenceCoverage([object[]]$PhotoReferences, [object[]]$GalleryReferences, [object]$AssetArchive) {
  $manifest = @($AssetArchive.FileManifest)
  $petFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  $galleryFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($file in $manifest) {
    if ([string]$file.path -match '^pet-uploads/(.+)$') { [void]$petFiles.Add($Matches[1]) }
    if ([string]$file.path -match '^site-gallery-(?:default|custom)/(.+)$') { [void]$galleryFiles.Add($Matches[1]) }
  }
  foreach ($reference in $PhotoReferences) {
    $value = [string]$reference
    if ($value -notmatch '^/uploads/pets/(?<name>[A-Za-z0-9][A-Za-z0-9._-]{0,179})$' -or -not $petFiles.Contains($Matches['name'])) {
      Stop-Backup 'AP-NEON-PHOTO-REFERENCE-MISSING' 'Uma referência de foto do Pet não corresponde a arquivo incluído no backup privado.'
    }
  }
  foreach ($reference in $GalleryReferences) {
    $value = [string]$reference
    if ($value -notmatch '^[a-f0-9-]{36}\.(jpg|png|webp)$' -or -not $galleryFiles.Contains($value)) {
      Stop-Backup 'AP-NEON-GALLERY-REFERENCE-MISSING' 'Uma referência da Galeria não corresponde a arquivo incluído no backup privado.'
    }
  }
}

function Get-FreeLoopbackPort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    $port = [int]$listener.LocalEndpoint.Port
    if ($port -in @(3001,5432,55432)) { Stop-Backup 'AP-NEON-TEMP-PORT' 'A porta descartável coincidiu com uma porta protegida.' }
    return $port
  } finally { $listener.Stop() }
}

function Assert-TemporaryIdentity([string]$Database) {
  $sql = "SELECT current_database() || '|' || current_user || '|' || host(inet_server_addr()) || '|' || inet_server_port()::text || '|' || current_setting('server_version_num') || '|' || extract(epoch FROM pg_postmaster_start_time())::bigint::text"
  $line = ([string](Invoke-TemporaryPsql $Database $sql 'Identidade do cluster descartável').StandardOutput).Trim()
  $parts = $line -split '\|', 6
  $version = 0; $port = 0; $epoch = [long]0
  if ($parts.Count -ne 6 -or -not [int]::TryParse($parts[3], [ref]$port) -or -not [int]::TryParse($parts[4], [ref]$version) -or -not [long]::TryParse($parts[5], [ref]$epoch)) {
    Stop-Backup 'AP-NEON-TEMP-IDENTITY-FORMAT' 'A identidade da cópia descartável retornou formato inesperado.'
  }
  if ($parts[0] -cne $Database -or $parts[1] -cne 'postgres' -or $parts[2] -cne '127.0.0.1' -or
      $port -ne $script:TempPort -or $version -lt 170000 -or $version -ge 180000) {
    Stop-Backup 'AP-NEON-TEMP-IDENTITY-MISMATCH' 'A conexão de restauração não corresponde ao cluster PostgreSQL 17 descartável.'
  }
  $postmaster = Get-AmoresPetPostmasterIdentity -Path (Join-Path $script:TempDataDirectory 'postmaster.pid') `
    -ExpectedDataDirectory $script:TempDataDirectory -ExpectedPort $script:TempPort -ExpectedListenAddress '127.0.0.1' -ExpectedStartEpoch $epoch
  $expectedExe = [IO.Path]::GetFullPath($script:PostgresExe)
  $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $postmaster.ProcessId `
    -ExpectedExecutable $expectedExe -ExpectedDataDirectory $script:TempDataDirectory `
    -ExpectedListenAddress '127.0.0.1' -ExpectedPort $script:TempPort
  $script:Report.temporary_cluster.identity_validated = $true
}

function Get-DatabaseLocale([string]$Database) {
  $sql = "SELECT CASE WHEN datlocprovider='b' THEN COALESCE(datlocale,'') || '|' || COALESCE(datlocale,'') || '|builtin|' || COALESCE(datlocale,'') ELSE COALESCE(datcollate,'') || '|' || COALESCE(datctype,'') || '|' || CASE datlocprovider WHEN 'c' THEN 'libc' WHEN 'i' THEN 'icu' ELSE 'unknown' END || '|' || COALESCE(datlocale,'') END FROM pg_database WHERE datname=current_database()"
  return ([string](Invoke-TemporaryPsql $Database $sql 'Verificação da collation descartável').StandardOutput).Trim()
}

function Compare-DatabaseCopy([string]$Database, [object]$ExpectedMetadata, [object]$ExpectedData, [object]$ExpectedSequences, [string]$ExpectedFunctionFingerprint, [string]$ExpectedSchemaHash, [bool]$AllowNeonCollation) {
  $actualMetadata = Get-SourceMetadata -Database $Database -Temporary
  $actualData = Get-DataSnapshot -Database $Database -Temporary
  $actualSequences = Get-SequenceSnapshot -Database $Database -Temporary
  $actualSequenceMetadata = Get-SequenceMetadata -Database $Database -Temporary
  $actualFunctionFingerprint = Get-FunctionDefinitionFingerprint -Database $Database -Temporary
  $actualSchemaHash = Get-SchemaFingerprint -Database $Database -Temporary

  foreach ($field in @('schemas','tables','views','indexes','sequences','foreign_keys','foreign_keys_unvalidated','triggers','triggers_disabled','functions','security_definer_functions','extensions',
      'migration_035_tables','migration_035_views','migration_036_authorizations','migration_036_file_queue','migration_037_function','migration_037_super_admin')) {
    if ([string]$actualMetadata.$field -cne [string]$ExpectedMetadata.$field) {
      Stop-Backup 'AP-NEON-STRUCTURE-MISMATCH' 'Contagens, definições ou assinaturas estruturais divergiram após a restauração.'
    }
  }
  if ([string]$actualMetadata.encoding -cne [string]$ExpectedMetadata.encoding -or
      [string]$actualMetadata.timezone -cne 'America/Sao_Paulo') {
    Stop-Backup 'AP-NEON-RESTORE-SETTINGS' 'Codificação ou fuso da cópia descartável não corresponde ao comportamento validado da origem.'
  }
  if (-not $AllowNeonCollation -and ([string]$actualMetadata.collation -cne [string]$ExpectedMetadata.collation -or
      [string]$actualMetadata.ctype -cne [string]$ExpectedMetadata.ctype -or
      [string]$actualMetadata.locale_provider -cne [string]$ExpectedMetadata.locale_provider)) {
    Stop-Backup 'AP-NEON-RESTORE-LOCALE' 'A restauração C/libc não reproduziu a collation da origem.'
  }
  if ($AllowNeonCollation -and ([string]$actualMetadata.locale_provider -cne 'builtin' -or
      [string]$actualMetadata.locale -cne 'C.UTF-8' -or [string]$actualMetadata.encoding -cne 'UTF8')) {
    Stop-Backup 'AP-NEON-TARGET-LOCALE' 'A cópia descartável não reproduziu a collation informada para Neon.'
  }
  foreach ($field in @('TableCount','RowCount','FingerprintA','FingerprintB')) {
    if ([decimal]$actualData.$field -ne [decimal]$ExpectedData.$field) {
      Stop-Backup 'AP-NEON-DATA-MISMATCH' 'Contagem ou fingerprint dos dados divergiu após a restauração.'
    }
  }
  if ([long]$actualSequences.Count -ne [long]$ExpectedSequences.Count -or
      [string]$actualSequences.Fingerprint -cne [string]$ExpectedSequences.Fingerprint) {
    Stop-Backup 'AP-NEON-SEQUENCE-MISMATCH' 'Os estados das sequences não foram preservados integralmente.'
  }
  if ($actualFunctionFingerprint -cne $ExpectedFunctionFingerprint) {
    Stop-Backup 'AP-NEON-FUNCTION-FINGERPRINT-MISMATCH' 'As definições de funções da origem e da restauração divergiram.'
  }
  $expectedSequenceJson = ConvertTo-Json -InputObject $ExpectedSequences.Metadata -Depth 8 -Compress
  $actualSequenceJson = ConvertTo-Json -InputObject $actualSequenceMetadata -Depth 8 -Compress
  if ($expectedSequenceJson -cne $actualSequenceJson) { Stop-Backup 'AP-NEON-SEQUENCE-DEFINITION-MISMATCH' 'Definições das sequences divergiram após a restauração.' }
  if ($actualSchemaHash -cne $ExpectedSchemaHash) {
    $script:Report.schema_fingerprint_diff = Get-SchemaFingerprintDifferenceSummary -Expected $script:ExpectedSchemaCanonicalText -Actual $script:LastSchemaCanonicalText
    Stop-Backup 'AP-NEON-SCHEMA-FINGERPRINT-MISMATCH' ('Fingerprint do esquema divergiu após a restauração; ' + [string]$script:Report.schema_fingerprint_diff + '.')
  }
  if ([int]$actualMetadata.foreign_keys_unvalidated -ne 0) { Stop-Backup 'AP-NEON-FK-UNVALIDATED' 'A cópia restaurada contém chaves estrangeiras não validadas.' }

  return [pscustomobject]@{ Metadata = $actualMetadata; Data = $actualData; Sequences = $actualSequences; SchemaHash = $actualSchemaHash }
}

function Get-StorageRoots([string]$BackendRoot, [string]$RuntimeDirectory) {
  $environment = @{}
  foreach ($key in @('FILE_STORAGE_MODE','SITE_GALLERY_STORAGE_DIR')) {
    $value = [Environment]::GetEnvironmentVariable($key,'Process')
    if (-not [string]::IsNullOrWhiteSpace($value)) { $environment[$key] = $value }
  }
  try { return @(Resolve-AmoresPetNeonStorageRoots -Environment $environment -BackendRoot $BackendRoot -RuntimeDirectory $RuntimeDirectory) }
  catch {
    switch -Exact ([string]$_.Exception.Message) {
      'AP-NEON-ASSET-STORAGE-MODE' { Stop-Backup 'AP-NEON-ASSET-STORAGE-MODE' 'O modo de armazenamento local não é reconhecido.' }
      'AP-NEON-ASSET-REMOTE-STORE' { Stop-Backup 'AP-NEON-ASSET-REMOTE-STORE' 'O armazenamento S3 está habilitado; nenhum objeto remoto foi consultado nem copiado.' }
      'AP-NEON-ASSET-GALLERY-PATH' { Stop-Backup 'AP-NEON-ASSET-GALLERY-PATH' 'O diretório personalizado da Galeria coincide com uploads privados ou diretórios públicos.' }
      'AP-NEON-ASSET-GALLERY-OVERLAP' { Stop-Backup 'AP-NEON-ASSET-GALLERY-OVERLAP' 'O diretório personalizado da Galeria sobrepõe o diretório padrão.' }
      default { Stop-Backup 'AP-NEON-ASSET-ROOT-RESOLUTION' 'Os diretórios de arquivos locais não puderam ser resolvidos com segurança.' }
    }
  }
}

function Start-DisposableRestore([string]$BackupPath, [object]$ExpectedMetadata, [object]$ExpectedData, [object]$ExpectedSequences, [string]$ExpectedFunctionFingerprint) {
  $script:TempDataDirectory = Join-Path $script:OperationDirectory ('preflight\cluster-' + [guid]::NewGuid().ToString('N'))
  $preflightRoot = Split-Path -Parent $script:TempDataDirectory
  New-PrivateDirectory $preflightRoot
  [void][IO.Directory]::CreateDirectory($script:TempDataDirectory)
  Assert-NoReparsePoint $script:TempDataDirectory
  Assert-PrivateAcl $script:TempDataDirectory -Resource 'cluster-descartavel'
  $script:Report.temporary_cluster.created = $true
  $script:TempPort = Get-FreeLoopbackPort
  $script:TempDatabaseSchemaReference = 'neon_schema_reference_' + [guid]::NewGuid().ToString('N')
  $script:TempDatabaseC = 'neon_restore_c_' + [guid]::NewGuid().ToString('N')
  $script:TempDatabaseBuiltin = 'neon_restore_builtin_' + [guid]::NewGuid().ToString('N')

  Set-Phase 'initdb PostgreSQL 17 descartável'
  $null = Invoke-PgTool $script:InitDb @('-D',$script:TempDataDirectory,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8','--locale-provider=libc') 'Inicialização do cluster descartável'
  $script:Report.temporary_cluster.initialized = $true
  $logPath = Join-Path $preflightRoot 'postgres-temporary.log'
  $options = '-h 127.0.0.1 -p ' + [string]$script:TempPort + ' -c timezone=America/Sao_Paulo'
  Set-Phase 'inicializacao do cluster PostgreSQL 17 descartavel'
  $null = Invoke-PgTool $script:PgCtl @('-D',$script:TempDataDirectory,'-o',$options,'-l',$logPath,'-w','-t','45','start') 'Inicialização do PostgreSQL descartável' -NoCapture
  $script:TempClusterStarted = $true
  $script:Report.temporary_cluster.started = $true
  Set-Phase 'validacao da identidade do cluster PostgreSQL 17 descartavel'
  Assert-TemporaryIdentity 'postgres'

  Set-Phase 'criação dos destinos temporários com locale compatível'
  $createReference = "CREATE DATABASE $($script:TempDatabaseSchemaReference) WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' LOCALE_PROVIDER libc"
  $null = Invoke-TemporaryPsql 'postgres' $createReference 'Criação do schema de referência descartável'
  $createC = "CREATE DATABASE $($script:TempDatabaseC) WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' LOCALE_PROVIDER libc"
  $null = Invoke-TemporaryPsql 'postgres' $createC 'Criação do destino C/libc descartável'
  $createBuiltin = "CREATE DATABASE $($script:TempDatabaseBuiltin) WITH TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'"
  $null = Invoke-TemporaryPsql 'postgres' $createBuiltin 'Criação do destino C.UTF-8/builtin descartável'

  Set-Phase 'restauracao do schema de referencia no PostgreSQL descartavel'
  $schemaRestoreArgs = @('-X','-w','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','--single-transaction',
    '--host','127.0.0.1','--port',[string]$script:TempPort,'--username','postgres','--dbname',$script:TempDatabaseSchemaReference,'--file',$script:SchemaReferencePath)
  $null = Invoke-PgTool $script:Psql $schemaRestoreArgs 'Restauração do schema de referência descartável'
  $script:Report.schema_reference.restored = $true
  $referenceMetadata = Get-SourceMetadata -Database $script:TempDatabaseSchemaReference -Temporary
  foreach ($field in @('schemas','tables','views','indexes','sequences','foreign_keys','foreign_keys_unvalidated','triggers','triggers_disabled','functions','security_definer_functions','extensions',
      'migration_035_tables','migration_035_views','migration_036_authorizations','migration_036_file_queue','migration_037_function','migration_037_super_admin')) {
    if ([string]$referenceMetadata.$field -cne [string]$ExpectedMetadata.$field) {
      Stop-Backup 'AP-NEON-SCHEMA-REFERENCE-METADATA' 'A restauração do schema de referência divergiu dos metadados estruturais da origem.'
    }
  }
  if ([string]$referenceMetadata.encoding -cne 'UTF8' -or [string]$referenceMetadata.collation -cne 'C' -or
      [string]$referenceMetadata.ctype -cne 'C' -or [string]$referenceMetadata.locale_provider -cne 'libc') {
    Stop-Backup 'AP-NEON-SCHEMA-REFERENCE-LOCALE' 'O schema de referência não foi restaurado na locale C/libc esperada.'
  }
  $script:Report.schema_reference.metadata_compared = $true
  $referenceFunctionFingerprint = Get-FunctionDefinitionFingerprint -Database $script:TempDatabaseSchemaReference -Temporary
  if ($referenceFunctionFingerprint -cne $ExpectedFunctionFingerprint) {
    $sourceFunctionComponents = Get-FunctionDefinitionComponentSnapshot 'amores_pet_homologacao'
    $referenceFunctionComponents = Get-FunctionDefinitionComponentSnapshot $script:TempDatabaseSchemaReference -Temporary
    $script:Report.function_fingerprint_diff = Compare-FunctionDefinitionComponents $sourceFunctionComponents $referenceFunctionComponents
    Write-PrivateReport
    Stop-Backup 'AP-NEON-SCHEMA-REFERENCE-FUNCTIONS' ('As definições de funções do dump de referência divergem da origem; comparação sanitizada=' + [string]$script:Report.function_fingerprint_diff + '.')
  }
  $referenceSchemaHash = Get-SchemaFingerprint -Database $script:TempDatabaseSchemaReference -Temporary
  $script:ExpectedSchemaCanonicalText = $script:LastSchemaCanonicalText
  Write-PrivateReport

  foreach ($database in @($script:TempDatabaseC,$script:TempDatabaseBuiltin)) {
    $target = if ($database -ceq $script:TempDatabaseC) { $script:Report.restore_libc } else { $script:Report.restore_neon_collation }
    $target.started = $true
    Set-Phase ('pg_restore e comparação em ' + [string]$target.collation)
    $restoreArgs = @('--exit-on-error','--no-owner','--no-privileges','--no-password','--host','127.0.0.1',
      '--port',[string]$script:TempPort,'--username','postgres','--dbname',$database,$BackupPath)
    $null = Invoke-PgTool $script:PgRestore $restoreArgs ('Restauração completa descartável ' + [string]$target.collation)
    $target.completed = $true
    Set-Phase ('comparacao de estrutura, dados e sequences em ' + [string]$target.collation)
    Assert-TemporaryIdentity $database
    $comparison = Compare-DatabaseCopy -Database $database -ExpectedMetadata $ExpectedMetadata -ExpectedData $ExpectedData `
      -ExpectedSequences $ExpectedSequences -ExpectedFunctionFingerprint $ExpectedFunctionFingerprint -ExpectedSchemaHash $referenceSchemaHash `
      -AllowNeonCollation:($database -ceq $script:TempDatabaseBuiltin)
    $target.compared = $true
    if ($database -ceq $script:TempDatabaseC) { $script:Report.schema_reference.fingerprint_compared = $true }
    if ($database -ceq $script:TempDatabaseC) {
      $script:Report.preflight.relational_integrity_validated = ([int]$comparison.Metadata.foreign_keys_unvalidated -eq 0)
    }
  }
  $script:Report.preflight.restore_tested = $true
  $script:Report.preflight.structures_compared = $true
  $script:Report.preflight.data_compared = $true
  $script:Report.preflight.sequence_states_compared = $true
}

function Stop-And-RemoveTemporaryCluster {
  if (-not $script:TempDataDirectory) { return }
  if ($script:TempClusterStarted -and -not $script:TempClusterStopped) {
    $pidPath = Join-Path $script:TempDataDirectory 'postmaster.pid'
    if (Test-Path -LiteralPath $pidPath -PathType Leaf) {
      try {
        $pidInfo = Get-AmoresPetPostmasterIdentity -Path $pidPath -ExpectedDataDirectory $script:TempDataDirectory `
          -ExpectedPort $script:TempPort -ExpectedListenAddress '127.0.0.1'
        $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $pidInfo.ProcessId `
          -ExpectedExecutable $script:PostgresExe -ExpectedDataDirectory $script:TempDataDirectory `
          -ExpectedListenAddress '127.0.0.1' -ExpectedPort $script:TempPort
      } catch {
        $script:Report.temporary_cluster.stopped = $false
        return
      }
      $null = Invoke-PgTool $script:PgCtl @('-D',$script:TempDataDirectory,'-m','fast','-w','-t','45','stop') 'Encerramento do cluster descartável' -NoCapture
    }
    $script:TempClusterStopped = $true
    $script:Report.temporary_cluster.stopped = $true
  }

  if (-not $script:TempClusterStopped -or (Test-Path -LiteralPath (Join-Path $script:TempDataDirectory 'postmaster.pid'))) { return }
  $full = [IO.Path]::GetFullPath($script:TempDataDirectory)
  $allowed = [IO.Path]::GetFullPath((Join-Path $script:OperationDirectory 'preflight')).TrimEnd('\') + '\'
  if (-not $full.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetFileName($full) -notmatch '^cluster-[a-f0-9]{32}$') { return }
  Remove-Item -LiteralPath $full -Recurse -Force
  if (Test-Path -LiteralPath $full) { return }
  $preflightRoot = Split-Path -Parent $full
  if ((Test-Path -LiteralPath $preflightRoot) -and
      [IO.Path]::GetFullPath($preflightRoot).StartsWith([IO.Path]::GetFullPath($script:OperationDirectory).TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $preflightRoot -Recurse -Force
  }
  $script:Report.temporary_cluster.removed = $true
}

try {
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -lt 1) {
    Stop-Backup 'AP-NEON-POWERSHELL-VERSION' 'O executor requer Windows PowerShell 5.1 ou posterior.'
  }
  Import-Module (Join-Path $PSScriptRoot 'Acl-Privada.psm1') -Force -ErrorAction Stop
  Import-Module (Join-Path $PSScriptRoot 'Postmaster-Identity.psm1') -Force -ErrorAction Stop
  Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force -ErrorAction Stop
  Import-Module (Join-Path $PSScriptRoot 'Neon-Backup-Arquivos.psm1') -Force -ErrorAction Stop

  $script:CurrentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $script:AllowedSids = @($script:CurrentSid,'S-1-5-18')
  $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Stop-Backup 'AP-NEON-ELEVATED' 'Execute pela conta Windows proprietária sem elevação administrativa.'
  }
  if (-not $env:LOCALAPPDATA) { Stop-Backup 'AP-NEON-LOCALAPPDATA' 'LOCALAPPDATA não está definido.' }

  Set-Phase 'validacao da raiz privada e da configuracao'
  $script:PrivateRoot = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
  $script:ConfigPath = Join-Path $script:PrivateRoot 'config.json'
  Assert-NoReparsePoint $script:PrivateRoot 'AP-NEON-PRIVATE-ROOT'
  Assert-PrivateAcl $script:PrivateRoot -RequireProtected -Code 'AP-NEON-PRIVATE-ROOT-ACL' -Resource 'raiz-privada'
  Assert-NoReparsePoint $script:ConfigPath 'AP-NEON-CONFIG'
  Assert-PrivateAcl $script:ConfigPath -Code 'AP-NEON-CONFIG-ACL' -Resource 'configuracao-privada'

  Set-Phase 'validacao e criacao do diretorio privado de backup'
  $backupParent = Join-Path $script:PrivateRoot 'neon-backups'
  New-PrivateDirectory $backupParent
  if ([IO.Path]::GetFullPath($backupParent).StartsWith($script:RepoRoot.TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase)) {
    Stop-Backup 'AP-NEON-BACKUP-IN-GIT' 'O destino privado calculado está dentro do repositório Git.'
  }
  $runName = 'neon-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N')
  $script:OperationDirectory = Join-Path $backupParent $runName
  [void][IO.Directory]::CreateDirectory($script:OperationDirectory)
  Assert-NoReparsePoint $script:OperationDirectory
  Assert-PrivateAcl $script:OperationDirectory -Resource 'diretorio-da-execucao'
  $script:ReportPath = Join-Path $script:OperationDirectory 'relatorio-neon-backup.json'
  $script:SafeReportPath = Join-Path $script:OperationDirectory 'relatorio-sanitizado.txt'
  Write-PrivateReport

  Save-And-ClearPgEnvironment
  $config = Get-Content -LiteralPath $script:ConfigPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  $script:Pg = $config.postgres
  if ([int]$config.version -ne 1 -or $script:Pg.host -cne '127.0.0.1' -or [int]$script:Pg.port -ne 55432 -or
      $script:Pg.database -cne 'amores_pet_homologacao' -or $script:Pg.user -cne 'amores_pet_homologacao_app' -or
      [string]$script:Pg.password -notmatch '^[A-Za-z0-9_-]{32,}$' -or [string]$script:Pg.clusterId -notmatch '^[a-f0-9-]{36}$') {
    Stop-Backup 'AP-NEON-CONFIG-MISMATCH' 'A configuração privada não corresponde à origem fixa de homologação.'
  }
  $script:DataDirectory = Assert-ManagedSourceDirectory ([string]$script:Pg.dataDirectory)
  Assert-PrivateAcl $script:DataDirectory -AllowAdministrators -Code 'AP-NEON-SOURCE-DATADIR-ACL'
  $versionPath = Join-Path $script:DataDirectory 'PG_VERSION'
  Assert-NoReparsePoint $versionPath 'AP-NEON-PG-VERSION'
  Assert-PrivateAcl $versionPath -AllowAdministrators -Code 'AP-NEON-PG-VERSION-ACL'
  if ((Get-Content -LiteralPath $versionPath -Raw).Trim() -cne '17') { Stop-Backup 'AP-NEON-SOURCE-PG-MAJOR' 'O cluster de origem não é PostgreSQL 17.' }
  $markerPath = Join-Path $script:DataDirectory '.amores-homologacao-cluster.json'
  Assert-NoReparsePoint $markerPath 'AP-NEON-SOURCE-MARKER'
  Assert-PrivateAcl $markerPath -AllowAdministrators -Code 'AP-NEON-SOURCE-MARKER-ACL'
  $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json -ErrorAction Stop
  if ($marker.formato -cne 'amores-pet-homologacao-v1' -or [string]$marker.clusterId -cne [string]$script:Pg.clusterId) {
    Stop-Backup 'AP-NEON-CLUSTER-MARKER-MISMATCH' 'O marcador e a configuração privada identificam clusters diferentes.'
  }

  $script:PgCtl = [IO.Path]::GetFullPath([string]$script:Pg.pgCtlPath)
  $script:Psql = [IO.Path]::GetFullPath([string]$script:Pg.psqlPath)
  if ([IO.Path]::GetDirectoryName($script:PgCtl) -ine [IO.Path]::GetDirectoryName($script:Psql)) {
    Stop-Backup 'AP-NEON-PG-TOOLS-MISMATCH' 'pg_ctl e psql não pertencem à mesma instalação PostgreSQL.'
  }
  $pgBin = Split-Path -Parent $script:PgCtl
  $script:PgDump = Join-Path $pgBin 'pg_dump.exe'
  $script:PgRestore = Join-Path $pgBin 'pg_restore.exe'
  $script:InitDb = Join-Path $pgBin 'initdb.exe'
  $script:PostgresExe = Join-Path $pgBin 'postgres.exe'
  foreach ($tool in @($script:PgCtl,$script:Psql,$script:PgDump,$script:PgRestore,$script:InitDb,$script:PostgresExe)) {
    Assert-NoReparsePoint $tool 'AP-NEON-PG-TOOL-MISSING' | Out-Null
  }
  foreach ($tool in @($script:Psql,$script:PgDump,$script:PgRestore,$script:InitDb,$script:PgCtl,$script:PostgresExe)) {
    $version = Invoke-PgTool $tool @('--version') 'Versão da ferramenta PostgreSQL'
    if ($version.StandardOutput -notmatch '\(PostgreSQL\)\s+17(?:\.|\s)') {
      Stop-Backup 'AP-NEON-PG-TOOL-VERSION' 'As ferramentas PostgreSQL necessárias não são da versão 17.'
    }
  }

  Set-Phase 'validacao do armazenamento local e preparação dos arquivos externos'
  $backendRoot = Join-Path $script:RepoRoot 'backend'
  $runtimeDirectory = Join-Path $script:PrivateRoot 'runtime'
  $assetRoots = Get-StorageRoots -BackendRoot $backendRoot -RuntimeDirectory $runtimeDirectory
  $assetPath = Join-Path $script:OperationDirectory 'arquivos-externos-homologacao.zip'
  $assetResult = New-AmoresPetNeonAssetArchive -Roots $assetRoots -ArchivePath $assetPath
  Assert-NoReparsePoint $assetPath 'AP-NEON-ASSET-ARCHIVE'
  Assert-PrivateAcl $assetPath -Code 'AP-NEON-ASSET-ACL'
  $assetHash = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $petTree = Get-AmoresPetNeonAssetTree -Path (Join-Path $backendRoot 'src\uploads\pets')
  if (-not $petTree.Present -or [long]$petTree.ImageCount -ne 3 -or [long]$petTree.ImageBytes -ne 504118) {
    Stop-Backup 'AP-NEON-PET-FILES-INVENTORY-DRIFT' 'A quantidade ou tamanho das imagens de Pet diverge do inventário confirmado; os arquivos não foram modificados.'
  }
  $script:Report.assets.created = $true
  $script:Report.assets.files = [long]$assetResult.FileCount
  $script:Report.assets.total_bytes = [long]$assetResult.TotalBytes
  $script:Report.assets.sha256 = $assetHash
  $script:Report.assets.private_acl_validated = $true
  Write-PrivateReport

  Set-Phase 'validacao da identidade SQL local e estado de migrations'
  $script:PassFile = New-PrivatePassfile
  $env:PGPASSFILE = $script:PassFile
  $env:PGCONNECT_TIMEOUT = '5'
  $env:PGCLIENTENCODING = 'UTF8'
  $env:PGAPPNAME = 'amores_pet_neon_backup_readonly'
  $null = Invoke-PgTool $script:PgCtl @('-D',$script:DataDirectory,'status') 'Identificação do cluster PostgreSQL persistente'
  $script:Identity = Assert-LiveSourceIdentity
  $script:Report.source.cluster_validated = $true
  $script:Report.source.server_version_num = $script:Identity.VersionNum
  $script:Report.source.timezone = $script:Identity.TimeZone
  $sourceMetadata = Get-SourceMetadata 'amores_pet_homologacao'
  if ([string]$sourceMetadata.locale_provider -cne 'libc' -or [string]$sourceMetadata.collation -cne 'C' -or
      [string]$sourceMetadata.ctype -cne 'C' -or [string]$sourceMetadata.encoding -cne 'UTF8' -or
      [int]$sourceMetadata.foreign_keys_unvalidated -ne 0 -or [bool]$sourceMetadata.app_role_superuser) {
    Stop-Backup 'AP-NEON-SOURCE-METADATA' 'Metadados de locale, integridade ou privilégio da origem divergem do inventário autorizado.'
  }
  Get-MigrationAssertions $sourceMetadata
  $sourceData = Get-DataSnapshot 'amores_pet_homologacao'
  $sourceSequences = Get-SequenceSnapshot 'amores_pet_homologacao'
  $sourceSequenceMetadata = Get-SequenceMetadata 'amores_pet_homologacao'
  $sourceFunctionFingerprint = Get-FunctionDefinitionFingerprint 'amores_pet_homologacao'
  $sourceSchemaHash = Get-SchemaFingerprint 'amores_pet_homologacao'
  $script:Report.source_snapshot = [ordered]@{
    database_bytes = [long]$sourceMetadata.database_bytes
    schemas = [long]$sourceMetadata.schemas; tables = [long]$sourceMetadata.tables; views = [long]$sourceMetadata.views
    indexes = [long]$sourceMetadata.indexes; sequences = [long]$sourceMetadata.sequences
    foreign_keys = [long]$sourceMetadata.foreign_keys; triggers = [long]$sourceMetadata.triggers
    functions = [long]$sourceMetadata.functions; extensions = [string]$sourceMetadata.extensions
    data_table_count = [long]$sourceData.TableCount; data_row_count = [decimal]$sourceData.RowCount
    sequence_count = [long]$sourceSequences.Count; schema_sha256 = $sourceSchemaHash
    timezone = [string]$sourceMetadata.timezone; collation = [string]$sourceMetadata.collation
    locale_provider = [string]$sourceMetadata.locale_provider
    app_role_superuser = [bool]$sourceMetadata.app_role_superuser
    app_role_database_owner = [bool]$sourceMetadata.app_role_database_owner
    app_role_public_schema_owner = [bool]$sourceMetadata.app_role_public_schema_owner
    app_role_owned_objects = [long]$sourceMetadata.app_role_owned_objects
    app_role_connect = [bool]$sourceMetadata.app_role_connect
    app_role_schema_usage = [bool]$sourceMetadata.app_role_schema_usage
    app_role_schema_create = [bool]$sourceMetadata.app_role_schema_create
    app_role_tables_select = [long]$sourceMetadata.app_role_tables_select
    app_role_sequences_usage = [long]$sourceMetadata.app_role_sequences_usage
    sequence_definition_count = [long]@($sourceSequenceMetadata).Count
  }
  $script:Report.source.stability_checked_before_and_after_dump = $false

  $photoReferences = Get-PhotoReferences
  $galleryReferences = Get-GalleryReferences
  Assert-FileReferenceCoverage -PhotoReferences $photoReferences -GalleryReferences $galleryReferences -AssetArchive $assetResult
  $script:Report.assets.references_validated = $true
  Write-PrivateReport

  Set-Phase 'geracao do backup custom somente leitura'
  $backupPath = Join-Path $script:OperationDirectory 'amores_pet_homologacao.custom'
  $dumpArgs = @('--format=custom','--serializable-deferrable','--no-password','--host','127.0.0.1','--port','55432',
    '--username','amores_pet_homologacao_app','--dbname','amores_pet_homologacao','--file',$backupPath)
  $script:Report.backup.pg_dump_started = $true
  Write-PrivateReport
  $dump = Invoke-PgTool $script:PgDump $dumpArgs 'pg_dump completo da homologação'
  $script:Report.backup.pg_dump_completed = $true
  if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) { Stop-Backup 'AP-NEON-BACKUP-MISSING' 'pg_dump terminou sem criar o arquivo esperado.' }
  Assert-NoReparsePoint $backupPath 'AP-NEON-BACKUP-PATH'
  Assert-PrivateAcl $backupPath -Code 'AP-NEON-BACKUP-ACL'
  $backupItem = Get-Item -LiteralPath $backupPath -Force
  if ([long]$backupItem.Length -le 0) { Stop-Backup 'AP-NEON-BACKUP-EMPTY' 'pg_dump produziu um arquivo vazio.' }
  $script:Report.backup.created = $true
  $script:Report.backup.size_bytes = [long]$backupItem.Length
  $script:Report.backup.sha256 = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $script:Report.backup.private_acl_validated = $true
  Write-PrivateReport

  Set-Phase 'validacao do formato e catalogo custom'
  $catalog = Invoke-PgTool $script:PgRestore @('--list',$backupPath) 'pg_restore --list'
  $catalogAssessment = Test-AmoresPetCustomArchiveCatalog -CatalogOutput ([string]$catalog.StandardOutput) -ArchiveSize ([long]$backupItem.Length)
  if (-not $catalogAssessment.Success) { Stop-Backup ([string]$catalogAssessment.Code) 'O catálogo não confirmou um archive custom completo.' }
  $script:Report.backup.catalog_validated = $true
  Write-PrivateReport

  Set-Phase 'verificacao de estabilidade da origem apos pg_dump'
  $afterData = Get-DataSnapshot 'amores_pet_homologacao'
  $afterSequences = Get-SequenceSnapshot 'amores_pet_homologacao'
  $afterMetadata = Get-SourceMetadata 'amores_pet_homologacao'
  $afterSchemaHash = Get-SchemaFingerprint 'amores_pet_homologacao'
  $afterFunctionFingerprint = Get-FunctionDefinitionFingerprint 'amores_pet_homologacao'
  foreach ($field in @('TableCount','RowCount','FingerprintA','FingerprintB')) {
    if ([decimal]$sourceData.$field -ne [decimal]$afterData.$field) { Stop-Backup 'AP-NEON-SOURCE-CHANGED' 'Os dados da origem mudaram durante o backup; o artefato foi preservado, mas não aprovado.' }
  }
  if ([string]$sourceSequences.Fingerprint -cne [string]$afterSequences.Fingerprint -or
      [long]$sourceMetadata.database_bytes -ne [long]$afterMetadata.database_bytes -or
      [string]$sourceSchemaHash -cne [string]$afterSchemaHash -or
      [string]$sourceFunctionFingerprint -cne [string]$afterFunctionFingerprint) {
    Stop-Backup 'AP-NEON-SOURCE-CHANGED' 'O estado da origem mudou durante a captura; o artefato foi preservado, mas não aprovado.'
  }
  $script:Report.source.stability_checked_before_and_after_dump = $true

  Set-Phase 'preflight de restauracao em PostgreSQL 17 descartavel'
  Start-DisposableRestore -BackupPath $backupPath -ExpectedMetadata $sourceMetadata -ExpectedData $sourceData `
    -ExpectedSequences ([pscustomobject]@{ Count = $sourceSequences.Count; Fingerprint = $sourceSequences.Fingerprint; Metadata = $sourceSequenceMetadata }) `
    -ExpectedFunctionFingerprint $sourceFunctionFingerprint
  $script:Report.preflight.approved = $true
  Stop-And-RemoveTemporaryCluster
  if (-not $script:Report.temporary_cluster.stopped -or -not $script:Report.temporary_cluster.removed) {
    Stop-Backup 'AP-NEON-TEMP-CLEANUP-INCOMPLETE' 'O cluster descartável não foi encerrado e removido com identidade comprovada; backup persistente permanece preservado.'
  }

  $script:Report.status = 'APROVADO'
  $script:Code = 'AP-NEON-BACKUP-OK'
  $script:Report.technical_code = $script:Code
  $script:Report.error = 'Backup local e arquivo separado de fotos validados; Neon não foi conectado.'
  Write-PrivateReport
  Write-Host 'BACKUP_NEON_STATUS=APROVADO' -ForegroundColor Green
  Write-Host ('BACKUP_BYTES=' + [string]$script:Report.backup.size_bytes)
  Write-Host ('BACKUP_SHA256=' + [string]$script:Report.backup.sha256)
  Write-Host ('ARQUIVOS_EXTERNOS=' + [string]$script:Report.assets.files + '; BYTES=' + [string]$script:Report.assets.total_bytes)
  Write-Host ('ARQUIVOS_EXTERNOS_SHA256=' + [string]$script:Report.assets.sha256)
  Write-Host 'RESTORE_PG17_C_LIBC=APROVADO; RESTORE_PG17_C_UTF8_BUILTIN=APROVADO'
  Write-Host 'MIGRATIONS_035_036_037=CONFIRMADAS_POR_ASSINATURA_SQL'
  Write-Host 'ORIGEM_MODIFICADA=NAO; SISTEMA_PETSHOP_CONECTADO=NAO; NEON_CONECTADO=NAO'
  Write-Host ('BACKUP_PRIVADO=%LOCALAPPDATA%\AmoresPet\Homologacao\neon-backups\' + $runName)
  Write-Host ('RELATORIO_SANITIZADO=%LOCALAPPDATA%\AmoresPet\Homologacao\neon-backups\' + $runName + '\relatorio-sanitizado.txt')
  if (-not $NoPause) {
    Write-Host 'Pressione Enter para fechar esta janela.'
    [void](Read-Host)
  }
  exit 0
} catch {
  if ($_.Exception.Message -ne 'AP-NEON-BACKUP-STOP') {
    $script:Code = 'AP-NEON-BACKUP-UNEXPECTED'
    $script:Report.error = 'Falha interna sanitizada; consulte etapa, código e localização no relatório privado.'
    $script:Report.internal_failure_type = [string]$_.Exception.GetType().FullName
    $script:Report.internal_failure_hresult = '0x{0:X8}' -f [int]$_.Exception.HResult
    $script:Report.failure_location = 'Preparar-Backup-Neon.ps1:' + [string]$_.InvocationInfo.ScriptLineNumber
  }
  $script:Report.status = 'INTERROMPIDO'
  $script:Report.technical_code = $script:Code
  if (-not $script:Report.failure_location) { $script:Report.failure_location = 'Preparar-Backup-Neon.ps1:' + [string]$_.InvocationInfo.ScriptLineNumber }
  try { Stop-And-RemoveTemporaryCluster } catch { }
  try { Write-PrivateReport } catch { }
  Write-Host 'BACKUP_NEON_STATUS=INTERROMPIDO' -ForegroundColor Yellow
  Write-Host ('ETAPA=' + $script:Phase)
  Write-Host ('CODIGO_TECNICO=' + $script:Code)
  Write-Host ('LOCALIZACAO=' + [string]$script:Report.failure_location)
  if ($script:Report.acl_resource) { Write-Host ('ACL_RECURSO=' + [string]$script:Report.acl_resource + '; REGRA=' + [string]$script:Report.acl_technical_code + '; VALIDA=' + [string]$script:Report.acl_validated) }
  if ($script:Report.internal_failure_type) { Write-Host ('TIPO_INTERNO=' + [string]$script:Report.internal_failure_type + '; HRESULT=' + [string]$script:Report.internal_failure_hresult) }
  Write-Host ('CAUSA=' + [string]$script:Report.error)
  Write-Host ('BACKUP_CRIADO=' + [string]$script:Report.backup.created + '; CATALOGO_VALIDADO=' + [string]$script:Report.backup.catalog_validated)
  Write-Host ('RESTORE_TESTADO=' + [string]$script:Report.preflight.restore_tested + '; PREFLIGHT_APROVADO=' + [string]$script:Report.preflight.approved)
  Write-Host 'ORIGEM_MODIFICADA=NAO; NEON_CONECTADO=NAO; DDL_PERSISTENTE=NAO'
  Write-Host ('RELATORIO_SANITIZADO=%LOCALAPPDATA%\AmoresPet\Homologacao\neon-backups\<execução>\relatorio-sanitizado.txt')
  if ($script:OperationDirectory -and -not $NoPause) {
    Write-Host 'Pressione Enter para fechar; o relatório local permanece disponível.'
    try { [void](Read-Host) } catch { }
  }
  exit 1
} finally {
  if ($script:PassFile -and (Test-Path -LiteralPath $script:PassFile -PathType Leaf) -and $script:OperationDirectory) {
    $fullPass = [IO.Path]::GetFullPath($script:PassFile)
    $runPrefix = [IO.Path]::GetFullPath($script:OperationDirectory).TrimEnd('\') + '\'
    if ($fullPass.StartsWith($runPrefix,[StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($fullPass) -match '^\.source-[a-f0-9]{32}\.pgpass$') {
      try { Remove-Item -LiteralPath $fullPass -Force -ErrorAction Stop } catch { }
    }
  }
  Restore-PgEnvironment
  if ($script:Pg) { $script:Pg.password = ''; $script:Pg = $null }
}
