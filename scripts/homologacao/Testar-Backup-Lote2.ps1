Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$requiredTools = @('initdb.exe','pg_ctl.exe','psql.exe','pg_dump.exe','pg_restore.exe')
foreach ($tool in $requiredTools) {
  if (-not (Test-Path -LiteralPath (Join-Path $pgBin $tool) -PathType Leaf)) {
    throw "Ferramenta PostgreSQL 17 ausente: $tool"
  }
}
Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force

$savedPgEnvironment = @{}
foreach ($entry in Get-ChildItem Env:) {
  if ($entry.Name -match '^(PG|PSQL)' -or $entry.Name -eq 'DATABASE_URL') {
    $savedPgEnvironment[$entry.Name] = $entry.Value
    Remove-Item -LiteralPath "Env:$($entry.Name)" -ErrorAction SilentlyContinue
  }
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$testId = [guid]::NewGuid().ToString('N')
$testRoot = Join-Path $tempRoot "Amores Pet Backup Test $testId"
$dataDirectory = Join-Path $tempRoot "amores-pet-backup-cluster-$testId"
$archivePath = Join-Path $testRoot 'custom archive with spaces.custom'
$truncatedPath = Join-Path $testRoot 'truncated archive.custom'
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$initDb = Join-Path $pgBin 'initdb.exe'
$psql = Join-Path $pgBin 'psql.exe'
$pgDump = Join-Path $pgBin 'pg_dump.exe'
$pgRestore = Join-Path $pgBin 'pg_restore.exe'
$database = 'backup_test_' + $testId
$restoredDatabase = 'restored_test_' + $testId
$emptyDatabase = 'empty_test_' + $testId
$realisticSourceDatabase = 'lote2_source_' + $testId
$realisticRestoredDatabase = 'lote2_restore_' + $testId
$realisticArchivePath = Join-Path $testRoot 'full system backup with spaces.custom'
$truncatedDatabase = 'truncated_test_' + $testId
$serverStarted = $false
$results = [Collections.Generic.List[string]]::new()

function Add-TestResult([string]$Message) {
  $results.Add($Message)
  Write-Output "[PASS] $Message"
}

function Invoke-TestProcess([string]$Executable, [string[]]$Arguments, [string]$Name, [switch]$NoCapture) {
  $result = Invoke-AmoresPetNativeProcess -Executable $Executable -Arguments $Arguments -NoCapture:$NoCapture
  if (-not $result.Started) { throw "${Name}: processo nao iniciou ($($result.HResult))." }
  return $result
}

function Invoke-TestSuccess([string]$Executable, [string[]]$Arguments, [string]$Name, [switch]$NoCapture) {
  $result = Invoke-TestProcess $Executable $Arguments $Name -NoCapture:$NoCapture
  if ($result.ExitCode -ne 0) {
    $summary = Get-AmoresPetProcessOutputFailureSummary $result.StandardError
    $detail = ([string]$result.StandardError -replace [regex]::Escape($testRoot), '[diretorio temporario]') -replace '[\r\n\t]+',' '
    if ($detail.Length -gt 300) { $detail = $detail.Substring(0,300) + '...' }
    throw "${Name}: exit $($result.ExitCode), diagnostico $summary, detalhe temporario=$detail"
  }
  return $result
}

function Invoke-TestQuery([string]$DatabaseName, [string]$Sql, [int]$Port, [string]$Name) {
  $result = Invoke-TestSuccess $psql @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1',
    '-h','127.0.0.1','-p',[string]$Port,'-U','postgres','-d',$DatabaseName,'-c',$Sql) $Name
  return $result.StandardOutput.Trim()
}

