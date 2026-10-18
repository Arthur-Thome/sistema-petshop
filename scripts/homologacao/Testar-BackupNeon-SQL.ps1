Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Postmaster-Identity.psm1') -Force

$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$tools = @{}
foreach ($name in @('initdb.exe','pg_ctl.exe','psql.exe','pg_dump.exe','postgres.exe')) {
  $path = Join-Path $pgBin $name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Ferramenta PostgreSQL 17 ausente.' }
  $tools[$name] = $path
}

$sourcePath = Join-Path $PSScriptRoot 'Preparar-Backup-Neon.ps1'
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($sourcePath,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw 'O executor de backup não pôde ser analisado.' }
$sqlFunction = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Get-SourceMetadataSql' },$true)
 $dataFunction = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Get-NeonDataSnapshotSql' },$true)
 $sequenceFunction = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Get-NeonSequenceSnapshotSql' },$true)
 $schemaNormalizerFunction = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Normalize-SchemaDumpForFingerprint' },$true)
$functionFingerprintSqlFunction = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Get-FunctionDefinitionFingerprintSql' },$true)
if (-not $sqlFunction -or -not $dataFunction -or -not $sequenceFunction -or -not $schemaNormalizerFunction -or -not $functionFingerprintSqlFunction) { throw 'Consultas ou normalizador do executor não foram encontrados.' }
Invoke-Expression $sqlFunction.Extent.Text
Invoke-Expression $dataFunction.Extent.Text
Invoke-Expression $sequenceFunction.Extent.Text
Invoke-Expression $schemaNormalizerFunction.Extent.Text
Invoke-Expression $functionFingerprintSqlFunction.Extent.Text
$ownerDumpA = "\restrict alphaKey`n-- Name: public.fixture; Type: TABLE; Schema: public; Owner: source_role`nCREATE TABLE public.fixture (id integer);`n\unrestrict alphaKey"
$ownerDumpB = "\restrict betaKey`n-- Name: public.fixture; Type: TABLE; Schema: public; Owner: restore_role`nCREATE TABLE public.fixture (id integer);`n\unrestrict betaKey"
if ((Normalize-SchemaDumpForFingerprint $ownerDumpA) -cne (Normalize-SchemaDumpForFingerprint $ownerDumpB)) {
  throw 'O fingerprint não normalizou somente o token pg_dump e o owner mapeado.'
}
$ownerDumpChanged = $ownerDumpB.Replace('id integer','id bigint')
if ((Normalize-SchemaDumpForFingerprint $ownerDumpA) -ceq (Normalize-SchemaDumpForFingerprint $ownerDumpChanged)) {
  throw 'O fingerprint aceitou uma alteração real depois da normalização do owner.'
}
$metadataSql = Get-SourceMetadataSql

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$testId = [guid]::NewGuid().ToString('N')
$dataDirectory = Join-Path $tempRoot ('Amores Pet Neon SQL Test ' + $testId)
$logPath = Join-Path $tempRoot ('amores-pet-neon-sql-' + $testId + '.log')
$portListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
try { $portListener.Start(); $port = [int]$portListener.LocalEndpoint.Port } finally { $portListener.Stop() }
if ($port -in @(3001,5432,55432)) { throw 'Porta descartável coincide com porta protegida.' }
$started = $false

