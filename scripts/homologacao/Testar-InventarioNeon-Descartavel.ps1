Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Postmaster-Identity.psm1') -Force

$script:PostgresBin = 'C:\Program Files\PostgreSQL\17\bin'
$script:TestRoot = $null
$script:ServerStarted = $false
$script:StartAttempted = $false
$script:SavedEnvironment = @{}
$script:CurrentStage = 'Inicializacao'
$pgCtl = $null
$dataDirectory = $null
$testPort = 0
$nodeProcess = $null

function Invoke-TestTool([string]$Executable, [string[]]$Arguments, [string]$Label, [switch]$NoCapture) {
  $result = Invoke-AmoresPetNativeProcess -Executable $Executable -Arguments $Arguments -NoCapture:$NoCapture
  if (-not $result.Started) { throw ('AP-INVTEST-LAUNCH-' + $Label) }
  if ($result.ExitCode -ne 0) {
    $detail = ([string]$result.StandardError + ' ' + [string]$result.StandardOutput).Trim() -replace '[\r\n\t]+',' '
    $detail = $detail -replace '(?i)[A-Z]:\\[^ ]+','[local path]'
    if ($detail.Length -gt 160) { $detail = $detail.Substring(0,160) }
    throw ('AP-INVTEST-EXIT-' + $Label + '-' + [int]$result.ExitCode + ':' + $detail)
  }
  return $result
}