function Invoke-TestSnapshot([string]$DatabaseName, [int]$Port, [string]$Name, [string]$Prefix = '') {
  $sql = $Prefix + (Get-AmoresPetNumericTableSnapshotSql)
  $process = Invoke-TestProcess $psql @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-h','127.0.0.1','-p',[string]$Port,'-U','postgres','-d',$DatabaseName,'-c',$sql) $Name
  $assessment = ConvertFrom-AmoresPetNumericTableSnapshot -StandardOutput $process.StandardOutput `
    -StandardError $process.StandardError -ExitCode $process.ExitCode
  return [pscustomobject]@{ Process = $process; Assessment = $assessment }
}

function Assert-TestSnapshotMatches($Expected, $Actual, [string]$Name) {
  foreach ($property in @('TableCount','RowCount','DataFingerprintA','DataFingerprintB','StructureFingerprintA','StructureFingerprintB')) {
    if ([decimal]$Expected.$property -ne [decimal]$Actual.$property) {
      throw "${Name}: diferenca de estrutura ou dados em $property."
    }
  }
}

try {
  [void][IO.Directory]::CreateDirectory($testRoot)

  $sentinel = 'PRIVATE_SYNTHETIC_SENTINEL_' + $testId

  $validIndented = "; Archive created at synthetic`r`n;     Format: CUSTOM`r`n"
  $validCompact = "; Archive created at synthetic`n; Format: CUSTOM`n"
  $invalidText = "; Archive created at synthetic`n;     Format: PLAIN`n"
  $indentedAssessment = Test-AmoresPetCustomArchiveCatalog -CatalogOutput $validIndented -ArchiveSize 100
  if (-not $indentedAssessment.Success) { throw ('Catalogo custom com recuo foi recusado: ' + ($indentedAssessment | ConvertTo-Json -Compress) + '; tamanho=' + $validIndented.Length) }
  Add-TestResult 'Parser: catalogo PG custom com recuo aceito'
  if (-not (Test-AmoresPetCustomArchiveCatalog -CatalogOutput $validCompact -ArchiveSize 100).Success) { throw 'Catalogo custom sem recuo foi recusado.' }
  Add-TestResult 'Parser: formato custom sem recuo aceito'
  if ((Test-AmoresPetCustomArchiveCatalog -CatalogOutput $invalidText -ArchiveSize 100).Success) { throw 'Catalogo de formato incorreto foi aceito.' }
  if ((Test-AmoresPetCustomArchiveCatalog -CatalogOutput $validIndented -ArchiveSize 0).Success) { throw 'Arquivo vazio foi aceito.' }
  if ((Test-AmoresPetCustomArchiveCatalog -CatalogOutput '' -ArchiveSize 100).Success) { throw 'Saida vazia do validador foi aceita.' }
  Add-TestResult 'Parser: formato incorreto, arquivo vazio e catalogo ausente rejeitados'

  $validSnapshotWarning = "WARNING:  DATA_SNAPSHOT=2|3|11|12|13|14|0|0`r`n"
  $validNumericSnapshot = ConvertFrom-AmoresPetNumericTableSnapshot -StandardOutput '' -StandardError $validSnapshotWarning -ExitCode 0
  if (-not $validNumericSnapshot.Success -or $validNumericSnapshot.Snapshot.TableCount -ne 2 -or
      $validNumericSnapshot.Snapshot.RowCount -ne 3) { throw 'Parser rejeitou snapshot numerico valido no stderr.' }
  $nonnumericSnapshot = ConvertFrom-AmoresPetNumericTableSnapshot -StandardOutput '' `
    -StandardError "WARNING:  DATA_SNAPSHOT=2|segredo_sintetico|11|12|13|14|0|0`r`n" -ExitCode 0
  if ($nonnumericSnapshot.Success -or $nonnumericSnapshot.Code -cne 'AP-MIG-SNAPSHOT-NONNUMERIC') {
    throw 'Parser aceitou campo nao numerico no snapshot.'
  }
  $unexpectedOutputSnapshot = ConvertFrom-AmoresPetNumericTableSnapshot -StandardOutput 'public.synthetic_items' `
    -StandardError $validSnapshotWarning -ExitCode 0
  if ($unexpectedOutputSnapshot.Success -or $unexpectedOutputSnapshot.Code -cne 'AP-MIG-SNAPSHOT-UNEXPECTED-STDOUT') {
    throw 'Parser aceitou saida inesperada com nomes no stdout.'
  }
  $permissionSnapshot = ConvertFrom-AmoresPetNumericTableSnapshot -StandardOutput '' `
    -StandardError 'ERROR:  42501: permission denied for table synthetic_items' -ExitCode 1
  if ($permissionSnapshot.Success -or $permissionSnapshot.Category -cne 'PSQL_PERMISSAO_SQL' -or
      $permissionSnapshot.Code -cne 'AP-PSQL-SQL-PERMISSION') { throw 'Parser nao classificou SQLSTATE 42501.' }
  Add-TestResult 'Parser de snapshot: stderr estruturado, formato nao numerico, stdout inesperado e SQLSTATE 42501'

  $prefixedSqlError = Get-AmoresPetPsqlFailureDiagnostic `
    -StandardError 'psql:[fixture]/verificar_estrutura.sql:442: ERROR:  P0001: constraint mismatch' -ExitCode 3
  if ($prefixedSqlError.SqlState -cne 'P0001' -or $prefixedSqlError.Code -cne 'AP-PSQL-SQL-ERROR') {
    throw 'O classificador nao extraiu SQLSTATE quando psql prefixa arquivo e linha.'
  }
  Add-TestResult 'Classificador: SQLSTATE extraido de stderr psql com prefixo de arquivo e linha'

  $snapshotSql = Get-AmoresPetNumericTableSnapshotSql
  $oidSignature = "format\('%s:%s:%s:%s:%s',\s*attnum,\s*attname,\s*atttypid,\s*atttypmod"
  if ($snapshotSql -match $oidSignature -or $snapshotSql -notmatch 'format_type\(atttypid, atttypmod\)') {
    throw 'Fingerprint estrutural ainda usa OID de tipo em vez de nome e modificador estaveis.'
  }
  Add-TestResult 'Fingerprint estrutural: usa format_type e nao depende do OID interno do tipo'

  $checkpointNames = @('PG_DUMP_INICIADO','PG_DUMP_CONCLUIDO','ARQUIVO_GERADO','CATALOGO_INICIADO','CATALOGO_VALIDADO',
    'RESTAURACAO_INICIADA','PG_RESTORE_CONCLUIDO','CONTAGEM_TABELAS_VALIDADA','ESTRUTURAS_COMPARADAS','DADOS_COMPARADOS',
    'RESTAURACAO_TESTADA','PREFLIGHT_APROVADO')
  $restorePrerequisites = @('PG_DUMP_INICIADO','PG_DUMP_CONCLUIDO','ARQUIVO_GERADO','CATALOGO_INICIADO','CATALOGO_VALIDADO',
    'RESTAURACAO_INICIADA','PG_RESTORE_CONCLUIDO','CONTAGEM_TABELAS_VALIDADA','ESTRUTURAS_COMPARADAS','DADOS_COMPARADOS')
  $preflightPrerequisites = $restorePrerequisites + 'RESTAURACAO_TESTADA'
  $checkpointState = [ordered]@{}
  foreach ($checkpointName in $checkpointNames) { $checkpointState[$checkpointName] = $false }
  $earlyRestoreTest = Test-AmoresPetBackupCheckpointTransition -Name 'RESTAURACAO_TESTADA' -Completed $true -Checkpoints $checkpointState
  if ($earlyRestoreTest.Success -or $earlyRestoreTest.Code -cne 'AP-MIG-CHECKPOINT-PREREQUISITE') {
    throw 'Checkpoint RESTAURACAO_TESTADA foi aceito antes das verificacoes.'
  }
  foreach ($checkpointName in @('PG_DUMP_INICIADO','PG_DUMP_CONCLUIDO','ARQUIVO_GERADO','CATALOGO_INICIADO','CATALOGO_VALIDADO',
      'RESTAURACAO_INICIADA','PG_RESTORE_CONCLUIDO','CONTAGEM_TABELAS_VALIDADA','ESTRUTURAS_COMPARADAS','DADOS_COMPARADOS')) {
    $checkpointState[$checkpointName] = $true
  }
  $validRestoreTest = Test-AmoresPetBackupCheckpointTransition -Name 'RESTAURACAO_TESTADA' -Completed $true -Checkpoints $checkpointState
  $earlyPreflight = Test-AmoresPetBackupCheckpointTransition -Name 'PREFLIGHT_APROVADO' -Completed $true -Checkpoints $checkpointState
  if (-not $validRestoreTest.Success -or $earlyPreflight.Success) { throw 'Transicao de checkpoint incoerente foi aceita.' }
  $checkpointState['RESTAURACAO_TESTADA'] = $true
  $validPreflight = Test-AmoresPetBackupCheckpointTransition -Name 'PREFLIGHT_APROVADO' -Completed $true -Checkpoints $checkpointState
  $regression = Test-AmoresPetBackupCheckpointTransition -Name 'DADOS_COMPARADOS' -Completed $false -Checkpoints $checkpointState
  if (-not $validPreflight.Success -or $regression.Success -or $regression.Code -cne 'AP-MIG-CHECKPOINT-REGRESSION') {
    throw 'Preflight valido ou bloqueio de regressao de checkpoint falhou.'
  }
  foreach ($prerequisite in $restorePrerequisites) {
    foreach ($checkpointName in $checkpointNames) { $checkpointState[$checkpointName] = $true }
    $checkpointState[$prerequisite] = $false
    $transition = Test-AmoresPetBackupCheckpointTransition -Name 'RESTAURACAO_TESTADA' -Completed $true -Checkpoints $checkpointState
    if ($transition.Success -or $transition.Missing -cne $prerequisite) {
      throw "RESTAURACAO_TESTADA ignorou o predecessor $prerequisite."
    }
  }
  foreach ($prerequisite in $preflightPrerequisites) {
    foreach ($checkpointName in $checkpointNames) { $checkpointState[$checkpointName] = $true }
    $checkpointState[$prerequisite] = $false
    $transition = Test-AmoresPetBackupCheckpointTransition -Name 'PREFLIGHT_APROVADO' -Completed $true -Checkpoints $checkpointState
    if ($transition.Success -or $transition.Missing -cne $prerequisite) {
      throw "PREFLIGHT_APROVADO ignorou o predecessor $prerequisite."
    }
  }
  Add-TestResult 'Checkpoints: restauração e preflight exigem predecessores aprovados e nao admitem regressao'

  $version = Invoke-TestSuccess $pgDump @('--version') 'pg_dump --version'
  if ($version.StandardOutput -notmatch '\(PostgreSQL\)\s+17(?:\.|\s)') { throw 'pg_dump nao e versao 17.' }
  $version = Invoke-TestSuccess $pgRestore @('--version') 'pg_restore --version'
  if ($version.StandardOutput -notmatch '\(PostgreSQL\)\s+17(?:\.|\s)') { throw 'pg_restore nao e versao 17.' }
  $version = Invoke-TestSuccess $psql @('--version') 'psql --version'
  if ($version.StandardOutput -notmatch '\(PostgreSQL\)\s+17(?:\.|\s)') { throw 'psql nao e versao 17.' }
  Add-TestResult 'Executaveis: pg_dump, pg_restore e psql 17 iniciados'

  $portListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try { $portListener.Start(); $port = [int]$portListener.LocalEndpoint.Port }
  finally { $portListener.Stop() }
  if ($port -in @(3001,5432,55432)) { throw 'Porta temporaria coincidiu com porta protegida.' }

  $init = Invoke-TestSuccess $initDb @('-D',$dataDirectory,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8') 'initdb descartavel'
  $logPath = Join-Path $testRoot 'postgres log.txt'
  $start = Invoke-TestSuccess $pgCtl @('-D',$dataDirectory,'-o',"-h 127.0.0.1 -p $port",'-l',$logPath,'-w','-t','30','start') 'pg_ctl start descartavel' -NoCapture
  $serverStarted = $true
  Add-TestResult 'PostgreSQL 17 descartavel iniciado; backup e log serao testados em caminho com espacos'

  $null = Invoke-TestQuery 'postgres' "CREATE DATABASE $database" $port 'criar banco sintetico'
  $createSyntheticData = "CREATE TYPE public.synthetic_state AS ENUM ('open','closed'); CREATE TABLE public.synthetic_items (id integer PRIMARY KEY, label text NOT NULL, state public.synthetic_state); INSERT INTO public.synthetic_items VALUES (1, 'alpha', 'open'), (2, 'beta', 'open'), (3, 'gamma', 'closed'); CREATE TABLE public.synthetic_private_probe (id integer PRIMARY KEY, private_value text NOT NULL); INSERT INTO public.synthetic_private_probe VALUES (1, '$sentinel')"
  $null = Invoke-TestQuery $database $createSyntheticData $port 'criar dados sinteticos'
  $null = Invoke-TestQuery 'postgres' "CREATE DATABASE $emptyDatabase" $port 'criar banco sem tabelas'

  $emptySnapshot = Invoke-TestSnapshot $emptyDatabase $port 'snapshot sem tabelas'
  if ($emptySnapshot.Process.ExitCode -ne 0 -or -not $emptySnapshot.Assessment.Success -or
      $emptySnapshot.Assessment.Snapshot.TableCount -ne 0 -or $emptySnapshot.Assessment.Snapshot.RowCount -ne 0) {
    throw 'A consulta nao aceitou um banco sem tabelas de usuario.'
  }
  Add-TestResult 'Consulta real: banco sem tabelas retorna snapshot numerico vazio'

  $sourceSnapshotResult = Invoke-TestSnapshot $database $port 'snapshot origem'
  if ($sourceSnapshotResult.Process.ExitCode -ne 0 -or -not $sourceSnapshotResult.Assessment.Success) {
    throw ('Consulta real de contagem falhou: ' + $sourceSnapshotResult.Assessment.Code)
  }
  $sourceSnapshot = $sourceSnapshotResult.Assessment.Snapshot
  if ($sourceSnapshot.TableCount -ne 2 -or $sourceSnapshot.RowCount -ne 4) { throw 'Snapshot da origem retornou contagem inesperada.' }
  if ($sourceSnapshotResult.Process.StandardOutput.Trim() -or
      $sourceSnapshotResult.Process.StandardError -match 'synthetic_items|synthetic_private_probe|PRIVATE_SYNTHETIC_SENTINEL') {
    throw 'A consulta real imprimiu nome de tabela ou dado sintetico no resultado de contagem.'
  }
  Add-TestResult 'Consulta real: tabela sintetica retorna contagem e fingerprints numericos sem nomes'

  $dump = Invoke-TestSuccess $pgDump @('--format=custom','--no-password','--host','127.0.0.1','--port',[string]$port,
    '--username','postgres','--dbname',$database,'--file',$archivePath) 'pg_dump custom'
  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf) -or (Get-Item -LiteralPath $archivePath).Length -le 0) {
    throw 'pg_dump nao criou arquivo nao vazio.'
  }
  Add-TestResult 'pg_dump -Fc: arquivo nao vazio criado'

  $catalog = Invoke-TestSuccess $pgRestore @('--list',$archivePath) 'pg_restore --list'
  $assessment = Test-AmoresPetCustomArchiveCatalog -CatalogOutput $catalog.StandardOutput -ArchiveSize ([long](Get-Item -LiteralPath $archivePath).Length)
  if (-not $assessment.Success) { throw "Catalogo real rejeitado: $($assessment.Code)." }
  if ($catalog.StandardOutput -match '(?m)^; Format: CUSTOM') {
    throw 'A saida real do pg_restore deixou de reproduzir o falso negativo do predicado antigo.'
  }
  Add-TestResult 'Catalogo real PostgreSQL 17: predicado antigo falha por indentacao; validador corrigido aprova'

  $null = Invoke-TestQuery 'postgres' "CREATE DATABASE $restoredDatabase" $port 'criar banco restaurado'
  $null = Invoke-TestQuery $restoredDatabase "CREATE TYPE public.synthetic_oid_offset AS ENUM ('discard'); DROP TYPE public.synthetic_oid_offset" $port 'deslocar OID somente no destino descartavel'
  $restore = Invoke-TestSuccess $pgRestore @('--exit-on-error','--no-owner','--no-privileges','-h','127.0.0.1',
    '-p',[string]$port,'-U','postgres','-d',$restoredDatabase,$archivePath) 'pg_restore restauracao valida'
  $schemaSql = "SELECT string_agg(table_name || ':' || column_name || ':' || data_type || ':' || is_nullable, ',' ORDER BY table_name, ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('synthetic_items','synthetic_private_probe')"
  $dataSql = "SELECT md5((SELECT string_agg(id::text || ':' || label || ':' || state::text, ',' ORDER BY id) FROM public.synthetic_items) || '|' || (SELECT string_agg(id::text || ':' || private_value, ',' ORDER BY id) FROM public.synthetic_private_probe))"
  $sourceSchema = Invoke-TestQuery $database $schemaSql $port 'comparar schema origem'
  $restoredSchema = Invoke-TestQuery $restoredDatabase $schemaSql $port 'comparar schema restaurado'
  $sourceRows = Invoke-TestQuery $database $dataSql $port 'comparar dados origem'
  $restoredRows = Invoke-TestQuery $restoredDatabase $dataSql $port 'comparar dados restaurados'
  if ($sourceSchema -cne $restoredSchema -or $sourceRows -cne $restoredRows) {
    throw 'Schema ou dados restaurados divergiram da origem sintetica.'
  }
  $restoredSnapshotResult = Invoke-TestSnapshot $restoredDatabase $port 'snapshot restaurado'
  if ($restoredSnapshotResult.Process.ExitCode -ne 0 -or -not $restoredSnapshotResult.Assessment.Success) {
    throw ('Snapshot restaurado falhou: ' + $restoredSnapshotResult.Assessment.Code)
  }
  $restoredSnapshot = $restoredSnapshotResult.Assessment.Snapshot
  $sourceTypeOid = Invoke-TestQuery $database "SELECT oid FROM pg_type WHERE typname='synthetic_state'" $port 'consultar OID sintetico de tipo na origem'
  $restoredTypeOid = Invoke-TestQuery $restoredDatabase "SELECT oid FROM pg_type WHERE typname='synthetic_state'" $port 'consultar OID sintetico de tipo restaurado'
  if ($sourceTypeOid -ceq $restoredTypeOid) { throw 'Fixture nao comprovou a diferenca de OID interno entre origem e restauracao.' }
  foreach ($property in @('TableCount','RowCount','DataFingerprintA','DataFingerprintB','StructureFingerprintA','StructureFingerprintB')) {
    if ([decimal]$sourceSnapshot.$property -ne [decimal]$restoredSnapshot.$property) {
      throw "Fingerprint numerico divergente apos restauracao: $property."
    }
  }
  $null = Invoke-TestQuery $restoredDatabase "UPDATE public.synthetic_items SET label = 'changed' WHERE id = 1" $port 'alterar somente dado temporario'
  $changedDataResult = Invoke-TestSnapshot $restoredDatabase $port 'detectar dado alterado'
  if (-not $changedDataResult.Assessment.Success -or
      $changedDataResult.Assessment.Snapshot.DataFingerprintA -eq $sourceSnapshot.DataFingerprintA -and
      $changedDataResult.Assessment.Snapshot.DataFingerprintB -eq $sourceSnapshot.DataFingerprintB) {
    throw 'Fingerprint nao detectou alteracao de valor mantendo a contagem.'
  }
  $null = Invoke-TestQuery $restoredDatabase "UPDATE public.synthetic_items SET label = 'alpha' WHERE id = 1; ALTER TABLE public.synthetic_items ADD COLUMN temporary_shape_check integer" $port 'alterar schema temporario'
  $changedSchemaResult = Invoke-TestSnapshot $restoredDatabase $port 'detectar schema alterado'
  if (-not $changedSchemaResult.Assessment.Success -or
      $changedSchemaResult.Assessment.Snapshot.StructureFingerprintA -eq $sourceSnapshot.StructureFingerprintA -and
      $changedSchemaResult.Assessment.Snapshot.StructureFingerprintB -eq $sourceSnapshot.StructureFingerprintB) {
    throw 'Fingerprint nao detectou alteracao estrutural.'
  }
  Add-TestResult 'Restauracao descartavel: fingerprint permanece igual com OID de tipo diferente; schema/dados coincidem e alteracoes sao detectadas'

  $limitedRole = 'snapshot_limited_' + $testId
  $null = Invoke-TestQuery 'postgres' "CREATE ROLE $limitedRole NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION" $port 'criar role SQL limitada'
  $deniedSnapshotResult = Invoke-TestSnapshot $database $port 'forcar permissao SQL negada' "SET ROLE $limitedRole;`n"
  if ($deniedSnapshotResult.Process.ExitCode -eq 0 -or $deniedSnapshotResult.Assessment.Success -or
      $deniedSnapshotResult.Assessment.Category -cne 'PSQL_PERMISSAO_SQL' -or
      $deniedSnapshotResult.Assessment.Code -cne 'AP-PSQL-SQL-PERMISSION') {
    throw 'A falha real de permissao SQL nao bloqueou ou nao foi classificada.'
  }
  Add-TestResult 'Permissao SQL: consulta de contagem recusada para role sem SELECT e classificada como 42501'

  $badDump = Invoke-TestProcess $pgDump @('--format=custom','--no-password','--host','127.0.0.1','--port',[string]$port,
    '--username','postgres','--dbname',('missing_' + $testId),'--file',(Join-Path $testRoot 'should not exist.custom')) 'pg_dump falha simulada'
  if ($badDump.ExitCode -eq 0) { throw 'Falha simulada do pg_dump retornou sucesso.' }
  Add-TestResult 'Falha simulada do pg_dump detectada pelo exit code'

  $badRestore = Invoke-TestProcess $pgRestore @('--list',(Join-Path $testRoot 'missing archive.custom')) 'pg_restore falha simulada'
  if ($badRestore.ExitCode -eq 0) { throw 'Falha simulada do pg_restore retornou sucesso.' }
  Add-TestResult 'Falha simulada do pg_restore detectada pelo exit code'

  $archiveBytes = [IO.File]::ReadAllBytes($archivePath)
  if ($archiveBytes.Length -lt 256) { throw 'Arquivo custom sintetico pequeno demais para teste de truncamento.' }
  $catalogPassRestoreFail = $false
  $truncatedFailureStage = ''
  foreach ($cutBytes in @(1, 4, 16, 64, 128, 256)) {
    if ($archiveBytes.Length -le ($cutBytes + 128)) { continue }
    $truncatedBytes = New-Object byte[] ($archiveBytes.Length - $cutBytes)
    [Array]::Copy($archiveBytes, $truncatedBytes, $truncatedBytes.Length)
    [IO.File]::WriteAllBytes($truncatedPath, $truncatedBytes)
    $truncatedCatalog = Invoke-TestProcess $pgRestore @('--list',$truncatedPath) "catalogo truncado $cutBytes"
    if ($truncatedCatalog.ExitCode -ne 0) {
      $truncatedFailureStage = 'catalogo'
      continue
    }
    $attemptDatabase = $truncatedDatabase + '_' + $cutBytes
    $null = Invoke-TestQuery 'postgres' "CREATE DATABASE $attemptDatabase" $port 'criar destino de restauracao truncada'
    $truncatedRestore = Invoke-TestProcess $pgRestore @('--exit-on-error','--no-owner','--no-privileges','-h','127.0.0.1',
      '-p',[string]$port,'-U','postgres','-d',$attemptDatabase,$truncatedPath) "restaurar arquivo truncado $cutBytes"
    if ($truncatedRestore.ExitCode -ne 0) {
      $catalogPassRestoreFail = $true
      $truncatedFailureStage = 'restauracao'
      break
    }
  }
  if (-not $catalogPassRestoreFail) { throw 'Nao foi possivel reproduzir uma restauracao incompleta apos catalogo validao.' }
  Add-TestResult "Restauração incompleta recusada por pg_restore apos catalogo válido (etapa: $truncatedFailureStage)"

  $databaseSourceDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\backend\src\database'))
  $stagedDatabaseDirectory = Join-Path $testRoot 'realistic database fixture'
  [void][IO.Directory]::CreateDirectory($stagedDatabaseDirectory)
  foreach ($item in Get-ChildItem -LiteralPath $databaseSourceDirectory -Force) {
    Copy-Item -LiteralPath $item.FullName -Destination $stagedDatabaseDirectory -Recurse -Force
  }
  $bootstrapPath = Join-Path $stagedDatabaseDirectory 'bootstrap\001_schema_completo.sql'
  $bootstrapText = [IO.File]::ReadAllText($bootstrapPath, [Text.Encoding]::UTF8)
  $restrictPattern = '(?im)^[ \t]*\\(?:restrict|unrestrict)(?:[ \t]+.*)?\r?$'
  if ([regex]::Matches($bootstrapText, $restrictPattern).Count -ne 2) {
    throw 'Dump bootstrap mudou as diretivas psql esperadas; fixture nao sera adaptada.'
  }
  $bootstrapText = [regex]::Replace($bootstrapText, $restrictPattern, '')
  [IO.File]::WriteAllText($bootstrapPath, $bootstrapText, (New-Object Text.UTF8Encoding($false)))

  $stagedSchemaPath = Join-Path $stagedDatabaseDirectory 'schema.sql'
  $schemaLines = [IO.File]::ReadAllLines($stagedSchemaPath, [Text.Encoding]::UTF8)
  $excludedSchemaLines = @('\ir migrations/036_autorizacoes_operacionais.sql',
    '\ir migrations/037_notificacoes_super_administrador.sql','\ir verificar_estrutura.sql')
  foreach ($line in $excludedSchemaLines) {
    if (@($schemaLines | Where-Object { $_ -ceq $line }).Count -ne 1) {
      throw "schema.sql nao contem exatamente uma diretiva esperada para a fixture: $line"
    }
  }
  $schemaLines = @($schemaLines | Where-Object { $excludedSchemaLines -cnotcontains $_ })
  [IO.File]::WriteAllText($stagedSchemaPath, ($schemaLines -join "`r`n") + "`r`n", (New-Object Text.UTF8Encoding($false)))

  $null = Invoke-TestQuery 'postgres' "CREATE DATABASE $realisticSourceDatabase ENCODING 'UTF8' TEMPLATE template0" $port 'criar banco de esquema realista'
  $schemaInstall = Invoke-TestSuccess $psql @('-X','-w','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-v',"banco_confirmado=$realisticSourceDatabase",'-h','127.0.0.1','-p',[string]$port,'-U','postgres',
    '-d',$realisticSourceDatabase,'-f',$stagedSchemaPath) 'instalar baseline realista ate migration 035'
  Add-TestResult 'Fixture realista: schema oficial e migrations 025-035 instalados em banco descartavel'

  $realisticSourceSnapshotResult = Invoke-TestSnapshot $realisticSourceDatabase $port 'snapshot baseline 035'
  if ($realisticSourceSnapshotResult.Process.ExitCode -ne 0 -or -not $realisticSourceSnapshotResult.Assessment.Success) {
    throw ('Snapshot baseline 035 falhou: ' + $realisticSourceSnapshotResult.Assessment.Code)
  }
  $realisticSourceSnapshot = $realisticSourceSnapshotResult.Assessment.Snapshot
  $readerRole = 'snapshot_reader_' + $testId
  $null = Invoke-TestQuery 'postgres' "CREATE ROLE $readerRole NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION" $port 'criar role de leitura limitada descartavel'
  $null = Invoke-TestQuery $realisticSourceDatabase "GRANT USAGE ON SCHEMA public TO $readerRole; GRANT SELECT ON ALL TABLES IN SCHEMA public TO $readerRole" $port 'conceder leitura somente no banco descartavel de origem'
  $readerSnapshot = Invoke-TestSnapshot $realisticSourceDatabase $port 'fingerprint sem privilegios administrativos' "SET ROLE $readerRole;`n"
  if ($readerSnapshot.Process.ExitCode -ne 0 -or -not $readerSnapshot.Assessment.Success) {
    $readerDiagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $readerSnapshot.Process.StandardError `
      -ExitCode $readerSnapshot.Process.ExitCode
    $readerDetail = ([string]$readerSnapshot.Process.StandardError -replace '[\r\n\t]+',' ').Trim()
    if ($readerDetail.Length -gt 1800) { $readerDetail = $readerDetail.Substring(0,1800) + '...' }
    throw ('Fingerprint com role de leitura falhou: exit=' + $readerSnapshot.Process.ExitCode +
      '; SQLSTATE=' + $readerDiagnostic.SqlState + '; detalhe somente da fixture descartavel=' + $readerDetail)
  }
  Assert-TestSnapshotMatches $realisticSourceSnapshot $readerSnapshot.Assessment.Snapshot 'Leitura limitada'
  Add-TestResult 'Permissoes: fingerprints executados por role sem privilégios administrativos, com SELECT de leitura'

  $realisticDump = Invoke-TestSuccess $pgDump @('--format=custom','--no-password','--host','127.0.0.1','--port',[string]$port,
    '--username','postgres','--dbname',$realisticSourceDatabase,'--file',$realisticArchivePath) 'backup custom do schema realista'
  $realisticArchiveSize = [long](Get-Item -LiteralPath $realisticArchivePath).Length
  $realisticCatalog = Invoke-TestSuccess $pgRestore @('--list',$realisticArchivePath) 'catalogo do schema realista'
  if (-not (Test-AmoresPetCustomArchiveCatalog -CatalogOutput $realisticCatalog.StandardOutput -ArchiveSize $realisticArchiveSize).Success) {
    throw 'Catalogo do backup realista nao passou na validacao.'
  }
  $null = Invoke-TestQuery 'postgres' "CREATE DATABASE $realisticRestoredDatabase ENCODING 'UTF8' TEMPLATE template0" $port 'criar destino descartavel do preflight realista'
  $realisticRestore = Invoke-TestSuccess $pgRestore @('--exit-on-error','--no-owner','--no-privileges','-h','127.0.0.1',
    '-p',[string]$port,'-U','postgres','-d',$realisticRestoredDatabase,$realisticArchivePath) 'restaurar schema realista'
  $realisticRestoredSnapshotResult = Invoke-TestSnapshot $realisticRestoredDatabase $port 'snapshot restaurado realista'
  if ($realisticRestoredSnapshotResult.Process.ExitCode -ne 0 -or -not $realisticRestoredSnapshotResult.Assessment.Success) {
    throw ('Snapshot restaurado realista falhou: ' + $realisticRestoredSnapshotResult.Assessment.Code)
  }
  $realisticBefore = $realisticRestoredSnapshotResult.Assessment.Snapshot
  Assert-TestSnapshotMatches $realisticSourceSnapshot $realisticBefore 'Restore do schema realista'
  Add-TestResult 'Preflight realista: pg_dump custom, catálogo, restauração e comparação integral antes das migrations'

  $migrationStage = Join-Path $testRoot 'migration stage'
  $migrationStageDirectory = Join-Path $migrationStage 'migrations'
  [void][IO.Directory]::CreateDirectory($migrationStageDirectory)
  Copy-Item -LiteralPath (Join-Path $stagedDatabaseDirectory 'confirmar_destino.sql') -Destination $migrationStage
  foreach ($migrationFile in @('036_autorizacoes_operacionais.sql','037_notificacoes_super_administrador.sql')) {
    $migrationSourcePath = Join-Path $databaseSourceDirectory ('migrations\' + $migrationFile)
    $migrationStagePath = Join-Path $migrationStageDirectory $migrationFile
    Copy-Item -LiteralPath $migrationSourcePath -Destination $migrationStagePath
  }
  $migrationWrapperPath = Join-Path $migrationStage 'aplicar-036-037.sql'
  $migrationWrapper = @'
\set ON_ERROR_STOP on
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
\ir migrations/036_autorizacoes_operacionais.sql
\ir migrations/037_notificacoes_super_administrador.sql
'@
  [IO.File]::WriteAllText($migrationWrapperPath, $migrationWrapper, (New-Object Text.UTF8Encoding($false)))
  $applyDisposable = Invoke-TestSuccess $psql @('-X','-w','-q','-1','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-v',"banco_confirmado=$realisticRestoredDatabase",'-h','127.0.0.1','-p',[string]$port,'-U','postgres',
    '-d',$realisticRestoredDatabase,'-f',$migrationWrapperPath) 'aplicar migrations 036/037 somente no descarte'
  Add-TestResult 'Migrations: 036 e 037 aplicadas em transacao apenas na copia restaurada descartavel'

  $verifier = Invoke-TestProcess $psql @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',$realisticRestoredDatabase,
    '-f',(Join-Path $databaseSourceDirectory 'verificar_estrutura.sql')) 'verificar esquema completo 036/037'
  if ($verifier.ExitCode -ne 0) {
    $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $verifier.StandardError -ExitCode $verifier.ExitCode
    $detail = ([string]$verifier.StandardError -replace '[\r\n\t]+',' ').Trim()
    if ($detail.Length -gt 600) { $detail = $detail.Substring(0,600) + '...' }
    throw "verificar_estrutura.sql: exit=$($verifier.ExitCode); code=$($diagnostic.Code); SQLSTATE=$($diagnostic.SqlState); detalhe fixture=$detail"
  }
  if ($verifier.StandardOutput -notmatch 'Contrato estrutural 036 validado' -or
      $verifier.StandardOutput -notmatch 'Contrato 037 validado') {
    throw 'O verificador estrutural concluiu sem confirmar explicitamente os contratos 036 e 037.'
  }
  Add-TestResult 'Verificador estrutural: baseline completo e contratos das migrations 036/037 aprovados'

  $invalidPorteConstraint = Invoke-TestSuccess $psql @('-X','-w','-q','-1','-v','ON_ERROR_STOP=1',
    '-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',$realisticRestoredDatabase,'-c',
    "ALTER TABLE public.pets DROP CONSTRAINT chk_pets_porte; ALTER TABLE public.pets ADD CONSTRAINT chk_pets_porte CHECK (porte IS NULL OR porte IN ('pequeno','medio','grande'))") `
    'instalar constraint sintetica incompatível somente no descarte'
  $invalidVerifier = Invoke-TestProcess $psql @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',$realisticRestoredDatabase,
    '-f',(Join-Path $databaseSourceDirectory 'verificar_estrutura.sql')) 'rejeitar constraint sintetica divergente'
  $invalidVerifierDiagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $invalidVerifier.StandardError `
    -ExitCode $invalidVerifier.ExitCode
  if ($invalidVerifier.ExitCode -ne 3 -or $invalidVerifierDiagnostic.SqlState -cne 'P0001' -or
      $invalidVerifier.StandardError -notmatch 'chk_pets_porte possui definicao incompativel') {
    throw 'O verificador nao rejeitou uma regra de porte materialmente divergente.'
  }
  $restorePorteConstraint = Invoke-TestSuccess $psql @('-X','-w','-q','-1','-v','ON_ERROR_STOP=1',
    '-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',$realisticRestoredDatabase,'-c',
    "ALTER TABLE public.pets DROP CONSTRAINT chk_pets_porte; ALTER TABLE public.pets ADD CONSTRAINT chk_pets_porte CHECK (porte IS NULL OR porte IN ('pequeno','medio','grande','gigante'))") `
    'restaurar constraint oficial somente no descarte'
  $recoveredVerifier = Invoke-TestProcess $psql @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',$realisticRestoredDatabase,
    '-f',(Join-Path $databaseSourceDirectory 'verificar_estrutura.sql')) 'revalidar constraint oficial descartavel'
  if ($recoveredVerifier.ExitCode -ne 0 -or $recoveredVerifier.StandardOutput -notmatch 'Contrato 037 validado') {
    throw 'O verificador nao voltou a aprovar a constraint oficial restaurada.'
  }
  Add-TestResult 'Contrato estrutural: deparse PG17 equivalente aprovado; divergencia real rejeitada com SQLSTATE P0001'

  $realisticAfterResult = Invoke-TestSnapshot $realisticRestoredDatabase $port 'snapshot pos-migration realista'
  if ($realisticAfterResult.Process.ExitCode -ne 0 -or -not $realisticAfterResult.Assessment.Success) {
    throw ('Snapshot pos-migration falhou: ' + $realisticAfterResult.Assessment.Code)
  }
  $realisticAfter = $realisticAfterResult.Assessment.Snapshot
  Assert-TestSnapshotMatches $realisticBefore $realisticAfter 'Preservacao apos migrations 036/037'
  if ($realisticAfter.MigrationTableCount -ne 2 -or $realisticAfter.MigrationRowCount -ne 0) {
    throw 'As duas estruturas novas nao existem vazias apos as migrations.'
  }
  Add-TestResult 'Preflight completo: estruturas e dados preservados, duas tabelas 036 presentes e vazias'

  $errorSqlPath = Join-Path $testRoot 'synthetic SQL error.sql'
  [IO.File]::WriteAllText($errorSqlPath, "SELECT 1 / 0;`r`n", (New-Object Text.UTF8Encoding($false)))
  $sqlFailure = Invoke-TestProcess $psql @('-X','-w','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
    '-h','127.0.0.1','-p',[string]$port,'-U','postgres','-d',$realisticRestoredDatabase,'-f',$errorSqlPath) 'simular SQLSTATE e exit code 3'
  $sqlFailureDiagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $sqlFailure.StandardError -ExitCode $sqlFailure.ExitCode
  if ($sqlFailure.ExitCode -ne 3 -or $sqlFailureDiagnostic.SqlState -cne '22012' -or
      $sqlFailureDiagnostic.Category -cne 'PSQL_ERRO_SQL') {
    throw 'O erro SQL simulado nao preservou exit code 3 e SQLSTATE 22012.'
  }
  Add-TestResult 'Tratamento de erro: psql exit 3 e SQLSTATE 22012 classificados separadamente'

  $applyPath = Join-Path $PSScriptRoot 'Aplicar-Migrations-Lote2.ps1'
  $applyTokens = $null
  $parseErrors = $null
  $applyAst = [Management.Automation.Language.Parser]::ParseFile($applyPath, [ref]$applyTokens, [ref]$parseErrors)
  if ($parseErrors.Count -gt 0) { throw 'Aplicador nao foi analisado para validar a saida sanitizada.' }
  $summaryAst = $applyAst.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -ceq 'Get-SanitizedOperationSummary' }, $true)
  if (-not $summaryAst) { throw 'Funcao de resumo sanitizado nao encontrada no aplicador.' }
  Invoke-Expression $summaryAst.Extent.Text
  $fakeReport = [pscustomobject]@{
    error = $sentinel; persistentDdlStarted = $false; status = 'falhou'; phase = 'teste'; technicalCode = 'AP-TEST'
    migrationStateBefore = 'nao consultado'; migrationStateAfter = 'nao consultado'; backupState = 'teste'
    backupCheckpoints = [ordered]@{ RESTAURACAO_TESTADA = $false }
    backupCheckpointFailure = $null; backup = [pscustomobject]@{ pgRestoreList = 'valido' }
    preflightState = 'teste'; confirmationPresented = $false; confirmationAccepted = $false
    persistentOperationAttempted = $false; persistentPsqlStarted = $false; persistentOperationState = 'nao iniciada'
    internalFailureFunction = 'teste'; internalFailureLocation = 'Aplicar-Migrations-Lote2.ps1:linha 1'
    launcherPolicyMode = 'DIRECT'; snapshot = $sourceSnapshot; tableName = 'private.synthetic_items'
  }
  $sanitizedSummary = Get-SanitizedOperationSummary -Report $fakeReport -SensitiveValue $sentinel
  if ($sanitizedSummary.Contains($sentinel) -or $sanitizedSummary.Contains('private.synthetic_items') -or
      $sanitizedSummary.Contains('synthetic_items')) { throw 'Resumo sanitizado expos tabela ou sentinela sintetica.' }
  Add-TestResult 'Relatorio sanitizado: omite nomes, linhas, fingerprint bruto e sentinela de dado sintetico'

  Write-Output 'RESULTADO: APROVADO'
  foreach ($result in $results) { Write-Output "- $result" }
} finally {
  $safeToRemove = $true
  if ($serverStarted -or (Test-Path -LiteralPath (Join-Path $dataDirectory 'postmaster.pid'))) {
    $stop = Invoke-TestProcess $pgCtl @('-D',$dataDirectory,'-m','fast','-w','-t','30','stop') 'pg_ctl stop descartavel' -NoCapture
    if ($stop.ExitCode -ne 0) { $safeToRemove = $false }
    if (Test-Path -LiteralPath (Join-Path $dataDirectory 'postmaster.pid')) { $safeToRemove = $false }
  }
  $fullRoot = [IO.Path]::GetFullPath($testRoot)
  $tempPrefix = $tempRoot.TrimEnd('\') + '\'
  if (-not $fullRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetFileName($fullRoot) -cne "Amores Pet Backup Test $testId") { $safeToRemove = $false }
  $fullData = [IO.Path]::GetFullPath($dataDirectory)
  if (-not $fullData.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetFileName($fullData) -cne "amores-pet-backup-cluster-$testId") { $safeToRemove = $false }
  if ($safeToRemove -and (Test-Path -LiteralPath $fullRoot)) {
    Remove-Item -LiteralPath $fullRoot -Recurse -Force
    if (Test-Path -LiteralPath $fullData) { Remove-Item -LiteralPath $fullData -Recurse -Force }
  } elseif (Test-Path -LiteralPath $fullRoot) {
    Write-Warning "O ambiente descartavel foi preservado para analise em: $fullRoot"
  } elseif (Test-Path -LiteralPath $fullData) {
    Write-Warning 'O cluster descartavel foi preservado para analise.'
  }
  $remainingPgEnvironment = @(Get-ChildItem Env: | Where-Object { $_.Name -match '^(PG|PSQL)' -or $_.Name -eq 'DATABASE_URL' } | ForEach-Object { $_.Name })
  foreach ($name in $remainingPgEnvironment) {
    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
  }
  foreach ($name in $savedPgEnvironment.Keys) { Set-Item -LiteralPath "Env:$name" -Value $savedPgEnvironment[$name] }
}
