Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force

$script:passed = 0
$script:failed = 0
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$testRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('Amores Pet Process Tests ' + [guid]::NewGuid().ToString('N'))))
if (-not $testRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $testRoot) -notmatch '^Amores Pet Process Tests [a-f0-9]{32}$') {
  throw 'A pasta temporaria de processos nao passou na validacao de destino.'
}

function Assert-Pass([string]$Name, [bool]$Condition, [string]$SafeFailure) {
  if (-not $Condition) {
    $script:failed++
    throw "PROCESS_TEST_FAIL=$Name $SafeFailure"
  }
  $script:passed++
  Write-Output "PROCESS_TEST_PASS=$Name"
}

try {
  [void][IO.Directory]::CreateDirectory($testRoot)

  $psqlCandidates = @()
  $command = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($command -and $command.Source) { $psqlCandidates += [string]$command.Source }
  if ($env:ProgramFiles) { $psqlCandidates += (Join-Path $env:ProgramFiles 'PostgreSQL\17\bin\psql.exe') }
  $psqlPath = $psqlCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $psqlPath) { throw 'psql 17 nao foi localizado para o teste isolado --version.' }

  $version = Invoke-AmoresPetNativeProcess -Executable $psqlPath -Arguments @('--version')
  Assert-Pass 'real-psql-version-no-connection' ($version.Started -and $version.ExitCode -eq 0 -and
    ($version.StandardOutput + $version.StandardError) -match '\(PostgreSQL\)\s+17(?:\.|\s)') 'psql --version deve iniciar e retornar PostgreSQL 17.'
  $verboseVersion = Invoke-AmoresPetNativeProcess -Executable $psqlPath -Arguments @('-v','VERBOSITY=verbose','--version')
  Assert-Pass 'psql-verbose-error-setting-accepted-without-connection' ($verboseVersion.Started -and
    $verboseVersion.ExitCode -eq 0 -and ($verboseVersion.StandardOutput + $verboseVersion.StandardError) -match '\(PostgreSQL\)\s+17(?:\.|\s)') 'psql deve aceitar VERBOSITY=verbose sem iniciar conexao.'
  Assert-Pass 'executable-path-with-spaces' ($psqlPath -match '\s') 'O teste usa a instalacao PostgreSQL em caminho com espacos.'

  $missingPath = Join-Path $testRoot 'psql ausente.exe'
  $missing = Invoke-AmoresPetNativeProcess -Executable $missingPath -Arguments @('--version')
  Assert-Pass 'missing-executable-not-started' (-not $missing.Started -and $null -eq $missing.ExitCode -and
    $missing.NativeErrorCode -eq 2 -and $missing.FailureSummary -eq 'EXECUTABLE_NOT_FOUND') 'Falha de arquivo ausente deve ser separada de conexao.'

  $accessDenied = Get-AmoresPetProcessFailureInfo ([System.ComponentModel.Win32Exception]::new(5))
  Assert-Pass 'access-denied-native-error-classified' ($accessDenied.NativeErrorCode -eq 5 -and
    $accessDenied.FailureSummary -eq 'EXECUTABLE_ACCESS_DENIED') 'Win32 ERROR_ACCESS_DENIED deve ser classificado sem mensagem bruta.'

  $processShell = Join-Path $env:SystemRoot 'System32\cmd.exe'
  $stderrFailure = Invoke-AmoresPetNativeProcess -Executable $processShell -Arguments @('/d','/c','echo synthetic-stderr 1>&2 & exit /b 7')
  Assert-Pass 'started-process-stderr-and-nonzero-exit' ($stderrFailure.Started -and $stderrFailure.ExitCode -eq 7 -and
    $stderrFailure.StandardError -match 'synthetic-stderr' -and $stderrFailure.HResult -eq $null) 'Processo iniciado deve retornar stderr e exit code, sem erro de lancamento PowerShell.'

  $legacyErrorType = $null
  $legacyHresult = $null
  try {
    & $processShell /d /c 'echo synthetic-stderr 1>&2 & exit /b 7' 2>&1 | Out-Null
  } catch {
    $legacyErrorType = [string]$_.Exception.GetType().FullName
    $legacyHresult = '0x{0:X8}' -f [int]$_.Exception.HResult
  }
  Assert-Pass 'legacy-stderr-hresult-reproduced-and-fixed' ($legacyErrorType -eq 'System.Management.Automation.RemoteException' -and
    $legacyHresult -eq '0x80131501' -and $stderrFailure.Started -and $stderrFailure.ExitCode -eq 7) 'PowerShell 5.1 deve reproduzir a falha antiga e o novo runner deve separar stderr de inicializacao.'

  $psqlInvalid = Invoke-AmoresPetNativeProcess -Executable $psqlPath -Arguments @('--amores-pet-invalid-option')
  $psqlInvalidDiagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $psqlInvalid.StandardError -ExitCode $psqlInvalid.ExitCode
  $psqlInvalidDiagnosticJson = $psqlInvalidDiagnostic | ConvertTo-Json -Compress
  Assert-Pass 'psql-exit-1-stderr-is-classified-before-connection' ($psqlInvalid.Started -and $psqlInvalid.ExitCode -eq 1 -and
    $psqlInvalid.StandardError -match '(?i)option|argument' -and
    $psqlInvalidDiagnostic.Category -eq 'PSQL_ARGUMENTOS' -and $psqlInvalidDiagnostic.Code -eq 'AP-PSQL-ARGUMENTS-INVALID' -and
    $psqlInvalidDiagnosticJson -notmatch [regex]::Escape('--amores-pet-invalid-option')) 'psql deve iniciar, retornar exit 1 com stderr e ser classificado como erro de argumentos, sem conexao nem texto bruto.'

  $classifierCases = @(
    @{ Name='arguments'; Error='psql: error: unrecognized option "--bad-option"'; Category='PSQL_ARGUMENTOS'; Code='AP-PSQL-ARGUMENTS-INVALID' },
    @{ Name='file-path'; Error='psql: error: could not open file "C:\private\query.sql": Permission denied'; Category='PSQL_ARQUIVO'; Code='AP-PSQL-FILE-ACCESS' },
    @{ Name='authentication'; Error='FATAL: password authentication failed for user "private-user"'; Category='PSQL_AUTENTICACAO'; Code='AP-PSQL-AUTHENTICATION' },
    @{ Name='connection'; Error='psql: error: connection to server at "127.0.0.1", port 55432 failed: Connection refused'; Category='PSQL_CONEXAO'; Code='AP-PSQL-CONNECTION' },
    @{ Name='missing-database-or-role'; Error='FATAL: role "private-user" does not exist'; Category='PSQL_DESTINO_INEXISTENTE'; Code='AP-PSQL-DATABASE-ROLE-NOT-FOUND' },
    @{ Name='sql-permission-sqlstate'; Error='ERROR:  42501: permission denied for table private_table'; Category='PSQL_PERMISSAO_SQL'; Code='AP-PSQL-SQL-PERMISSION'; SqlState='42501' },
    @{ Name='sql-query-sqlstate'; Error='ERROR:  42P01: relation "private_table" does not exist'; Category='PSQL_ERRO_SQL'; Code='AP-PSQL-SQL-ERROR'; SqlState='42P01' }
  )
  foreach ($case in $classifierCases) {
    $classified = Get-AmoresPetPsqlFailureDiagnostic -StandardError $case.Error -ExitCode 1
    $expectedSqlState = if ($case.ContainsKey('SqlState')) { $case['SqlState'] } else { $null }
    Assert-Pass ('stderr-category-' + $case.Name) ($classified.Category -eq $case.Category -and
      $classified.Code -eq $case.Code -and $classified.SqlState -eq $expectedSqlState -and
      $classified.Description -notmatch '(?i)private-user|private_table|127\.0\.0\.1|C:\\private') 'O classificador deve retornar apenas categoria, codigo e descricao fixa.'
  }

  $unknownMarker = 'sensitive-local-marker-credential=do-not-share'
  $unknownDiagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError ('unexpected client failure ' + $unknownMarker) -ExitCode 1
  $unknownDiagnosticJson = $unknownDiagnostic | ConvertTo-Json -Compress
  Assert-Pass 'unclassified-stderr-is-not-in-shareable-diagnostic' ($unknownDiagnostic.Category -eq 'PSQL_NAO_CLASSIFICADO' -and
    $unknownDiagnostic.Code -eq 'AP-PSQL-ERROR-UNCLASSIFIED' -and
    $unknownDiagnosticJson -notmatch [regex]::Escape($unknownMarker) -and
    $unknownDiagnostic.Description -notmatch 'credential|do-not-share') 'Detalhe nao classificado nao pode vazar para o objeto compartilhavel.'
  $emptyDiagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError '' -ExitCode 1
  Assert-Pass 'exit-one-without-stderr-has-distinct-code' ($emptyDiagnostic.Code -eq 'AP-PSQL-ERROR-EMPTY' -and
    $emptyDiagnostic.Category -eq 'PSQL_NAO_CLASSIFICADO') 'Exit 1 sem stderr deve ser distinto de stderr generico.'

  $fakeAuthenticationError = 'password authentication failed for user synthetic-user; password=synthetic-secret-marker'
  $authenticationSummary = Get-AmoresPetProcessOutputFailureSummary $fakeAuthenticationError
  Assert-Pass 'stderr-classified-without-recording-credentials' ($authenticationSummary -eq 'PSQL_AUTHENTICATION_REJECTED' -and
    $authenticationSummary -notmatch 'synthetic|password=') 'O relatorio deve armazenar somente a categoria sanitizada.'

  $argumentSentinel = 'synthetic "credential" marker\ending'
  $argumentProbePath = Join-Path $testRoot 'argument probe with spaces.exe'
  $argumentProbeSource = @'