try {
  $script:CurrentStage = 'Validacao das ferramentas PostgreSQL 17'
  $initdb = Join-Path $script:PostgresBin 'initdb.exe'
  $pgCtl = Join-Path $script:PostgresBin 'pg_ctl.exe'
  $psql = Join-Path $script:PostgresBin 'psql.exe'
  foreach ($tool in @($initdb,$pgCtl,$psql)) { if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw 'AP-INVTEST-PG17-MISSING' } }
  $version = Invoke-TestTool $initdb @('--version') 'VERSION'
  if (($version.StandardOutput + $version.StandardError) -notmatch 'PostgreSQL\) 17\.') { throw 'AP-INVTEST-PG17-MISMATCH' }

  foreach ($entry in Get-ChildItem Env:) {
    if ($entry.Name -match '^(PG|PSQL|DB_)' -or $entry.Name -eq 'DATABASE_URL') {
      $script:SavedEnvironment[$entry.Name] = $entry.Value
      Remove-Item -LiteralPath ('Env:' + $entry.Name) -ErrorAction SilentlyContinue
    }
  }

  $script:CurrentStage = 'Criacao do cluster descartavel'
  $tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
  $script:TestRoot = Join-Path $tempParent ('Amores Pet Neon Inventory Test-' + [guid]::NewGuid().ToString('N'))
  $resolvedTestRoot = [IO.Path]::GetFullPath($script:TestRoot)
  if (-not $resolvedTestRoot.StartsWith($tempParent + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'AP-INVTEST-TEMP-ALLOWLIST' }
  [void][IO.Directory]::CreateDirectory($script:TestRoot)
  $dataDirectory = Join-Path $script:TestRoot 'data cluster'
  $logPath = Join-Path $script:TestRoot 'postgres local.log'
  $setupSql = Join-Path $script:TestRoot 'synthetic schema.sql'
  $probeScript = Join-Path $script:TestRoot 'run inventory probes.cjs'

  $portReservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
  $portReservation.Start()
  $testPort = [int]$portReservation.LocalEndpoint.Port
  $portReservation.Stop()

  $script:CurrentStage = 'Inicializacao PostgreSQL descartavel'
  $null = Invoke-TestTool $initdb @('-D',$dataDirectory,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8') 'INITDB'
  $script:StartAttempted = $true
  $null = Invoke-TestTool $pgCtl @('-D',$dataDirectory,'-o',("-h 127.0.0.1 -p $testPort"),'-l',$logPath,'-w','-t','30','start') 'START' -NoCapture
  $script:ServerStarted = $true

  $script:CurrentStage = 'Preparacao de schema inteiramente sintetico'
  $setup = @'
CREATE ROLE amores_pet_inventory_reader LOGIN;
CREATE SCHEMA inventory_probe;
CREATE TABLE inventory_probe.synthetic_tutor (id integer PRIMARY KEY, email text);
CREATE TABLE inventory_probe.synthetic_pet (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tutor_id integer REFERENCES inventory_probe.synthetic_tutor(id), nome text);
CREATE VIEW inventory_probe.synthetic_pet_view AS SELECT id, tutor_id, nome FROM inventory_probe.synthetic_pet;
CREATE FUNCTION inventory_probe.audit_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
CREATE TRIGGER synthetic_pet_audit BEFORE INSERT ON inventory_probe.synthetic_pet FOR EACH ROW EXECUTE FUNCTION inventory_probe.audit_probe();
GRANT USAGE ON SCHEMA inventory_probe TO amores_pet_inventory_reader;
'@
  [IO.File]::WriteAllText($setupSql,$setup,(New-Object Text.UTF8Encoding($false)))
  $null = Invoke-TestTool $psql @('-X','-h','127.0.0.1','-p',[string]$testPort,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f',$setupSql) 'SYNTHETIC-SCHEMA'

  $backendRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\backend'))
  $helperPath = Join-Path $backendRoot 'src\database\inventariarHomologacaoNeon.cjs'
  $pgPackage = Join-Path $backendRoot 'node_modules\pg'
  if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf) -or -not (Test-Path -LiteralPath $pgPackage -PathType Container)) { throw 'AP-INVTEST-HELPER-OR-PG-MISSING' }
  $probe = @'
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const pg = require(path.join(process.env.AMORES_INVTEST_BACKEND, 'node_modules', 'pg'));
const { CONSULTAS } = require(process.env.AMORES_INVTEST_HELPER);
let currentStage = 'startup';
(async () => {
  currentStage = 'connect';
  const host = process.env.AMORES_INVTEST_HOST;
  const port = Number(process.env.AMORES_INVTEST_PORT);
  if (host !== '127.0.0.1' || port === 55432 || process.env.AMORES_INVTEST_DATABASE !== 'postgres') throw new Error('test target rejected');
  const client = new pg.Client({ host, port, database: 'postgres', user: 'amores_pet_inventory_reader', password: '', ssl: false, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
  try {
    await client.connect();
    currentStage = 'readonly_transaction';
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
    const results = {};
    for (const [name, sql] of Object.entries(CONSULTAS)) {
      currentStage = name;
      const result = await client.query(sql);
      assert.equal(result.rows.length, 1, `${name} should return one metadata row`);
      results[name] = result.rows[0];
    }
    assert.ok(Number(results.objetos.tables) >= 2);
    assert.ok(Number(results.objetos.views) >= 1);
    assert.ok(Number(results.objetos.sequences) >= 1);
    assert.ok(Number(results.objetos.foreign_keys) >= 1);
    assert.ok(Number(results.objetos.triggers) >= 1);
    assert.ok(results.privacidade.columns.some(column => column.category === 'personal_data'));
    assert.equal(results.identidade.database, 'postgres');
    assert.ok(Number(results.identidade.server_version_num) >= 170000 && Number(results.identidade.server_version_num) < 180000);
    assert.equal(results.identidade.server_encoding, 'UTF8');
    await client.query('ROLLBACK');
    process.stdout.write(`PASS_READONLY_METADATA_QUERIES=${Object.keys(CONSULTAS).length}\n`);
  } finally { await client.end().catch(() => {}); }
})().catch(error => {
  const stage = /^[a-z_]{1,40}$/.test(String(currentStage || '')) ? currentStage : 'query';
  const code = /^[0-9A-Z]{5}$/.test(String(error && error.code || '')) ? error.code : 'CLIENT_ERROR';
  const type = /^[A-Za-z0-9_]{1,40}$/.test(String(error && error.name || '')) ? error.name : 'Error';
  const message = String(error && error.message || '').replace(/[\r\n\t]+/g, ' ').replace(/[^A-Za-z0-9 _.,:;()=-]/g, '').slice(0, 140);
  process.stderr.write(`INVENTORY_PROBE_FAILED|${stage}|${code}|${type}|${message}\n`);
  process.exitCode = 1;
});
'@
  [IO.File]::WriteAllText($probeScript,$probe,(New-Object Text.UTF8Encoding($false)))

  $script:CurrentStage = 'Consultas de catalogo com role nao administrativa'
  $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $nodeInfo = New-Object System.Diagnostics.ProcessStartInfo
  $nodeInfo.FileName = [IO.Path]::GetFullPath([string]$node)
  $nodeInfo.Arguments = ConvertTo-AmoresPetWindowsArgument $probeScript
  $nodeInfo.WorkingDirectory = $backendRoot
  $nodeInfo.UseShellExecute = $false
  $nodeInfo.CreateNoWindow = $true
  $nodeInfo.RedirectStandardOutput = $true
  $nodeInfo.RedirectStandardError = $true
  $nodeInfo.EnvironmentVariables['AMORES_INVTEST_BACKEND'] = $backendRoot
  $nodeInfo.EnvironmentVariables['AMORES_INVTEST_HELPER'] = $helperPath
  $nodeInfo.EnvironmentVariables['AMORES_INVTEST_HOST'] = '127.0.0.1'
  $nodeInfo.EnvironmentVariables['AMORES_INVTEST_PORT'] = [string]$testPort
  $nodeInfo.EnvironmentVariables['AMORES_INVTEST_DATABASE'] = 'postgres'
  $nodeProcess = New-Object System.Diagnostics.Process
  $nodeProcess.StartInfo = $nodeInfo
  if (-not $nodeProcess.Start()) { throw 'AP-INVTEST-NODE-LAUNCH' }
  $nodeOutTask = $nodeProcess.StandardOutput.ReadToEndAsync()
  $nodeErrTask = $nodeProcess.StandardError.ReadToEndAsync()
  if (-not $nodeProcess.WaitForExit(30000)) { try { $nodeProcess.Kill() } catch { }; throw 'AP-INVTEST-NODE-TIMEOUT' }
  $nodeOutput = $nodeOutTask.GetAwaiter().GetResult()
  $nodeError = $nodeErrTask.GetAwaiter().GetResult()
  $nodeExitCode = [int]$nodeProcess.ExitCode
  $nodeProcess.Dispose()
  $nodeProcess = $null
  if ($nodeExitCode -ne 0 -or $nodeOutput -notmatch 'PASS_READONLY_METADATA_QUERIES=\d+') {
    $probeFailure = [regex]::Match($nodeError, '(?m)^INVENTORY_PROBE_FAILED\|([a-z_]{1,40})\|([0-9A-Z_]{5,40})\|([A-Za-z0-9_]{1,40})\|([^\r\n]{0,140})\s*$')
    if ($probeFailure.Success) { throw ('AP-INVTEST-READONLY-QUERY-' + $probeFailure.Groups[1].Value + '-' + $probeFailure.Groups[2].Value + '-' + $probeFailure.Groups[3].Value + '-' + $probeFailure.Groups[4].Value) }
    throw 'AP-INVTEST-READONLY-QUERY-FAILED'
  }

  Write-Host 'PASS: PostgreSQL 17 descartavel iniciado em loopback.' -ForegroundColor Green
  Write-Host 'PASS: consultas de metadados executadas em transacao READ ONLY por role nao administrativa.' -ForegroundColor Green
  Write-Host 'PASS: tabelas, view, sequence, FK, trigger, colunas classificadas e privilegios foram consultados sem ler linhas.' -ForegroundColor Green
  Write-Host 'Nenhum banco persistente ou dado real foi acessado.'
  Write-Host ($nodeOutput.Trim())
} catch {
  Write-Host ('TESTE INTERROMPIDO; etapa=' + $script:CurrentStage + '; codigo=' + $_.Exception.Message) -ForegroundColor Yellow
  exit 1
} finally {
  if ($nodeProcess -and -not $nodeProcess.HasExited) { try { $nodeProcess.Kill(); $nodeProcess.WaitForExit(5000) | Out-Null } catch { } }
  if ($nodeProcess) { $nodeProcess.Dispose() }
  $keepTestRoot = $false
  $pidPath = if ($dataDirectory) { Join-Path $dataDirectory 'postmaster.pid' } else { $null }
  if ($script:StartAttempted -and $pidPath -and (Test-Path -LiteralPath $pidPath -PathType Leaf)) {
    try {
      $postmasterIdentity = Get-AmoresPetPostmasterIdentity -Path $pidPath -ExpectedDataDirectory $dataDirectory `
        -ExpectedPort $testPort -ExpectedListenAddress '127.0.0.1'
      $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $postmasterIdentity.ProcessId `
        -ExpectedExecutable (Join-Path $script:PostgresBin 'postgres.exe') -ExpectedDataDirectory $dataDirectory `
        -ExpectedListenAddress '127.0.0.1' -ExpectedPort $testPort
      $script:ServerStarted = $true
    } catch { $keepTestRoot = $true }
  }
  if ($script:ServerStarted) {
    $stop = Invoke-AmoresPetNativeProcess -Executable $pgCtl -Arguments @('-D',$dataDirectory,'-m','fast','-w','-t','30','stop')
    if (-not $stop.Started -or $stop.ExitCode -ne 0 -or (Test-Path -LiteralPath (Join-Path $dataDirectory 'postmaster.pid'))) {
      Write-Host 'LIMPEZA RECUSADA: cluster temporario nao teve parada confirmada; arquivos preservados em diretorio temporario.' -ForegroundColor Yellow
      $keepTestRoot = $true
    } else { $script:ServerStarted = $false }
  }
  Get-ChildItem Env: | Where-Object { $_.Name -match '^(PG|PSQL|DB_)' -or $_.Name -eq 'DATABASE_URL' } |
    ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) -ErrorAction SilentlyContinue }
  foreach ($name in $script:SavedEnvironment.Keys) { Set-Item -LiteralPath ('Env:' + $name) -Value $script:SavedEnvironment[$name] }
  if ($script:TestRoot -and -not $script:ServerStarted -and -not $keepTestRoot -and (Test-Path -LiteralPath $script:TestRoot)) {
    $tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    $resolvedTestRoot = [IO.Path]::GetFullPath($script:TestRoot)
    if ($resolvedTestRoot.StartsWith($tempParent + '\',[StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($resolvedTestRoot) -match '^Amores Pet Neon Inventory Test-[a-f0-9]{32}$') {
      Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
