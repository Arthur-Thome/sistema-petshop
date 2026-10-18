Set-StrictMode -Version Latest

function ConvertTo-AmoresPetWindowsArgument {
  param([AllowEmptyString()][string]$Argument)

  if ($Argument.Length -gt 0 -and $Argument -notmatch '[\s"]') { return $Argument }
  $builder = New-Object System.Text.StringBuilder
  [void]$builder.Append('"')
  $backslashCount = 0
  foreach ($character in $Argument.ToCharArray()) {
    if ($character -eq [char]92) {
      $backslashCount++
      continue
    }
    if ($character -eq [char]34) {
      if ($backslashCount -gt 0) { [void]$builder.Append(('\' * (2 * $backslashCount + 1))) }
      else { [void]$builder.Append('\') }
      [void]$builder.Append('"')
      $backslashCount = 0
      continue
    }
    if ($backslashCount -gt 0) { [void]$builder.Append(('\' * $backslashCount)) }
    [void]$builder.Append($character)
    $backslashCount = 0
  }
  if ($backslashCount -gt 0) { [void]$builder.Append(('\' * (2 * $backslashCount))) }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function Get-AmoresPetProcessFailureInfo([System.Exception]$Exception) {
  $nativeCode = $null
  $cursor = $Exception
  while ($cursor) {
    if ($cursor -is [System.ComponentModel.Win32Exception]) {
      $nativeCode = [int]$cursor.NativeErrorCode
      break
    }
    $cursor = $cursor.InnerException
  }
  $failureSummary = switch ($nativeCode) {
    2 { 'EXECUTABLE_NOT_FOUND'; break }
    3 { 'EXECUTABLE_PATH_NOT_FOUND'; break }
    5 { 'EXECUTABLE_ACCESS_DENIED'; break }
    32 { 'EXECUTABLE_SHARING_VIOLATION'; break }
    126 { 'EXECUTABLE_DEPENDENCY_NOT_FOUND'; break }
    193 { 'EXECUTABLE_FORMAT_INVALID'; break }
    577 { 'EXECUTABLE_BLOCKED_BY_CODE_POLICY'; break }
    740 { 'EXECUTABLE_REQUIRES_ELEVATION'; break }
    default { 'PROCESS_START_FAILED' }
  }
  return [pscustomobject]@{
    ExceptionType = if ($Exception) { [string]$Exception.GetType().FullName } else { 'nao informado' }
    HResult = if ($Exception) { '0x{0:X8}' -f [int]$Exception.HResult } else { 'nao informado' }
    NativeErrorCode = $nativeCode
    FailureSummary = $failureSummary
  }
}

function Get-AmoresPetProcessOutputFailureSummary([string]$StandardError) {
  $safeProbe = ([string]$StandardError -replace '[\r\n\t]+',' ').Trim()
  if ($safeProbe -match '(?i)connection refused|could not connect|no route to host|could not translate host name') {
    return 'PSQL_CONNECTION_UNAVAILABLE'
  }
  if ($safeProbe -match '(?i)timeout expired|connection timed out|timed out') {
    return 'PSQL_CONNECTION_TIMEOUT'
  }
  if ($safeProbe -match '(?i)password authentication failed|no password supplied|authentication failed') {
    return 'PSQL_AUTHENTICATION_REJECTED'
  }
  if ($safeProbe -match '(?i)database .+ does not exist') { return 'PSQL_DATABASE_UNAVAILABLE' }
  if ($safeProbe -match '(?i)(unrecognized|unknown|unsupported|invalid).*(option|argument)|option.*(unrecognized|unknown|unsupported|invalid)|command[- ]line') {
    return 'PROCESS_ARGUMENT_REJECTED'
  }
  if ($safeProbe) { return 'PROCESS_STDERR_PRESENT_REDACTED' }
  return 'NO_STDERR'
}

function Test-AmoresPetCustomArchiveCatalog {
  [CmdletBinding()]
  param(
    [AllowEmptyString()][string]$CatalogOutput,
    [long]$ArchiveSize
  )

  if ($ArchiveSize -le 0) {
    return [pscustomobject]@{ Success = $false; Code = 'AP-MIG-BACKUP-EMPTY'; Reason = 'EMPTY_ARCHIVE' }
  }

  # pg_restore -l indents metadata fields after the semicolon (for example,
  # ";     Format: CUSTOM"). Match horizontal whitespace only so the field
  # remains anchored to one catalog line and does not consume adjacent lines.
  $hasCreatedAt = [regex]::IsMatch([string]$CatalogOutput, '(?m)^;[ \t]*Archive created at [^\r\n]+[ \t]*\r?$')
  $hasCustomFormat = [regex]::IsMatch([string]$CatalogOutput, '(?m)^;[ \t]*Format:[ \t]*CUSTOM[ \t]*\r?$')
  if (-not $hasCreatedAt -or -not $hasCustomFormat) {
    return [pscustomobject]@{ Success = $false; Code = 'AP-MIG-BACKUP-CATALOG-OUTPUT'; Reason = 'EXPECTED_CUSTOM_CATALOG_FIELDS_NOT_FOUND' }
  }

  return [pscustomobject]@{ Success = $true; Code = 'AP-MIG-BACKUP-CATALOG-VALID'; Reason = 'CUSTOM_CATALOG_CONFIRMED' }
}

function Get-AmoresPetPsqlFailureDiagnostic {
  [CmdletBinding()]
  param(
    [AllowEmptyString()][string]$StandardError,
    [Nullable[int]]$ExitCode
  )

  $probe = ([string]$StandardError -replace '[\r\n\t]+',' ').Trim()
  $sqlState = $null
  $stateMatch = [regex]::Match([string]$StandardError,
    '(?i)(?:ERROR|FATAL|PANIC):\s+(?<state>[0-9A-Z]{5})(?::|\s|$)')
  if (-not $stateMatch.Success) {
    $stateMatch = [regex]::Match([string]$StandardError,
      '(?i)SQLSTATE\s*[:=]?\s*(?<state>[0-9A-Z]{5})')
  }
  if ($stateMatch.Success) { $sqlState = $stateMatch.Groups['state'].Value.ToUpperInvariant() }

  $diagnostic = switch -Regex -CaseSensitive ($probe) {
    '(?i)(unrecognized|unknown|unsupported|invalid)\s+(?:command[- ]line\s+)?(?:option|argument)|(?:option|argument)\s+.{0,80}(?:unrecognized|unknown|unsupported|invalid)|option\s+requires\s+an?\s+argument|missing\s+argument\s+for\s+option|extra\s+command[- ]line\s+argument|too\s+many\s+command[- ]line\s+arguments' {
      @{ Category='PSQL_ARGUMENTOS'; Code='AP-PSQL-ARGUMENTS-INVALID'; Description='O cliente psql rejeitou uma opção ou argumento.' }; break
    }
    '(?i)no such file or directory|file not found|path not found|could not (?:open|read|write|access).{0,160}\b(?:file|directory|path|pgpass|certificate|service)\b|(?:file|directory|path|pgpass|certificate|service)\b.{0,120}(?:does not exist|not found|access denied|permission denied)|access is denied' {
      @{ Category='PSQL_ARQUIVO'; Code='AP-PSQL-FILE-ACCESS'; Description='O cliente psql não conseguiu acessar um arquivo necessário.' }; break
    }
    '(?i)(?:database|role|user)\s+[''"].+?[''"]\s+does not exist|(?:database|role|user)\s+.+?\s+does not exist' {
      @{ Category='PSQL_DESTINO_INEXISTENTE'; Code='AP-PSQL-DATABASE-ROLE-NOT-FOUND'; Description='O banco ou usuário PostgreSQL configurado não existe no destino.' }; break
    }
    '(?i)password authentication failed|no password supplied|authentication failed|SASL authentication|SCRAM authentication|no pg_hba\.conf entry|SQLSTATE\s*[:=]?\s*28[A-Z0-9]{3}' {
      @{ Category='PSQL_AUTENTICACAO'; Code='AP-PSQL-AUTHENTICATION'; Description='A autenticação PostgreSQL foi recusada ou não recebeu uma credencial utilizável.' }; break
    }
    '(?i)hostname mismatch|host name mismatch|does not match host name|doesn.t match host name|certificate subject name .+ does not match|certificate is not valid for this name|server certificate .{0,240}(?:does not match|doesn.t match) host name|certificate (?:name|hostname) does not match|hostname .{0,80}(?:does not match|doesn.t match|mismatch)' {
      @{ Category='PSQL_TLS_CERTIFICADO'; Code='AP-PSQL-TLS-HOSTNAME-MISMATCH'; Description='A validação do hostname do certificado TLS foi recusada pelo cliente PostgreSQL.' }; break
    }
    '(?i)certificate signed by unknown authority|unable to get local issuer certificate|self[- ]signed certificate in certificate chain|unable to verify the first certificate' {
      @{ Category='PSQL_TLS_CERTIFICADO'; Code='AP-PSQL-TLS-CA-INVALID'; Description='A cadeia do certificado TLS não foi validada pela CA configurada.' }; break
    }
    '(?i)certificate verify failed|certificate verify error|self[- ]signed certificate|SSL certificate problem|certificate has expired|certificate is not yet valid' {
      @{ Category='PSQL_TLS_CERTIFICADO'; Code='AP-PSQL-TLS-CERTIFICATE'; Description='A validação do certificado TLS foi recusada pelo cliente PostgreSQL.' }; break
    }
    '(?i)server does not support SSL|SSL is not enabled|no SSL connection|SSL connection is required|SSL negotiation failed|could not establish SSL connection' {
      @{ Category='PSQL_TLS_NEGOCIACAO'; Code='AP-PSQL-TLS-NEGOTIATION'; Description='O cliente PostgreSQL não conseguiu negociar a conexão TLS exigida.' }; break
    }
    '(?i)connection refused|could not connect|no route to host|could not translate host name|connection timed out|timeout expired|timed out|connection to server.{0,160}failed|server closed the connection|terminating connection|SSL connection|SSL error|SQLSTATE\s*[:=]?\s*08[A-Z0-9]{3}' {
      @{ Category='PSQL_CONEXAO'; Code='AP-PSQL-CONNECTION'; Description='A conexão PostgreSQL não pôde ser estabelecida ou mantida.' }; break
    }
    '(?i)permission denied for (?:database|schema|table|sequence|function|relation|column)|must be owner of|insufficient privilege|SQLSTATE\s*[:=]?\s*42501' {
      @{ Category='PSQL_PERMISSAO_SQL'; Code='AP-PSQL-SQL-PERMISSION'; Description='O PostgreSQL recusou a consulta por falta de permissão SQL.' }; break
    }
    default { $null }
  }

  if ($null -eq $diagnostic -and $sqlState) {
    if ($sqlState -eq '3D000') {
      $diagnostic = @{ Category='PSQL_DESTINO_INEXISTENTE'; Code='AP-PSQL-DATABASE-ROLE-NOT-FOUND'; Description='O banco ou usuário PostgreSQL configurado não existe no destino.' }
    } elseif ($sqlState -eq '42501') {
      $diagnostic = @{ Category='PSQL_PERMISSAO_SQL'; Code='AP-PSQL-SQL-PERMISSION'; Description='O PostgreSQL recusou a consulta por falta de permissão SQL.' }
    } elseif ($sqlState.StartsWith('28')) {
      $diagnostic = @{ Category='PSQL_AUTENTICACAO'; Code='AP-PSQL-AUTHENTICATION'; Description='A autenticação PostgreSQL foi recusada ou não recebeu uma credencial utilizável.' }
    } elseif ($sqlState.StartsWith('08')) {
      $diagnostic = @{ Category='PSQL_CONEXAO'; Code='AP-PSQL-CONNECTION'; Description='A conexão PostgreSQL não pôde ser estabelecida ou mantida.' }
    } else {
      $diagnostic = @{ Category='PSQL_ERRO_SQL'; Code='AP-PSQL-SQL-ERROR'; Description='O PostgreSQL rejeitou a consulta de diagnóstico.' }
    }
  }

  if ($null -eq $diagnostic -and $probe -match '(?i)(?:^|\s)(?:ERROR|FATAL):\s') {
    $diagnostic = @{ Category='PSQL_ERRO_SQL'; Code='AP-PSQL-SQL-ERROR'; Description='O PostgreSQL rejeitou a consulta de diagnóstico.' }
  }
  if ($null -eq $diagnostic) {
    if ([string]::IsNullOrWhiteSpace($probe)) {
      $diagnostic = @{
        Category='PSQL_NAO_CLASSIFICADO'
        Code='AP-PSQL-ERROR-EMPTY'
        Description='O cliente psql encerrou com erro sem fornecer stderr; a causa não foi determinada.'
      }
    } else {
      $diagnostic = @{
        Category='PSQL_NAO_CLASSIFICADO'
        Code='AP-PSQL-ERROR-UNCLASSIFIED'
        Description='O cliente psql terminou com erro não classificado; detalhes brutos não são exibidos no relatório.'
      }
    }
  }

  $matchRule = switch ([string]$diagnostic.Code) {
    'AP-PSQL-TLS-HOSTNAME-MISMATCH' { 'TLS_HOSTNAME_MISMATCH_TEXT'; break }
    'AP-PSQL-TLS-CA-INVALID' { 'TLS_UNTRUSTED_CA_TEXT'; break }
    'AP-PSQL-TLS-CERTIFICATE' { 'TLS_CERTIFICATE_VALIDATION_TEXT'; break }
    'AP-PSQL-TLS-NEGOTIATION' { 'TLS_NEGOTIATION_TEXT'; break }
    'AP-PSQL-CONNECTION' {
      if ($probe -match '(?i)could not translate host name|name or service not known|no such host|dns') { 'DNS_RESOLUTION_TEXT' }
      else { 'NETWORK_CONNECTION_TEXT' }
      break
    }
    'AP-PSQL-AUTHENTICATION' { 'AUTHENTICATION_TEXT'; break }
    'AP-PSQL-ARGUMENTS-INVALID' { 'ARGUMENT_VALIDATION_TEXT'; break }
    'AP-PSQL-FILE-ACCESS' { 'FILE_ACCESS_TEXT'; break }
    'AP-PSQL-SQL-PERMISSION' { 'SQL_PERMISSION_TEXT'; break }
    'AP-PSQL-SQL-ERROR' { 'SQL_ERROR_TEXT'; break }
    'AP-PSQL-DATABASE-ROLE-NOT-FOUND' { 'DESTINATION_NOT_FOUND_TEXT'; break }
    default { 'UNCLASSIFIED_TEXT' }
  }
  return [pscustomobject]@{
    Category = [string]$diagnostic.Category
    Code = [string]$diagnostic.Code
    Description = [string]$diagnostic.Description
    MatchRule = [string]$matchRule
    SqlState = $sqlState
    IsClassified = ($diagnostic.Category -ne 'PSQL_NAO_CLASSIFICADO')
    ExitCode = $ExitCode
  }
}

function Get-AmoresPetNumericTableSnapshotSql {
  return @'
DO $snapshot$
DECLARE
  item record;
  table_row_count bigint;
  table_data_fingerprint_a numeric;
  table_data_fingerprint_b numeric;
  table_data_fingerprint_c numeric;
  column_signature text;
  table_key text;
  digest_text text;
  existing_table_count bigint := 0;
  existing_row_count numeric := 0;
  data_fingerprint_a numeric := 0;
  data_fingerprint_b numeric := 0;
  structure_fingerprint_a numeric := 0;
  structure_fingerprint_b numeric := 0;
  migration_table_count bigint := 0;
  migration_row_count numeric := 0;
  hash_piece bigint;
  fingerprint_prime CONSTANT numeric := 2305843009213693951;
BEGIN
  FOR item IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY schemaname, tablename
  LOOP
    EXECUTE format($query$
      SELECT count(*)::bigint,
        COALESCE(mod(sum(('x' || substr(row_md5, 1, 15))::bit(60)::bigint::numeric), 2305843009213693951), 0),
        COALESCE(mod(sum(('x' || substr(row_md5, 16, 15))::bit(60)::bigint::numeric), 2305843009213693951), 0),
        COALESCE(mod(sum(mod(
          ('x' || substr(row_md5, 1, 15))::bit(60)::bigint::numeric *
          ('x' || substr(row_md5, 16, 15))::bit(60)::bigint::numeric,
          2305843009213693951)), 2305843009213693951), 0)
      FROM (
        SELECT md5($1 || to_jsonb(row_value)::text) AS row_md5
        FROM %I.%I AS row_value
      ) AS hashed_rows
    $query$, item.schemaname, item.tablename)
      INTO table_row_count, table_data_fingerprint_a, table_data_fingerprint_b, table_data_fingerprint_c
      USING item.schemaname || '.' || item.tablename || ':';

    IF item.tablename IN ('operation_authorizations', 'permanent_file_deletion_queue') THEN
      migration_table_count := migration_table_count + 1;
      migration_row_count := migration_row_count + table_row_count;
    ELSE
      existing_table_count := existing_table_count + 1;
      existing_row_count := existing_row_count + table_row_count;

      SELECT COALESCE(string_agg(
        format('%s:%s:%s:%s', attnum, attname, format_type(atttypid, atttypmod), attnotnull),
        ',' ORDER BY attnum), '')
      INTO column_signature
      FROM pg_attribute
      WHERE attrelid = format('%I.%I', item.schemaname, item.tablename)::regclass
        AND attnum > 0
        AND NOT attisdropped;

      table_key := item.schemaname || '.' || item.tablename || ':' || table_row_count::text || ':' ||
        table_data_fingerprint_a::text || ':' || table_data_fingerprint_b::text || ':' || table_data_fingerprint_c::text;
      digest_text := md5(table_key);
      hash_piece := ('x' || substr(digest_text, 1, 15))::bit(60)::bigint;
      data_fingerprint_a := mod(data_fingerprint_a * 65599 + hash_piece::numeric, fingerprint_prime);
      hash_piece := ('x' || substr(digest_text, 16, 15))::bit(60)::bigint;
      data_fingerprint_b := mod(data_fingerprint_b * 65599 + hash_piece::numeric, fingerprint_prime);

      digest_text := md5(item.schemaname || '.' || item.tablename || ':' || column_signature);
      hash_piece := ('x' || substr(digest_text, 1, 15))::bit(60)::bigint;
      structure_fingerprint_a := mod(structure_fingerprint_a * 65599 + hash_piece::numeric, fingerprint_prime);
      hash_piece := ('x' || substr(digest_text, 16, 15))::bit(60)::bigint;
      structure_fingerprint_b := mod(structure_fingerprint_b * 65599 + hash_piece::numeric, fingerprint_prime);
    END IF;
  END LOOP;

  RAISE WARNING 'DATA_SNAPSHOT=%|%|%|%|%|%|%|%',
    existing_table_count,
    existing_row_count,
    data_fingerprint_a,
    data_fingerprint_b,
    structure_fingerprint_a,
    structure_fingerprint_b,
    migration_table_count,
    migration_row_count;
END
$snapshot$;
'@
}

function ConvertFrom-AmoresPetNumericTableSnapshot {
  [CmdletBinding()]
  param(
    [AllowEmptyString()][string]$StandardOutput,
    [AllowEmptyString()][string]$StandardError,
    [int]$ExitCode = 0
  )

  if ($ExitCode -ne 0) {
    $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $StandardError -ExitCode $ExitCode
    return [pscustomobject]@{
      Success = $false
      Code = [string]$diagnostic.Code
      Category = [string]$diagnostic.Category
      Description = [string]$diagnostic.Description
      Snapshot = $null
    }
  }
  if (-not [string]::IsNullOrWhiteSpace($StandardOutput)) {
    return [pscustomobject]@{
      Success = $false; Code = 'AP-MIG-SNAPSHOT-UNEXPECTED-STDOUT'
      Category = 'FORMATO'; Description = 'A consulta de validação retornou saída fora do formato numérico esperado.'
      Snapshot = $null
    }
  }

  $markerCount = [regex]::Matches([string]$StandardError, 'DATA_SNAPSHOT=').Count
  if ($markerCount -ne 1) {
    $code = if ($markerCount -eq 0) { 'AP-MIG-SNAPSHOT-MISSING' } else { 'AP-MIG-SNAPSHOT-MULTIPLE' }
    $description = if ($markerCount -eq 0) {
      'A consulta não retornou a contagem numérica estruturada esperada.'
    } else {
      'A consulta retornou mais de uma contagem numérica; o resultado foi rejeitado.'
    }
    return [pscustomobject]@{ Success = $false; Code = $code; Category = 'FORMATO'; Description = $description; Snapshot = $null }
  }

  $match = [regex]::Match([string]$StandardError,
    '(?m)^.*?DATA_SNAPSHOT=(?<payload>[0-9]+(?:\|[0-9]+){7})[ \t]*\r?$')
  if (-not $match.Success) {
    return [pscustomobject]@{
      Success = $false; Code = 'AP-MIG-SNAPSHOT-NONNUMERIC'
      Category = 'FORMATO'; Description = 'A contagem retornada não possui o formato estritamente numérico esperado.'
      Snapshot = $null
    }
  }

  $values = $match.Groups['payload'].Value.Split('|')
  try {
    $integerIndexes = @(0, 2, 3, 4, 5, 6)
    $integers = @{}
    foreach ($index in $integerIndexes) {
      $parsed = [long]0
      if (-not [long]::TryParse($values[$index], [Globalization.NumberStyles]::Integer,
          [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed) -or $parsed -lt 0) {
        throw 'numeric field invalid'
      }
      if ($index -in @(2, 3, 4, 5) -and $parsed -ge 2305843009213693951) { throw 'fingerprint out of range' }
      $integers[$index] = $parsed
    }
    $rowCount = [decimal]0
    $migrationRowCount = [decimal]0
    if (-not [decimal]::TryParse($values[1], [Globalization.NumberStyles]::Integer,
        [Globalization.CultureInfo]::InvariantCulture, [ref]$rowCount) -or $rowCount -lt 0 -or
        -not [decimal]::TryParse($values[7], [Globalization.NumberStyles]::Integer,
        [Globalization.CultureInfo]::InvariantCulture, [ref]$migrationRowCount) -or $migrationRowCount -lt 0) {
      throw 'numeric total invalid'
    }
  } catch {
    return [pscustomobject]@{
      Success = $false; Code = 'AP-MIG-SNAPSHOT-NONNUMERIC'
      Category = 'FORMATO'; Description = 'A contagem retornada não possui o formato estritamente numérico esperado.'
      Snapshot = $null
    }
  }

  return [pscustomobject]@{
    Success = $true
    Code = 'AP-MIG-SNAPSHOT-VALID'
    Category = 'OK'
    Description = 'Contagem numérica validada.'
    Snapshot = [pscustomobject]@{
      TableCount = $integers[0]
      RowCount = $rowCount
      DataFingerprintA = $integers[2]
      DataFingerprintB = $integers[3]
      StructureFingerprintA = $integers[4]
      StructureFingerprintB = $integers[5]
      MigrationTableCount = $integers[6]
      MigrationRowCount = $migrationRowCount
    }
  }
}

function Test-AmoresPetBackupCheckpointTransition {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][bool]$Completed,
    [Parameter(Mandatory)][System.Collections.IDictionary]$Checkpoints
  )

  if (-not $Checkpoints.Contains($Name)) {
    return [pscustomobject]@{ Success = $false; Code = 'AP-MIG-CHECKPOINT-UNKNOWN'; Missing = $Name }
  }
  if (-not $Completed -and $Checkpoints[$Name] -eq $true) {
    return [pscustomobject]@{ Success = $false; Code = 'AP-MIG-CHECKPOINT-REGRESSION'; Missing = $Name }
  }

  $required = switch ($Name) {
    'RESTAURACAO_TESTADA' {
      @('PG_DUMP_INICIADO','PG_DUMP_CONCLUIDO','ARQUIVO_GERADO','CATALOGO_INICIADO','CATALOGO_VALIDADO',
        'RESTAURACAO_INICIADA','PG_RESTORE_CONCLUIDO','CONTAGEM_TABELAS_VALIDADA','ESTRUTURAS_COMPARADAS','DADOS_COMPARADOS')
      break
    }
    'PREFLIGHT_APROVADO' {
      @('PG_DUMP_INICIADO','PG_DUMP_CONCLUIDO','ARQUIVO_GERADO','CATALOGO_INICIADO','CATALOGO_VALIDADO',
        'RESTAURACAO_INICIADA','PG_RESTORE_CONCLUIDO','CONTAGEM_TABELAS_VALIDADA','ESTRUTURAS_COMPARADAS',
        'DADOS_COMPARADOS','RESTAURACAO_TESTADA')
      break
    }
    default { @() }
  }

  if ($Completed) {
    foreach ($requiredName in $required) {
      if (-not $Checkpoints.Contains($requiredName) -or $Checkpoints[$requiredName] -ne $true) {
        return [pscustomobject]@{
          Success = $false
          Code = 'AP-MIG-CHECKPOINT-PREREQUISITE'
          Missing = [string]$requiredName
        }
      }
    }
  }
  return [pscustomobject]@{ Success = $true; Code = 'AP-MIG-CHECKPOINT-VALID'; Missing = $null }
}

function Invoke-AmoresPetNativeProcess {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Executable,
    [AllowEmptyCollection()][string[]]$Arguments = @(),
    [switch]$NoCapture
  )

  $process = $null
  try {
    $executablePath = [IO.Path]::GetFullPath($Executable)
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $executablePath
    $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-AmoresPetWindowsArgument ([string]$_) }) -join ' ')
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = -not $NoCapture
    $startInfo.RedirectStandardError = -not $NoCapture
    if (-not $NoCapture) {
      $startInfo.StandardOutputEncoding = [Text.Encoding]::UTF8
      $startInfo.StandardErrorEncoding = [Text.Encoding]::UTF8
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    $started = $process.Start()
    if (-not $started) {
      return [pscustomobject]@{
        Started = $false; ExitCode = $null; StandardOutput = ''; StandardError = ''
        ExceptionType = 'System.Diagnostics.ProcessStartInfo'; HResult = '0x80131500'
        NativeErrorCode = $null; FailureSummary = 'PROCESS_START_RETURNED_FALSE'; OutputCaptured = $false
      }
    }

    if ($NoCapture) {
      $process.WaitForExit()
      return [pscustomobject]@{
        Started = $true; ExitCode = [int]$process.ExitCode
        StandardOutput = ''; StandardError = ''
        ExceptionType = $null; HResult = $null; NativeErrorCode = $null; FailureSummary = $null
        OutputCaptured = $false
      }
    }
    $standardOutputTask = $process.StandardOutput.ReadToEndAsync()
    $standardErrorTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $standardOutput = $standardOutputTask.GetAwaiter().GetResult()
    $standardError = $standardErrorTask.GetAwaiter().GetResult()
    return [pscustomobject]@{
      Started = $true; ExitCode = [int]$process.ExitCode
      StandardOutput = [string]$standardOutput; StandardError = [string]$standardError
      ExceptionType = $null; HResult = $null; NativeErrorCode = $null; FailureSummary = $null
      OutputCaptured = $true
    }
  } catch {
    $failure = Get-AmoresPetProcessFailureInfo $_.Exception
    return [pscustomobject]@{
      Started = $false; ExitCode = $null; StandardOutput = ''; StandardError = ''
      ExceptionType = $failure.ExceptionType; HResult = $failure.HResult
      NativeErrorCode = $failure.NativeErrorCode; FailureSummary = $failure.FailureSummary
      OutputCaptured = $false
    }
  } finally {
    if ($process) { $process.Dispose() }
  }
}

Export-ModuleMember -Function ConvertTo-AmoresPetWindowsArgument,Get-AmoresPetProcessFailureInfo,Get-AmoresPetProcessOutputFailureSummary,Test-AmoresPetCustomArchiveCatalog,Get-AmoresPetPsqlFailureDiagnostic,Get-AmoresPetNumericTableSnapshotSql,ConvertFrom-AmoresPetNumericTableSnapshot,Test-AmoresPetBackupCheckpointTransition,Invoke-AmoresPetNativeProcess