using System;
public static class AmoresPetArgumentProbe {
    public static int Main(string[] args) {
        if (args.Length == 1 && args[0] == "synthetic \"credential\" marker\\ending") {
            Console.WriteLine("ARGUMENT_OK");
            return 0;
        }
        return 19;
    }
}
'@
  Add-Type -TypeDefinition $argumentProbeSource -OutputAssembly $argumentProbePath -OutputType ConsoleApplication -ErrorAction Stop
  $argumentCheck = Invoke-AmoresPetNativeProcess -Executable $argumentProbePath -Arguments @($argumentSentinel)
  Assert-Pass 'argument-with-spaces-preserved-without-echo' ($argumentCheck.Started -and $argumentCheck.ExitCode -eq 0 -and
    $argumentCheck.StandardOutput.Trim() -eq 'ARGUMENT_OK' -and
    $argumentCheck.StandardOutput -notmatch [regex]::Escape($argumentSentinel) -and
    $argumentCheck.StandardError -notmatch [regex]::Escape($argumentSentinel)) 'Argumento sintetico nao pode ser corrompido nem aparecer na saida capturada.'

  $cscriptPath = Join-Path $env:SystemRoot 'System32\cscript.exe'
  $diagnosticVbs = Join-Path $PSScriptRoot 'Diagnosticar-Migrations-Lote2.vbs'
  $savedLocalAppData = $env:LOCALAPPDATA
  try {
    $env:LOCALAPPDATA = $testRoot
    $launcherResult = Invoke-AmoresPetNativeProcess -Executable $cscriptPath -Arguments @(
      '//nologo',$diagnosticVbs,'/simularFalha:PROCESSO','/testarPolitica'
    )
  } finally {
    $env:LOCALAPPDATA = $savedLocalAppData
  }
  Assert-Pass 'vbs-preserves-process-category-and-sanitized-report' ($launcherResult.Started -and
    $launcherResult.ExitCode -eq 1 -and $launcherResult.StandardOutput -match 'SANITIZED_REPORT=AVAILABLE' -and
    $launcherResult.StandardOutput -match 'Categoria: PROCESSO' -and
    $launcherResult.StandardOutput -match 'Inicializacao do processo PostgreSQL' -and
    $launcherResult.StandardOutput -notmatch [regex]::Escape($testRoot)) 'O atalho deve manter o diagnostico sanitizado sem revelar caminhos locais.'

  $environmentBefore = @{}
  foreach ($name in @('PGPASSFILE','PGPASSWORD','PGHOST','PGPORT','PGDATABASE','PGUSER','DATABASE_URL')) {
    $environmentBefore[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  }
  foreach ($name in $environmentBefore.Keys) {
    if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne $environmentBefore[$name]) {
      throw 'A verificacao de processo alterou o ambiente PostgreSQL do processo pai.'
    }
  }
  Assert-Pass 'no-persistent-database-or-environment-access' $true 'Nenhuma conexao, migration ou alteracao persistente foi executada.'
} finally {
  $resolvedRoot = [IO.Path]::GetFullPath($testRoot)
  if ($resolvedRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path -Leaf $resolvedRoot) -match '^Amores Pet Process Tests [a-f0-9]{32}$' -and
      (Test-Path -LiteralPath $resolvedRoot)) {
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
  }
}

Write-Output ("PROCESS_TESTS_PASSED={0}; PROCESS_TESTS_FAILED={1}" -f $script:passed,$script:failed)
if ($script:failed -gt 0) { exit 1 }