try {
  Write-Output 'TEST_STAGE=INITDB'
  $init = Invoke-AmoresPetNativeProcess -Executable $tools['initdb.exe'] -Arguments @('-D',$dataDirectory,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8','--locale-provider=libc')
  if (-not $init.Started) { throw ('initdb não iniciou; erro técnico=' + [string]$init.FailureSummary + '; HRESULT=' + [string]$init.HResult) }
  if ($init.ExitCode -ne 0) {
    $initFailure = Get-AmoresPetProcessOutputFailureSummary -StandardError ([string]$init.StandardError)
    if ([string]$init.StandardError -match '(?i)cannot be run by.*administrator|must not be run as.*administrator') { $initFailure = 'INITDB_ELEVATED_CONTEXT_REJECTED' }
    elseif ([string]$init.StandardError -match '(?i)could not create directory|permission denied|access is denied') { $initFailure = 'INITDB_TEMP_DIRECTORY_ACCESS' }
    elseif ([string]$init.StandardError -match '(?i)invalid command.?line|unrecognized option|unknown option') { $initFailure = 'INITDB_ARGUMENT_REJECTED' }
    elseif ([string]$init.StandardError -match '(?i)exists and is not empty') { $initFailure = 'INITDB_DIRECTORY_NOT_EMPTY' }
    throw ('initdb descartável falhou; exit=' + [string]$init.ExitCode + '; causa=' + $initFailure)
  }
  Write-Output 'TEST_STAGE=PG_CTL_START'
  $start = Invoke-AmoresPetNativeProcess -Executable $tools['pg_ctl.exe'] -Arguments @('-D',$dataDirectory,'-o',"-h 127.0.0.1 -p $port",'-l',$logPath,'-w','-t','30','start') -NoCapture
  if (-not $start.Started -or $start.ExitCode -ne 0) { throw 'PostgreSQL descartável não iniciou.' }
  $started = $true
  Write-Output 'TEST_STAGE=PSQL_METADATA_QUERY'
  $sql = "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;`n$metadataSql`nCOMMIT;"
  $result = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',$sql)
  if (-not $result.Started) { throw 'psql descartável não iniciou.' }
  if ($result.ExitCode -ne 0) {
    $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $result.StandardError -ExitCode $result.ExitCode
    $positionMatch = [regex]::Match([string]$result.StandardError,'(?im)^POSITION:\s*(?<position>[0-9]+)\s*$')
    $position = 0
    $sqlLine = 0
    $lineMatch = [regex]::Match([string]$result.StandardError,'(?im)^LINE\s+(?<line>[0-9]+):')
    if ($lineMatch.Success) { [void][int]::TryParse($lineMatch.Groups['line'].Value,[ref]$sqlLine) }
    if ($positionMatch.Success -and [int]::TryParse($positionMatch.Groups['position'].Value,[ref]$position)) {
      if ($sqlLine -eq 0) { $sqlLine = ([string]$metadataSql).Substring(0,[Math]::Min([string]$metadataSql.Length,[Math]::Max(0,$position - 1))).Split("`n").Count }
    }
    $tokenMatch = [regex]::Match([string]$result.StandardError,'(?im)syntax error at or near "(?<token>[^"\r\n]{1,60})"')
    $token = if ($tokenMatch.Success) { $tokenMatch.Groups['token'].Value } else { 'unavailable' }
    throw ('SQL de metadados recusado: ' + $diagnostic.Code + '; SQLSTATE=' + [string]$diagnostic.SqlState +
      '; posicao=' + [string]$position + '; linha_sql=' + [string]$sqlLine + '; token=' + $token + '; stderr bruto omitido.')
  }
  try { $metadata = ([string]$result.StandardOutput).Trim() | ConvertFrom-Json -ErrorAction Stop }
  catch { throw 'Saída de metadados descartáveis inválida.' }
  if ([string]$metadata.encoding -cne 'UTF8' -or [string]$metadata.locale_provider -cne 'libc' -or
      [long]$metadata.tables -ne 0 -or [bool]$metadata.migration_037_super_admin) {
    throw 'A consulta de metadados retornou valores inesperados no cluster descartável.'
  }
  $functionBodyOne = "`nBEGIN`n  RETURN p_value + 1;`nEND;`n"
  $functionFixtureSql = 'CREATE ROLE ap_function_owner_probe; CREATE FUNCTION public.ap_function_definition_probe(p_value integer) RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $ap$' + $functionBodyOne + '$ap$; ALTER FUNCTION public.ap_function_definition_probe(integer) OWNER TO ap_function_owner_probe'
  $functionFixture = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',$functionFixtureSql)
  if (-not $functionFixture.Started -or $functionFixture.ExitCode -ne 0) { throw 'Não foi possível criar a fixture de função e role descartáveis.' }
  $functionFingerprint = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',(Get-FunctionDefinitionFingerprintSql))
  if (-not $functionFingerprint.Started -or $functionFingerprint.ExitCode -ne 0 -or ([string]$functionFingerprint.StandardOutput).Trim() -notmatch '^[a-f0-9]{32}$') {
    $functionDiagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError ([string]$functionFingerprint.StandardError) -ExitCode $functionFingerprint.ExitCode
    throw ('Fingerprint de funções descartável falhou; SQLSTATE=' + [string]$functionDiagnostic.SqlState + '; código=' + [string]$functionDiagnostic.Code)
  }
  $functionOwnerChange = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c','ALTER FUNCTION public.ap_function_definition_probe(integer) OWNER TO postgres')
  if (-not $functionOwnerChange.Started -or $functionOwnerChange.ExitCode -ne 0) { throw 'Não foi possível alterar o owner da fixture no cluster descartável.' }
  $functionFingerprintAfterOwner = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',(Get-FunctionDefinitionFingerprintSql))
  if (-not $functionFingerprintAfterOwner.Started -or $functionFingerprintAfterOwner.ExitCode -ne 0 -or
      ([string]$functionFingerprint.StandardOutput).Trim() -cne ([string]$functionFingerprintAfterOwner.StandardOutput).Trim()) {
    throw 'O fingerprint de função variou apenas por causa do owner.'
  }
  $functionBodyTwo = "`nBEGIN`n  RETURN p_value + 2;`nEND;`n"
  $functionBodyChangeSql = 'CREATE OR REPLACE FUNCTION public.ap_function_definition_probe(p_value integer) RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $ap$' + $functionBodyTwo + '$ap$'
  $functionBodyChange = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',$functionBodyChangeSql)
  if (-not $functionBodyChange.Started -or $functionBodyChange.ExitCode -ne 0) { throw 'Não foi possível alterar o corpo da função sintética.' }
  $functionFingerprintAfterBody = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',(Get-FunctionDefinitionFingerprintSql))
  if (-not $functionFingerprintAfterBody.Started -or $functionFingerprintAfterBody.ExitCode -ne 0 -or
      ([string]$functionFingerprint.StandardOutput).Trim() -ceq ([string]$functionFingerprintAfterBody.StandardOutput).Trim()) {
    throw 'O fingerprint de função não detectou a alteração real do corpo.'
  }
  Write-Output 'FUNCTION_DEFINITION_FINGERPRINT=PASS'
  Write-Output 'FUNCTION_OWNER_MAPPING_NORMALIZATION=PASS'
  Write-Output 'FUNCTION_BODY_CHANGE_DETECTION=PASS'

  $localeCases = @(
    @{ Name = 'C/libc'; Database = 'ap_neon_c_' + [guid]::NewGuid().ToString('N'); CreateSql = "CREATE DATABASE ap_neon_c_$([guid]::NewGuid().ToString('N')) WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' LOCALE_PROVIDER libc"; Expected = 'C|C|libc|' },
    @{ Name = 'C.UTF-8/builtin'; Database = 'ap_neon_builtin_' + [guid]::NewGuid().ToString('N'); CreateSql = $null; Expected = 'C.UTF-8|C.UTF-8|builtin|C.UTF-8' }
  )
  $localeCases[0].CreateSql = "CREATE DATABASE $($localeCases[0].Database) WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' LOCALE_PROVIDER libc"
  $localeCases[1].CreateSql = "CREATE DATABASE $($localeCases[1].Database) WITH TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'"
  foreach ($localeCase in $localeCases) {
    $createResult = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',[string]$localeCase.CreateSql)
    if (-not $createResult.Started -or $createResult.ExitCode -ne 0) {
      $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $createResult.StandardError -ExitCode $createResult.ExitCode
      $errorClass = 'UNCLASSIFIED_SERVER_ERROR'
      if ([string]$createResult.StandardError -match '(?i)wrong object type|SQLSTATE\s*[:=]?\s*42809') { $errorClass = 'WRONG_OBJECT_TYPE' }
      elseif ([string]$createResult.StandardError -match '(?i)locale.{0,80}(?:unsupported|invalid|not available)|(?:unsupported|invalid|not available).{0,80}locale') { $errorClass = 'LOCALE_UNAVAILABLE' }
      throw ('LOCALE_DATABASE_CREATE=FAILED; CASE=' + [string]$localeCase.Name + '; SQLSTATE=' + [string]$diagnostic.SqlState + '; CLASS=' + $errorClass + '; STDERR_REDACTED')
    }
    $localeSql = "SELECT CASE WHEN datlocprovider='b' THEN COALESCE(datlocale,'') || '|' || COALESCE(datlocale,'') || '|builtin|' || COALESCE(datlocale,'') ELSE COALESCE(datcollate,'') || '|' || COALESCE(datctype,'') || '|' || CASE datlocprovider WHEN 'c' THEN 'libc' WHEN 'i' THEN 'icu' ELSE 'unknown' END || '|' || COALESCE(datlocale,'') END FROM pg_database WHERE datname=current_database()"
    $localeResult = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',[string]$localeCase.Database,'-c',$localeSql)
    if (-not $localeResult.Started -or $localeResult.ExitCode -ne 0 -or ([string]$localeResult.StandardOutput).Trim() -cne [string]$localeCase.Expected) {
      throw ('LOCALE_DATABASE_VERIFY=FAILED; CASE=' + [string]$localeCase.Name + '; SQLSTATE=NONE_OR_REDACTED')
    }
    Write-Output ('LOCALE_DATABASE=' + [string]$localeCase.Name + '; APROVADO')
  }
  $unicodeLocaleSql = "SELECT encode(convert_to(lower(U&'\00C9'),'UTF8'),'hex') || '|' || (U&'\00C9' ILIKE U&'\00E9')::text || '|' || (U&'\00C9' ~ U&'^[[:alpha:]]$')::text"
  $unicodeLocaleExpected = @('c389|false|false','c3a9|true|true')
  for ($localeIndex = 0; $localeIndex -lt $localeCases.Count; $localeIndex++) {
    $localeProbe = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',[string]$localeCases[$localeIndex].Database,'-c',$unicodeLocaleSql)
    if (-not $localeProbe.Started -or $localeProbe.ExitCode -ne 0 -or ([string]$localeProbe.StandardOutput).Trim() -cne [string]$unicodeLocaleExpected[$localeIndex]) {
      throw ('Comportamento Unicode de locale inesperado; caso=' + [string]$localeCases[$localeIndex].Name)
    }
  }
  Write-Output 'COLLATION_UNICODE_LOWER_ILIKE_REGEX_DIFFERENCE=CONFIRMED'
  $timezoneProbeSql = "SET TIME ZONE 'America/Sao_Paulo'; SELECT to_char(TIMESTAMPTZ '2026-10-17 12:00:00+00','HH24:MI') || '|' || to_char(TIMESTAMPTZ '2026-10-17 12:00:00+00'::timestamp,'HH24:MI')"
  $timezoneSaoPaulo = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',$timezoneProbeSql)
  $timezoneGmt = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',"SET TIME ZONE 'GMT'; SELECT to_char(TIMESTAMPTZ '2026-10-17 12:00:00+00','HH24:MI') || '|' || to_char(TIMESTAMPTZ '2026-10-17 12:00:00+00'::timestamp,'HH24:MI')")
  if (-not $timezoneSaoPaulo.Started -or $timezoneSaoPaulo.ExitCode -ne 0 -or ([string]$timezoneSaoPaulo.StandardOutput).Trim() -cne '09:00|09:00' -or
      -not $timezoneGmt.Started -or $timezoneGmt.ExitCode -ne 0 -or ([string]$timezoneGmt.StandardOutput).Trim() -cne '12:00|12:00') {
    throw 'A verificação sintética do efeito de TimeZone em conversões timestamp falhou.'
  }
  Write-Output 'TIMEZONE_TIMESTAMP_CAST_EFFECT=CONFIRMED'

  $schemaProbeSql = 'CREATE TABLE ap_schema_fingerprint_probe (id integer PRIMARY KEY)'
  $schemaProbe = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',$schemaProbeSql)
  if (-not $schemaProbe.Started -or $schemaProbe.ExitCode -ne 0) { throw 'Não foi possível criar a fixture descartável do fingerprint de esquema.' }
  $unicodeComment = 'A' + [char]0x00E7 + 'ao ' + [char]0x2014 + ' teste UTF-8'
  $commentSql = "COMMENT ON TABLE ap_schema_fingerprint_probe IS U&'A\00E7ao \2014 teste UTF-8'"
  $commentResult = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',$commentSql)
  if (-not $commentResult.Started -or $commentResult.ExitCode -ne 0) { throw 'Não foi possível criar o comentário UTF-8 sintético.' }
  $schemaDumpArguments = @('--format=plain','--schema-only','--no-owner','--no-privileges','--no-tablespaces','--quote-all-identifiers',
    '--no-password','--file=-','--host','127.0.0.1','--port',[string]$port,'--username','postgres','--dbname','postgres')
  $schemaDumpA = Invoke-AmoresPetNativeProcess -Executable $tools['pg_dump.exe'] -Arguments $schemaDumpArguments
  $schemaDumpB = Invoke-AmoresPetNativeProcess -Executable $tools['pg_dump.exe'] -Arguments $schemaDumpArguments
  if (-not $schemaDumpA.Started -or $schemaDumpA.ExitCode -ne 0 -or -not $schemaDumpB.Started -or $schemaDumpB.ExitCode -ne 0 -or
      (Normalize-SchemaDumpForFingerprint ([string]$schemaDumpA.StandardOutput)) -cne (Normalize-SchemaDumpForFingerprint ([string]$schemaDumpB.StandardOutput))) {
    throw 'O fingerprint normalizado divergiu entre dumps equivalentes do PostgreSQL 17.'
  }
  if (-not ([string]$schemaDumpA.StandardOutput).Contains($unicodeComment)) {
    throw 'A saída UTF-8 do pg_dump foi decodificada de maneira incorreta.'
  }
  $rawSchemaReferencePath = Join-Path $dataDirectory 'schema-reference-raw.sql'
  $normalizedSchemaReferencePath = Join-Path $dataDirectory 'schema-reference-normalized.sql'
  $utf8NoBom = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($rawSchemaReferencePath,[string]$schemaDumpA.StandardOutput,$utf8NoBom)
  $normalizedSchemaReferenceText = ([string]$schemaDumpA.StandardOutput).Replace("`r`n","`n")
  [IO.File]::WriteAllText($normalizedSchemaReferencePath,$normalizedSchemaReferenceText,$utf8NoBom)
  $rawReferenceRestore = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-1','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',[string]$localeCases[1].Database,'-f',$rawSchemaReferencePath)
  $normalizedReferenceRestore = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-1','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',[string]$localeCases[0].Database,'-f',$normalizedSchemaReferencePath)
  if (-not $rawReferenceRestore.Started -or $rawReferenceRestore.ExitCode -ne 0 -or
      -not $normalizedReferenceRestore.Started -or $normalizedReferenceRestore.ExitCode -ne 0) {
    throw 'A restauração sintética do dump de esquema falhou.'
  }
  $sourceFunctionForFile = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',(Get-FunctionDefinitionFingerprintSql))
  $rawFunctionForFile = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',[string]$localeCases[1].Database,'-c',(Get-FunctionDefinitionFingerprintSql))
  $normalizedFunctionForFile = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',[string]$localeCases[0].Database,'-c',(Get-FunctionDefinitionFingerprintSql))
  if (-not $sourceFunctionForFile.Started -or $sourceFunctionForFile.ExitCode -ne 0 -or
      -not $rawFunctionForFile.Started -or $rawFunctionForFile.ExitCode -ne 0 -or
      -not $normalizedFunctionForFile.Started -or $normalizedFunctionForFile.ExitCode -ne 0 -or
      ([string]$sourceFunctionForFile.StandardOutput).Trim() -ceq ([string]$rawFunctionForFile.StandardOutput).Trim() -or
      ([string]$sourceFunctionForFile.StandardOutput).Trim() -cne ([string]$normalizedFunctionForFile.StandardOutput).Trim()) {
    throw 'A normalização da tradução de newline do stdout não reproduziu o caso bruto nem preservou o fingerprint da origem.'
  }
  $schemaChange = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c','ALTER TABLE ap_schema_fingerprint_probe ADD COLUMN value text')
  if (-not $schemaChange.Started -or $schemaChange.ExitCode -ne 0) { throw 'Não foi possível alterar a fixture descartável do fingerprint de esquema.' }
  $schemaDumpChanged = Invoke-AmoresPetNativeProcess -Executable $tools['pg_dump.exe'] -Arguments $schemaDumpArguments
  if (-not $schemaDumpChanged.Started -or $schemaDumpChanged.ExitCode -ne 0 -or
      (Normalize-SchemaDumpForFingerprint ([string]$schemaDumpA.StandardOutput)) -ceq (Normalize-SchemaDumpForFingerprint ([string]$schemaDumpChanged.StandardOutput))) {
    throw 'O fingerprint normalizado aceitou uma divergência estrutural real.'
  }
  $schemaProbeCleanup = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c','DROP TABLE ap_schema_fingerprint_probe')
  if (-not $schemaProbeCleanup.Started -or $schemaProbeCleanup.ExitCode -ne 0) { throw 'A fixture estrutural descartável não foi removida.' }
  Write-Output 'SCHEMA_DUMP_RANDOM_KEY_NORMALIZATION=PASS'
  Write-Output 'SCHEMA_DUMP_OWNER_METADATA_NORMALIZATION=PASS'
  Write-Output 'SCHEMA_DUMP_STRUCTURAL_CHANGE_DETECTION=PASS'
  Write-Output 'SCHEMA_REFERENCE_WINDOWS_NEWLINE_NORMALIZATION=PASS'
  Write-Output 'PROCESS_STDOUT_UTF8=PASS'
  Write-Output 'BACKUP_NEON_METADATA_SQL=PASS'
  Write-Output 'DESTINO=POSTGRESQL_17_DESCARTAVEL'
  Write-Output 'SQLSTATE=NONE'
  Write-Output 'DADOS_DE_APLICACAO=0'

  foreach ($snapshotCase in @(
      @{ Marker = 'NEON_DATA_SNAPSHOT='; Sql = Get-NeonDataSnapshotSql; Pattern = '(?m)^.*?NEON_DATA_SNAPSHOT=0\|0\|0\|0\|2305843009213693951[ \t]*\r?$'; Label = 'dados sem tabelas de aplicação' },
      @{ Marker = 'NEON_SEQUENCE_SNAPSHOT='; Sql = Get-NeonSequenceSnapshotSql; Pattern = '(?m)^.*?NEON_SEQUENCE_SNAPSHOT=0\|d41d8cd98f00b204e9800998ecf8427e[ \t]*\r?$'; Label = 'sequences sem objetos de aplicação' }
    )) {
    $snapshotCommand = "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;`n" + [string]$snapshotCase.Sql + "`nCOMMIT;"
    $snapshotResult = Invoke-AmoresPetNativeProcess -Executable $tools['psql.exe'] -Arguments @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d','postgres','-c',$snapshotCommand)
    if (-not $snapshotResult.Started -or $snapshotResult.ExitCode -ne 0 -or
        [regex]::Matches([string]$snapshotResult.StandardError,[regex]::Escape([string]$snapshotCase.Marker)).Count -ne 1 -or
        -not [regex]::IsMatch([string]$snapshotResult.StandardError,[string]$snapshotCase.Pattern)) {
      $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $snapshotResult.StandardError -ExitCode $snapshotResult.ExitCode
      throw ('Snapshot descartável recusado: ' + [string]$snapshotCase.Label + '; código=' + $diagnostic.Code + '; SQLSTATE=' + [string]$diagnostic.SqlState)
    }
    Write-Output ('SNAPSHOT=' + [string]$snapshotCase.Label + '; APROVADO')
  }
} finally {
  if (Test-Path -LiteralPath (Join-Path $dataDirectory 'postmaster.pid') -PathType Leaf) {
    try {
      $identity = Get-AmoresPetPostmasterIdentity -Path (Join-Path $dataDirectory 'postmaster.pid') -ExpectedDataDirectory $dataDirectory -ExpectedPort $port -ExpectedListenAddress '127.0.0.1'
      $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $identity.ProcessId -ExpectedExecutable $tools['postgres.exe'] -ExpectedDataDirectory $dataDirectory -ExpectedListenAddress '127.0.0.1' -ExpectedPort $port
      $stop = Invoke-AmoresPetNativeProcess -Executable $tools['pg_ctl.exe'] -Arguments @('-D',$dataDirectory,'-m','fast','-w','-t','30','stop') -NoCapture
      if (-not $stop.Started -or $stop.ExitCode -ne 0) { throw 'Não foi possível encerrar com identidade confirmada o cluster descartável.' }
    } catch { Write-Warning 'Cluster descartável preservado para inspeção; nenhum banco persistente foi envolvido.'; throw }
  }
  $fullData = [IO.Path]::GetFullPath($dataDirectory)
  $prefix = $tempRoot.TrimEnd('\') + '\'
  if ($fullData.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($fullData) -ceq ('Amores Pet Neon SQL Test ' + $testId) -and
      -not (Test-Path -LiteralPath (Join-Path $dataDirectory 'postmaster.pid'))) {
    if (Test-Path -LiteralPath $fullData) { Remove-Item -LiteralPath $fullData -Recurse -Force }
  }
  if (Test-Path -LiteralPath $logPath) { Remove-Item -LiteralPath $logPath -Force }
}
