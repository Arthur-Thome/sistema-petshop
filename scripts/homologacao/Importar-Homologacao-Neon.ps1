param([switch]$SelfTestOnly, [switch]$TestEndpointOnly, [switch]$DiagnoseSessionsOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:PgBin = 'C:\Program Files\PostgreSQL\17\bin'
$script:PgTools = @{}
$script:Phase = 'Inicializacao'
$script:Code = 'AP-NEON-IMPORT-STARTUP'
$script:Message = 'O executor foi iniciado.'
$script:PrivateRoot = $null
$script:OperationDirectory = $null
$script:ReportPath = $null
$script:SafeReportPath = $null
$script:PassFile = $null
$script:CurrentSid = $null
$script:AllowedSids = @()
$script:TempDataDirectory = $null
$script:TempPort = 0
$script:TempClusterStarted = $false
$script:TempClusterStopped = $false
$script:SavedPgEnvironment = @{}
$script:NeonHost = $null
$script:ExecutionApplicationName = 'ap_neon_' + [guid]::NewGuid().ToString('N')
$script:ApprovedNeonTarget = [ordered]@{
  ProjectId = 'square-boat-15573195'
  BranchId = 'br-holy-sunset-b6ykrr20'
  Branch = 'main'
  Region = 'sa-east-1'
  Database = 'amores_pet_homologacao'
  Role = 'amores_pet_homologacao_owner'
  Host = 'ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech'
  Port = 5432
}
$script:NeonRootCert = $null
$script:NeonPassword = $null
$script:PersistentProcessStarted = $false
$script:LegacyWrongHostProbe = 'NAO_EXECUTADO'
$script:LegacyDefaultGssProbe = 'NAO_EXECUTADO'
$script:WrongHostClassifierEvidence = 'NAO_EXECUTADO'
$script:IntegrationPipelineTestCount = 0
$script:SessionAssessmentTestCount = 0
$script:Report = [ordered]@{
  format = 'amores-pet-neon-import-v1'; status = 'INICIADO'; phase = 'Inicializacao'
  technical_code = 'AP-NEON-IMPORT-STARTUP'; error = $null; failure_location = $null; failure_function = $null; failure_command = $null; failure_error_id = $null
  internal_failure_class = $null; internal_failure_type = $null; internal_failure_hresult = $null
  backup = [ordered]@{ approved_id = 'neon-backup-20261017-175742-a62a952065b74d09a1f9419ca10cb584'; size_bytes = $null; sha256 = $null; catalog_validated = $false; source_report_approved = $false }
  disposable = [ordered]@{ self_tests_passed = $false; developer_suite_status = 'NAO_EXECUTADA_SEPARADA_DO_PREFLIGHT'; tls_client_tests_passed = 0; integration_pipeline_tests_passed = 0; source_restore_passed = $false; structure_compared = $false; data_compared = $false; sequence_states_compared = $false; transaction_rollback_tested = $false }
  destination = [ordered]@{ project_id = $script:ApprovedNeonTarget.ProjectId; region = 'aws-sa-east-1'; branch_id = $script:ApprovedNeonTarget.BranchId; branch = $script:ApprovedNeonTarget.Branch; database = $script:ApprovedNeonTarget.Database; role = $script:ApprovedNeonTarget.Role; approved_endpoint_host = $script:ApprovedNeonTarget.Host; endpoint_mapping_validated = $false; host_metadata_confirmed_locally = $false; connected = $false; identity_validated = $false; tls_verified = $false; tls_mode = $null; gss_encryption_mode = $null; tls_root_certificate_configured = $false; tls_hostname_verified = $false; tls_protocol = $null; tls_cipher = $null; server_reported_tls = $null; postgres_major = $null; timezone = $null; empty_validated = $false; sessions_clear = $false; session_summary = [ordered]@{ status='NAO_CONSULTADO'; total_observed=0; execution_sessions=0; same_execution_other_sessions=0; external_sessions=0; external_client_sessions=0; non_client_sessions=0; irrelevant_internal_sessions=0; concurrent_sessions=0; backend_groups=@(); block_reason='NAO_CONSULTADO' }; permissions_validated = $false; capacity_estimate_validated = $false }
  import = [ordered]@{ local_confirmation_presented = $false; local_confirmation_accepted = $false; launch_armed = $false; process_started = $false; exit_code = $null; post_validation = $false; state = 'NAO_INICIADA' }
  expected = [ordered]@{ tables = 30; rows = 153; views = 3; indexes = 97; sequences = 24; foreign_keys = 54; triggers = 7; functions = 6; migrations = '035/036/037' }
  origin_modified = $false; sistema_petshop_connected = $false; photos_uploaded = $false; migrations_reapplied = $false
}

function Set-Phase([string]$Name) {
  $script:Phase = $Name
  $script:Report.phase = $Name
  Write-ImportReport
}

function Stop-Import([string]$TechnicalCode, [string]$SafeMessage) {
  $script:Code = $TechnicalCode
  $script:Message = $SafeMessage
  $script:Report.technical_code = $TechnicalCode
  $script:Report.error = $SafeMessage
  throw 'AP-NEON-IMPORT-STOP'
}

function Get-OptionalPropertyValue([object]$InputObject,[string]$PropertyName) {
  if ($null -eq $InputObject -or [string]::IsNullOrWhiteSpace($PropertyName)) { return $null }
  try {
    if ($InputObject -is [System.Collections.IDictionary] -and $InputObject.Contains($PropertyName)) {
      return $InputObject[$PropertyName]
    }
    $property = $InputObject.PSObject.Properties[$PropertyName]
    if ($null -ne $property) { return $property.Value }
  } catch { }
  return $null
}

function Test-ObjectHasProperties([object]$InputObject,[string[]]$PropertyNames) {
  if ($null -eq $InputObject) { return $false }
  foreach ($propertyName in $PropertyNames) {
    if ($null -eq (Get-OptionalPropertyValue $InputObject $propertyName)) { return $false }
  }
  return $true
}

function Test-ObjectHasPropertyNames([object]$InputObject,[string[]]$PropertyNames) {
  if ($null -eq $InputObject) { return $false }
  foreach ($propertyName in $PropertyNames) {
    try {
      if ($InputObject -is [System.Collections.IDictionary]) {
        if (-not $InputObject.Contains($propertyName)) { return $false }
      } elseif ($null -eq $InputObject.PSObject.Properties[$propertyName]) { return $false }
    } catch { return $false }
  }
  return $true
}

function Assert-ImportReportShape {
  $valid = (Test-ObjectHasPropertyNames $script:Report @('format','status','phase','technical_code','error','failure_location','failure_function','failure_command',
      'failure_error_id','internal_failure_class','internal_failure_type','internal_failure_hresult','backup','disposable','destination','import','expected',
      'origin_modified','sistema_petshop_connected','photos_uploaded','migrations_reapplied')) -and
    (Test-ObjectHasPropertyNames $script:Report.backup @('approved_id','size_bytes','sha256','catalog_validated','source_report_approved')) -and
    (Test-ObjectHasPropertyNames $script:Report.disposable @('self_tests_passed','developer_suite_status','tls_client_tests_passed','integration_pipeline_tests_passed','source_restore_passed',
      'structure_compared','data_compared','sequence_states_compared','transaction_rollback_tested')) -and
    (Test-ObjectHasPropertyNames $script:Report.destination @('project_id','region','branch_id','branch','database','role','approved_endpoint_host','endpoint_mapping_validated',
      'host_metadata_confirmed_locally','connected','identity_validated','tls_verified','tls_mode','gss_encryption_mode','tls_root_certificate_configured',
      'tls_hostname_verified','tls_protocol','tls_cipher','server_reported_tls','postgres_major','timezone','empty_validated','sessions_clear','session_summary',
      'permissions_validated','capacity_estimate_validated')) -and
    (Test-ObjectHasPropertyNames $script:Report.destination.session_summary @('status','total_observed','execution_sessions','same_execution_other_sessions','external_sessions',
      'external_client_sessions','non_client_sessions','irrelevant_internal_sessions','concurrent_sessions','backend_groups','block_reason')) -and
    (Test-ObjectHasPropertyNames $script:Report.import @('local_confirmation_presented','local_confirmation_accepted','launch_armed','process_started','exit_code','post_validation','state'))
  if (-not $valid) { Stop-Import 'AP-NEON-REPORT-SCHEMA' 'O modelo interno do relatório está incompleto; operação interrompida antes de qualquer conexão.' }
}

function Set-InternalFailureDiagnostic([object]$ErrorRecord) {
  # This is a last-resort path. Every optional PowerShell/ErrorRecord member is
  # read defensively so a reporting failure can never replace the original.
  try {
    $script:Report.failure_function = $null
    $script:Report.failure_location = $null
    $script:Report.failure_command = $null
    $script:Report.failure_error_id = $null
    $script:Report.internal_failure_class = 'PS_INTERNAL_ERROR'
    $script:Report.internal_failure_type = 'System.Exception'
    $script:Report.internal_failure_hresult = $null

    $exception = Get-OptionalPropertyValue $ErrorRecord 'Exception'
    if ($null -ne $exception) {
      try { $script:Report.internal_failure_type = [string]$exception.GetType().FullName } catch { }
      $hresultValue = Get-OptionalPropertyValue $exception 'HResult'
      $hresultNumber = [int]0
      if ([int]::TryParse([string]$hresultValue,[ref]$hresultNumber)) {
        $script:Report.internal_failure_hresult = '0x{0:X8}' -f $hresultNumber
      }
    }

    $errorId = [string](Get-OptionalPropertyValue $ErrorRecord 'FullyQualifiedErrorId')
    if ($errorId) { $errorId = ($errorId -split ',')[0] }
    $invocationInfo = Get-OptionalPropertyValue $ErrorRecord 'InvocationInfo'
    $myCommand = Get-OptionalPropertyValue $invocationInfo 'MyCommand'
    $commandName = [string](Get-OptionalPropertyValue $myCommand 'Name')
    $stackTrace = [string](Get-OptionalPropertyValue $ErrorRecord 'ScriptStackTrace')

    if ($script:Report.internal_failure_type -eq 'System.Management.Automation.ParameterBindingValidationException' -and
        $errorId -eq 'ParameterArgumentValidationErrorNullNotAllowed') {
      $script:Report.internal_failure_class = 'PS_PARAMETER_NULL'
    } elseif ($script:Report.internal_failure_type -eq 'System.UnauthorizedAccessException' -or
        $script:Report.internal_failure_type -eq 'System.Security.SecurityException') {
      $script:Report.internal_failure_class = 'PS_ACCESS_DENIED'
    } elseif ($errorId -eq 'PropertyNotFoundStrict') {
      $script:Report.internal_failure_class = 'PS_OPTIONAL_PROPERTY_UNAVAILABLE'
    }

    if ($errorId -match '^[A-Za-z0-9_.-]{1,96}$') { $script:Report.failure_error_id = $errorId }
    if ($commandName -match '^[A-Za-z0-9_.-]{1,96}$') { $script:Report.failure_command = $commandName }
    if ($stackTrace -match '(?m)^\s*at (?<frame>[A-Za-z0-9_.<>-]+),.*? line (?<line>[0-9]+)') {
      $script:Report.failure_function = $Matches['frame']
      $script:Report.failure_location = 'Importar-Homologacao-Neon.ps1:' + $Matches['line']
    }

    if (-not $script:Report.failure_function -or -not $script:Report.failure_location) {
      try {
        $callFrames = @(Get-PSCallStack)
        foreach ($frame in $callFrames) {
          $frameName = [string](Get-OptionalPropertyValue $frame 'FunctionName')
          if ($frameName -and $frameName -ne 'Set-InternalFailureDiagnostic') {
            if (-not $script:Report.failure_function -and $frameName -match '^[A-Za-z0-9_.<>-]+$') {
              $script:Report.failure_function = $frameName
            }
            $position = Get-OptionalPropertyValue $frame 'Position'
            $lineValue = Get-OptionalPropertyValue $position 'StartLine'
            $lineNumber = 0
            if (-not $script:Report.failure_location -and [int]::TryParse([string]$lineValue,[ref]$lineNumber) -and $lineNumber -gt 0) {
              $script:Report.failure_location = 'Importar-Homologacao-Neon.ps1:' + [string]$lineNumber
            }
            if ($script:Report.failure_function -and $script:Report.failure_location) { break }
          }
        }
      } catch { }
    }

    if (-not $script:Report.failure_location) {
      $lineValue = Get-OptionalPropertyValue $invocationInfo 'ScriptLineNumber'
      $lineNumber = 0
      if ([int]::TryParse([string]$lineValue,[ref]$lineNumber) -and $lineNumber -gt 0) {
        $script:Report.failure_location = 'Importar-Homologacao-Neon.ps1:' + [string]$lineNumber
      }
    }
  } catch {
    # Do not use details from this catch: only stable, non-sensitive fallback fields.
    try {
      $script:Report.internal_failure_class = 'PS_DIAGNOSTIC_FALLBACK'
      if (-not $script:Report.internal_failure_type) { $script:Report.internal_failure_type = 'System.Exception' }
      $script:Report.failure_function = $null
      $script:Report.failure_command = $null
      $script:Report.failure_error_id = $null
      $script:Report.failure_location = $null
    } catch { }
  }
}

function Assert-NoReparsePoint([string]$Path, [string]$Code = 'AP-NEON-PATH-INVALID') {
  try { $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop }
  catch { Stop-Import $Code 'Um caminho exigido não existe ou não pôde ser lido.' }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Stop-Import $Code 'Um caminho de configuração ou backup é link/junction; operação recusada.' }
}

function Assert-PrivateAcl([string]$Path, [switch]$RequireProtected) {
  try {
    $assessment = Test-AmoresPetPrivateAcl -Path $Path -CurrentSid $script:CurrentSid -OwnerAllowedSids $script:AllowedSids `
      -AccessAllowedSids $script:AllowedSids -RequireProtected:$RequireProtected
  } catch { Stop-Import 'AP-NEON-ACL-QUERY' 'A ACL privada não pôde ser consultada; nenhuma permissão foi alterada.' }
  if (-not $assessment.Success) {
    $script:Report.acl_rule = [string]$assessment.TechnicalCode
    Stop-Import 'AP-NEON-ACL-INVALID' 'A ACL de um recurso privado não atende à política; nenhuma permissão foi alterada.'
  }
}

function Write-ImportReport {
  if (-not $script:ReportPath -or -not $script:OperationDirectory) { return }
  Assert-ImportReportShape
  $script:Report.phase = $script:Phase
  $script:Report.technical_code = $script:Code
  foreach ($path in @($script:ReportPath,$script:SafeReportPath)) {
    if (Test-Path -LiteralPath $path -PathType Leaf) { Assert-NoReparsePoint $path }
    else {
      $stream = [IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
      $stream.Dispose()
      Assert-PrivateAcl $path
    }
  }
  [IO.File]::WriteAllText($script:ReportPath,($script:Report | ConvertTo-Json -Depth 10) + "`r`n",(New-Object Text.UTF8Encoding($false)))
  $lines = @(
    'Amores Pet — importação controlada da homologação para Neon'
    'Status: ' + [string]$script:Report.status
    'Etapa: ' + [string]$script:Phase
    'Código técnico: ' + [string]$script:Code
    'Causa: ' + [string]$script:Message
    'Falha interna sanitizada: classe=' + [string]$script:Report.internal_failure_class + '; tipo=' + [string]$script:Report.internal_failure_type + '; HRESULT=' + [string]$script:Report.internal_failure_hresult + '; função=' + [string]$script:Report.failure_function + '; comando=' + [string]$script:Report.failure_command + '; error_id=' + [string]$script:Report.failure_error_id + '; localização=' + [string]$script:Report.failure_location
    'Projeto: square-boat-15573195; região: aws-sa-east-1'
    'Branch: main; ID: br-holy-sunset-b6ykrr20'
    'Banco/role: amores_pet_homologacao / amores_pet_homologacao_owner'
    'Endpoint direto aprovado: ' + [string]$script:Report.destination.approved_endpoint_host + '; mapeamento validado: ' + [string]$script:Report.destination.endpoint_mapping_validated
    'Backup aprovado: ' + [string]$script:Report.backup.approved_id
    'Backup bytes: ' + [string]$script:Report.backup.size_bytes
    'Backup SHA-256: ' + [string]$script:Report.backup.sha256
    'Catálogo: ' + [string]$script:Report.backup.catalog_validated + '; relatório anterior aprovado: ' + [string]$script:Report.backup.source_report_approved
    'Testes descartáveis: self-test=' + [string]$script:Report.disposable.self_tests_passed + '; tls_cliente=' + [string]$script:Report.disposable.tls_client_tests_passed + '; fluxo_integrado=' + [string]$script:Report.disposable.integration_pipeline_tests_passed + '; restauração=' + [string]$script:Report.disposable.source_restore_passed + '; estrutura=' + [string]$script:Report.disposable.structure_compared + '; dados=' + [string]$script:Report.disposable.data_compared + '; sequences=' + [string]$script:Report.disposable.sequence_states_compared + '; rollback=' + [string]$script:Report.disposable.transaction_rollback_tested
    'Destino conectado: ' + [string]$script:Report.destination.connected + '; identidade=' + [string]$script:Report.destination.identity_validated + '; TLS verificado: ' + [string]$script:Report.destination.tls_verified
    'Evidência TLS cliente: mode=' + [string]$script:Report.destination.tls_mode + '; gssencmode=' + [string]$script:Report.destination.gss_encryption_mode + '; CA configurada=' + [string]$script:Report.destination.tls_root_certificate_configured + '; hostname verificado=' + [string]$script:Report.destination.tls_hostname_verified + '; protocolo=' + [string]$script:Report.destination.tls_protocol + '; cifra=' + [string]$script:Report.destination.tls_cipher + '; TLS reportado pelo backend=' + [string]$script:Report.destination.server_reported_tls
    'Destino vazio: ' + [string]$script:Report.destination.empty_validated + '; sessões concorrentes: ' + [string]$script:Report.destination.sessions_clear + '; permissões: ' + [string]$script:Report.destination.permissions_validated
    'Sessões externas não pertencentes à execução: ' + [string]$script:Report.destination.session_summary.external_sessions
    'Sessões (agregadas, sem IP/usuário/consulta): status=' + [string]$script:Report.destination.session_summary.status + '; total=' + [string]$script:Report.destination.session_summary.total_observed + '; execução=' + [string]$script:Report.destination.session_summary.execution_sessions + '; outras da execução=' + [string]$script:Report.destination.session_summary.same_execution_other_sessions + '; clientes externos=' + [string]$script:Report.destination.session_summary.external_client_sessions + '; não clientes=' + [string]$script:Report.destination.session_summary.non_client_sessions + '; processos internos passivos=' + [string]$script:Report.destination.session_summary.irrelevant_internal_sessions + '; concorrentes=' + [string]$script:Report.destination.session_summary.concurrent_sessions + '; motivo=' + [string]$script:Report.destination.session_summary.block_reason
    'Grupos backend/estado: ' + (($script:Report.destination.session_summary.backend_groups | ForEach-Object { [string]$_.backend_type + '/' + [string]$_.state + '=' + [string]$_.count }) -join ',')
    'Confirmação local: apresentada=' + [string]$script:Report.import.local_confirmation_presented + '; aceita=' + [string]$script:Report.import.local_confirmation_accepted
    'Importação: tentativa armada=' + [string]$script:Report.import.launch_armed + '; processo iniciado=' + [string]$script:Report.import.process_started + '; exit=' + [string]$script:Report.import.exit_code + '; estado=' + [string]$script:Report.import.state + '; validação posterior=' + [string]$script:Report.import.post_validation
    'Origem modificada: NAO; sistema_petshop conectado: NAO; fotos enviadas: NAO; migrations reaplicadas: NAO'
    'Relatório privado: %LOCALAPPDATA%\AmoresPet\Homologacao\neon-imports\<execucao>\relatorio-sanitizado.txt'
  )
  [IO.File]::WriteAllText($script:SafeReportPath,($lines -join "`r`n") + "`r`n",(New-Object Text.UTF8Encoding($true)))
  Assert-PrivateAcl $script:ReportPath
  Assert-PrivateAcl $script:SafeReportPath
}

function Invoke-Tool([string]$ToolName,[string[]]$Arguments,[string]$Label,[switch]$NoCapture) {
  $toolPath = [string]$script:PgTools[$ToolName]
  $result = Invoke-AmoresPetNativeProcess -Executable $toolPath -Arguments $Arguments -NoCapture:$NoCapture
  if (-not $result.Started) {
    Stop-Import ('AP-NEON-PROCESS-' + [string]$result.FailureSummary) ($Label + ' não pôde iniciar; nenhum resultado foi considerado válido.')
  }
  if ([int]$result.ExitCode -ne 0) {
    if ($ToolName -eq 'psql.exe') {
      $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError ([string]$result.StandardError) -ExitCode ([int]$result.ExitCode)
      Stop-Import ([string]$diagnostic.Code) ($Label + ' falhou; categoria=' + [string]$diagnostic.Category + '; SQLSTATE=' + [string]$diagnostic.SqlState + '; exit=' + [string]$result.ExitCode + '.')
    }
    Stop-Import ('AP-NEON-' + $ToolName.Replace('.exe','').ToUpperInvariant() + '-EXIT-' + [string]$result.ExitCode) ($Label + ' falhou; saída técnica=' + [string]$result.ExitCode + '. stderr bruto foi omitido.')
  }
  return $result
}

function Get-PsqlArguments([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$Sql,[string]$RoleName) {
  $psqlArguments = @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-F','|','--host',$HostName,'--port',[string]$Port,'--username',$UserName,'--dbname',$Database)
  if ($RoleName) {
    if ($RoleName -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { Stop-Import 'AP-NEON-ROLE-NAME-INVALID' 'Um nome de role local descartável não passou pela validação.' }
    $Sql = 'SET ROLE "' + $RoleName + '";' + "`n" + $Sql
  }
  $psqlArguments += @('--command',$Sql)
  return ,$psqlArguments
}

function Invoke-Psql([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$Sql,[string]$Label,[string]$RoleName) {
  return Invoke-Tool 'psql.exe' (Get-PsqlArguments $HostName $Port $UserName $Database $Sql $RoleName) $Label
}

function Invoke-PsqlWithConnectionInfo([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$Sql,[string]$Label,[string]$HostAddress = '',[switch]$CaptureFailure) {
  $priorHostAddress = [Environment]::GetEnvironmentVariable('PGHOSTADDR','Process')
  try {
    if (-not [string]::IsNullOrWhiteSpace($HostAddress)) {
      $parsedAddress = $null
      if (-not $script:TempClusterStarted -or -not [Net.IPAddress]::TryParse($HostAddress,[ref]$parsedAddress) -or -not [Net.IPAddress]::IsLoopback($parsedAddress)) {
        Stop-Import 'AP-NEON-TLS-SELFTEST-HOSTADDR-GUARD' 'hostaddr só é permitido para loopback durante o teste do cluster descartável.'
      }
      $env:PGHOSTADDR = $parsedAddress.ToString()
    }
    $arguments = Get-PsqlArguments $HostName $Port $UserName $Database $Sql ''
    $arguments += @('--command','\conninfo')
    if ($CaptureFailure) { return Invoke-AmoresPetNativeProcess -Executable $script:PgTools['psql.exe'] -Arguments $arguments }
    return Invoke-Tool 'psql.exe' $arguments $Label
  } finally {
    if ($null -eq $priorHostAddress) { Remove-Item Env:PGHOSTADDR -ErrorAction SilentlyContinue }
    else { $env:PGHOSTADDR = $priorHostAddress }
  }
}

function ConvertFrom-PsqlClientTlsEvidence([string]$StandardOutput,[int]$ExitCode) {
  if ($ExitCode -ne 0) {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-CLIENT-QUERY-FAILED'; Identity=$null; Protocol=$null; Cipher=$null; ServerTlsReported=$null }
  }
  $lines = @(([string]$StandardOutput -split "`r?`n") | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
  $jsonLines = @($lines | Where-Object { $_ -match '^\{.*\}$' })
  if ($jsonLines.Count -ne 1) {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-CLIENT-EVIDENCE-INCONCLUSIVE'; Identity=$null; Protocol=$null; Cipher=$null; ServerTlsReported=$null }
  }
  try { $identity = $jsonLines[0] | ConvertFrom-Json -ErrorAction Stop }
  catch { return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-CLIENT-EVIDENCE-INCONCLUSIVE'; Identity=$null; Protocol=$null; Cipher=$null; ServerTlsReported=$null } }
  foreach ($propertyName in @('database','user','session_user','server_tls_reported')) {
    if (-not $identity.PSObject.Properties[$propertyName]) {
      return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-CLIENT-EVIDENCE-INCONCLUSIVE'; Identity=$null; Protocol=$null; Cipher=$null; ServerTlsReported=$null }
    }
  }
  if ($identity.server_tls_reported -isnot [bool]) {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-CLIENT-EVIDENCE-INCONCLUSIVE'; Identity=$null; Protocol=$null; Cipher=$null; ServerTlsReported=$null }
  }

  $sslLines = @([regex]::Matches([string]$StandardOutput,'(?i)SSL connection\s*\(protocol:\s*(?<protocol>TLSv[0-9.]+),\s*cipher:\s*(?<cipher>[A-Za-z0-9_-]+)(?:,|\))'))
  if ($sslLines.Count -ne 1) {
    $hasSslClaim = [regex]::IsMatch([string]$StandardOutput,'(?i)SSL connection\b')
    $code = if ($hasSslClaim) { 'AP-NEON-TLS-CLIENT-EVIDENCE-INCONCLUSIVE' } else { 'AP-NEON-TLS-CLIENT-NOT-NEGOTIATED' }
    return [pscustomobject]@{ Success=$false; Code=$code; Identity=$identity; Protocol=$null; Cipher=$null; ServerTlsReported=$identity.server_tls_reported }
  }
  $protocol = $sslLines[0].Groups['protocol'].Value
  $cipher = $sslLines[0].Groups['cipher'].Value
  if ($protocol -notin @('TLSv1.2','TLSv1.3')) {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-PROTOCOL-REJECTED'; Identity=$identity; Protocol=$protocol; Cipher=$cipher; ServerTlsReported=$identity.server_tls_reported }
  }
  return [pscustomobject]@{ Success=$true; Code='AP-NEON-TLS-CLIENT-VERIFIED'; Identity=$identity; Protocol=$protocol; Cipher=$cipher; ServerTlsReported=$identity.server_tls_reported }
}

function Assert-NeonLibpqTlsConfiguration([string]$HostName) {
  $assessment = Test-LibpqTlsSettings -HostName $HostName -ApprovedHost $script:ApprovedNeonTarget.Host -SslMode ([string]$env:PGSSLMODE) `
    -RootCertificatePath ([string]$env:PGSSLROOTCERT) -Service ([string]$env:PGSERVICE) -ServiceFile ([string]$env:PGSERVICEFILE) `
    -HostAddress ([string]$env:PGHOSTADDR) -GssEncMode ([string]$env:PGGSSENCMODE)
  if (-not [bool]$assessment.Success) { Stop-Import ([string]$assessment.Code) ([string]$assessment.Description) }
  $rootPath = [string]$assessment.RootCertificatePath
  Assert-NoReparsePoint $rootPath 'AP-NEON-TLS-ROOT-CERT-INVALID'
  $script:Report.destination.tls_mode = 'verify-full'
  $script:Report.destination.gss_encryption_mode = 'disable'
  $script:Report.destination.tls_root_certificate_configured = $true
  return $rootPath
}

function Test-LibpqTlsSettings {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][AllowEmptyString()][string]$HostName,
    [Parameter(Mandatory)][AllowEmptyString()][string]$ApprovedHost,
    [Parameter(Mandatory)][AllowEmptyString()][string]$SslMode,
    [Parameter(Mandatory)][AllowEmptyString()][string]$RootCertificatePath,
    [AllowEmptyString()][string]$Service = '',
    [AllowEmptyString()][string]$ServiceFile = '',
    [AllowEmptyString()][string]$HostAddress = '',
    [AllowEmptyString()][string]$GssEncMode = ''
  )
  if ($HostName -cne $ApprovedHost) {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-HOST-MISMATCH'; Description='O hostname usado pelo cliente não é o endpoint direto aprovado.'; RootCertificatePath=$null }
  }
  if ($SslMode -cne 'verify-full') {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-MODE-NOT-VERIFIED'; Description='O cliente libpq não está configurado com sslmode=verify-full.'; RootCertificatePath=$null }
  }
  if ($GssEncMode -cne 'disable') {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-GSSENC-NOT-DISABLED'; Description='A criptografia GSS está habilitada ou indeterminada e poderia substituir a sessão TLS verificada.'; RootCertificatePath=$null }
  }
  if (-not [string]::IsNullOrWhiteSpace($Service) -or -not [string]::IsNullOrWhiteSpace($ServiceFile) -or -not [string]::IsNullOrWhiteSpace($HostAddress)) {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-CONNECTION-OVERRIDE'; Description='Uma configuração de serviço ou endereço alternativo pode sobrepor o destino explícito.'; RootCertificatePath=$null }
  }
  if ([string]::IsNullOrWhiteSpace($RootCertificatePath)) {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-ROOT-CERT-MISSING'; Description='O cliente libpq não recebeu o caminho de um certificado raiz.'; RootCertificatePath=$null }
  }
  try {
    $rootPath = [IO.Path]::GetFullPath($RootCertificatePath)
    $certFile = Get-Item -LiteralPath $rootPath -Force -ErrorAction Stop
    if (-not $certFile.PSIsContainer -and [long]$certFile.Length -gt 0 -and ($certFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
      return [pscustomobject]@{ Success=$true; Code='AP-NEON-TLS-CONFIG-VALID'; Description=''; RootCertificatePath=$rootPath }
    }
    if ($certFile.PSIsContainer) { $code='AP-NEON-TLS-ROOT-CERT-INVALID'; $description='O caminho do certificado raiz não aponta para um arquivo regular.' }
    elseif ([long]$certFile.Length -le 0) { $code='AP-NEON-TLS-ROOT-CERT-EMPTY'; $description='O arquivo de certificado raiz está vazio.' }
    else { $code='AP-NEON-TLS-ROOT-CERT-INVALID'; $description='O certificado raiz é um link ou caminho redirecionado, que não é aceito.' }
    return [pscustomobject]@{ Success=$false; Code=$code; Description=$description; RootCertificatePath=$null }
  } catch {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-TLS-ROOT-CERT-INVALID'; Description='O caminho do certificado raiz não pôde ser validado.'; RootCertificatePath=$null }
  }
}

function Initialize-SnapshotSqlFunctions {
  $sourcePath = Join-Path $PSScriptRoot 'Preparar-Backup-Neon.ps1'
  $tokens = $null; $parseErrors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($sourcePath,[ref]$tokens,[ref]$parseErrors)
  if ($parseErrors.Count -gt 0) { Stop-Import 'AP-NEON-SNAPSHOT-SOURCE-PARSE' 'As funções de snapshot aprovadas não puderam ser analisadas.' }
  foreach ($functionName in @('Get-NeonDataSnapshotSql','Get-NeonSequenceSnapshotSql','Get-SourceMetadataSql','Get-SequenceMetadataSql','Get-FunctionDefinitionFingerprintSql','Normalize-SchemaDumpForFingerprint')) {
    $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq $functionName },$true)
    if (-not $definition) { Stop-Import 'AP-NEON-SNAPSHOT-FUNCTION-MISSING' 'Uma função de fingerprint validada não foi encontrada.' }
    $bodyText = [string]$definition.Body.Extent.Text
    if ($bodyText.Length -lt 2 -or $bodyText[0] -ne '{' -or $bodyText[$bodyText.Length - 1] -ne '}') {
      Stop-Import 'AP-NEON-SNAPSHOT-FUNCTION-BODY' 'O corpo de uma função de snapshot não pôde ser delimitado com segurança.'
    }
    $functionBody = [scriptblock]::Create($bodyText.Substring(1,$bodyText.Length - 2))
    Set-Item -LiteralPath ('Function:script:' + $functionName) -Value $functionBody
  }

  $expectedSqlStarts = @{
    'Get-NeonDataSnapshotSql' = 'DO $snapshot$'
    'Get-NeonSequenceSnapshotSql' = 'DO $sequence_snapshot$'
    'Get-SourceMetadataSql' = 'SELECT jsonb_build_object('
    'Get-SequenceMetadataSql' = 'SELECT COALESCE('
    'Get-FunctionDefinitionFingerprintSql' = 'SET search_path = pg_catalog, public;'
  }
  foreach ($functionName in $expectedSqlStarts.Keys) {
    $sqlText = [string](& ('script:' + $functionName))
    if ([string]::IsNullOrWhiteSpace($sqlText) -or -not $sqlText.TrimStart().StartsWith([string]$expectedSqlStarts[$functionName],[StringComparison]::Ordinal)) {
      Stop-Import 'AP-NEON-SNAPSHOT-SQL-INVALID' 'Uma função de snapshot não gerou SQL no formato esperado; nenhuma conexão foi iniciada.'
    }
  }
}

function Get-SnapshotWarning([object]$Process,[string]$Marker,[int]$FieldCount,[string]$Label) {
  if (-not [string]::IsNullOrWhiteSpace([string]$Process.StandardOutput)) { Stop-Import 'AP-NEON-SNAPSHOT-STDOUT' ($Label + ' retornou saída fora do formato previsto.') }
  $markerCount = [regex]::Matches([string]$Process.StandardError,[regex]::Escape($Marker)).Count
  if ($markerCount -ne 1) { Stop-Import 'AP-NEON-SNAPSHOT-MARKER' ($Label + ' não retornou exatamente um fingerprint estruturado.') }
  $fieldPattern = '(?:[0-9]+|[a-f0-9]{32})'
  $pattern = '(?m)^.*?' + [regex]::Escape($Marker) + '(?<payload>' + $fieldPattern + '(?:\|' + $fieldPattern + '){' + ($FieldCount - 1) + '})[ \t]*\r?$'
  $matches = [regex]::Matches([string]$Process.StandardError,$pattern)
  if ($matches.Count -ne 1) { Stop-Import 'AP-NEON-SNAPSHOT-FORMAT' ($Label + ' retornou fingerprint em formato inesperado.') }
  return ,$matches[0].Groups['payload'].Value.Split('|')
}

function Get-DataSnapshot([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$RoleName) {
  $sql = "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'America/Sao_Paulo';`n" + (Get-NeonDataSnapshotSql) + "`nCOMMIT;"
  $process = Invoke-Psql $HostName $Port $UserName $Database $sql 'Fingerprint dos dados' $RoleName
  $values = Get-SnapshotWarning $process 'NEON_DATA_SNAPSHOT=' 5 'Fingerprint dos dados'
  $tableCount = [long]0; $rowCount = [decimal]0; $fingerprintA = [long]0; $fingerprintB = [long]0
  if (-not [long]::TryParse($values[0],[ref]$tableCount) -or
      -not [decimal]::TryParse($values[1],[Globalization.NumberStyles]::Integer,[Globalization.CultureInfo]::InvariantCulture,[ref]$rowCount) -or
      -not [long]::TryParse($values[2],[ref]$fingerprintA) -or -not [long]::TryParse($values[3],[ref]$fingerprintB)) {
    Stop-Import 'AP-NEON-SNAPSHOT-NONNUMERIC' 'O fingerprint de dados contém campos inválidos.'
  }
  return [pscustomobject]@{ TableCount=$tableCount; RowCount=$rowCount; FingerprintA=$fingerprintA; FingerprintB=$fingerprintB }
}

function Get-SequenceSnapshot([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$RoleName) {
  $sql = "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;`n" + (Get-NeonSequenceSnapshotSql) + "`nCOMMIT;"
  $process = Invoke-Psql $HostName $Port $UserName $Database $sql 'Fingerprint de estado das sequences' $RoleName
  $values = Get-SnapshotWarning $process 'NEON_SEQUENCE_SNAPSHOT=' 2 'Fingerprint de sequences'
  $count = [long]0
  if (-not [long]::TryParse($values[0],[ref]$count) -or $values[1] -notmatch '^[a-f0-9]{32}$') { Stop-Import 'AP-NEON-SEQUENCE-SNAPSHOT-FORMAT' 'O fingerprint das sequences retornou formato inválido.' }
  return [pscustomobject]@{ Count=$count; Fingerprint=[string]$values[1] }
}

function Get-JsonSnapshot([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$RoleName,[string]$Sql,[string]$Label,[string[]]$RequiredProperties = @()) {
  $process = Invoke-Psql $HostName $Port $UserName $Database $Sql $Label $RoleName
  $output = ([string]$process.StandardOutput).Trim()
  try { $parsed = $output | ConvertFrom-Json -ErrorAction Stop }
  catch { Stop-Import 'AP-NEON-SNAPSHOT-JSON' ($Label + ' retornou dados estruturais em formato inválido.') }
  if ($null -eq $parsed -or ($RequiredProperties.Count -gt 0 -and -not (Test-ObjectHasProperties $parsed $RequiredProperties))) {
    Stop-Import 'AP-NEON-SNAPSHOT-SCHEMA' ($Label + ' não contém todos os campos obrigatórios do snapshot.')
  }
  return $parsed
}

function Get-Metadata([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$RoleName) {
  $sql = "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;`n" + (Get-SourceMetadataSql) + "`nCOMMIT;"
  $required = @('encoding','collation','ctype','locale_provider','locale','timezone','database_bytes','schemas','tables','views','indexes','sequences',
    'foreign_keys','foreign_keys_unvalidated','triggers','triggers_disabled','functions','security_definer_functions','extensions',
    'migration_035_tables','migration_035_views','migration_036_authorizations','migration_036_file_queue','migration_037_function',
    'migration_037_super_admin','app_role_superuser','app_role_database_owner','app_role_public_schema_owner','app_role_owned_objects',
    'app_role_connect','app_role_schema_usage','app_role_schema_create','app_role_tables_select','app_role_sequences_usage')
  return Get-JsonSnapshot $HostName $Port $UserName $Database $RoleName $sql 'Metadados estruturais' $required
}

function Get-SequenceMetadata([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$RoleName) {
  return Get-JsonSnapshot $HostName $Port $UserName $Database $RoleName (Get-SequenceMetadataSql) 'Metadados de sequences'
}

function Get-FunctionFingerprint([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$RoleName) {
  $functionProcess = Invoke-Psql $HostName $Port $UserName $Database (Get-FunctionDefinitionFingerprintSql) 'Fingerprint das funções' $RoleName
  $value = ([string]$functionProcess.StandardOutput).Trim()
  if ($value -notmatch '^[a-f0-9]{32}$') { Stop-Import 'AP-NEON-FUNCTION-FINGERPRINT' 'O fingerprint das funções retornou formato inválido.' }
  return $value
}

function Get-SchemaFingerprint([string]$HostName,[int]$Port,[string]$UserName,[string]$Database) {
  $args = @('--format=plain','--schema-only','--no-owner','--no-privileges','--no-tablespaces','--quote-all-identifiers','--no-password','--file=-','--host',$HostName,'--port',[string]$Port,'--username',$UserName,'--dbname',$Database)
  $result = Invoke-Tool 'pg_dump.exe' $args 'Fingerprint estrutural pg_dump'
  $text = ([string]$result.StandardOutput -replace '(?m)^-- Dumped from database version[^\r\n]*\r?\n','' -replace '(?m)^-- Dumped by pg_dump version[^\r\n]*\r?\n','')
  $text = Normalize-SchemaDumpForFingerprint $text
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($text)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() }
  finally { $sha.Dispose(); [Array]::Clear($bytes,0,$bytes.Length); $text = $null }
}

function Get-OwnershipAssessment([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$RoleName) {
  $sql = @'
SELECT jsonb_build_object(
  'database_owner', pg_get_userbyid(d.datdba)=current_user,
  'database_create', has_database_privilege(current_user,d.oid,'CREATE'),
  'schema_public_usage', has_schema_privilege(current_user,'public','USAGE'),
  'schema_public_create', has_schema_privilege(current_user,'public','CREATE'),
  'wrong_object_owners', (SELECT count(*) FROM (
    SELECT c.relowner AS owner_id FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f')
    UNION ALL SELECT p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  ) owners WHERE pg_get_userbyid(owner_id)<>current_user),
  'is_superuser', (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
)::text FROM pg_database d WHERE d.datname=current_database()
'@
  return Get-JsonSnapshot $HostName $Port $UserName $Database $RoleName $sql 'Verificação de owner e permissões' @('database_owner','database_create','schema_public_usage','schema_public_create','wrong_object_owners','is_superuser')
}

function Get-SessionAssessmentSql {
  return @'
activity AS MATERIALIZED (
  SELECT pid, backend_type, state, application_name,
    CASE backend_type
      WHEN 'client backend' THEN 'CLIENT_BACKEND'
      WHEN 'checkpointer' THEN 'CHECKPOINTER'
      WHEN 'background writer' THEN 'BACKGROUND_WRITER'
      WHEN 'walwriter' THEN 'WALWRITER'
      WHEN 'archiver' THEN 'ARCHIVER'
      WHEN 'wal summarizer' THEN 'WAL_SUMMARIZER'
      WHEN 'io worker' THEN 'IO_WORKER'
      WHEN 'autovacuum launcher' THEN 'AUTOVACUUM_LAUNCHER'
      WHEN 'autovacuum worker' THEN 'AUTOVACUUM_WORKER'
      WHEN 'logical replication launcher' THEN 'LOGICAL_REPLICATION_LAUNCHER'
      WHEN 'logical replication worker' THEN 'LOGICAL_REPLICATION_WORKER'
      WHEN 'parallel worker' THEN 'PARALLEL_WORKER'
      WHEN 'background worker' THEN 'BACKGROUND_WORKER'
      WHEN 'walsender' THEN 'WALSENDER'
      WHEN 'walreceiver' THEN 'WALRECEIVER'
      WHEN 'startup' THEN 'STARTUP'
      ELSE 'OTHER_BACKEND'
    END AS backend_label,
    CASE state
      WHEN 'active' THEN 'ACTIVE'
      WHEN 'idle' THEN 'IDLE'
      WHEN 'idle in transaction' THEN 'IDLE_IN_TRANSACTION'
      WHEN 'idle in transaction (aborted)' THEN 'IDLE_IN_TRANSACTION_ABORTED'
      WHEN 'fastpath function call' THEN 'FASTPATH_FUNCTION_CALL'
      WHEN 'disabled' THEN 'DISABLED'
      ELSE 'STATE_UNKNOWN'
    END AS state_label
  FROM pg_stat_activity
  WHERE datname=current_database()
), counts AS (
  SELECT
    count(*)::bigint AS session_total_count,
    count(*) FILTER (WHERE pid=pg_backend_pid())::bigint AS session_current_count,
    count(*) FILTER (WHERE application_name=current_setting('application_name') AND (pid=pg_backend_pid() OR backend_type NOT IN ('checkpointer','background writer','walwriter','archiver','wal summarizer')))::bigint AS session_execution_count,
    count(*) FILTER (WHERE pid<>pg_backend_pid() AND application_name=current_setting('application_name') AND backend_type NOT IN ('checkpointer','background writer','walwriter','archiver','wal summarizer'))::bigint AS session_same_execution_other_count,
    count(*) FILTER (WHERE pid<>pg_backend_pid() AND application_name IS DISTINCT FROM current_setting('application_name') AND backend_type NOT IN ('checkpointer','background writer','walwriter','archiver','wal summarizer'))::bigint AS session_external_count,
    count(*) FILTER (WHERE pid<>pg_backend_pid() AND backend_type='client backend' AND application_name IS DISTINCT FROM current_setting('application_name'))::bigint AS session_external_client_count,
    count(*) FILTER (WHERE pid<>pg_backend_pid() AND backend_type<>'client backend')::bigint AS session_non_client_count,
    count(*) FILTER (WHERE pid<>pg_backend_pid() AND backend_type IN ('checkpointer','background writer','walwriter','archiver','wal summarizer'))::bigint AS session_irrelevant_internal_count,
    count(*) FILTER (WHERE pid<>pg_backend_pid() AND backend_type NOT IN ('checkpointer','background writer','walwriter','archiver','wal summarizer'))::bigint AS session_concurrent_count
  FROM activity
), groups AS (
  SELECT backend_label, state_label, count(*)::bigint AS session_count
  FROM activity
  GROUP BY backend_label, state_label
)
'@
}

function Test-SessionAssessment([object]$Identity) {
  $numericFields = @('session_total_count','session_current_count','session_execution_count','session_same_execution_other_count',
    'session_external_count','session_external_client_count','session_non_client_count','session_irrelevant_internal_count','session_concurrent_count','other_sessions')
  if (-not (Test-ObjectHasPropertyNames $Identity ($numericFields + @('session_backend_groups')))) {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-SESSION-ASSESSMENT-SCHEMA'; Reason='REQUIRED_FIELDS_MISSING' }
  }
  $counts = @{}
  foreach ($field in $numericFields) {
    $number = [long]0
    if (-not [long]::TryParse([string](Get-OptionalPropertyValue $Identity $field),[ref]$number) -or $number -lt 0) {
      return [pscustomobject]@{ Success=$false; Code='AP-NEON-SESSION-ASSESSMENT-INCONCLUSIVE'; Reason='COUNT_INVALID' }
    }
    $counts[$field] = $number
  }
  $groups = @(Get-OptionalPropertyValue $Identity 'session_backend_groups')
  $groupTotal = [long]0
  $knownBackendLabels = @('CLIENT_BACKEND','CHECKPOINTER','BACKGROUND_WRITER','WALWRITER','ARCHIVER','WAL_SUMMARIZER','IO_WORKER','AUTOVACUUM_LAUNCHER','AUTOVACUUM_WORKER','LOGICAL_REPLICATION_LAUNCHER','LOGICAL_REPLICATION_WORKER','PARALLEL_WORKER','BACKGROUND_WORKER','WALSENDER','WALRECEIVER','STARTUP','OTHER_BACKEND')
  $knownStateLabels = @('ACTIVE','IDLE','IDLE_IN_TRANSACTION','IDLE_IN_TRANSACTION_ABORTED','FASTPATH_FUNCTION_CALL','DISABLED','STATE_UNKNOWN')
  foreach ($group in $groups) {
    $backend = [string](Get-OptionalPropertyValue $group 'backend_type')
    $state = [string](Get-OptionalPropertyValue $group 'state')
    $groupCount = [long]0
    if ($backend -notin $knownBackendLabels -or $state -notin $knownStateLabels -or
        -not [long]::TryParse([string](Get-OptionalPropertyValue $group 'count'),[ref]$groupCount) -or $groupCount -le 0) {
      return [pscustomobject]@{ Success=$false; Code='AP-NEON-SESSION-ASSESSMENT-INCONCLUSIVE'; Reason='GROUP_FORMAT_INVALID' }
    }
    $groupTotal += $groupCount
  }
  $other = $counts.session_total_count - $counts.session_current_count
  if ($counts.session_total_count -lt 1 -or $counts.session_current_count -ne 1 -or $counts.session_execution_count -lt 1 -or
      $counts.session_execution_count -gt $counts.session_total_count -or $counts.session_execution_count -ne ($counts.session_current_count + $counts.session_same_execution_other_count) -or
      $counts.session_external_count -gt $other -or $counts.session_external_client_count -gt $counts.session_external_count -or $counts.session_non_client_count -gt $other -or
      $counts.session_irrelevant_internal_count -gt $counts.session_non_client_count -or
      $counts.session_concurrent_count -ne ($other - $counts.session_irrelevant_internal_count) -or
      $counts.session_concurrent_count -ne ($counts.session_external_count + $counts.session_same_execution_other_count) -or
      $counts.other_sessions -ne $counts.session_concurrent_count -or $groupTotal -ne $counts.session_total_count) {
    return [pscustomobject]@{ Success=$false; Code='AP-NEON-SESSION-ASSESSMENT-INCONCLUSIVE'; Reason='COUNTS_INCONSISTENT' }
  }
  $reason = if ($counts.session_concurrent_count -eq 0) { 'NONE' }
    elseif ($counts.session_external_count -gt 0) { 'EXTERNAL_CONNECTIONS' }
    elseif ($counts.session_same_execution_other_count -gt 0) { 'SAME_EXECUTION_EXTRA_CONNECTION' }
    else { 'OTHER_NON_PASSIVE_BACKEND' }
  return [pscustomobject]@{ Success=$true; Code='AP-NEON-SESSION-ASSESSMENT-VALID'; Reason=$reason; Counts=$counts; Groups=$groups }
}

function Update-SessionAssessmentReport([object]$Assessment) {
  if (-not [bool]$Assessment.Success) {
    $script:Report.destination.session_summary.status = 'INCONCLUSIVO'
    $script:Report.destination.session_summary.block_reason = [string]$Assessment.Reason
    return
  }
  $counts = $Assessment.Counts
  $summary = $script:Report.destination.session_summary
  $summary.status = 'VALIDADO'
  $summary.total_observed = [long]$counts.session_total_count
  $summary.execution_sessions = [long]$counts.session_execution_count
  $summary.same_execution_other_sessions = [long]$counts.session_same_execution_other_count
  $summary.external_sessions = [long]$counts.session_external_count
  $summary.external_client_sessions = [long]$counts.session_external_client_count
  $summary.non_client_sessions = [long]$counts.session_non_client_count
  $summary.irrelevant_internal_sessions = [long]$counts.session_irrelevant_internal_count
  $summary.concurrent_sessions = [long]$counts.session_concurrent_count
  $summary.backend_groups = @($Assessment.Groups | ForEach-Object {
      [pscustomobject]@{ backend_type=[string]$_.backend_type; state=[string]$_.state; count=[long]$_.count }
    })
  $summary.block_reason = [string]$Assessment.Reason
  $script:Report.destination.sessions_clear = ([long]$counts.session_concurrent_count -eq 0)
}

function Get-DestinationIdentity([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$SessionSqlOverride = '') {
  if ($HostName -cne $script:ApprovedNeonTarget.Host -or $Port -ne [int]$script:ApprovedNeonTarget.Port -or
      $UserName -cne $script:ApprovedNeonTarget.Role -or $Database -cne $script:ApprovedNeonTarget.Database) {
    Stop-Import 'AP-NEON-TLS-DESTINATION-MISMATCH' 'Os parâmetros SQL não correspondem ao endpoint, porta, role e banco aprovados.'
  }
  $null = Assert-NeonLibpqTlsConfiguration $HostName
  if (-not [string]::IsNullOrWhiteSpace($SessionSqlOverride)) {
    $parsedHost = $null
    $isLoopbackHost = ($HostName -ceq 'localhost')
    if (-not $isLoopbackHost) { $isLoopbackHost = ([Net.IPAddress]::TryParse($HostName,[ref]$parsedHost) -and [Net.IPAddress]::IsLoopback($parsedHost)) }
    if (-not $script:TempClusterStarted -or $Port -ne $script:TempPort -or
        -not $isLoopbackHost) {
      Stop-Import 'AP-NEON-SELFTEST-SQL-OVERRIDE-GUARD' 'A consulta sintética de erro só pode ser usada no cluster PostgreSQL descartável em loopback.'
    }
    $sessionSql = $SessionSqlOverride
  } else { $sessionSql = Get-SessionAssessmentSql }
  $sql = @"
WITH $sessionSql
SELECT (jsonb_build_object(
 'database',current_database(),'user',current_user,'session_user',session_user,
 'version_num',current_setting('server_version_num')::integer,
 'timezone',current_setting('TimeZone'),
 'locale_provider',(SELECT CASE datlocprovider WHEN 'b' THEN 'builtin' WHEN 'c' THEN 'libc' WHEN 'i' THEN 'icu' ELSE 'unknown' END FROM pg_database WHERE datname=current_database()),
 'locale',(SELECT COALESCE(datlocale,'') FROM pg_database WHERE datname=current_database()),
 'database_timezone_settings',(SELECT COALESCE(array_to_string(setconfig,','),'') FROM pg_db_role_setting WHERE setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()) AND setrole=0),
 'is_superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
 'in_recovery',pg_is_in_recovery(),
 'server_tls_reported',(SELECT COALESCE(ssl,false) FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'database_bytes',pg_database_size(current_database()),
 'application_relations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','S','i','I','f')),
 'application_functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'),
 'application_custom_types',(SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND t.typtype IN ('d','e','r','m')),
 'application_large_objects',(SELECT count(*) FROM pg_largeobject_metadata),
 'application_extensions',(SELECT COALESCE(string_agg(extname || '=' || extversion,',' ORDER BY extname), '') FROM pg_extension),
 'migration_036_present',(to_regclass('public.operation_authorizations') IS NOT NULL OR to_regclass('public.permanent_file_deletion_queue') IS NOT NULL),
 'migration_037_present',(to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)') IS NOT NULL),
 'non_public_schemas',(SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema','public'))
) || jsonb_build_object(
  'session_total_count',c.session_total_count,
  'session_current_count',c.session_current_count,
  'session_execution_count',c.session_execution_count,
  'session_same_execution_other_count',c.session_same_execution_other_count,
  'session_external_count',c.session_external_count,
  'session_external_client_count',c.session_external_client_count,
  'session_non_client_count',c.session_non_client_count,
  'session_irrelevant_internal_count',c.session_irrelevant_internal_count,
  'session_concurrent_count',c.session_concurrent_count,
  'other_sessions',c.session_concurrent_count,
  'session_backend_groups',COALESCE((SELECT jsonb_agg(jsonb_build_object('backend_type',g.backend_label,'state',g.state_label,'count',g.session_count)
    ORDER BY g.backend_label,g.state_label) FROM groups g),'[]'::jsonb)
))::text
FROM counts c
"@
  try { $process = Invoke-PsqlWithConnectionInfo $HostName $Port $UserName $Database $sql 'Identidade SQL e TLS do cliente libpq' }
  catch {
    if ([string]$script:Code -ceq 'AP-PSQL-SQL-PERMISSION') {
      Stop-Import 'AP-NEON-SESSION-ASSESSMENT-ACCESS' 'O PostgreSQL recusou a leitura conjunta de identidade e sessões (SQLSTATE 42501); concorrência inconclusiva e operação bloqueada.'
    }
    throw
  }
  $evidence = ConvertFrom-PsqlClientTlsEvidence -StandardOutput ([string]$process.StandardOutput) -ExitCode ([int]$process.ExitCode)
  if (-not [bool]$evidence.Success) {
    $code = [string]$evidence.Code
    $message = switch ($code) {
      'AP-NEON-TLS-CLIENT-NOT-NEGOTIATED' { 'O psql não demonstrou TLS negociado na conexão do cliente.'; break }
      'AP-NEON-TLS-PROTOCOL-REJECTED' { 'O cliente negociou uma versão TLS fora do mínimo permitido.'; break }
      'AP-NEON-TLS-CLIENT-QUERY-FAILED' { 'A consulta conjunta de identidade e evidência TLS não foi concluída.'; break }
      default { 'A evidência TLS do cliente psql ficou ausente ou inconclusiva.' }
    }
    Stop-Import $code $message
  }
  $identity = $evidence.Identity
  $requiredIdentity = @('database','user','session_user','version_num','timezone','locale_provider','locale',
    'is_superuser','in_recovery','server_tls_reported','database_bytes','other_sessions','non_public_schemas',
    'application_relations','application_functions','application_custom_types','application_large_objects','application_extensions','migration_036_present','migration_037_present',
    'session_total_count','session_current_count','session_execution_count','session_same_execution_other_count',
    'session_external_count','session_external_client_count','session_non_client_count','session_irrelevant_internal_count','session_concurrent_count','session_backend_groups')
  if (-not (Test-ObjectHasProperties $identity $requiredIdentity)) {
    Stop-Import 'AP-NEON-DESTINATION-IDENTITY-SCHEMA' 'A consulta de identidade não retornou todos os campos obrigatórios.'
  }
  $sessionAssessment = Test-SessionAssessment $identity
  if (-not [bool]$sessionAssessment.Success) {
    Update-SessionAssessmentReport $sessionAssessment
    Stop-Import ([string]$sessionAssessment.Code) 'A consulta de sessões retornou campos ausentes, inválidos ou inconsistentes; concorrência não pôde ser avaliada com segurança.'
  }
  $identity | Add-Member -NotePropertyName session_assessment -NotePropertyValue $sessionAssessment
  $identity | Add-Member -NotePropertyName client_tls_verified -NotePropertyValue $true
  $identity | Add-Member -NotePropertyName client_tls_hostname_verified -NotePropertyValue $true
  $identity | Add-Member -NotePropertyName client_tls_root_verified -NotePropertyValue $true
  $identity | Add-Member -NotePropertyName client_tls_protocol -NotePropertyValue ([string]$evidence.Protocol)
  $identity | Add-Member -NotePropertyName client_tls_cipher -NotePropertyValue ([string]$evidence.Cipher)
  $identity | Add-Member -NotePropertyName server_tls_reported -NotePropertyValue ([bool]$evidence.ServerTlsReported) -Force
  return $identity
}

function Get-EmptyAssessment([string]$HostName,[int]$Port,[string]$UserName,[string]$Database) {
  $sql = @'
SELECT jsonb_build_object(
 'relations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','S','i','I','f')),
 'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'),
 'custom_types',(SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND t.typtype IN ('d','e','r','m')),
 'large_objects',(SELECT count(*) FROM pg_largeobject_metadata),
 'extensions',(SELECT COALESCE(string_agg(extname || '=' || extversion,',' ORDER BY extname), '') FROM pg_extension),
 'migration_036',(to_regclass('public.operation_authorizations') IS NOT NULL OR to_regclass('public.permanent_file_deletion_queue') IS NOT NULL),
 'migration_037',(to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)') IS NOT NULL)
)::text
'@
  return Get-JsonSnapshot $HostName $Port $UserName $Database '' $sql 'Verificação de destino vazio' @('relations','functions','custom_types','large_objects','extensions','migration_036','migration_037')
}

function Assert-Identity([object]$Identity,[string]$ExpectedUser,[bool]$RequireEmpty,[long]$SourceBytes = 0,
  [string]$HostName = $script:ApprovedNeonTarget.Host,[int]$Port = $script:ApprovedNeonTarget.Port,[string]$Database = $script:ApprovedNeonTarget.Database,
  [switch]$ReadOnlySessionDiagnostic) {
  $requiredIdentity = @('database','user','session_user','version_num','client_tls_verified','client_tls_hostname_verified','client_tls_root_verified',
    'is_superuser','in_recovery','timezone','locale_provider','locale','non_public_schemas','other_sessions','database_bytes','server_tls_reported',
    'application_relations','application_functions','application_custom_types','application_large_objects','application_extensions','migration_036_present','migration_037_present',
    'client_tls_protocol','client_tls_cipher','session_total_count','session_current_count','session_execution_count','session_same_execution_other_count',
    'session_external_count','session_external_client_count','session_non_client_count','session_irrelevant_internal_count','session_concurrent_count','session_backend_groups')
  if (-not (Test-ObjectHasProperties $Identity $requiredIdentity)) {
    Stop-Import 'AP-NEON-DESTINATION-IDENTITY-SCHEMA' 'A identidade não contém todos os campos obrigatórios; nenhuma escrita foi iniciada.'
  }
  $sessionAssessment = Test-SessionAssessment $Identity
  if (-not [bool]$sessionAssessment.Success) {
    Update-SessionAssessmentReport $sessionAssessment
    Stop-Import ([string]$sessionAssessment.Code) 'A avaliação de sessões foi incompleta ou contraditória; operação bloqueada.'
  }
  Update-SessionAssessmentReport $sessionAssessment
  $version = [int]$Identity.version_num
  if ([string]$Identity.database -cne $Database -or [string]$Identity.user -cne $ExpectedUser -or
      [string]$Identity.session_user -cne $ExpectedUser -or $version -lt 170000 -or $version -ge 180000 -or
      -not [bool]$Identity.client_tls_verified -or -not [bool]$Identity.client_tls_hostname_verified -or -not [bool]$Identity.client_tls_root_verified -or
      [bool]$Identity.is_superuser -or [bool]$Identity.in_recovery -or
      [string]$Identity.timezone -cne 'GMT' -or [string]$Identity.locale_provider -cne 'builtin' -or [string]$Identity.locale -cne 'C.UTF-8' -or
      [long]$Identity.non_public_schemas -ne 0) {
    Stop-Import 'AP-NEON-DESTINATION-IDENTITY-MISMATCH' 'O banco, role, PostgreSQL 17, TLS, fuso ou namespace do destino diverge do autorizado.'
  }
  if ([long]$Identity.session_concurrent_count -ne 0 -and -not $ReadOnlySessionDiagnostic) {
    $summary = $script:Report.destination.session_summary
    $reasonText = switch ([string]$summary.block_reason) {
      'EXTERNAL_CONNECTIONS' { 'Há sessões externas no destino; podem alterar o banco e a operação foi bloqueada.'; break }
      'SAME_EXECUTION_EXTRA_CONNECTION' { 'A própria execução possui mais de uma conexão simultânea; a operação foi bloqueada.'; break }
      default { 'Há backends não passivos no destino; a operação foi bloqueada.' }
    }
    Stop-Import 'AP-NEON-DESTINATION-BUSY' $reasonText
  }
  if ([long]$Identity.database_bytes + $SourceBytes -gt 1073741824) { Stop-Import 'AP-NEON-DESTINATION-CAPACITY' 'A estimativa de espaço pode exceder o limite de 1 GB informado para o projeto.' }
  if ($RequireEmpty) {
    if ([long]$Identity.application_relations -ne 0 -or [long]$Identity.application_functions -ne 0 -or [long]$Identity.application_custom_types -ne 0 -or
      [long]$Identity.application_large_objects -ne 0 -or [bool]$Identity.migration_036_present -or [bool]$Identity.migration_037_present -or
      [string]$Identity.application_extensions -cne 'plpgsql=1.0') {
      Stop-Import 'AP-NEON-DESTINATION-NOT-EMPTY' 'O destino contém objetos ou dados; nenhuma escrita foi iniciada.'
    }
    $script:Report.destination.empty_validated = $true
  }
  $script:Report.destination.connected = $true
  $script:Report.destination.identity_validated = $true
  $script:Report.destination.tls_verified = $true
  $script:Report.destination.tls_mode = 'verify-full'
  $script:Report.destination.tls_root_certificate_configured = [bool]$Identity.client_tls_root_verified
  $script:Report.destination.tls_hostname_verified = [bool]$Identity.client_tls_hostname_verified
  $script:Report.destination.tls_protocol = [string]$Identity.client_tls_protocol
  $script:Report.destination.tls_cipher = [string]$Identity.client_tls_cipher
  $script:Report.destination.server_reported_tls = [bool]$Identity.server_tls_reported
  $script:Report.destination.postgres_major = 17
  $script:Report.destination.timezone = [string]$Identity.timezone
  $script:Report.destination.capacity_estimate_validated = $true
}

function Get-ImportRestoreArguments([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$BackupPath) {
  if ([string]::IsNullOrWhiteSpace($HostName) -or $Port -lt 1 -or $Port -gt 65535 -or
      $UserName -notmatch '^[A-Za-z_][A-Za-z0-9_]*$' -or $Database -notmatch '^[A-Za-z_][A-Za-z0-9_]*$' -or
      [string]::IsNullOrWhiteSpace($BackupPath)) {
    Stop-Import 'AP-NEON-RESTORE-ARGUMENTS-INVALID' 'Os parâmetros do restore não passaram pela validação local.'
  }
  return ,@('--exit-on-error','--single-transaction','--no-owner','--no-acl','--no-password',
    '--host',$HostName,'--port',[string]$Port,'--username',$UserName,'--dbname',$Database,$BackupPath)
}

function Confirm-ImportAuthorization([string]$TypedConfirmation,[string]$ExpectedConfirmation) {
  if (-not [bool]$script:Report.import.local_confirmation_presented) {
    Stop-Import 'AP-NEON-LOCAL-CONFIRMATION-NOT-PRESENTED' 'A confirmação local ainda não foi apresentada; nenhuma escrita foi iniciada.'
  }
  if ($TypedConfirmation -cne $ExpectedConfirmation) {
    $script:Report.import.state = 'REJEITADA_LOCALMENTE'
    Stop-Import 'AP-NEON-LOCAL-CONFIRMATION-REJECTED' 'A confirmação literal não correspondeu; nenhuma escrita foi iniciada.'
  }
  $script:Report.import.local_confirmation_accepted = $true
}

function Assert-MigrationSignatures([object]$Metadata) {
  if (-not [bool]$Metadata.migration_035_tables -or -not [bool]$Metadata.migration_035_views -or
      -not [bool]$Metadata.migration_036_authorizations -or -not [bool]$Metadata.migration_036_file_queue -or
      -not [bool]$Metadata.migration_037_function -or -not [bool]$Metadata.migration_037_super_admin) {
    Stop-Import 'AP-NEON-MIGRATION-SIGNATURE-MISMATCH' 'As assinaturas estruturais das migrations 035/036/037 não foram confirmadas.'
  }
}

function Get-ImportSnapshotBundle([string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$RoleName) {
  return [pscustomobject]@{
    Metadata = Get-Metadata $HostName $Port $UserName $Database $RoleName
    Data = Get-DataSnapshot $HostName $Port $UserName $Database $RoleName
    Sequences = Get-SequenceSnapshot $HostName $Port $UserName $Database $RoleName
    SequenceMetadata = Get-SequenceMetadata $HostName $Port $UserName $Database $RoleName
    FunctionHash = Get-FunctionFingerprint $HostName $Port $UserName $Database $RoleName
    SchemaHash = Get-SchemaFingerprint $HostName $Port $UserName $Database
  }
}

function Assert-SnapshotCoreEquivalent([object]$Expected,[object]$Actual) {
  foreach ($bundle in @($Expected,$Actual)) {
    if (-not (Test-ObjectHasProperties $bundle @('Metadata','Data','Sequences','SequenceMetadata','FunctionHash','SchemaHash')) -or
        -not (Test-ObjectHasProperties $bundle.Metadata @('encoding','schemas','tables','views','indexes','sequences','foreign_keys','foreign_keys_unvalidated',
          'triggers','triggers_disabled','functions','security_definer_functions','extensions','migration_035_tables','migration_035_views',
          'migration_036_authorizations','migration_036_file_queue','migration_037_function','migration_037_super_admin')) -or
        -not (Test-ObjectHasProperties $bundle.Data @('TableCount','RowCount','FingerprintA','FingerprintB')) -or
        -not (Test-ObjectHasProperties $bundle.Sequences @('Count','Fingerprint'))) {
      Stop-Import 'AP-NEON-SNAPSHOT-SCHEMA' 'A comparação recebeu snapshot sem todos os campos obrigatórios.'
    }
  }
  $fields = @('schemas','tables','views','indexes','sequences','foreign_keys','foreign_keys_unvalidated','triggers','triggers_disabled','functions',
    'security_definer_functions','extensions','migration_035_tables','migration_035_views','migration_036_authorizations',
    'migration_036_file_queue','migration_037_function','migration_037_super_admin')
  foreach ($field in $fields) {
    if ([string]$Actual.Metadata.$field -cne [string]$Expected.Metadata.$field) {
      Stop-Import 'AP-NEON-POST-STRUCTURE-MISMATCH' 'Contagens ou assinaturas de objetos divergem do backup aprovado.'
    }
  }
  if ([string]$Expected.Metadata.encoding -cne 'UTF8' -or [string]$Actual.Metadata.encoding -cne 'UTF8') {
    Stop-Import 'AP-NEON-POST-SESSION-SETTINGS' 'A codificação da sessão de comparação diverge do esperado.'
  }
  if ([long]$Actual.Data.TableCount -ne [long]$Expected.Data.TableCount -or [decimal]$Actual.Data.RowCount -ne [decimal]$Expected.Data.RowCount -or
      [long]$Actual.Data.FingerprintA -ne [long]$Expected.Data.FingerprintA -or [long]$Actual.Data.FingerprintB -ne [long]$Expected.Data.FingerprintB) {
    Stop-Import 'AP-NEON-POST-DATA-MISMATCH' 'Contagem ou fingerprint dos dados diverge do backup aprovado.'
  }
  if ([long]$Actual.Sequences.Count -ne [long]$Expected.Sequences.Count -or [string]$Actual.Sequences.Fingerprint -cne [string]$Expected.Sequences.Fingerprint) {
    Stop-Import 'AP-NEON-POST-SEQUENCE-MISMATCH' 'Estados das sequences divergem do backup aprovado.'
  }
  if ((ConvertTo-Json -InputObject $Actual.SequenceMetadata -Depth 8 -Compress) -cne (ConvertTo-Json -InputObject $Expected.SequenceMetadata -Depth 8 -Compress)) {
    Stop-Import 'AP-NEON-POST-SEQUENCE-DEFINITION' 'Definições das sequences divergem do backup aprovado.'
  }
  if ([string]$Actual.FunctionHash -cne [string]$Expected.FunctionHash -or [string]$Actual.SchemaHash -cne [string]$Expected.SchemaHash) {
    Stop-Import 'AP-NEON-POST-FINGERPRINT-MISMATCH' 'Fingerprint de funções ou esquema diverge do backup aprovado.'
  }
}

function Compare-ImportedSnapshot([object]$ExpectedMetadata,[object]$ExpectedData,[object]$ExpectedSequences,[object]$ExpectedSequenceMetadata,[string]$ExpectedFunctionHash,[string]$ExpectedSchemaHash,[string]$HostName,[int]$Port,[string]$UserName,[string]$Database,[string]$RoleName) {
  $actual = Get-ImportSnapshotBundle $HostName $Port $UserName $Database $RoleName
  $expected = [pscustomobject]@{ Metadata=$ExpectedMetadata; Data=$ExpectedData; Sequences=$ExpectedSequences; SequenceMetadata=$ExpectedSequenceMetadata; FunctionHash=$ExpectedFunctionHash; SchemaHash=$ExpectedSchemaHash }
  Assert-SnapshotCoreEquivalent $expected $actual
  $actualMetadata = $actual.Metadata
  $actualData = $actual.Data
  Assert-MigrationSignatures $actualMetadata
  $owner = Get-OwnershipAssessment $HostName $Port $UserName $Database $RoleName
  if (-not [bool]$owner.database_owner -or -not [bool]$owner.database_create -or -not [bool]$owner.schema_public_usage -or
      -not [bool]$owner.schema_public_create -or [long]$owner.wrong_object_owners -ne 0 -or [bool]$owner.is_superuser) {
    Stop-Import 'AP-NEON-POST-OWNER-PRIVILEGES' 'Ownership ou permissões dos objetos restaurados divergem da role autorizada.'
  }
  if ([long]$actualMetadata.tables -ne 30 -or [decimal]$actualData.RowCount -ne 153 -or [long]$actualMetadata.views -ne 3 -or
      [long]$actualMetadata.indexes -ne 97 -or [long]$actualMetadata.sequences -ne 24 -or [long]$actualMetadata.foreign_keys -ne 54 -or
      [long]$actualMetadata.triggers -ne 7 -or [long]$actualMetadata.functions -ne 6 -or [long]$actualMetadata.foreign_keys_unvalidated -ne 0 -or
      [long]$actualMetadata.triggers_disabled -ne 0) {
    Stop-Import 'AP-NEON-POST-APPROVED-COUNTS' 'As quantidades de tabelas, registros ou objetos diferem do snapshot aprovado.'
  }
  return [pscustomobject]@{ Metadata=$actualMetadata; Data=$actualData; Sequences=$actual.Sequences }
}

function Start-DisposableCluster([string]$DataDirectory,[string]$LogPath,[switch]$PrivateAclRequired,[string]$TlsCertificatePath,[string]$TlsKeyPath) {
  if (Test-Path -LiteralPath $DataDirectory) { Stop-Import 'AP-NEON-TEMP-PATH-EXISTS' 'O diretório descartável aleatório já existe; não será reutilizado.' }
  [void][IO.Directory]::CreateDirectory($DataDirectory)
  if ($PrivateAclRequired) { Assert-NoReparsePoint $DataDirectory; Assert-PrivateAcl $DataDirectory }
  $init = Invoke-Tool 'initdb.exe' @('-D',$DataDirectory,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8','--locale-provider=libc') 'initdb do PostgreSQL descartável'
  if ([string]::IsNullOrWhiteSpace($TlsCertificatePath) -xor [string]::IsNullOrWhiteSpace($TlsKeyPath)) {
    Stop-Import 'AP-NEON-TLS-SELFTEST-CERTIFICATE-PAIR' 'O teste TLS descartável recebeu somente parte do par sintético de certificado.'
  }
  if (-not [string]::IsNullOrWhiteSpace($TlsCertificatePath)) {
    foreach ($certificatePath in @($TlsCertificatePath,$TlsKeyPath)) {
      Assert-NoReparsePoint $certificatePath 'AP-NEON-TLS-SELFTEST-CERTIFICATE'
      if (-not (Test-Path -LiteralPath $certificatePath -PathType Leaf)) { Stop-Import 'AP-NEON-TLS-SELFTEST-CERTIFICATE' 'Um arquivo do certificado sintético não existe.' }
    }
    $escapedCertificate = [IO.Path]::GetFullPath($TlsCertificatePath).Replace('\','/').Replace("'","''")
    $escapedKey = [IO.Path]::GetFullPath($TlsKeyPath).Replace('\','/').Replace("'","''")
    $postgresConfig = Join-Path $DataDirectory 'postgresql.conf'
    $tlsSettings = "`r`nssl = on`r`nssl_cert_file = '$escapedCertificate'`r`nssl_key_file = '$escapedKey'`r`n"
    [IO.File]::AppendAllText($postgresConfig,$tlsSettings,(New-Object Text.UTF8Encoding($false)))
  }
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
  try { $listener.Start(); $script:TempPort = [int]$listener.LocalEndpoint.Port } finally { $listener.Stop() }
  if ($script:TempPort -in @(3001,5432,55432)) { Stop-Import 'AP-NEON-TEMP-PORT' 'A porta descartável conflita com uma porta protegida.' }
  $options = '-h 127.0.0.1 -p ' + [string]$script:TempPort + ' -c timezone=America/Sao_Paulo'
  # pg_ctl passes inherited standard handles to the postmaster. Capturing its
  # pipes can keep ReadToEndAsync open after pg_ctl exits; use NoCapture here.
  $startResult = Invoke-AmoresPetNativeProcess -Executable $script:PgTools['pg_ctl.exe'] -Arguments @('-D',$DataDirectory,'-o',$options,'-l',$LogPath,'-w','-t','45','start') -NoCapture
  if (-not $startResult.Started -or [int]$startResult.ExitCode -ne 0) {
    $pidPath = Join-Path $DataDirectory 'postmaster.pid'
    if (Test-Path -LiteralPath $pidPath -PathType Leaf) {
      $possiblyStarted = Get-AmoresPetPostmasterIdentity -Path $pidPath -ExpectedDataDirectory $DataDirectory -ExpectedPort $script:TempPort -ExpectedListenAddress '127.0.0.1'
      $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $possiblyStarted.ProcessId -ExpectedExecutable $script:PgTools['postgres.exe'] -ExpectedDataDirectory $DataDirectory -ExpectedListenAddress '127.0.0.1' -ExpectedPort $script:TempPort
      $script:TempClusterStarted = $true
      Stop-Import 'AP-NEON-PG-CTL-START-AMBIGUOUS' 'pg_ctl retornou falha, mas um cluster descartável ativo foi identificado; será encerrado com identidade validada.'
    }
    Stop-Import ('AP-NEON-PG-CTL-START-' + [string]$startResult.ExitCode) 'O cluster PostgreSQL descartável não iniciou; nenhum destino persistente foi conectado.'
  }
  $script:TempClusterStarted = $true
  $pidPath = Join-Path $DataDirectory 'postmaster.pid'
  $identity = Get-AmoresPetPostmasterIdentity -Path $pidPath -ExpectedDataDirectory $DataDirectory -ExpectedPort $script:TempPort -ExpectedListenAddress '127.0.0.1'
  $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $identity.ProcessId -ExpectedExecutable $script:PgTools['postgres.exe'] -ExpectedDataDirectory $DataDirectory -ExpectedListenAddress '127.0.0.1' -ExpectedPort $script:TempPort
}

function Stop-DisposableCluster([string]$DataDirectory,[string]$AllowedRoot) {
  if (-not $script:TempClusterStarted -or $script:TempClusterStopped) { return }
  $pidPath = Join-Path $DataDirectory 'postmaster.pid'
  if (Test-Path -LiteralPath $pidPath -PathType Leaf) {
    $identity = Get-AmoresPetPostmasterIdentity -Path $pidPath -ExpectedDataDirectory $DataDirectory -ExpectedPort $script:TempPort -ExpectedListenAddress '127.0.0.1'
    $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $identity.ProcessId -ExpectedExecutable $script:PgTools['postgres.exe'] -ExpectedDataDirectory $DataDirectory -ExpectedListenAddress '127.0.0.1' -ExpectedPort $script:TempPort
    $null = Invoke-Tool 'pg_ctl.exe' @('-D',$DataDirectory,'-m','fast','-w','-t','45','stop') 'Encerramento do PostgreSQL descartável' -NoCapture
  }
  $script:TempClusterStopped = $true
  $fullData = [IO.Path]::GetFullPath($DataDirectory)
  $fullRoot = [IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\') + '\'
  if (-not $fullData.StartsWith($fullRoot,[StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetFileName($fullData) -notmatch '^(?:cluster|selftest)-[a-f0-9]{32}$' -or
      (Test-Path -LiteralPath (Join-Path $fullData 'postmaster.pid'))) {
    Stop-Import 'AP-NEON-TEMP-CLEANUP-GUARD' 'A identidade do diretório descartável não pôde ser confirmada para limpeza.'
  }
  if (Test-Path -LiteralPath $fullData) { Remove-Item -LiteralPath $fullData -Recurse -Force }
  if (Test-Path -LiteralPath $fullData) { Stop-Import 'AP-NEON-TEMP-CLEANUP' 'O diretório do cluster descartável não foi removido.' }
}

function Assert-MetadataEquivalent([object]$Expected,[object]$Actual) {
  foreach ($field in @('schemas','tables','views','indexes','sequences','foreign_keys','foreign_keys_unvalidated','triggers','triggers_disabled','functions','security_definer_functions','extensions',
      'migration_035_tables','migration_035_views','migration_036_authorizations','migration_036_file_queue','migration_037_function','migration_037_super_admin')) {
    if ([string]$Expected.$field -cne [string]$Actual.$field) { Stop-Import 'AP-NEON-DISPOSABLE-STRUCTURE' 'A restauração descartável divergiu na estrutura do backup.' }
  }
}

function Test-ApprovedArchiveInDisposable([string]$BackupPath,[object]$BackupReport,[bool]$PrivateAclRequired) {
  $dataDirectory = $script:TempDataDirectory
  $logPath = Join-Path (Split-Path -Parent $dataDirectory) 'postgres-neon-import-preflight.log'
  $script:TempClusterStarted = $false; $script:TempClusterStopped = $false
  try {
    Start-DisposableCluster $dataDirectory $logPath -PrivateAclRequired:$PrivateAclRequired
    $testRole = 'amores_pet_homologacao_owner'
    $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' 'postgres' "CREATE ROLE `"$testRole`" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;" 'Criação da role descartável' ''
    $database = 'neon_import_preflight_' + [guid]::NewGuid().ToString('N')
    $createDb = "CREATE DATABASE `"$database`" WITH TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' OWNER `"$testRole`";"
    $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' 'postgres' $createDb 'Criação do destino descartável' ''
    $restoreArgs = @('--exit-on-error','--single-transaction','--no-owner','--no-acl','--no-password','--host','127.0.0.1','--port',[string]$script:TempPort,'--username','postgres','--role',$testRole,'--dbname',$database,$BackupPath)
    $null = Invoke-Tool 'pg_restore.exe' $restoreArgs 'Restauração integral do backup aprovado no PostgreSQL descartável'
    $meta = Get-Metadata '127.0.0.1' $script:TempPort 'postgres' $database $testRole
    $data = Get-DataSnapshot '127.0.0.1' $script:TempPort 'postgres' $database $testRole
    $sequences = Get-SequenceSnapshot '127.0.0.1' $script:TempPort 'postgres' $database $testRole
    $sequenceMeta = Get-SequenceMetadata '127.0.0.1' $script:TempPort 'postgres' $database $testRole
    $functionHash = Get-FunctionFingerprint '127.0.0.1' $script:TempPort 'postgres' $database $testRole
    $schemaHash = Get-SchemaFingerprint '127.0.0.1' $script:TempPort 'postgres' $database
    Assert-MigrationSignatures $meta
    if ([long]$meta.tables -ne 30 -or [decimal]$data.RowCount -ne 153 -or [long]$meta.views -ne 3 -or [long]$meta.indexes -ne 97 -or
        [long]$meta.sequences -ne 24 -or [long]$meta.foreign_keys -ne 54 -or [long]$meta.triggers -ne 7 -or [long]$meta.functions -ne 6 -or
        [long]$data.TableCount -ne 30 -or [long]$sequences.Count -ne 24 -or [long]$meta.foreign_keys_unvalidated -ne 0 -or [long]$meta.triggers_disabled -ne 0) {
      Stop-Import 'AP-NEON-DISPOSABLE-APPROVED-COUNTS' 'O backup restaurado não corresponde ao snapshot e contagens aprovadas.'
    }
    $owner = Get-OwnershipAssessment '127.0.0.1' $script:TempPort 'postgres' $database $testRole
    if (-not [bool]$owner.database_owner -or -not [bool]$owner.database_create -or -not [bool]$owner.schema_public_create -or [long]$owner.wrong_object_owners -ne 0 -or [bool]$owner.is_superuser) {
      Stop-Import 'AP-NEON-DISPOSABLE-OWNER' 'O teste descartável não reproduziu ownership e menor privilégio.'
    }
    foreach ($field in @('tables','views','indexes','sequences','foreign_keys','triggers','functions','extensions')) {
      if ([string]$meta.$field -cne [string]$BackupReport.source_snapshot.$field) { Stop-Import 'AP-NEON-DISPOSABLE-REPORT-MISMATCH' 'A restauração descartável divergiu do snapshot privado de origem.' }
    }
    if ([long]$data.TableCount -ne [long]$BackupReport.source_snapshot.data_table_count -or
        [decimal]$data.RowCount -ne [decimal]$BackupReport.source_snapshot.data_row_count) {
      Stop-Import 'AP-NEON-DISPOSABLE-REPORT-DATA' 'Contagem dos dados restaurados divergiu do snapshot privado de origem.'
    }
    $script:ExpectedDisposable = [pscustomobject]@{ Metadata=$meta; Data=$data; Sequences=$sequences; SequenceMetadata=$sequenceMeta; FunctionHash=$functionHash; SchemaHash=$schemaHash }
    $script:Report.disposable.source_restore_passed = $true
    $script:Report.disposable.structure_compared = $true
    $script:Report.disposable.data_compared = $true
    $script:Report.disposable.sequence_states_compared = $true
    return $database
  } finally {
    Stop-DisposableCluster $dataDirectory (Split-Path -Parent $dataDirectory)
  }
}

function Test-RestoreAtomicitySynthetic {
  # A second disposable archive intentionally collides with a pre-existing
  # table. pg_restore must fail and roll back all other archive objects.
  $testId = [guid]::NewGuid().ToString('N')
  $dataDirectory = Join-Path $script:SelfTestRoot ('selftest-' + $testId)
  $logPath = Join-Path $script:SelfTestRoot ('postgres-' + $testId + '.log')
  $script:TempDataDirectory = $dataDirectory; $script:TempClusterStarted = $false; $script:TempClusterStopped = $false
  try {
    Assert-ImportReportShape
    if (Test-ObjectHasPropertyNames ([pscustomobject]@{tls_mode='verify-full'}) @('tls_mode','gss_encryption_mode')) {
      Stop-Import 'AP-NEON-SELFTEST-REPORT-SCHEMA' 'A validação sintética não detectou um campo ausente do relatório.'
    }
    Start-DisposableCluster $dataDirectory $logPath
    $fixtureDb = 'fixture_source_' + $testId
    $targetDb = 'fixture_target_' + $testId
    $fixtureRole = 'amores_pet_homologacao_owner'
    $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' 'postgres' "CREATE ROLE `"$fixtureRole`" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; CREATE ROLE source_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;" 'Criação de roles sintéticas' ''
    $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' 'postgres' "CREATE DATABASE `"$fixtureDb`" WITH TEMPLATE template0 ENCODING 'UTF8' OWNER postgres;" 'Criação do banco sintético de origem' ''
    $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' 'postgres' "CREATE DATABASE `"$targetDb`" WITH TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' OWNER `"$fixtureRole`";" 'Criação do banco sintético de destino' ''
    $fixtureSql = @'
CREATE TABLE public.tutores (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, nome text NOT NULL);
CREATE TABLE public.pets (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, tutor_id bigint NOT NULL REFERENCES public.tutores(id), nome text NOT NULL);
CREATE TABLE public.atendimentos (id bigint PRIMARY KEY, status text NOT NULL);
CREATE TABLE public.atendimento_servicos (id bigint PRIMARY KEY, atendimento_id bigint REFERENCES public.atendimentos(id));
CREATE TABLE public.pagamentos_atendimentos (id bigint PRIMARY KEY, atendimento_id bigint REFERENCES public.atendimentos(id));
CREATE VIEW public.banho_tosa AS SELECT * FROM public.atendimentos;
CREATE VIEW public.banho_tosa_servicos AS SELECT * FROM public.atendimento_servicos;
CREATE VIEW public.pagamentos_banho_tosa AS SELECT * FROM public.pagamentos_atendimentos;
CREATE TABLE public.operation_authorizations (id integer PRIMARY KEY);
CREATE TABLE public.permanent_file_deletion_queue (id integer PRIMARY KEY);
CREATE SEQUENCE public.synthetic_sequence START 9;
CREATE FUNCTION public.synthetic_trigger_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER synthetic_trigger BEFORE INSERT ON public.tutores FOR EACH ROW EXECUTE FUNCTION public.synthetic_trigger_fn();
CREATE FUNCTION public.emitir_notificacao_equipe(text,text,text,text,text) RETURNS integer LANGUAGE plpgsql AS $$ BEGIN RETURN position('super_administrador' IN 'super_administrador'); END $$;
INSERT INTO public.tutores(id,nome) VALUES (1,'Fixture Tutor');
INSERT INTO public.pets(id,tutor_id,nome) VALUES (1,1,'Fixture Pet');
GRANT SELECT ON public.tutores TO source_app;
'@
    $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' $fixtureDb $fixtureSql 'Criação de schema sintético' ''
    $archive = Join-Path $script:SelfTestRoot ('fixture-' + $testId + '.custom')
    $dumpArgs = @('--format=custom','--no-password','--host','127.0.0.1','--port',[string]$script:TempPort,'--username','postgres','--dbname',$fixtureDb,'--file',$archive)
    $null = Invoke-Tool 'pg_dump.exe' $dumpArgs 'pg_dump do fixture sintético'
    $targetLocale = 'builtin|C.UTF-8'
    $localeProcess = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' $targetDb "SELECT CASE datlocprovider WHEN 'b' THEN 'builtin' WHEN 'c' THEN 'libc' WHEN 'i' THEN 'icu' ELSE 'other' END||'|'||COALESCE(datlocale,'') FROM pg_database WHERE datname=current_database()" 'Collation synthetic' ''
    $locale = ([string]$localeProcess.StandardOutput).Trim()
    if ($locale -cne $targetLocale) { Stop-Import 'AP-NEON-SELFTEST-LOCALE' 'PostgreSQL descartável não criou a locale Neon equivalente.' }
    $restoreArgs = @('--exit-on-error','--single-transaction','--no-owner','--no-acl','--no-password','--host','127.0.0.1','--port',[string]$script:TempPort,'--username','postgres','--role',$fixtureRole,'--dbname',$targetDb,$archive)
    $null = Invoke-Tool 'pg_restore.exe' $restoreArgs 'pg_restore com ownership Neon sintético'
    $owner = Get-OwnershipAssessment '127.0.0.1' $script:TempPort 'postgres' $targetDb $fixtureRole
    if (-not [bool]$owner.database_owner -or [long]$owner.wrong_object_owners -ne 0 -or [bool]$owner.is_superuser) { Stop-Import 'AP-NEON-SELFTEST-OWNER' 'O mapeamento --no-owner/--role não passou.' }
    $aclSql = "SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a JOIN pg_roles r ON r.oid=a.grantee WHERE n.nspname='public' AND c.relname='tutores' AND r.rolname='source_app'"
    $aclProcess = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' $targetDb $aclSql 'Verificação --no-acl' $fixtureRole
    $aclCount = ([string]$aclProcess.StandardOutput).Trim()
    if ($aclCount -cne '0') { Stop-Import 'AP-NEON-SELFTEST-ACL' 'O restore sintético reaplicou privilégios do owner original.' }
    $catalogProcess = Invoke-Tool 'pg_restore.exe' @('--list',$archive) 'Catálogo do fixture de rollback'
    $catalog = [string]$catalogProcess.StandardOutput
    $tableEntries = [regex]::Matches($catalog,'TABLE\s+public\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)')
    if ($tableEntries.Count -lt 2) { Stop-Import 'AP-NEON-SELFTEST-CATALOG' 'O catálogo sintético não forneceu tabelas para o teste transacional.' }
    $firstTable = $tableEntries[0].Groups['name'].Value
    $conflictTable = $tableEntries[1].Groups['name'].Value
    $rollbackDb = 'fixture_rollback_' + $testId
    $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' 'postgres' "CREATE DATABASE `"$rollbackDb`" WITH TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' OWNER `"$fixtureRole`";" 'Criação do destino de rollback sintético' ''
    $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' $rollbackDb ("CREATE TABLE public.`"$conflictTable`" (probe integer)") 'Criação do conflito sintético' $fixtureRole
    $rollbackResult = Invoke-AmoresPetNativeProcess -Executable $script:PgTools['pg_restore.exe'] -Arguments @('--exit-on-error','--single-transaction','--no-owner','--no-acl','--no-password','--host','127.0.0.1','--port',[string]$script:TempPort,'--username','postgres','--role',$fixtureRole,'--dbname',$rollbackDb,$archive)
    if (-not $rollbackResult.Started -or [int]$rollbackResult.ExitCode -eq 0) { Stop-Import 'AP-NEON-SELFTEST-ROLLBACK-NOT-REJECTED' 'O conflito sintético não foi rejeitado pelo pg_restore.' }
    $rollbackStateSql = "SELECT (to_regclass('public.`"$firstTable`"') IS NULL)::text||'|'||(to_regclass('public.`"$conflictTable`"') IS NOT NULL)::text||'|'||(SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p'))::text"
    $rollbackStateProcess = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' $rollbackDb $rollbackStateSql 'Verificação de rollback transacional' $fixtureRole
    $rollbackState = ([string]$rollbackStateProcess.StandardOutput).Trim()
    if ($rollbackState -cne 'true|true|1') { Stop-Import 'AP-NEON-SELFTEST-ROLLBACK-PARTIAL' 'O restore sintético deixou objetos parciais apesar de --single-transaction.' }
    $dataBefore = Get-DataSnapshot '127.0.0.1' $script:TempPort 'postgres' $targetDb $fixtureRole
    $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' $targetDb "INSERT INTO public.tutores(id,nome) VALUES (2,'Synthetic Difference')" 'Mutação sintética para teste de fingerprint' $fixtureRole
    $dataAfter = Get-DataSnapshot '127.0.0.1' $script:TempPort 'postgres' $targetDb $fixtureRole
    if ([long]$dataBefore.FingerprintA -eq [long]$dataAfter.FingerprintA -and [long]$dataBefore.FingerprintB -eq [long]$dataAfter.FingerprintB) { Stop-Import 'AP-NEON-SELFTEST-DATA-FINGERPRINT' 'O teste sintético não detectou uma divergência de dados.' }
    $schemaBefore = Get-SchemaFingerprint '127.0.0.1' $script:TempPort 'postgres' $targetDb
    $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' $targetDb 'ALTER TABLE public.pets ADD COLUMN synthetic_difference boolean' 'Mutação sintética para teste estrutural' $fixtureRole
    $schemaAfter = Get-SchemaFingerprint '127.0.0.1' $script:TempPort 'postgres' $targetDb
    if ($schemaBefore -ceq $schemaAfter) { Stop-Import 'AP-NEON-SELFTEST-SCHEMA-FINGERPRINT' 'O teste sintético não detectou uma divergência estrutural.' }
    $priorCode = $script:Code; $priorMessage = $script:Message
    $sqlFailureClassified = $false
    try {
      $null = Invoke-Psql '127.0.0.1' $script:TempPort 'postgres' $targetDb 'SELEC 1;' 'Teste sanitizado de SQLSTATE' $fixtureRole
    } catch {
      $sqlFailureClassified = $_.Exception.Message -eq 'AP-NEON-IMPORT-STOP' -and
        $script:Code -eq 'AP-PSQL-SQL-ERROR' -and $script:Message -match 'SQLSTATE=42601' -and
        $script:Message -notmatch '(?i)syntax error|SELEC 1'
    }
    if (-not $sqlFailureClassified) { Stop-Import 'AP-NEON-SELFTEST-SQLSTATE' 'A falha SQL sintética não foi classificada e sanitizada como esperado.' }
    $script:Code = $priorCode; $script:Message = $priorMessage; $script:Report.technical_code = $priorCode
    $priorDiagnostic = @{
      class=$script:Report.internal_failure_class; type=$script:Report.internal_failure_type; hresult=$script:Report.internal_failure_hresult
      function=$script:Report.failure_function; command=$script:Report.failure_command; error_id=$script:Report.failure_error_id; location=$script:Report.failure_location
    }
    $strictPropertyError = $null
    try { $missingPropertyObject = [pscustomobject]@{}; $null = $missingPropertyObject.Name } catch { $strictPropertyError = $_ }
    if ($null -eq $strictPropertyError -or ([string](Get-OptionalPropertyValue $strictPropertyError 'FullyQualifiedErrorId') -split ',')[0] -cne 'PropertyNotFoundStrict') {
      Stop-Import 'AP-NEON-SELFTEST-STRICT-PROPERTY' 'O teste não reproduziu PropertyNotFoundStrict no Windows PowerShell 5.1.'
    }
    $strictErrorNoThrow = $true
    try { Set-InternalFailureDiagnostic $strictPropertyError } catch { $strictErrorNoThrow = $false }
    $strictErrorPreserved = $strictErrorNoThrow -and $script:Report.failure_error_id -ceq 'PropertyNotFoundStrict' -and
      $script:Report.internal_failure_class -ceq 'PS_OPTIONAL_PROPERTY_UNAVAILABLE'
    $missingNameError = [pscustomobject]@{
      Exception = [Exception]::new('synthetic_private_path_should_not_appear')
      FullyQualifiedErrorId = 'PropertyNotFoundStrict'
      InvocationInfo = [pscustomobject]@{ MyCommand = [pscustomobject]@{}; ScriptLineNumber = 0 }
      ScriptStackTrace = ''
    }
    $missingNameNoThrow = $true
    try { Set-InternalFailureDiagnostic $missingNameError } catch { $missingNameNoThrow = $false }
    $missingNameSafe = $missingNameNoThrow -and $script:Report.internal_failure_class -ceq 'PS_OPTIONAL_PROPERTY_UNAVAILABLE' -and
      $script:Report.failure_error_id -ceq 'PropertyNotFoundStrict' -and $null -eq $script:Report.failure_command -and
      ((@($script:Report.internal_failure_type,$script:Report.failure_function,$script:Report.failure_command,$script:Report.failure_error_id,$script:Report.failure_location) -join '|') -notmatch 'synthetic_private_path_should_not_appear')
    $nullInvocationError = [pscustomobject]@{
      Exception = [Exception]::new('synthetic_private_path_should_not_appear')
      FullyQualifiedErrorId = 'Synthetic.NoInvocationInfo'
      InvocationInfo = $null
      ScriptStackTrace = $null
    }
    $nullInvocationNoThrow = $true
    try { Set-InternalFailureDiagnostic $nullInvocationError } catch { $nullInvocationNoThrow = $false }
    $nullInvocationSafe = $nullInvocationNoThrow -and $script:Report.internal_failure_class -ceq 'PS_INTERNAL_ERROR' -and
      $script:Report.failure_error_id -ceq 'Synthetic.NoInvocationInfo' -and $null -eq $script:Report.failure_command
    try { $null = Join-Path $null 'synthetic_private_path_should_not_appear' } catch { Set-InternalFailureDiagnostic $_ }
    $syntheticDiagnostic = [pscustomobject]@{
      Class=$script:Report.internal_failure_class; Type=$script:Report.internal_failure_type; HResult=$script:Report.internal_failure_hresult
      Function=$script:Report.failure_function; Command=$script:Report.failure_command; ErrorId=$script:Report.failure_error_id; Location=$script:Report.failure_location
    }
    $safeDiagnostic = @($syntheticDiagnostic.Class,$syntheticDiagnostic.Type,$syntheticDiagnostic.HResult,$syntheticDiagnostic.Function,
      $syntheticDiagnostic.Command,$syntheticDiagnostic.ErrorId,$syntheticDiagnostic.Location) -join '|'
    $internalDiagnosticPassed = $strictErrorPreserved -and $missingNameSafe -and $nullInvocationSafe -and $syntheticDiagnostic.Class -eq 'PS_PARAMETER_NULL' -and
      $syntheticDiagnostic.Type -eq 'System.Management.Automation.ParameterBindingValidationException' -and
      $syntheticDiagnostic.Command -eq 'Join-Path' -and $syntheticDiagnostic.ErrorId -eq 'ParameterArgumentValidationErrorNullNotAllowed' -and
      $syntheticDiagnostic.Function -and $syntheticDiagnostic.Location -match '^Importar-Homologacao-Neon\.ps1:[0-9]+$' -and
      $safeDiagnostic -notmatch 'synthetic_private_path_should_not_appear'
    foreach ($field in $priorDiagnostic.Keys) {
      switch ($field) {
        'class' { $script:Report.internal_failure_class=$priorDiagnostic[$field] }
        'type' { $script:Report.internal_failure_type=$priorDiagnostic[$field] }
        'hresult' { $script:Report.internal_failure_hresult=$priorDiagnostic[$field] }
        'function' { $script:Report.failure_function=$priorDiagnostic[$field] }
        'command' { $script:Report.failure_command=$priorDiagnostic[$field] }
        'error_id' { $script:Report.failure_error_id=$priorDiagnostic[$field] }
        'location' { $script:Report.failure_location=$priorDiagnostic[$field] }
      }
    }
    if (-not $internalDiagnosticPassed) {
      Write-Output ('SYNTHETIC_DIAGNOSTIC_CLASS=' + [string]$syntheticDiagnostic.Class + '; TYPE=' + [string]$syntheticDiagnostic.Type +
        '; FUNCTION=' + [string]$syntheticDiagnostic.Function + '; COMMAND=' + [string]$syntheticDiagnostic.Command +
        '; ERROR_ID=' + [string]$syntheticDiagnostic.ErrorId + '; LOCATION=' + [string]$syntheticDiagnostic.Location)
      Stop-Import 'AP-NEON-SELFTEST-INTERNAL-DIAGNOSTIC' 'A exceção PowerShell sintética não foi classificada sem conteúdo sensível.'
    }
    $script:Report.disposable.self_tests_passed = $true
    $script:Report.disposable.transaction_rollback_tested = $true
    Write-Output '[PASS] PostgreSQL 17: restore transacional, owner role, --no-acl, fingerprints, rollback, SQLSTATE 42601 e diagnóstico PowerShell sanitizados.'
  } finally {
    Stop-DisposableCluster $dataDirectory $script:SelfTestRoot
    $archivePath = Join-Path $script:SelfTestRoot ('fixture-' + $testId + '.custom')
    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    if (Test-Path -LiteralPath $logPath) { Remove-Item -LiteralPath $logPath -Force }
  }
}

function Save-PgEnvironment {
  foreach ($entry in Get-ChildItem Env:) {
    if ($entry.Name -match '^(PG|PSQL)' -or $entry.Name -eq 'DATABASE_URL') {
      $script:SavedPgEnvironment[$entry.Name] = [string]$entry.Value
      Remove-Item -LiteralPath ('Env:' + $entry.Name) -ErrorAction SilentlyContinue
    }
  }
}

function Restore-PgEnvironment {
  foreach ($entry in Get-ChildItem Env:) { if ($entry.Name -match '^(PG|PSQL)' -or $entry.Name -eq 'DATABASE_URL') { Remove-Item -LiteralPath ('Env:' + $entry.Name) -ErrorAction SilentlyContinue } }
  foreach ($name in $script:SavedPgEnvironment.Keys) { Set-Item -LiteralPath ('Env:' + $name) -Value $script:SavedPgEnvironment[$name] }
  $script:SavedPgEnvironment.Clear()
}

function New-PrivatePassfile([string]$HostName,[string]$Password) {
  $path = Join-Path $script:OperationDirectory ('.neon-' + [guid]::NewGuid().ToString('N') + '.pgpass')
  $escape = { param([string]$value) $value.Replace('\','\\').Replace(':','\:').Replace("`r",'').Replace("`n",'') }
  $passParts = @($HostName,'5432','amores_pet_homologacao','amores_pet_homologacao_owner',$Password)
  $line = (@($passParts | ForEach-Object { & $escape ([string]$_) }) -join ':')
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($line + "`n")
  $stream = [IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush() } finally { $stream.Dispose(); [Array]::Clear($bytes,0,$bytes.Length); $line = $null }
  Assert-NoReparsePoint $path
  Assert-PrivateAcl $path
  return $path
}

function Remove-PrivatePassfile {
  if ($script:PassFile -and (Test-Path -LiteralPath $script:PassFile -PathType Leaf)) {
    try {
      Assert-NoReparsePoint $script:PassFile
      $parent = [IO.Path]::GetFullPath((Split-Path -Parent $script:PassFile))
      if ($parent -ceq [IO.Path]::GetFullPath($script:OperationDirectory) -and [IO.Path]::GetFileName($script:PassFile) -match '^\.neon-[a-f0-9]{32}\.pgpass$') {
        Remove-Item -LiteralPath $script:PassFile -Force
      }
    } catch { }
  }
  $script:PassFile = $null
}

function Initialize-NeonReadOnlySessionDiagnosticConnection {
  Set-Phase 'captura local do endpoint e CA para diagnóstico somente leitura'
  Write-Host ('Diagnóstico somente leitura: projeto ' + $script:ApprovedNeonTarget.ProjectId + ', branch ' + $script:ApprovedNeonTarget.BranchId + ', banco ' + $script:ApprovedNeonTarget.Database + ', role ' + $script:ApprovedNeonTarget.Role + '.')
  $script:NeonHost = Normalize-NeonEndpointInput (Read-Host 'Informe somente o hostname DIRETO aprovado do Neon')
  Test-EndpointHost $script:NeonHost
  $attestation = Read-Host ('Digite exatamente HOST ' + $script:ApprovedNeonTarget.ProjectId + ' ' + $script:ApprovedNeonTarget.BranchId)
  $null = Confirm-NeonEndpointAttestation $attestation
  $defaultRootCert = Join-Path $env:APPDATA 'postgresql\root.crt'
  if (Test-Path -LiteralPath $defaultRootCert -PathType Leaf) { $script:NeonRootCert = [IO.Path]::GetFullPath($defaultRootCert) }
  else { $script:NeonRootCert = [IO.Path]::GetFullPath((Read-Host 'Informe o caminho do certificado raiz CA oficial do Neon')) }
  Assert-NoReparsePoint $script:NeonRootCert 'AP-NEON-ROOT-CERT'
  if (-not (Test-Path -LiteralPath $script:NeonRootCert -PathType Leaf)) { Stop-Import 'AP-NEON-ROOT-CERT-MISSING' 'O certificado raiz informado não existe.' }

  Save-PgEnvironment
  $env:PGPASSFILE = ''
  $env:PGSSLMODE = 'verify-full'
  $env:PGSSLROOTCERT = $script:NeonRootCert
  $env:PGGSSENCMODE = 'disable'
  $env:PGCONNECT_TIMEOUT = '10'
  $env:PGCLIENTENCODING = 'UTF8'
  $env:PGAPPNAME = $script:ExecutionApplicationName
  $env:PGSERVICE = ''
  $env:PGSERVICEFILE = ''
  $env:PGHOSTADDR = ''
  $script:NeonPassword = ConvertFrom-SecurePassword (Read-Host 'Senha da role autorizada (entrada oculta)' -AsSecureString)
  if ([string]::IsNullOrWhiteSpace($script:NeonPassword)) { Stop-Import 'AP-NEON-PASSWORD-EMPTY' 'Nenhuma senha utilizável foi informada; nenhuma conexão foi iniciada.' }
  Set-Phase 'criação de credencial temporária protegida para consulta somente leitura'
  $script:PassFile = New-PrivatePassfile $script:NeonHost $script:NeonPassword
  $script:NeonPassword = $null
  $env:PGPASSFILE = $script:PassFile
  $env:PGAPPNAME = $script:ExecutionApplicationName
}

function Normalize-NeonEndpointInput([string]$RawEndpoint) {
  if ($null -eq $RawEndpoint) { return '' }
  return $RawEndpoint.Trim().ToLowerInvariant()
}

function Test-EndpointHost([string]$EndpointHost) {
  $target = $script:ApprovedNeonTarget
  if ([string]::IsNullOrWhiteSpace($EndpointHost)) {
    Stop-Import 'AP-NEON-ENDPOINT-FORMAT' 'O hostname está vazio; informe somente o endpoint direto aprovado.'
  }
  if ($EndpointHost -match '(?i)-pooler(?:\.|$)') {
    Stop-Import 'AP-NEON-POOLED-ENDPOINT-REJECTED' 'Endpoints pooled são proibidos; use somente o endpoint direto aprovado.'
  }
  if ($EndpointHost -match '[\s"''/:?@#\\]') {
    Stop-Import 'AP-NEON-ENDPOINT-FORMAT' 'Informe somente um hostname, sem URL, aspas, espaços, porta ou parâmetros.'
  }

  $hostPattern = '^ep-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.c-[1-9][0-9]*)?\.(?<region>[a-z]+(?:-[a-z]+){1,2}-[0-9]+)\.aws\.neon\.tech$'
  $parsedHost = [regex]::Match($EndpointHost, $hostPattern, [Text.RegularExpressions.RegexOptions]::CultureInvariant)
  if (-not $parsedHost.Success) {
    Stop-Import 'AP-NEON-ENDPOINT-FORMAT' 'O hostname não corresponde ao formato de endpoint direto do Neon.'
  }
  if ($parsedHost.Groups['region'].Value -cne $target.Region) {
    Stop-Import 'AP-NEON-ENDPOINT-REGION-REJECTED' 'A região do endpoint diverge da região autorizada para este projeto.'
  }
  if ($target.ProjectId -cne 'square-boat-15573195' -or $target.BranchId -cne 'br-holy-sunset-b6ykrr20' -or
      $target.Branch -cne 'main' -or $target.Region -cne 'sa-east-1' -or
      $target.Database -cne 'amores_pet_homologacao' -or $target.Role -cne 'amores_pet_homologacao_owner' -or
      $target.Host -cne 'ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech') {
    Stop-Import 'AP-NEON-ENDPOINT-MAPPING-INVALID' 'O mapeamento local de projeto, branch, região e endpoint não corresponde ao destino autorizado.'
  }
  if ($EndpointHost -cne $target.Host) {
    Stop-Import 'AP-NEON-ENDPOINT-NOT-APPROVED' 'O endpoint direto não está associado ao projeto e à branch autorizados.'
  }

  $script:Report.destination.endpoint_mapping_validated = $true
}

function Confirm-NeonEndpointAttestation([string]$Attestation) {
  $target = $script:ApprovedNeonTarget
  $expected = 'HOST ' + $target.ProjectId + ' ' + $target.BranchId
  if ($Attestation -cne $expected) {
    Stop-Import 'AP-NEON-ENDPOINT-ATTESTATION-REJECTED' 'A confirmação local da associação entre projeto, branch e endpoint foi recusada.'
  }
  $script:Report.destination.host_metadata_confirmed_locally = $true
  return 'CAPTURA_DO_CERTIFICADO_RAIZ'
}

function Test-EndpointRejectedCase([string]$Name, [string]$RawEndpoint, [string]$ExpectedCode) {
  $originalCode = $script:Code
  $originalMessage = $script:Message
  $originalMapping = [bool]$script:Report.destination.endpoint_mapping_validated
  try {
    $normalized = Normalize-NeonEndpointInput $RawEndpoint
    Test-EndpointHost $normalized
    throw ('TEST_EXPECTED_REJECTION:' + $Name)
  } catch {
    if ($_.Exception.Message -eq 'AP-NEON-IMPORT-STOP' -and $script:Code -ceq $ExpectedCode) {
      return $true
    }
    throw
  } finally {
    $script:Code = $originalCode
    $script:Message = $originalMessage
    $script:Report.technical_code = $originalCode
    $script:Report.error = $originalMessage
    $script:Report.destination.endpoint_mapping_validated = $originalMapping
  }
}

function Invoke-EndpointInputSelfTests {
  $passed = 0
  $expectedHost = 'ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech'
  $validInput = Normalize-NeonEndpointInput '  EP-LITTLE-DAWN-B6IY8O0T.C-2.SA-EAST-1.AWS.NEON.TECH  '
  if ($validInput -cne $expectedHost) { Stop-Import 'AP-NEON-ENDPOINT-TEST-NORMALIZATION' 'A normalização simulada do hostname não correspondeu ao esperado.' }
  Test-EndpointHost $validInput
  if (-not [bool]$script:Report.destination.endpoint_mapping_validated) { Stop-Import 'AP-NEON-ENDPOINT-TEST-MAPPING' 'O endpoint direto não foi associado ao projeto e à branch aprovados.' }
  $passed++

  $transition = Confirm-NeonEndpointAttestation ('HOST ' + $script:ApprovedNeonTarget.ProjectId + ' ' + $script:ApprovedNeonTarget.BranchId)
  if ($transition -cne 'CAPTURA_DO_CERTIFICADO_RAIZ' -or -not [bool]$script:Report.destination.host_metadata_confirmed_locally) {
    Stop-Import 'AP-NEON-ENDPOINT-TEST-TRANSITION' 'A confirmação simulada não avançou para a etapa local do certificado.'
  }
  $passed++

  $cases = @(
    @{ Name='pooled'; Input='ep-little-dawn-b6iy8o0t-pooler.c-2.sa-east-1.aws.neon.tech'; Code='AP-NEON-POOLED-ENDPOINT-REJECTED' },
    @{ Name='regiao divergente'; Input='ep-little-dawn-b6iy8o0t.c-2.eu-west-1.aws.neon.tech'; Code='AP-NEON-ENDPOINT-REGION-REJECTED' },
    @{ Name='host direto nao associado'; Input='ep-another-branch.c-2.sa-east-1.aws.neon.tech'; Code='AP-NEON-ENDPOINT-NOT-APPROVED' },
    @{ Name='sem roteamento de cluster e nao aprovado'; Input='ep-little-dawn-b6iy8o0t.sa-east-1.aws.neon.tech'; Code='AP-NEON-ENDPOINT-NOT-APPROVED' },
    @{ Name='URL completa'; Input='https://ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech'; Code='AP-NEON-ENDPOINT-FORMAT' },
    @{ Name='usuario ou porta'; Input='user@ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech:5432'; Code='AP-NEON-ENDPOINT-FORMAT' },
    @{ Name='query string'; Input='ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech?sslmode=require'; Code='AP-NEON-ENDPOINT-FORMAT' },
    @{ Name='fragmento'; Input='ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech#branch'; Code='AP-NEON-ENDPOINT-FORMAT' },
    @{ Name='aspas'; Input='"ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech"'; Code='AP-NEON-ENDPOINT-FORMAT' },
    @{ Name='espaco interno'; Input='ep-little-dawn-b6iy8o0t. c-2.sa-east-1.aws.neon.tech'; Code='AP-NEON-ENDPOINT-FORMAT' },
    @{ Name='caractere invisivel'; Input=('ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech' + [char]0x200B); Code='AP-NEON-ENDPOINT-FORMAT' },
    @{ Name='hostname vazio'; Input='   '; Code='AP-NEON-ENDPOINT-FORMAT' }
  )
  foreach ($case in $cases) {
    if (-not (Test-EndpointRejectedCase ([string]$case.Name) ([string]$case.Input) ([string]$case.Code))) {
      Stop-Import 'AP-NEON-ENDPOINT-TEST-REJECTION' 'Um caso negativo do endpoint não foi rejeitado como esperado.'
    }
    $passed++
  }

  $originalCode = $script:Code
  $originalMessage = $script:Message
  try {
    Confirm-NeonEndpointAttestation 'HOST square-boat-15573195 br-unapproved'
    Stop-Import 'AP-NEON-ENDPOINT-TEST-ATTESTATION' 'Uma confirmação de projeto/branch inválida foi aceita.'
  } catch {
    if ($_.Exception.Message -ne 'AP-NEON-IMPORT-STOP' -or $script:Code -cne 'AP-NEON-ENDPOINT-ATTESTATION-REJECTED') { throw }
    $passed++
  } finally {
    $script:Code = $originalCode
    $script:Message = $originalMessage
    $script:Report.technical_code = $originalCode
    $script:Report.error = $originalMessage
    $script:Report.destination.host_metadata_confirmed_locally = $true
  }

  return $passed
}

function Test-ApprovedBackup([string]$PrivateRootPath) {
  $backupId = 'neon-backup-20261017-175742-a62a952065b74d09a1f9419ca10cb584'
  $backupDir = Join-Path $PrivateRootPath ('neon-backups\' + $backupId)
  $backupPath = Join-Path $backupDir 'amores_pet_homologacao.custom'
  $reportPath = Join-Path $backupDir 'relatorio-neon-backup.json'
  Assert-NoReparsePoint (Join-Path $PrivateRootPath 'neon-backups')
  Assert-PrivateAcl (Join-Path $PrivateRootPath 'neon-backups')
  Assert-NoReparsePoint $backupDir; Assert-PrivateAcl $backupDir
  Assert-NoReparsePoint $backupPath; Assert-PrivateAcl $backupPath
  Assert-NoReparsePoint $reportPath; Assert-PrivateAcl $reportPath
  $item = Get-Item -LiteralPath $backupPath -Force
  if ([long]$item.Length -ne 159721) { Stop-Import 'AP-NEON-APPROVED-BACKUP-SIZE' 'O tamanho do backup não corresponde ao artefato autorizado.' }
  $hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -cne '2aa1ca41dea59e0150f198c544b05b05419b346dd93fc89237721bccb4faf7e0') { Stop-Import 'AP-NEON-APPROVED-BACKUP-HASH' 'O SHA-256 diverge; importação abortada sem conexão ao destino.' }
  try { $prior = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json -ErrorAction Stop }
  catch { Stop-Import 'AP-NEON-APPROVED-REPORT' 'O relatório privado de aprovação do backup não pôde ser validado.' }
  if (-not (Test-ObjectHasProperties $prior @('status','technical_code','source','source_changed','sistema_petshop_connected','neon_connected','persistent_ddl_started',
      'backup','preflight','migration_signatures','source_snapshot')) -or
      -not (Test-ObjectHasProperties $prior.source @('database','host','port','postgres_major','cluster_validated')) -or
      -not (Test-ObjectHasProperties $prior.backup @('size_bytes','sha256','catalog_validated','private_acl_validated')) -or
      -not (Test-ObjectHasProperties $prior.preflight @('approved','restore_tested','structures_compared','data_compared','sequence_states_compared','relational_integrity_validated')) -or
      -not (Test-ObjectHasProperties $prior.migration_signatures @('migration_035','migration_036','migration_037')) -or
      -not (Test-ObjectHasProperties $prior.source_snapshot @('tables','views','indexes','sequences','foreign_keys','triggers','functions','data_table_count','data_row_count','sequence_definition_count','database_bytes'))) {
    Stop-Import 'AP-NEON-APPROVED-REPORT-SCHEMA' 'O relatório de aprovação não contém os campos obrigatórios; nenhuma conexão foi iniciada.'
  }
  if ($prior.status -cne 'APROVADO' -or $prior.technical_code -cne 'AP-NEON-BACKUP-OK' -or
      [string]$prior.source.database -cne 'amores_pet_homologacao' -or [string]$prior.source.host -cne '127.0.0.1' -or
      [int]$prior.source.port -ne 55432 -or [int]$prior.source.postgres_major -ne 17 -or
      -not [bool]$prior.source.cluster_validated -or [bool]$prior.source_changed -or [bool]$prior.sistema_petshop_connected -or
      [bool]$prior.neon_connected -or [bool]$prior.persistent_ddl_started -or
      [long]$prior.backup.size_bytes -ne 159721 -or [string]$prior.backup.sha256 -cne $hash -or
      -not [bool]$prior.backup.catalog_validated -or -not [bool]$prior.backup.private_acl_validated -or
      -not [bool]$prior.preflight.approved -or -not [bool]$prior.preflight.restore_tested -or
      -not [bool]$prior.preflight.structures_compared -or -not [bool]$prior.preflight.data_compared -or
      -not [bool]$prior.preflight.sequence_states_compared -or -not [bool]$prior.preflight.relational_integrity_validated -or
      -not [bool]$prior.migration_signatures.migration_035 -or -not [bool]$prior.migration_signatures.migration_036 -or -not [bool]$prior.migration_signatures.migration_037) {
    Stop-Import 'AP-NEON-APPROVED-REPORT-MISMATCH' 'O relatório não comprova o snapshot, catálogo, isolamento e preflight aprovados.'
  }
  $snapshot = $prior.source_snapshot
  if ([long]$snapshot.tables -ne 30 -or [long]$snapshot.views -ne 3 -or [long]$snapshot.indexes -ne 97 -or [long]$snapshot.sequences -ne 24 -or
      [long]$snapshot.foreign_keys -ne 54 -or [long]$snapshot.triggers -ne 7 -or [long]$snapshot.functions -ne 6 -or
      [long]$snapshot.data_table_count -ne 30 -or [decimal]$snapshot.data_row_count -ne 153 -or [long]$snapshot.sequence_definition_count -ne 24 -or
      [long]$snapshot.database_bytes -le 0 -or [long]$snapshot.database_bytes -ge 1073741824) {
    Stop-Import 'AP-NEON-APPROVED-SNAPSHOT-MISMATCH' 'O snapshot privado não corresponde às quantidades autorizadas ou excede o limite informado.'
  }
  $script:Report.backup.size_bytes = [long]$item.Length
  $script:Report.backup.sha256 = $hash
  $script:Report.backup.source_report_approved = $true
  $script:Report.expected.source_database_bytes = [long]$snapshot.database_bytes
  return [pscustomobject]@{ Path=$backupPath; Directory=$backupDir; Report=$prior }
}

function Get-FreeTempRoot {
  if (-not $env:TEMP) { Stop-Import 'AP-NEON-TEMP-ROOT' 'TEMP não está definido para o teste descartável.' }
  return [IO.Path]::GetFullPath($env:TEMP)
}

function Get-ConnectionIdentity([string]$HostName,[int]$Port = $script:ApprovedNeonTarget.Port,
  [string]$UserName = $script:ApprovedNeonTarget.Role,[string]$Database = $script:ApprovedNeonTarget.Database,[string]$SessionSqlOverride = '') {
  $identity = Get-DestinationIdentity -HostName $HostName -Port $Port -UserName $UserName -Database $Database -SessionSqlOverride $SessionSqlOverride
  if ([string]$identity.database_timezone_settings -and [string]$identity.database_timezone_settings -notmatch 'TimeZone=GMT') {
    Stop-Import 'AP-NEON-DATABASE-TIMEZONE' 'A configuração de timezone específica do banco diverge do destino GMT esperado.'
  }
  return $identity
}

function ConvertFrom-SecurePassword([Security.SecureString]$SecureValue) {
  $pointer = [IntPtr]::Zero
  try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally { if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) } }
}

function Invoke-DisposableSelfTest([string]$TestRoot) {
  $testId = [guid]::NewGuid().ToString('N')
  $script:SelfTestRoot = $TestRoot
  $script:TempDataDirectory = Join-Path $TestRoot ('selftest-' + $testId)
  Test-RestoreAtomicitySynthetic
  $script:TlsSelfTestCount = Invoke-ClientTlsSelfTests $TestRoot
  $script:Report.disposable.tls_client_tests_passed = [int]$script:TlsSelfTestCount
  $script:Report.disposable.integration_pipeline_tests_passed = [int]$script:IntegrationPipelineTestCount
}

function Invoke-DisposableImportPipelineSelfTest([string]$TestRoot,[string]$RootCertificatePath) {
  $testId = [guid]::NewGuid().ToString('N')
  $sourceDatabase = 'pipeline_source_' + $testId
  $targetDatabase = 'pipeline_target_' + $testId
  $roleName = 'amores_pet_homologacao_owner'
  $archivePath = Join-Path $TestRoot ('pipeline-' + $testId + '.custom')
  $originalTarget = @{}
  foreach ($key in @('Host','Port','Database','Role')) { $originalTarget[$key] = $script:ApprovedNeonTarget[$key] }
  $environmentNames = @('PGPASSFILE','PGSSLMODE','PGSSLROOTCERT','PGGSSENCMODE','PGSERVICE','PGSERVICEFILE','PGHOSTADDR','PGCONNECT_TIMEOUT','PGCLIENTENCODING','PGAPPNAME','PGOPTIONS')
  $originalEnvironment = @{}
  foreach ($name in $environmentNames) { $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
  $reportDestination = @{
    connected=$script:Report.destination.connected; identity_validated=$script:Report.destination.identity_validated; tls_verified=$script:Report.destination.tls_verified
    tls_mode=$script:Report.destination.tls_mode; gss_encryption_mode=$script:Report.destination.gss_encryption_mode; tls_root_certificate_configured=$script:Report.destination.tls_root_certificate_configured
    tls_hostname_verified=$script:Report.destination.tls_hostname_verified; tls_protocol=$script:Report.destination.tls_protocol
    tls_cipher=$script:Report.destination.tls_cipher; server_reported_tls=$script:Report.destination.server_reported_tls
    postgres_major=$script:Report.destination.postgres_major; timezone=$script:Report.destination.timezone
    empty_validated=$script:Report.destination.empty_validated; sessions_clear=$script:Report.destination.sessions_clear
    session_summary=(ConvertFrom-Json -InputObject (ConvertTo-Json -InputObject $script:Report.destination.session_summary -Depth 8))
    permissions_validated=$script:Report.destination.permissions_validated; capacity_estimate_validated=$script:Report.destination.capacity_estimate_validated
  }
  $reportImport = @{
    local_confirmation_presented=$script:Report.import.local_confirmation_presented; local_confirmation_accepted=$script:Report.import.local_confirmation_accepted
    launch_armed=$script:Report.import.launch_armed; process_started=$script:Report.import.process_started
    exit_code=$script:Report.import.exit_code; post_validation=$script:Report.import.post_validation; state=$script:Report.import.state
  }
  $priorCode = $script:Code; $priorMessage = $script:Message
  $pipelineFailureCode = $null; $pipelineFailureMessage = $null
  $checks = 0
  try {
    Set-Phase 'fluxo integrado descartável - cluster e role sintética'
    if (-not $script:TempClusterStarted -or -not (Test-Path -LiteralPath (Join-Path $script:TempDataDirectory 'postmaster.pid') -PathType Leaf)) {
      Stop-Import 'AP-NEON-INTEGRATION-CLUSTER' 'O cluster PostgreSQL descartável não está ativo para o fluxo integrado.'
    }

    $script:ApprovedNeonTarget.Host = 'localhost'
    $script:ApprovedNeonTarget.Port = [int]$script:TempPort
    $script:ApprovedNeonTarget.Database = $targetDatabase
    $script:ApprovedNeonTarget.Role = $roleName
    $env:PGPASSFILE = ''
    $env:PGSSLMODE = 'verify-full'
    $env:PGSSLROOTCERT = [IO.Path]::GetFullPath($RootCertificatePath)
    $env:PGGSSENCMODE = 'disable'
    $env:PGSERVICE = ''
    $env:PGSERVICEFILE = ''
    $env:PGHOSTADDR = ''
    $env:PGCONNECT_TIMEOUT = '3'
    $env:PGCLIENTENCODING = 'UTF8'
    $env:PGAPPNAME = 'amores_pet_neon_import_selftest'
    $env:PGOPTIONS = '-c TimeZone=GMT'

    $null = Invoke-Psql 'localhost' $script:TempPort 'postgres' 'postgres' "CREATE ROLE `"$roleName`" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;" 'Criação da role do fluxo integrado descartável' ''
    $null = Invoke-Psql 'localhost' $script:TempPort 'postgres' 'postgres' "CREATE DATABASE `"$sourceDatabase`" WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' OWNER postgres;" 'Criação do banco sintético de origem' ''
    $checks++

    Set-Phase 'fluxo integrado descartável - dados sintéticos e backup custom'
    $fixtureSql = @'
CREATE TABLE public.pipeline_tutors (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.pipeline_pets (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, tutor_id bigint NOT NULL REFERENCES public.pipeline_tutors(id), name text NOT NULL);
CREATE TABLE public.pipeline_services (id bigint PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.pipeline_visits (id bigint PRIMARY KEY, pet_id bigint NOT NULL REFERENCES public.pipeline_pets(id), service_id bigint NOT NULL REFERENCES public.pipeline_services(id));
CREATE VIEW public.pipeline_pet_visits AS SELECT p.id AS pet_id, p.name AS pet_name, v.id AS visit_id FROM public.pipeline_pets p LEFT JOIN public.pipeline_visits v ON v.pet_id=p.id;
CREATE SEQUENCE public.pipeline_receipt_sequence START WITH 41 INCREMENT BY 3;
CREATE FUNCTION public.pipeline_touch_tutor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.pipeline_fixture_total() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 4 $$;
CREATE TRIGGER pipeline_tutor_touch BEFORE UPDATE ON public.pipeline_tutors FOR EACH ROW EXECUTE FUNCTION public.pipeline_touch_tutor();
INSERT INTO public.pipeline_tutors(id,name) VALUES (1,'Synthetic Tutor'),(2,'Synthetic Tutor Two');
INSERT INTO public.pipeline_pets(id,tutor_id,name) VALUES (1,1,'Synthetic Pet');
INSERT INTO public.pipeline_services(id,name) VALUES (1,'Synthetic Service');
INSERT INTO public.pipeline_visits(id,pet_id,service_id) VALUES (1,1,1);
SELECT setval('public.pipeline_receipt_sequence',52,true);
'@
    $null = Invoke-Psql 'localhost' $script:TempPort 'postgres' $sourceDatabase $fixtureSql 'Preparação do backup sintético' ''
    $dump = Invoke-Tool 'pg_dump.exe' @('--format=custom','--no-password','--host','localhost','--port',[string]$script:TempPort,
      '--username','postgres','--dbname',$sourceDatabase,'--file',$archivePath) 'Backup custom sintético para integração'
    $archive = Get-Item -LiteralPath $archivePath -Force -ErrorAction Stop
    if ([long]$archive.Length -le 0) { Stop-Import 'AP-NEON-INTEGRATION-BACKUP' 'O pg_dump descartável não gerou arquivo custom válido.' }
    $checks++

    Set-Phase 'fluxo integrado descartável - validação do catálogo e snapshot de origem'
    $catalog = Invoke-Tool 'pg_restore.exe' @('--list',$archivePath) 'Catálogo do backup de integração'
    $catalogAssessment = Test-AmoresPetCustomArchiveCatalog -CatalogOutput ([string]$catalog.StandardOutput) -ArchiveSize ([long]$archive.Length)
    if (-not [bool]$catalogAssessment.Success) { Stop-Import 'AP-NEON-INTEGRATION-CATALOG' 'O catálogo do backup sintético não foi validado.' }
    $expectedSnapshot = Get-ImportSnapshotBundle 'localhost' $script:TempPort 'postgres' $sourceDatabase ''
    $checks++

    Set-Phase 'fluxo integrado descartável - criação do destino vazio local'
    $createTargetSql = "CREATE DATABASE `"$targetDatabase`" WITH TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' OWNER `"$roleName`";"
    $null = Invoke-Psql 'localhost' $script:TempPort 'postgres' 'postgres' $createTargetSql 'Criação do destino vazio descartável' ''
    $null = Invoke-Psql 'localhost' $script:TempPort 'postgres' $targetDatabase 'CREATE EXTENSION IF NOT EXISTS plpgsql;' 'Preparação da extensão padrão do destino descartável' ''

    Set-Phase 'fluxo integrado descartável - TLS e identidade SQL'
    $identity = Get-ConnectionIdentity 'localhost' $script:TempPort $roleName $targetDatabase
    if (-not [bool]$identity.client_tls_verified -or -not [bool]$identity.client_tls_hostname_verified -or -not [bool]$identity.client_tls_root_verified) {
      Stop-Import 'AP-NEON-INTEGRATION-TLS' 'A sessão descartável não comprovou TLS verify-full no cliente.'
    }
    Assert-Identity $identity $roleName $true ([long]$expectedSnapshot.Metadata.database_bytes) 'localhost' $script:TempPort $targetDatabase
    Set-Phase 'fluxo integrado descartável - concorrência e estados de sessão'
    $sessionChecks = Invoke-PostgresSessionAssessmentSelfTests $targetDatabase $roleName
    $checks += [int]$sessionChecks
    Set-Phase 'fluxo integrado descartável - destino vazio e privilégios mínimos'
    $permissions = Get-OwnershipAssessment 'localhost' $script:TempPort $roleName $targetDatabase ''
    if (-not [bool]$permissions.database_owner -or -not [bool]$permissions.database_create -or -not [bool]$permissions.schema_public_usage -or
        -not [bool]$permissions.schema_public_create -or [bool]$permissions.is_superuser -or [long]$permissions.wrong_object_owners -ne 0) {
      Stop-Import 'AP-NEON-INTEGRATION-OWNER' 'A role sintética não reproduziu ownership e menor privilégio.'
    }
    $checks += 2

    Set-Phase 'fluxo integrado descartável - confirmação simulada'
    $confirmation = 'SIMULAR IMPORTACAO DESCARTAVEL ' + $testId
    $script:Report.import.local_confirmation_presented = $true
    $wrongConfirmationRejected = $false
    try { Confirm-ImportAuthorization ('INVALIDA ' + $testId) $confirmation }
    catch {
      $wrongConfirmationRejected = $_.Exception.Message -eq 'AP-NEON-IMPORT-STOP' -and
        $script:Code -ceq 'AP-NEON-LOCAL-CONFIRMATION-REJECTED' -and -not [bool]$script:Report.import.local_confirmation_accepted
    }
    $emptyAfterRejectedConfirmation = Get-EmptyAssessment 'localhost' $script:TempPort $roleName $targetDatabase
    if (-not $wrongConfirmationRejected -or [long]$emptyAfterRejectedConfirmation.relations -ne 0) {
      Stop-Import 'AP-NEON-INTEGRATION-CONFIRMATION-REJECT' 'Uma confirmação inválida não foi bloqueada antes da restauração descartável.'
    }
    $script:Report.import.state = 'NAO_INICIADA'
    $script:Code = $priorCode; $script:Message = $priorMessage
    $script:Report.technical_code = $priorCode; $script:Report.error = $priorMessage
    Confirm-ImportAuthorization $confirmation $confirmation
    if (-not [bool]$script:Report.import.local_confirmation_accepted) { Stop-Import 'AP-NEON-INTEGRATION-CONFIRMATION' 'A confirmação sintética válida não foi aceita pelo helper compartilhado.' }
    $checks += 2

    Set-Phase 'fluxo integrado descartável - pg_restore transacional'
    $restoreArguments = Get-ImportRestoreArguments 'localhost' $script:TempPort $roleName $targetDatabase $archivePath
    if ($restoreArguments -notcontains '--single-transaction' -or $restoreArguments -notcontains '--no-owner' -or
        $restoreArguments -notcontains '--no-acl' -or $restoreArguments -contains '--clean' -or $restoreArguments -contains '--create' -or
        $restoreArguments -notcontains $archivePath) {
      Stop-Import 'AP-NEON-INTEGRATION-RESTORE-OPTIONS' 'Os parâmetros locais do restore não conservaram as proteções obrigatórias.'
    }
    $restoreResult = Invoke-Tool 'pg_restore.exe' $restoreArguments 'Restauração transacional sintética após confirmação simulada'
    if (-not [bool]$restoreResult.Started -or [int]$restoreResult.ExitCode -ne 0) {
      Stop-Import 'AP-NEON-INTEGRATION-RESTORE' 'A restauração simulada não terminou com sucesso no banco descartável.'
    }
    $checks++

    Set-Phase 'fluxo integrado descartável - validação posterior'
    $postIdentity = Get-ConnectionIdentity 'localhost' $script:TempPort $roleName $targetDatabase
    Assert-Identity $postIdentity $roleName $false 0 'localhost' $script:TempPort $targetDatabase
    $actualSnapshot = Get-ImportSnapshotBundle 'localhost' $script:TempPort $roleName $targetDatabase ''
    Assert-SnapshotCoreEquivalent $expectedSnapshot $actualSnapshot
    $postOwner = Get-OwnershipAssessment 'localhost' $script:TempPort $roleName $targetDatabase ''
    if (-not [bool]$postOwner.database_owner -or -not [bool]$postOwner.schema_public_create -or [bool]$postOwner.is_superuser -or
        [long]$postOwner.wrong_object_owners -ne 0) {
      Stop-Import 'AP-NEON-INTEGRATION-POST-OWNER' 'A ownership posterior ao restore divergiu da role sintética autorizada.'
    }
    $checks++

    $nonEmptyRejected = $false
    try { Assert-Identity $postIdentity $roleName $true 0 'localhost' $script:TempPort $targetDatabase }
    catch {
      $nonEmptyRejected = $_.Exception.Message -eq 'AP-NEON-IMPORT-STOP' -and $script:Code -ceq 'AP-NEON-DESTINATION-NOT-EMPTY'
    }
    if (-not $nonEmptyRejected) { Stop-Import 'AP-NEON-INTEGRATION-NONEMPTY-GUARD' 'O preflight não rejeitou o destino sintético já restaurado.' }
    $checks++

    $script:IntegrationPipelineTestCount = $checks
    Write-Host ('[PASS] Fluxo integrado descartável: backup custom, catálogo, TLS/verify-full, identidade, destino vazio, confirmação simulada, pg_restore transacional, owner e validação estrutural/de dados; PASS=' + [string]$checks + '.')
    return $checks
  } catch {
    $pipelineCaught = $_
    $pipelineCaughtMessage = [string](Get-OptionalPropertyValue (Get-OptionalPropertyValue $pipelineCaught 'Exception') 'Message')
    if ($pipelineCaughtMessage -ceq 'AP-NEON-IMPORT-STOP') {
      $pipelineFailureCode = $script:Code
      $pipelineFailureMessage = $script:Message
    } else {
      $pipelineFailureCode = 'AP-NEON-INTEGRATION-UNEXPECTED'
      $pipelineFailureMessage = 'Falha interna no preflight descartável; localização e tipo foram sanitizados.'
      $script:Code = $pipelineFailureCode; $script:Message = $pipelineFailureMessage
      Set-InternalFailureDiagnostic $pipelineCaught
    }
    throw
  } finally {
    foreach ($key in $originalTarget.Keys) { $script:ApprovedNeonTarget[$key] = $originalTarget[$key] }
    foreach ($name in $environmentNames) {
      if ($null -eq $originalEnvironment[$name]) { Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction SilentlyContinue }
      else { Set-Item -LiteralPath ('Env:' + $name) -Value $originalEnvironment[$name] }
    }
    foreach ($key in $reportDestination.Keys) { $script:Report.destination[$key] = $reportDestination[$key] }
    foreach ($key in $reportImport.Keys) { $script:Report.import[$key] = $reportImport[$key] }
    if ($pipelineFailureCode) {
      $script:Code = $pipelineFailureCode; $script:Message = $pipelineFailureMessage
      $script:Report.technical_code = $pipelineFailureCode; $script:Report.error = $pipelineFailureMessage
    } else {
      $script:Code = $priorCode; $script:Message = $priorMessage
      $script:Report.technical_code = $priorCode; $script:Report.error = $priorMessage
    }
    if (Test-Path -LiteralPath $archivePath -PathType Leaf) { Remove-Item -LiteralPath $archivePath -Force }
  }
}

function New-TlsSelfTestCertificate([string]$OpenSslPath,[string]$ConfigPath,[string]$CertificatePath,[string]$KeyPath) {
  $result = Invoke-AmoresPetNativeProcess -Executable $OpenSslPath -Arguments @(
    'req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','2','-keyout',$KeyPath,'-out',$CertificatePath,'-config',$ConfigPath
  )
  if (-not $result.Started -or [int]$result.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $CertificatePath -PathType Leaf) -or -not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
    Stop-Import 'AP-NEON-TLS-SELFTEST-CERTIFICATE-GENERATION' 'Não foi possível gerar o certificado sintético para o teste TLS descartável.'
  }
}

function Get-SafePsqlDiagnosticHints([string]$StandardError) {
  $text = [string]$StandardError
  return ('stderr_chars=' + [string]$text.Length +
    '; ssl_marker=' + [string][regex]::IsMatch($text,'(?i)ssl|tls') +
    '; certificate_marker=' + [string][regex]::IsMatch($text,'(?i)cert|issuer|subject|hostname|peer name') +
    '; hostname_mismatch_marker=' + [string][regex]::IsMatch($text,'(?i)hostname mismatch|host name mismatch|does not match host name|doesn.t match host name|certificate subject name .+ does not match|certificate is not valid for this name|server certificate .{0,240}(?:does not match|doesn.t match) host name|certificate (?:name|hostname) does not match|hostname .{0,80}(?:does not match|doesn.t match|mismatch)') +
    '; verify_failure_marker=' + [string][regex]::IsMatch($text,'(?i)verify|verification|invalid certificate|certificate.*(?:failed|invalid|expired|unknown)|unknown.*issuer') +
    '; dns_marker=' + [string][regex]::IsMatch($text,'(?i)translate host|resolve|name or service|no such host|dns') +
    '; network_marker=' + [string][regex]::IsMatch($text,'(?i)connect|connection|socket|address|listen|refused|timed out|actively refused|target machine') +
    '; argument_marker=' + [string][regex]::IsMatch($text,'(?i)invalid option|unrecognized|unknown option|argument') +
    '; server_marker=' + [string][regex]::IsMatch($text,'(?i)server|fatal|error|postgres|psql') +
    '; relation_marker=' + [string][regex]::IsMatch($text,'(?i)relation|database|role|permission|syntax|does not exist') +
    '; auth_marker=' + [string][regex]::IsMatch($text,'(?i)authentication|password|scram|sasl') +
    '; sqlstate_marker=' + [string][regex]::IsMatch($text,'(?i)SQLSTATE|(?:ERROR|FATAL):\s+[0-9A-Z]{5}'))
}

function Test-TlsExpectedFailure([string]$HostName,[int]$Port,[string]$RootCertificate,[string[]]$ExpectedDiagnosticCodes,[string]$HostAddress) {
  $priorRoot = [string]$env:PGSSLROOTCERT
  try {
    $env:PGSSLROOTCERT = $RootCertificate
    $result = Invoke-PsqlWithConnectionInfo $HostName $Port 'postgres' 'postgres' "SELECT jsonb_build_object('database',current_database(),'user',current_user,'session_user',session_user,'server_tls_reported',false)::text" 'Teste TLS negativo PostgreSQL descartável' $HostAddress -CaptureFailure
    if (-not $result.Started) {
      return [pscustomobject]@{ Success=$false; Started=$false; ExitCode=$null; Code='AP-PSQL-PROCESS-START'; Category='PSQL_LAUNCH'; SqlState=$null }
    }
    if ([int]$result.ExitCode -eq 0) {
      return [pscustomobject]@{ Success=$false; Started=$true; ExitCode=0; Code='AP-NEON-TLS-NEGATIVE-TEST-CONNECTION-ACCEPTED'; Category='TLS_NEGATIVE_TEST'; SqlState=$null }
    }
    $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError ([string]$result.StandardError) -ExitCode ([int]$result.ExitCode)
    $legacyHostnamePatternMatched = [regex]::IsMatch([string]$result.StandardError,'(?i)hostname mismatch|does not match host name|certificate subject name .+ does not match|certificate is not valid for this name')
    return [pscustomobject]@{
      Success=([string]$diagnostic.Category -ceq 'PSQL_TLS_CERTIFICADO' -and [string]$diagnostic.Code -in $ExpectedDiagnosticCodes -and $null -eq $diagnostic.SqlState)
      Started=$true; ExitCode=[int]$result.ExitCode; Code=[string]$diagnostic.Code
      Category=[string]$diagnostic.Category; SqlState=$diagnostic.SqlState
      SafeHints=(Get-SafePsqlDiagnosticHints ([string]$result.StandardError))
      MatchRule=[string]$diagnostic.MatchRule
      LegacyHostnamePatternMatched=[bool]$legacyHostnamePatternMatched
    }
  } finally { $env:PGSSLROOTCERT = $priorRoot }
}

function Test-IdentityRejectedForTls([string]$FieldName,[string]$FieldValue) {
  $originalCode = $script:Code
  $originalMessage = $script:Message
  $identity = [pscustomobject]@{
    database='amores_pet_homologacao'; user='authorized_owner'; session_user='authorized_owner'; version_num=170011
    client_tls_verified=$true; client_tls_hostname_verified=$true; client_tls_root_verified=$true
    is_superuser=$false; in_recovery=$false; timezone='GMT'; locale_provider='builtin'; locale='C.UTF-8'
    non_public_schemas=0; other_sessions=0; database_bytes=1; server_tls_reported=$false
    application_relations=0; application_functions=0; application_custom_types=0; application_large_objects=0; application_extensions='plpgsql=1.0'
    migration_036_present=$false; migration_037_present=$false
    session_total_count=1; session_current_count=1; session_execution_count=1; session_same_execution_other_count=0
    session_external_count=0; session_external_client_count=0; session_non_client_count=0; session_irrelevant_internal_count=0; session_concurrent_count=0
    session_backend_groups=@([pscustomobject]@{backend_type='CLIENT_BACKEND';state='ACTIVE';count=1})
    client_tls_protocol='TLSv1.3'; client_tls_cipher='TLS_AES_256_GCM_SHA384'
  }
  $identity.$FieldName = $FieldValue
  try {
    Assert-Identity $identity 'authorized_owner' $false
    return $false
  } catch {
    if ($_.Exception.Message -eq 'AP-NEON-IMPORT-STOP' -and $script:Code -ceq 'AP-NEON-DESTINATION-IDENTITY-MISMATCH') { return $true }
    throw
  } finally {
    $script:Code = $originalCode
    $script:Message = $originalMessage
    $script:Report.technical_code = $originalCode
    $script:Report.error = $originalMessage
  }
}

function New-SessionAssessmentFixture([string]$BackendType,[string]$State,[string]$ApplicationKind,[string]$Database,[string]$Role) {
  $executionCount = 1
  $sameExecutionOther = 0
  $externalSession = 0
  $externalClient = 0
  $nonClient = 0
  $irrelevant = 0
  $concurrent = 0
  if ($ApplicationKind -eq 'CURRENT') { }
  elseif ($ApplicationKind -eq 'SAME_EXECUTION') { $executionCount=2; $sameExecutionOther=1; $concurrent=1 }
  elseif ($BackendType -eq 'CLIENT_BACKEND') { $externalSession=1; $externalClient=1; $concurrent=1 }
  elseif ($BackendType -in @('CHECKPOINTER','BACKGROUND_WRITER','WALWRITER','ARCHIVER','WAL_SUMMARIZER')) { $nonClient=1; $irrelevant=1 }
  else { $externalSession=1; $nonClient=1; $concurrent=1 }
  $groups = @([pscustomobject]@{backend_type='CLIENT_BACKEND';state='ACTIVE';count=1})
  if ($concurrent -gt 0 -or $irrelevant -gt 0) {
    $groups += [pscustomobject]@{backend_type=$BackendType;state=$State;count=1}
  }
  return [pscustomobject]@{
    database=$Database; user=$Role; session_user=$Role; version_num=170011
    client_tls_verified=$true; client_tls_hostname_verified=$true; client_tls_root_verified=$true
    is_superuser=$false; in_recovery=$false; timezone='GMT'; locale_provider='builtin'; locale='C.UTF-8'
    non_public_schemas=0; database_bytes=1; server_tls_reported=$false
    application_relations=0; application_functions=0; application_custom_types=0; application_large_objects=0; application_extensions='plpgsql=1.0'
    migration_036_present=$false; migration_037_present=$false
    client_tls_protocol='TLSv1.3'; client_tls_cipher='TLS_AES_256_GCM_SHA384'
    session_total_count=1 + [int]($concurrent + $irrelevant)
    session_current_count=1
    session_execution_count=$executionCount
    session_same_execution_other_count=$sameExecutionOther
    session_external_count=$externalSession
    session_external_client_count=$externalClient
    session_non_client_count=$nonClient
    session_irrelevant_internal_count=$irrelevant
    session_concurrent_count=$concurrent
    other_sessions=$concurrent
    session_backend_groups=$groups
  }
}

function Invoke-SessionAssessmentSyntheticSelfTests([string]$Database,[string]$Role) {
  $passed = 0
  $cases = @(
    @{Name='only current preflight';Identity=(New-SessionAssessmentFixture 'CLIENT_BACKEND' 'ACTIVE' 'CURRENT' $Database $Role);Expected=$true;Reason='NONE'},
    @{Name='two same-execution connections';Identity=(New-SessionAssessmentFixture 'CLIENT_BACKEND' 'ACTIVE' 'SAME_EXECUTION' $Database $Role);Expected=$true;Reason='SAME_EXECUTION_EXTRA_CONNECTION'},
    @{Name='irrelevant core backend';Identity=(New-SessionAssessmentFixture 'CHECKPOINTER' 'STATE_UNKNOWN' 'EXTERNAL' $Database $Role);Expected=$true;Reason='NONE'},
    @{Name='external idle reader';Identity=(New-SessionAssessmentFixture 'CLIENT_BACKEND' 'IDLE' 'EXTERNAL' $Database $Role);Expected=$true;Reason='EXTERNAL_CONNECTIONS'},
    @{Name='external active writer';Identity=(New-SessionAssessmentFixture 'CLIENT_BACKEND' 'ACTIVE' 'EXTERNAL' $Database $Role);Expected=$true;Reason='EXTERNAL_CONNECTIONS'},
    @{Name='unknown external backend fails closed';Identity=(New-SessionAssessmentFixture 'OTHER_BACKEND' 'STATE_UNKNOWN' 'EXTERNAL' $Database $Role);Expected=$true;Reason='EXTERNAL_CONNECTIONS'}
  )
  foreach ($case in $cases) {
    $assessment = Test-SessionAssessment $case.Identity
    if (-not [bool]$assessment.Success -or [string]$assessment.Reason -cne [string]$case.Reason) {
      Stop-Import 'AP-NEON-SESSION-SELFTEST-CLASSIFICATION' ('A classificação sintética falhou: caso=' + [string]$case.Name + '; resultado=' + [string]$assessment.Code + '; motivo=' + [string]$assessment.Reason + '.')
    }
    if ([string]$case.Reason -eq 'NONE') {
      try { Assert-Identity $case.Identity $Role $false 0 'localhost' $script:TempPort $Database }
      catch { Stop-Import 'AP-NEON-SESSION-SELFTEST-PASSIVE-BLOCK' 'Um backend passivo ou a própria conexão foi bloqueado indevidamente.' }
    } elseif (-not (Test-DisposableIdentityBusy $case.Identity $Role $Database 'AP-NEON-DESTINATION-BUSY')) {
      Stop-Import 'AP-NEON-SESSION-SELFTEST-CLIENT-ALLOW' ('Uma sessão potencialmente concorrente não foi bloqueada: ' + [string]$case.Name + '.')
    }
    $passed++
  }
  $malformed = New-SessionAssessmentFixture 'CLIENT_BACKEND' 'ACTIVE' 'EXTERNAL' $Database $Role
  $malformed.other_sessions = 0
  $assessment = Test-SessionAssessment $malformed
  if ([bool]$assessment.Success -or [string]$assessment.Code -cne 'AP-NEON-SESSION-ASSESSMENT-INCONCLUSIVE') {
    Stop-Import 'AP-NEON-SESSION-SELFTEST-MALFORMED' 'Uma contagem contraditória de sessões não foi rejeitada.'
  }
  $passed++
  $missing = New-SessionAssessmentFixture 'CLIENT_BACKEND' 'ACTIVE' 'CURRENT' $Database $Role
  $missing.PSObject.Properties.Remove('session_backend_groups')
  $assessment = Test-SessionAssessment $missing
  if ([bool]$assessment.Success -or [string]$assessment.Code -cne 'AP-NEON-SESSION-ASSESSMENT-SCHEMA') {
    Stop-Import 'AP-NEON-SESSION-SELFTEST-MISSING' 'A ausência dos grupos de sessões não foi rejeitada.'
  }
  $passed++
  return $passed
}

function Start-DisposableSessionProbe([string]$Database,[string]$Role,[string]$ApplicationName,[string]$Sql) {
  if ($ApplicationName -notmatch '^ap_neon_probe_[a-f0-9]{32}$') { Stop-Import 'AP-NEON-SESSION-SELFTEST-APPNAME' 'O nome da aplicação sintética não passou pela validação.' }
  $arguments = Get-PsqlArguments 'localhost' $script:TempPort $Role $Database $Sql ''
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = [string]$script:PgTools['psql.exe']
  $startInfo.Arguments = (($arguments | ForEach-Object { ConvertTo-AmoresPetWindowsArgument ([string]$_) }) -join ' ')
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.StandardOutputEncoding = [Text.Encoding]::UTF8
  $startInfo.StandardErrorEncoding = [Text.Encoding]::UTF8
  $startInfo.EnvironmentVariables['PGAPPNAME'] = $ApplicationName
  $process = New-Object System.Diagnostics.Process
  try {
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { Stop-Import 'AP-NEON-SESSION-SELFTEST-LAUNCH' 'A sessão PostgreSQL descartável não iniciou.' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    return [pscustomobject]@{ Process=$process; StandardOutputTask=$stdoutTask; StandardErrorTask=$stderrTask; ApplicationName=$ApplicationName }
  } catch {
    $process.Dispose()
    throw
  }
}

function Stop-DisposableSessionProbe([object]$Probe,[string]$Database,[string]$Role) {
  if ($null -eq $Probe -or $null -eq $Probe.Process) { return }
  $process = $Probe.Process
  try {
    if (-not $process.HasExited) { $process.Kill(); $null = $process.WaitForExit(10000) }
    if (-not $process.HasExited) { Stop-Import 'AP-NEON-SESSION-SELFTEST-CLEANUP' 'Uma sessão sintética conhecida não encerrou no cluster descartável.' }
    try { $null = $Probe.StandardOutputTask.GetAwaiter().GetResult() } catch { }
    try { $null = $Probe.StandardErrorTask.GetAwaiter().GetResult() } catch { }
    $deadline = [DateTime]::UtcNow.AddSeconds(12)
    do {
      $observation = Get-DisposableSessionProbeObservation $Probe $Database $Role
      if ([long]$observation.TagCount -eq 0) { return }
      Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    Stop-Import 'AP-NEON-SESSION-SELFTEST-CLEANUP' 'A conexão do probe sintético permaneceu visível no cluster descartável após encerrar seu processo.'
  } finally { $process.Dispose() }
}

function Get-DisposableSessionProbeObservation([object]$Probe,[string]$Database,[string]$Role) {
  $priorAppName = $env:PGAPPNAME
  try {
    $env:PGAPPNAME = 'ap_neon_observer_' + [guid]::NewGuid().ToString('N')
    $sql = "SELECT count(*) FILTER (WHERE application_name='" + [string]$Probe.ApplicationName + "') || '|' || count(*) FILTER (WHERE pid<>pg_backend_pid() AND backend_type='client backend') FROM pg_stat_activity WHERE datname=current_database()"
    $result = Invoke-Psql 'localhost' $script:TempPort $Role $Database $sql 'Verificação da sessão sintética no cluster descartável' ''
    $parts = ([string]$result.StandardOutput).Trim() -split '\|'
    $tagCount = [long]0; $otherClientCount = [long]0
    if ($parts.Count -ne 2 -or -not [long]::TryParse($parts[0],[ref]$tagCount) -or -not [long]::TryParse($parts[1],[ref]$otherClientCount) -or $tagCount -lt 0 -or $otherClientCount -lt 0) {
      Stop-Import 'AP-NEON-SESSION-SELFTEST-OBSERVATION' 'A contagem da sessão sintética retornou formato inválido no cluster descartável.'
    }
    return [pscustomobject]@{ TagCount=$tagCount; OtherClientCount=$otherClientCount }
  } finally {
    if ($null -eq $priorAppName) { Remove-Item Env:PGAPPNAME -ErrorAction SilentlyContinue }
    else { $env:PGAPPNAME = $priorAppName }
  }
}

function Wait-DisposableSessionProbe([object]$Probe,[string]$Database,[string]$Role) {
  $tagCount = [long]0; $otherClientCount = [long]0
  $deadline = [DateTime]::UtcNow.AddSeconds(6)
  do {
    if ($Probe.Process.HasExited) {
      if ([int]$Probe.Process.ExitCode -eq 0) {
        Stop-Import 'AP-NEON-SESSION-SELFTEST-PROBE-ENDED' 'O probe sintético terminou com sucesso antes de ser observado; o cenário concorrente não foi validado.'
      }
      $probeError = ''
      try { $probeError = [string]$Probe.StandardErrorTask.GetAwaiter().GetResult() } catch { }
      $probeDiagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError $probeError -ExitCode ([int]$Probe.Process.ExitCode)
      Stop-Import 'AP-NEON-SESSION-SELFTEST-PROBE-EXIT' ('A sessão PostgreSQL descartável terminou antes de aparecer no monitoramento; exit=' + [string]$Probe.Process.ExitCode + '; categoria=' + [string]$probeDiagnostic.Category + '; código=' + [string]$probeDiagnostic.Code + '.')
    }
    $observation = Get-DisposableSessionProbeObservation $Probe $Database $Role
    $tagCount = [long]$observation.TagCount
    $otherClientCount = [long]$observation.OtherClientCount
    if ($tagCount -eq 1 -and $otherClientCount -ge 1) { return }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)
  Stop-Import 'AP-NEON-SESSION-SELFTEST-TIMEOUT' ('A sessão concorrente específica não apareceu no monitoramento; correspondências da etiqueta=' + [string]$tagCount + '; outras conexões de cliente=' + [string]$otherClientCount + '.')
}

function Test-DisposableIdentityBusy([object]$Identity,[string]$Role,[string]$Database,[string]$ExpectedCode) {
  $priorCode = $script:Code
  $priorMessage = $script:Message
  try {
    Assert-Identity $Identity $Role $false 0 'localhost' $script:TempPort $Database
    return $false
  } catch {
    $expected = ($_.Exception.Message -ceq 'AP-NEON-IMPORT-STOP' -and $script:Code -ceq $ExpectedCode)
    if (-not $expected) {
      if ($_.Exception.Message -cne 'AP-NEON-IMPORT-STOP') {
        $script:Code = $priorCode
        $script:Message = $priorMessage
        $script:Report.technical_code = $priorCode
        $script:Report.error = $priorMessage
      }
      throw
    }
    $script:Code = $priorCode
    $script:Message = $priorMessage
    $script:Report.technical_code = $priorCode
    $script:Report.error = $priorMessage
    return $true
  }
}

function Invoke-PostgresSessionAssessmentSelfTests([string]$Database,[string]$Role) {
  $passed = Invoke-SessionAssessmentSyntheticSelfTests $Database $Role
  Set-Phase 'fluxo integrado descartável - somente sessão do preflight'
  $identity = Get-ConnectionIdentity 'localhost' $script:TempPort $Role $Database
  if ([long]$identity.session_current_count -ne 1 -or [long]$identity.session_execution_count -ne 1 -or
      [long]$identity.session_concurrent_count -ne 0 -or -not [bool](Test-SessionAssessment $identity).Success) {
    Stop-Import 'AP-NEON-SESSION-SELFTEST-OWN-SESSION' 'A sessão atual do preflight não foi distinguida corretamente no PostgreSQL descartável.'
  }
  Assert-Identity $identity $Role $false 0 'localhost' $script:TempPort $Database
  $passed++

  Set-Phase 'fluxo integrado descartável - segunda sessão da mesma execução'
  $sameAppName = 'ap_neon_probe_' + [guid]::NewGuid().ToString('N')
  $priorAppName = $env:PGAPPNAME
  $env:PGAPPNAME = $sameAppName
  $ownProbe = $null
  try {
    $ownProbe = Start-DisposableSessionProbe $Database $Role $sameAppName 'SELECT pg_sleep(8);'
    Wait-DisposableSessionProbe $ownProbe $Database $Role
    $identity = Get-ConnectionIdentity 'localhost' $script:TempPort $Role $Database
    $sameRunBlocked = Test-DisposableIdentityBusy $identity $Role $Database 'AP-NEON-DESTINATION-BUSY'
    if ([long]$identity.session_execution_count -ne 2 -or [long]$identity.session_same_execution_other_count -ne 1 -or
        [long]$identity.session_external_client_count -ne 0 -or -not $sameRunBlocked) {
      Stop-Import 'AP-NEON-SESSION-SELFTEST-SAME-EXECUTION' ('Uma segunda conexão identificada como própria não foi bloqueada corretamente; total=' + [string]$identity.session_total_count + '; atual=' + [string]$identity.session_current_count + '; execucao=' + [string]$identity.session_execution_count + '; da_execucao=' + [string]$identity.session_same_execution_other_count + '; clientes_externos=' + [string]$identity.session_external_client_count + '; concorrentes=' + [string]$identity.session_concurrent_count + '; motivo=' + [string]$identity.session_assessment.Reason + '; bloqueio=' + [string]$sameRunBlocked + '; codigo=' + [string]$script:Code + '.')
    }
    $passed++
  } finally {
    if ($ownProbe) { Stop-DisposableSessionProbe $ownProbe $Database $Role }
    $env:PGAPPNAME = $priorAppName
  }

  Set-Phase 'fluxo integrado descartável - cliente externo somente leitura'
  $readerName = 'ap_neon_probe_' + [guid]::NewGuid().ToString('N')
  $readerProbe = $null
  try {
    $readerProbe = Start-DisposableSessionProbe $Database $Role $readerName 'SELECT pg_sleep(8);'
    Wait-DisposableSessionProbe $readerProbe $Database $Role
    $identity = Get-ConnectionIdentity 'localhost' $script:TempPort $Role $Database
    $readerBlocked = Test-DisposableIdentityBusy $identity $Role $Database 'AP-NEON-DESTINATION-BUSY'
    if ([long]$identity.session_external_client_count -ne 1 -or [long]$identity.session_concurrent_count -ne 1 -or -not $readerBlocked) {
      Stop-Import 'AP-NEON-SESSION-SELFTEST-EXTERNAL-READER' ('Leitura externa: externa=' + [string]$identity.session_external_count + '; clientes=' + [string]$identity.session_external_client_count + '; da_execucao=' + [string]$identity.session_same_execution_other_count + '; concorrentes=' + [string]$identity.session_concurrent_count + '; bloqueio=' + [string]$readerBlocked + '.')
    }
    $passed++
  } finally { if ($readerProbe) { Stop-DisposableSessionProbe $readerProbe $Database $Role } }

  Set-Phase 'fluxo integrado descartável - revalidação após preflight limpo'
  $lateFirst = Get-ConnectionIdentity 'localhost' $script:TempPort $Role $Database
  $lateFirstBlocked = Test-DisposableIdentityBusy $lateFirst $Role $Database 'AP-NEON-DESTINATION-BUSY'
  if ([long]$lateFirst.session_concurrent_count -ne 0 -or $lateFirstBlocked) {
    Stop-Import 'AP-NEON-SESSION-SELFTEST-QUIESCENCE' ('O cluster descartável não ficou sem probes após cleanup; externos=' + [string]$lateFirst.session_external_count + '; clientes=' + [string]$lateFirst.session_external_client_count + '; mesma_execucao=' + [string]$lateFirst.session_same_execution_other_count + '; concorrentes=' + [string]$lateFirst.session_concurrent_count + '; grupos=' + (($lateFirst.session_backend_groups | ForEach-Object { [string]$_.backend_type + '/' + [string]$_.state + '=' + [string]$_.count }) -join ',') + '.')
  }
  Assert-Identity $lateFirst $Role $false 0 'localhost' $script:TempPort $Database
  $passed++
  Set-Phase 'fluxo integrado descartável - sessão surgida após primeiro preflight'
  $lateName = 'ap_neon_probe_' + [guid]::NewGuid().ToString('N')
  $lateProbe = $null
  try {
    $lateProbe = Start-DisposableSessionProbe $Database $Role $lateName 'SELECT pg_sleep(8);'
    Wait-DisposableSessionProbe $lateProbe $Database $Role
    $lateSecond = Get-ConnectionIdentity 'localhost' $script:TempPort $Role $Database
    if ([long]$lateSecond.session_external_client_count -ne 1 -or
        -not (Test-DisposableIdentityBusy $lateSecond $Role $Database 'AP-NEON-DESTINATION-BUSY')) {
      Stop-Import 'AP-NEON-SESSION-SELFTEST-LATE-SESSION' 'Uma sessão iniciada depois do primeiro preflight não foi detectada na revalidação.'
    }
    $passed++
  } finally { if ($lateProbe) { Stop-DisposableSessionProbe $lateProbe $Database $Role } }

  Set-Phase 'fluxo integrado descartável - escritor externo com transação aberta'
  $probeSetupSql = 'CREATE TABLE public.session_write_probe(id integer PRIMARY KEY, value integer NOT NULL); INSERT INTO public.session_write_probe VALUES (1,0); GRANT SELECT,UPDATE ON public.session_write_probe TO "' + $Role + '";'
  $null = Invoke-Psql 'localhost' $script:TempPort 'postgres' $Database $probeSetupSql 'Preparação da prova de escrita concorrente descartável' ''
  $writerName = 'ap_neon_probe_' + [guid]::NewGuid().ToString('N')
  $writerProbe = $null
  try {
    $writerSql = 'BEGIN; UPDATE public.session_write_probe SET value=value+1 WHERE id=1; SELECT pg_sleep(8); ROLLBACK;'
    $writerProbe = Start-DisposableSessionProbe $Database $Role $writerName $writerSql
    Wait-DisposableSessionProbe $writerProbe $Database $Role
    $identity = Get-ConnectionIdentity 'localhost' $script:TempPort $Role $Database
    if ([long]$identity.session_external_client_count -ne 1 -or [long]$identity.session_concurrent_count -ne 1 -or
        -not (Test-DisposableIdentityBusy $identity $Role $Database 'AP-NEON-DESTINATION-BUSY')) {
      Stop-Import 'AP-NEON-SESSION-SELFTEST-EXTERNAL-WRITER' 'Uma sessão externa com escrita em andamento não bloqueou o preflight.'
    }
    $passed++
  } finally { if ($writerProbe) { Stop-DisposableSessionProbe $writerProbe $Database $Role } }
  $null = Invoke-Psql 'localhost' $script:TempPort 'postgres' $Database 'DROP TABLE public.session_write_probe;' 'Remoção da tabela de prova no banco descartável' ''

  Set-Phase 'fluxo integrado descartável - permissão de monitoramento insuficiente'
  $priorDiagnosticCode = $script:Code; $priorDiagnosticMessage = $script:Message
  $priorDiagnosticAppName = $env:PGAPPNAME
  $permissionTestPassed = $false
  $permissionObjectCreated = $false
  $permissionTestFailure = $null
  try {
    $null = Invoke-Psql 'localhost' $script:TempPort 'postgres' $Database 'CREATE TABLE public.permission_denied_probe(id integer NOT NULL);' 'Preparação da prova de permissão negada descartável' ''
    $permissionObjectCreated = $true
    $permissionProbe = Invoke-AmoresPetNativeProcess -Executable $script:PgTools['psql.exe'] -Arguments (Get-PsqlArguments 'localhost' $script:TempPort $Role $Database 'SELECT count(*) FROM public.permission_denied_probe;' '')
    $permissionProbeDiagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError ([string]$permissionProbe.StandardError) -ExitCode ([int]$permissionProbe.ExitCode)
    if (-not [bool]$permissionProbe.Started -or [int]$permissionProbe.ExitCode -eq 0 -or [string]$permissionProbeDiagnostic.Code -cne 'AP-PSQL-SQL-PERMISSION') {
      Stop-Import 'AP-NEON-SESSION-SELFTEST-PRIVILEGE-PROBE' ('A role sintética não produziu a recusa SQL 42501 esperada; iniciou=' + [string]$permissionProbe.Started + '; saída=' + [string]$permissionProbe.ExitCode + '; código=' + [string]$permissionProbeDiagnostic.Code + '.')
    }
    $permissionProbeSessionSql = @'
activity AS MATERIALIZED (SELECT 1),
counts AS (
  SELECT 1::bigint AS permission_probe,
    (SELECT count(*) FROM public.permission_denied_probe)::bigint AS session_total_count, 1::bigint AS session_current_count, 1::bigint AS session_execution_count,
    0::bigint AS session_same_execution_other_count, 0::bigint AS session_external_count,
    0::bigint AS session_external_client_count, 0::bigint AS session_non_client_count,
    0::bigint AS session_irrelevant_internal_count, 0::bigint AS session_concurrent_count
),
groups AS (
  SELECT 'CLIENT_BACKEND'::text AS backend_label, 'ACTIVE'::text AS state_label, 1::bigint AS session_count
)
'@
    $permissionMappedCode = ''
    try { $null = Get-DestinationIdentity -HostName 'localhost' -Port $script:TempPort -UserName $Role -Database $Database -SessionSqlOverride $permissionProbeSessionSql }
    catch { $permissionMappedCode = [string]$script:Code }
    if ($permissionMappedCode -cne 'AP-NEON-SESSION-ASSESSMENT-ACCESS') { Stop-Import 'AP-NEON-SESSION-SELFTEST-ACCESS' ('O erro de permissão simulado não foi bloqueado como esperado; resultado=' + [string]$permissionMappedCode + '; estado=' + [string]$script:Code + '.') }
    $script:Code = $priorDiagnosticCode; $script:Message = $priorDiagnosticMessage
    $script:Report.technical_code = $priorDiagnosticCode; $script:Report.error = $priorDiagnosticMessage
    $permissionTestPassed = $true
    $passed++
  } catch {
    $permissionTestFailure = $_
    throw
  } finally {
    if ($permissionObjectCreated) {
      try { $null = Invoke-Psql 'localhost' $script:TempPort 'postgres' $Database 'DROP TABLE public.permission_denied_probe;' 'Limpeza da prova de permissão negada descartável' '' }
      catch { if ($null -eq $permissionTestFailure) { throw } }
    }
    if ($permissionTestPassed) {
      $script:Code = $priorDiagnosticCode; $script:Message = $priorDiagnosticMessage
      $script:Report.technical_code = $priorDiagnosticCode; $script:Report.error = $priorDiagnosticMessage
    }
    if ($null -eq $priorDiagnosticAppName) { Remove-Item Env:PGAPPNAME -ErrorAction SilentlyContinue } else { $env:PGAPPNAME = $priorDiagnosticAppName }
  }
  $script:SessionAssessmentTestCount += $passed
  return $passed
}

function Invoke-ClientTlsSelfTests([string]$TestRoot) {
  $opensslCandidates = @('C:\Program Files\Git\usr\bin\openssl.exe')
  $opensslCommand = Get-Command openssl.exe -ErrorAction SilentlyContinue
  if ($opensslCommand) { $opensslCandidates += [string]$opensslCommand.Source }
  $opensslPath = $null
  foreach ($candidate in $opensslCandidates) { if (Test-Path -LiteralPath $candidate -PathType Leaf) { $opensslPath = $candidate; break } }
  if (-not $opensslPath) { Stop-Import 'AP-NEON-TLS-SELFTEST-OPENSSL-MISSING' 'OpenSSL local não está disponível para gerar certificados sintéticos de teste.' }

  $testId = [guid]::NewGuid().ToString('N')
  $dataDirectory = Join-Path $TestRoot ('selftest-' + $testId)
  $logPath = Join-Path $TestRoot ('postgres-tls-' + $testId + '.log')
  $configPath = Join-Path $TestRoot ('tls-' + $testId + '.cnf')
  $certificatePath = Join-Path $TestRoot ('tls-' + $testId + '.crt')
  $keyPath = Join-Path $TestRoot ('tls-' + $testId + '.key')
  $wrongCertificatePath = Join-Path $TestRoot ('wrong-ca-' + $testId + '.crt')
  $wrongKeyPath = Join-Path $TestRoot ('wrong-ca-' + $testId + '.key')
  $certificateConfig = @'
[req]
distinguished_name=dn
x509_extensions=server_ext
prompt=no
[dn]
CN=tls-selftest.invalid
[server_ext]
basicConstraints=critical,CA:TRUE
keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign,cRLSign
extendedKeyUsage=serverAuth
subjectAltName=@alt_names
[alt_names]
DNS.1=localhost
DNS.2=*.c-2.sa-east-1.aws.neon.tech
'@
  [IO.File]::WriteAllText($configPath,$certificateConfig,(New-Object Text.UTF8Encoding($false)))
  Save-PgEnvironment
  $script:TempDataDirectory = $dataDirectory
  $script:TempClusterStarted = $false
  $script:TempClusterStopped = $false
  $passed = 0
  try {
    New-TlsSelfTestCertificate $opensslPath $configPath $certificatePath $keyPath
    New-TlsSelfTestCertificate $opensslPath $configPath $wrongCertificatePath $wrongKeyPath
    Start-DisposableCluster $dataDirectory $logPath -TlsCertificatePath $certificatePath -TlsKeyPath $keyPath

    $env:PGPASSFILE = ''
    $env:PGSSLMODE = 'verify-full'
    $env:PGSSLROOTCERT = $certificatePath
    $env:PGGSSENCMODE = 'disable'
    $env:PGSERVICE = ''
    $env:PGSERVICEFILE = ''
    $env:PGHOSTADDR = ''
    $env:PGCONNECT_TIMEOUT = '3'
    $tlsAuthorizedHost = [string]$script:ApprovedNeonTarget.Host
    $tlsOtherWildcardHost = 'ep-another-branch.c-2.sa-east-1.aws.neon.tech'
    $tlsMismatchedHost = 'mismatch.example.invalid'
    $settings = Test-LibpqTlsSettings -HostName $tlsAuthorizedHost -ApprovedHost $tlsAuthorizedHost -SslMode $env:PGSSLMODE -RootCertificatePath $env:PGSSLROOTCERT -Service $env:PGSERVICE -ServiceFile $env:PGSERVICEFILE -HostAddress $env:PGHOSTADDR -GssEncMode $env:PGGSSENCMODE
    if (-not [bool]$settings.Success) { Stop-Import 'AP-NEON-TLS-SELFTEST-CONFIG' 'A configuração sintética verify-full não passou no validador do cliente.' }

    $originalCode = $script:Code; $originalMessage = $script:Message
    try {
      $null = Invoke-PsqlWithConnectionInfo $tlsAuthorizedHost $script:TempPort 'postgres' 'postgres' 'SELECT 1' 'Teste hostaddr fora do loopback' '192.0.2.1'
      Stop-Import 'AP-NEON-TLS-SELFTEST-HOSTADDR-ACCEPTED' 'O parâmetro hostaddr fora de loopback foi aceito no teste descartável.'
    } catch {
      if ($_.Exception.Message -ne 'AP-NEON-IMPORT-STOP' -or $script:Code -cne 'AP-NEON-TLS-SELFTEST-HOSTADDR-GUARD') { throw }
      $passed++
    } finally {
      $script:Code = $originalCode; $script:Message = $originalMessage
      $script:Report.technical_code = $originalCode; $script:Report.error = $originalMessage
    }

    $sql = "SELECT jsonb_build_object('database',current_database(),'user',current_user,'session_user',session_user,'server_tls_reported',(SELECT COALESCE(ssl,false) FROM pg_stat_ssl WHERE pid=pg_backend_pid()))::text"
    $valid = Invoke-PsqlWithConnectionInfo $tlsAuthorizedHost $script:TempPort 'postgres' 'postgres' $sql 'Teste TLS cliente PostgreSQL descartável' '127.0.0.1' -CaptureFailure
    if (-not $valid.Started -or [int]$valid.ExitCode -ne 0) {
      $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError ([string]$valid.StandardError) -ExitCode ([int]$valid.ExitCode)
      $hints = Get-SafePsqlDiagnosticHints ([string]$valid.StandardError)
      Stop-Import 'AP-NEON-TLS-SELFTEST-VALID-CONNECTION' ('A conexão TLS com o endpoint coberto pelo certificado sintético falhou; started=' + [string]$valid.Started + '; exit=' + [string]$valid.ExitCode + '; categoria=' + [string]$diagnostic.Category + '; codigo=' + [string]$diagnostic.Code + '; sqlstate=' + [string]$diagnostic.SqlState + '; ' + $hints + '.')
    }
    $evidence = ConvertFrom-PsqlClientTlsEvidence -StandardOutput ([string]$valid.StandardOutput) -ExitCode ([int]$valid.ExitCode)
    if (-not [bool]$evidence.Success -or [string]$evidence.Protocol -notin @('TLSv1.2','TLSv1.3') -or [string]::IsNullOrWhiteSpace([string]$evidence.Cipher)) {
      $jsonLineCount = @(([string]$valid.StandardOutput -split "`r?`n") | Where-Object { ([string]$_).Trim() -match '^\{.*\}$' }).Count
      $sslMarkerPresent = [regex]::IsMatch([string]$valid.StandardOutput,'(?i)SSL connection\b')
      Stop-Import 'AP-NEON-TLS-SELFTEST-VALID-CONNECTION' ('A conexão TLS válida não foi comprovada pelo psql descartável; parser=' + [string]$evidence.Code + '; json_rows=' + [string]$jsonLineCount + '; ssl_marker=' + [string]$sslMarkerPresent + '; psql_exit=' + [string]$valid.ExitCode + '.')
    }
    $passed++

    $proxyOutput = [regex]::Replace([string]$valid.StandardOutput,'("server_tls_reported"\s*:\s*)(?:true|false)','$1false')
    $proxyEvidence = ConvertFrom-PsqlClientTlsEvidence -StandardOutput $proxyOutput -ExitCode 0
    if (-not [bool]$proxyEvidence.Success -or [bool]$proxyEvidence.ServerTlsReported) {
      Stop-Import 'AP-NEON-TLS-SELFTEST-PROXY' 'A indicação server-side falsa do cenário proxy foi interpretada incorretamente.'
    }
    $passed++

    $legacyWrongHost = Test-TlsExpectedFailure '127.0.0.1' $script:TempPort $certificatePath @('AP-PSQL-TLS-HOSTNAME-MISMATCH','AP-PSQL-TLS-CERTIFICATE') ''
    if ([int]$legacyWrongHost.ExitCode -eq 0) {
      $script:LegacyWrongHostProbe = 'CONEXAO_ACEITA'
    } elseif ([string]$legacyWrongHost.Category -ceq 'PSQL_TLS_CERTIFICADO' -and [string]$legacyWrongHost.Code -in @('AP-PSQL-TLS-HOSTNAME-MISMATCH','AP-PSQL-TLS-CERTIFICATE')) {
      $script:LegacyWrongHostProbe = 'CERTIFICADO_RECUSADO_E_CLASSIFICADO'
    } else {
      $script:LegacyWrongHostProbe = 'FALHA_CLASSIFICADA_COMO_' + [string]$legacyWrongHost.Code
    }
    $priorGssMode = [Environment]::GetEnvironmentVariable('PGGSSENCMODE','Process')
    try {
      Remove-Item Env:PGGSSENCMODE -ErrorAction SilentlyContinue
      $legacyDefaultGss = Test-TlsExpectedFailure '127.0.0.1' $script:TempPort $certificatePath @('AP-PSQL-TLS-HOSTNAME-MISMATCH','AP-PSQL-TLS-CERTIFICATE') ''
      if ([int]$legacyDefaultGss.ExitCode -eq 0) {
        $script:LegacyDefaultGssProbe = 'CONEXAO_ACEITA'
      } else {
        $script:LegacyDefaultGssProbe = [string]$legacyDefaultGss.Code
      }
    } finally {
      if ($null -eq $priorGssMode) { Remove-Item Env:PGGSSENCMODE -ErrorAction SilentlyContinue }
      else { $env:PGGSSENCMODE = $priorGssMode }
    }

    $wrongCa = Test-TlsExpectedFailure $tlsAuthorizedHost $script:TempPort $wrongCertificatePath @('AP-PSQL-TLS-CA-INVALID','AP-PSQL-TLS-CERTIFICATE') '127.0.0.1'
    if (-not [bool]$wrongCa.Success) {
      Stop-Import 'AP-NEON-TLS-SELFTEST-WRONG-CA' ('A CA incorreta não foi recusada como erro de certificado; started=' + [string]$wrongCa.Started + '; exit=' + [string]$wrongCa.ExitCode + '; categoria=' + [string]$wrongCa.Category + '; codigo=' + [string]$wrongCa.Code + '; sqlstate=' + [string]$wrongCa.SqlState + '.')
    }
    $passed++
    $wrongHost = Test-TlsExpectedFailure $tlsMismatchedHost $script:TempPort $certificatePath @('AP-PSQL-TLS-HOSTNAME-MISMATCH','AP-PSQL-TLS-CERTIFICATE') '127.0.0.1'
    if (-not [bool]$wrongHost.Success) {
      Stop-Import 'AP-NEON-TLS-SELFTEST-WRONG-HOST' ('O teste de hostname incompatível não foi classificado como certificado; started=' + [string]$wrongHost.Started + '; exit=' + [string]$wrongHost.ExitCode + '; categoria=' + [string]$wrongHost.Category + '; codigo=' + [string]$wrongHost.Code + '; sqlstate=' + [string]$wrongHost.SqlState + '; ' + [string]$wrongHost.SafeHints + '.')
    }
    $script:WrongHostClassifierEvidence = 'EXIT=' + [string]$wrongHost.ExitCode + '; CODE=' + [string]$wrongHost.Code + '; RULE=' + [string]$wrongHost.MatchRule + '; LEGACY_PATTERN_MATCH=' + [string]$wrongHost.LegacyHostnamePatternMatched
    $passed++

    $wildcardValid = Invoke-PsqlWithConnectionInfo $tlsOtherWildcardHost $script:TempPort 'postgres' 'postgres' $sql 'Teste TLS wildcard PostgreSQL descartável' '127.0.0.1' -CaptureFailure
    if (-not $wildcardValid.Started -or [int]$wildcardValid.ExitCode -ne 0) {
      $diagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError ([string]$wildcardValid.StandardError) -ExitCode ([int]$wildcardValid.ExitCode)
      $hints = Get-SafePsqlDiagnosticHints ([string]$wildcardValid.StandardError)
      Stop-Import 'AP-NEON-TLS-SELFTEST-WILDCARD-CONNECTION' ('A conexão do hostname alternativo coberto pelo wildcard falhou; started=' + [string]$wildcardValid.Started + '; exit=' + [string]$wildcardValid.ExitCode + '; categoria=' + [string]$diagnostic.Category + '; codigo=' + [string]$diagnostic.Code + '; sqlstate=' + [string]$diagnostic.SqlState + '; ' + $hints + '.')
    }
    $wildcardEvidence = ConvertFrom-PsqlClientTlsEvidence -StandardOutput ([string]$wildcardValid.StandardOutput) -ExitCode ([int]$wildcardValid.ExitCode)
    if (-not [bool]$wildcardEvidence.Success) { Stop-Import 'AP-NEON-TLS-SELFTEST-WILDCARD-CERT' 'O certificado wildcard sintético não validou o hostname alternativo esperado.' }
    if (-not (Test-EndpointRejectedCase 'hostname TLS wildcard valido mas branch nao autorizada' $tlsOtherWildcardHost 'AP-NEON-ENDPOINT-NOT-APPROVED')) {
      Stop-Import 'AP-NEON-TLS-SELFTEST-WILDCARD-ALLOWLIST' 'A allowlist não recusou o hostname alternativo coberto pelo certificado wildcard.'
    }
    $passed++

    $script:IntegrationPipelineTestCount = Invoke-DisposableImportPipelineSelfTest $TestRoot $certificatePath

    $env:PGSSLMODE = 'disable'
    $plain = Invoke-PsqlWithConnectionInfo $tlsAuthorizedHost $script:TempPort 'postgres' 'postgres' $sql 'Teste psql sem TLS' '127.0.0.1'
    $plainEvidence = ConvertFrom-PsqlClientTlsEvidence -StandardOutput ([string]$plain.StandardOutput) -ExitCode ([int]$plain.ExitCode)
    if ([bool]$plainEvidence.Success -or [string]$plainEvidence.Code -cne 'AP-NEON-TLS-CLIENT-NOT-NEGOTIATED') {
      Stop-Import 'AP-NEON-TLS-SELFTEST-NO-TLS' 'A conexão sem TLS foi aceita pelo validador do cliente.'
    }
    $passed++

    $modeAssessment = Test-LibpqTlsSettings -HostName $tlsAuthorizedHost -ApprovedHost $tlsAuthorizedHost -SslMode '' -RootCertificatePath $certificatePath -GssEncMode 'disable'
    if ([bool]$modeAssessment.Success -or [string]$modeAssessment.Code -cne 'AP-NEON-TLS-MODE-NOT-VERIFIED') { Stop-Import 'AP-NEON-TLS-SELFTEST-MISSING-MODE' 'A ausência de verify-full não foi bloqueada.' }
    $passed++
    $rootAssessment = Test-LibpqTlsSettings -HostName $tlsAuthorizedHost -ApprovedHost $tlsAuthorizedHost -SslMode 'verify-full' -RootCertificatePath '' -GssEncMode 'disable'
    if ([bool]$rootAssessment.Success -or [string]$rootAssessment.Code -cne 'AP-NEON-TLS-ROOT-CERT-MISSING') { Stop-Import 'AP-NEON-TLS-SELFTEST-MISSING-ROOT' 'A ausência de CA não foi bloqueada.' }
    $passed++
    $overrideAssessment = Test-LibpqTlsSettings -HostName $tlsAuthorizedHost -ApprovedHost $tlsAuthorizedHost -SslMode 'verify-full' -RootCertificatePath $certificatePath -Service 'unexpected' -GssEncMode 'disable'
    if ([bool]$overrideAssessment.Success -or [string]$overrideAssessment.Code -cne 'AP-NEON-TLS-CONNECTION-OVERRIDE') { Stop-Import 'AP-NEON-TLS-SELFTEST-CONNECTION-OVERRIDE' 'Uma configuração alternativa de conexão não foi bloqueada.' }
    $passed++
    $gssAssessment = Test-LibpqTlsSettings -HostName $tlsAuthorizedHost -ApprovedHost $tlsAuthorizedHost -SslMode 'verify-full' -RootCertificatePath $certificatePath -GssEncMode 'prefer'
    if ([bool]$gssAssessment.Success -or [string]$gssAssessment.Code -cne 'AP-NEON-TLS-GSSENC-NOT-DISABLED') { Stop-Import 'AP-NEON-TLS-SELFTEST-GSSENC' 'O modo GSS habilitado não foi bloqueado.' }
    $passed++

    $tlsFailure = Get-AmoresPetPsqlFailureDiagnostic -StandardError 'psql: error: SSL error: certificate verify failed' -ExitCode 2
    $hostnameFailure = Get-AmoresPetPsqlFailureDiagnostic -StandardError 'psql: error: connection failed: server certificate for "tls-selftest.invalid" does not match host name "mismatch.example.invalid"' -ExitCode 2
    $dnsFailure = Get-AmoresPetPsqlFailureDiagnostic -StandardError 'psql: error: could not translate host name "synthetic.invalid" to address: Name or service not known' -ExitCode 2
    $authFailure = Get-AmoresPetPsqlFailureDiagnostic -StandardError 'FATAL: 28P01: password authentication failed' -ExitCode 2
    if ($tlsFailure.Code -cne 'AP-PSQL-TLS-CERTIFICATE' -or $null -ne $tlsFailure.SqlState -or
        $hostnameFailure.Code -cne 'AP-PSQL-TLS-HOSTNAME-MISMATCH' -or $null -ne $hostnameFailure.SqlState -or
        $dnsFailure.Category -cne 'PSQL_CONEXAO' -or $dnsFailure.Code -ceq 'AP-PSQL-TLS-CERTIFICATE' -or
        $dnsFailure.Code -cne 'AP-PSQL-CONNECTION' -or $authFailure.Category -cne 'PSQL_AUTENTICACAO' -or $authFailure.Code -ceq 'AP-PSQL-TLS-CERTIFICATE') {
      Stop-Import 'AP-NEON-TLS-SELFTEST-ERROR-CLASSIFICATION' ('Classificação sintética divergente; tls=' + [string]$tlsFailure.Code + '; hostname=' + [string]$hostnameFailure.Code + '; dns=' + [string]$dnsFailure.Code + '; auth=' + [string]$authFailure.Code + '.')
    }
    $passed++
    $dnsHints = Get-SafePsqlDiagnosticHints 'psql: error: could not translate host name "mismatch.example.invalid" to address: Name or service not known'
    $hostnameHints = Get-SafePsqlDiagnosticHints 'psql: error: server certificate does not match host name "mismatch.example.invalid"'
    if ($dnsHints -match 'hostname_mismatch_marker=True' -or $dnsHints -notmatch 'dns_marker=True' -or
        $hostnameHints -notmatch 'hostname_mismatch_marker=True') {
      Stop-Import 'AP-NEON-TLS-SELFTEST-SANITIZED-HINTS' 'Os marcadores sanitizados confundiram resolução DNS com rejeição de hostname TLS.'
    }
    $passed++

    $mockIdentity = '{"database":"amores_pet_homologacao","user":"owner","session_user":"owner","server_tls_reported":false}' + "`r`n" +
      'You are connected to database "amores_pet_homologacao" as user "owner". password=synthetic-only-marker' + "`r`n" +
      'SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off)'
    $mockEvidence = ConvertFrom-PsqlClientTlsEvidence -StandardOutput $mockIdentity -ExitCode 0
    $safeReportEvidence = [ordered]@{
      tls_verified=[bool]$mockEvidence.Success; tls_mode='verify-full'; root_certificate_configured=$true
      hostname_verified=[bool]$mockEvidence.Success; protocol=[string]$mockEvidence.Protocol
      cipher=[string]$mockEvidence.Cipher; server_reported_tls=[bool]$mockEvidence.ServerTlsReported
    } | ConvertTo-Json -Compress
    if (-not [bool]$mockEvidence.Success -or [bool]$mockEvidence.ServerTlsReported -or
        $safeReportEvidence -match 'synthetic-only-marker|password=|amores_pet_homologacao|owner' -or
        $mockEvidence.PSObject.Properties['StandardOutput'] -or $mockEvidence.PSObject.Properties['ConnectionInfo']) {
      Stop-Import 'AP-NEON-TLS-SELFTEST-REPORT-SANITIZATION' 'O resumo de TLS contém texto bruto ou informação não prevista para o relatório.'
    }
    $passed++

    $inconclusive = ConvertFrom-PsqlClientTlsEvidence -StandardOutput '{malformed-json}' -ExitCode 0
    if ([bool]$inconclusive.Success -or [string]$inconclusive.Code -cne 'AP-NEON-TLS-CLIENT-EVIDENCE-INCONCLUSIVE') { Stop-Import 'AP-NEON-TLS-SELFTEST-INCONCLUSIVE' 'A saída psql malformada não foi tratada como inconclusiva.' }
    $passed++
    $weak = ConvertFrom-PsqlClientTlsEvidence -StandardOutput ($mockIdentity -replace 'TLSv1\.3','TLSv1.1') -ExitCode 0
    if ([bool]$weak.Success -or [string]$weak.Code -cne 'AP-NEON-TLS-PROTOCOL-REJECTED') { Stop-Import 'AP-NEON-TLS-SELFTEST-WEAK-PROTOCOL' 'Uma versão TLS antiga não foi bloqueada.' }
    $passed++

    if (-not (Test-IdentityRejectedForTls 'database' 'other_database')) { Stop-Import 'AP-NEON-TLS-SELFTEST-WRONG-DATABASE' 'Um banco divergente não foi recusado pela identidade SQL.' }
    $passed++
    if (-not (Test-IdentityRejectedForTls 'user' 'other_role')) { Stop-Import 'AP-NEON-TLS-SELFTEST-WRONG-ROLE' 'Uma role divergente não foi recusada pela identidade SQL.' }
    $passed++
    if (-not (Test-IdentityRejectedForTls 'session_user' 'other_role')) { Stop-Import 'AP-NEON-TLS-SELFTEST-WRONG-SESSION-ROLE' 'Uma role de sessão divergente não foi recusada pela identidade SQL.' }
    $passed++

    if (-not (Test-EndpointRejectedCase 'tls pooled endpoint' 'ep-little-dawn-b6iy8o0t-pooler.c-2.sa-east-1.aws.neon.tech' 'AP-NEON-POOLED-ENDPOINT-REJECTED')) {
      Stop-Import 'AP-NEON-TLS-SELFTEST-POOLED' 'O endpoint pooled não foi recusado no preflight sintético.'
    }
    $passed++

    $connectionListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
    try { $connectionListener.Start(); $connectionPort = [int]$connectionListener.LocalEndpoint.Port } finally { $connectionListener.Stop() }
    $connectionFailure = Invoke-AmoresPetNativeProcess -Executable $script:PgTools['psql.exe'] -Arguments (Get-PsqlArguments '127.0.0.1' $connectionPort 'postgres' 'postgres' 'SELECT 1' '')
    if (-not $connectionFailure.Started -or [int]$connectionFailure.ExitCode -eq 0) { Stop-Import 'AP-NEON-TLS-SELFTEST-CONNECTION-FAILURE' 'O cliente não detectou a conexão descartável indisponível.' }
    $connectionDiagnostic = Get-AmoresPetPsqlFailureDiagnostic -StandardError ([string]$connectionFailure.StandardError) -ExitCode ([int]$connectionFailure.ExitCode)
    if ([string]$connectionDiagnostic.Category -notin @('PSQL_CONEXAO','PSQL_TLS_NEGOCIACAO')) { Stop-Import 'AP-NEON-TLS-SELFTEST-CONNECTION-CLASSIFICATION' 'A falha de conexão não foi classificada como conexão/TLS.' }
    $passed++

    return $passed
  } finally {
    try { Stop-DisposableCluster $dataDirectory $TestRoot } finally { Restore-PgEnvironment }
  }
}

try {
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -lt 1) { Stop-Import 'AP-NEON-POWERSHELL-VERSION' 'O executor requer Windows PowerShell 5.1.' }
  Import-Module (Join-Path $PSScriptRoot 'Acl-Privada.psm1') -Force -ErrorAction Stop
  Import-Module (Join-Path $PSScriptRoot 'Postmaster-Identity.psm1') -Force -ErrorAction Stop
  Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force -ErrorAction Stop
  if ($TestEndpointOnly) {
    $endpointTestCount = Invoke-EndpointInputSelfTests
    $script:Report.status = 'APROVADO'
    $script:Code = 'AP-NEON-ENDPOINT-TESTS-OK'
    Write-Output ('ENDPOINT_TESTS=APROVADO; PASS=' + [string]$endpointTestCount + '; FAIL=0; DESTINO=MAPEAMENTO_LOCAL; CONEXAO_NEON=NAO_TENTADA; ESCRITA=NAO_INICIADA')
    exit 0
  }
  $script:CurrentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $script:AllowedSids = @($script:CurrentSid,'S-1-5-18')
  foreach ($name in @('initdb.exe','pg_ctl.exe','psql.exe','pg_dump.exe','pg_restore.exe','postgres.exe')) {
    $tool = Join-Path $script:PgBin $name
    Assert-NoReparsePoint $tool 'AP-NEON-PG-TOOL-MISSING'
    $script:PgTools[$name] = $tool
    $version = Invoke-Tool $name @('--version') 'Versão de ferramenta PostgreSQL'
    if ([string]$version.StandardOutput -notmatch '\(PostgreSQL\)\s+17(?:\.|\s)') { Stop-Import 'AP-NEON-PG-TOOL-VERSION' 'As ferramentas locais não são PostgreSQL 17.' }
  }
  Initialize-SnapshotSqlFunctions

  if ($SelfTestOnly) {
    $selfRoot = Join-Path (Get-FreeTempRoot) ('Amores Pet Neon Import SelfTest ' + [guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($selfRoot)
    $script:OperationDirectory = $selfRoot
    $selfTestDir = Join-Path $script:OperationDirectory 'selftest'
    [void][IO.Directory]::CreateDirectory($selfTestDir)
    $script:SelfTestRoot = $selfTestDir
    try {
      Set-Phase 'self-test PostgreSQL 17 descartável'
      Invoke-DisposableSelfTest $selfTestDir
      $script:Report.status = 'APROVADO'
      $script:Report.disposable.self_tests_passed = $true
      $script:Report.disposable.developer_suite_status = 'APROVADA'
      $script:Code = 'AP-NEON-SELFTEST-OK'
      Write-Output ('RESULTADO=APROVADO; TESTES_RESTORE=10; TESTES_TLS_CLIENTE=' + [string]$script:TlsSelfTestCount + '; TESTES_FLUXO_INTEGRADO=' + [string]$script:IntegrationPipelineTestCount + '; TESTES_SESSOES=' + [string]$script:SessionAssessmentTestCount + '; WRONG_HOST=' + [string]$script:WrongHostClassifierEvidence + '; LEGACY_IP_HOST_PROBE=' + [string]$script:LegacyWrongHostProbe + '; DEFAULT_GSS_IP_HOST_PROBE=' + [string]$script:LegacyDefaultGssProbe + '; FALHAS=0; DESTINO_PERSISTENTE_NAO_CONECTADO')
    } finally {
      $full = [IO.Path]::GetFullPath($selfRoot); $temp = [IO.Path]::GetFullPath((Get-FreeTempRoot)).TrimEnd('\') + '\'
      $activeTestCluster = $script:TempDataDirectory -and (Test-Path -LiteralPath (Join-Path $script:TempDataDirectory 'postmaster.pid'))
      if ($full.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($full) -match '^Amores Pet Neon Import SelfTest [a-f0-9]{32}$' -and -not $activeTestCluster) {
        if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Recurse -Force }
      }
    }
    return
  }

  Set-Phase 'validacao da conta Windows e raiz privada'
  $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Stop-Import 'AP-NEON-ELEVATED' 'Execute pela conta proprietária, sem elevação administrativa.' }
  if (-not $env:LOCALAPPDATA) { Stop-Import 'AP-NEON-LOCALAPPDATA' 'LOCALAPPDATA não está definido.' }
  $script:PrivateRoot = Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
  Assert-NoReparsePoint $script:PrivateRoot; Assert-PrivateAcl $script:PrivateRoot -RequireProtected
  Set-Phase 'criacao do diretorio e relatorio privado da operacao'
  $importsRoot = Join-Path $script:PrivateRoot 'neon-imports'
  if (-not (Test-Path -LiteralPath $importsRoot)) { [void][IO.Directory]::CreateDirectory($importsRoot) }
  Assert-NoReparsePoint $importsRoot; Assert-PrivateAcl $importsRoot
  $runName = 'neon-import-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N')
  $script:OperationDirectory = Join-Path $importsRoot $runName
  [void][IO.Directory]::CreateDirectory($script:OperationDirectory)
  Assert-NoReparsePoint $script:OperationDirectory; Assert-PrivateAcl $script:OperationDirectory
  $script:ReportPath = Join-Path $script:OperationDirectory 'relatorio-importacao.json'
  $script:SafeReportPath = Join-Path $script:OperationDirectory 'relatorio-sanitizado.txt'
  Write-ImportReport

  if ($DiagnoseSessionsOnly) {
    Initialize-NeonReadOnlySessionDiagnosticConnection
    Set-Phase 'consulta somente leitura da identidade e sessões no destino autorizado'
    $identity = Get-ConnectionIdentity $script:NeonHost
    Assert-Identity $identity $script:ApprovedNeonTarget.Role $false 0 -ReadOnlySessionDiagnostic
    $isApplicationEmpty = [long]$identity.application_relations -eq 0 -and [long]$identity.application_functions -eq 0 -and [long]$identity.application_custom_types -eq 0 -and
      [long]$identity.application_large_objects -eq 0 -and -not [bool]$identity.migration_036_present -and -not [bool]$identity.migration_037_present -and [string]$identity.application_extensions -ceq 'plpgsql=1.0'
    $script:Report.destination.empty_validated = [bool]$isApplicationEmpty
    $script:Report.status = 'DIAGNOSTICO_CONCLUIDO'
    if ([bool]$script:Report.destination.sessions_clear) {
      $script:Code = 'AP-NEON-SESSION-DIAGNOSTIC-CLEAR'
      $script:Message = 'A checagem excluiu somente a sessão de diagnóstico e encontrou zero sessões concorrentes.'
    } else {
      $script:Code = 'AP-NEON-SESSION-DIAGNOSTIC-BUSY'
      $script:Message = 'Foram encontradas outras sessões que podem executar operações no banco; nenhuma sessão foi encerrada.'
    }
    $script:Report.technical_code = $script:Code
    $script:Report.error = $script:Message
    Write-ImportReport
    $sessionSummary = $script:Report.destination.session_summary
    Write-Host ''
    Write-Host ('DIAGNOSTICO_SESSOES=' + [string]$script:Report.status)
    Write-Host ('DESTINO_VALIDADO=' + [string]$script:Report.destination.identity_validated + '; TLS_VERIFY_FULL=' + [string]$script:Report.destination.tls_verified + '; DESTINO_APLICACAO_VAZIO=' + [string]$script:Report.destination.empty_validated)
    Write-Host ('SESSOES_TOTAL=' + [string]$sessionSummary.total_observed + '; DA_EXECUCAO=' + [string]$sessionSummary.execution_sessions + '; OUTRAS_DA_EXECUCAO=' + [string]$sessionSummary.same_execution_other_sessions + '; CLIENTES_EXTERNOS=' + [string]$sessionSummary.external_client_sessions + '; BACKENDS_NAO_CLIENTE=' + [string]$sessionSummary.non_client_sessions + '; INTERNOS_PASSIVOS=' + [string]$sessionSummary.irrelevant_internal_sessions + '; CONCORRENTES=' + [string]$sessionSummary.concurrent_sessions + '; MOTIVO=' + [string]$sessionSummary.block_reason)
    Write-Host ('SESSOES_EXTERNAS_NAO_DA_EXECUCAO=' + [string]$sessionSummary.external_sessions)
    Write-Host ('TIPOS_E_ESTADOS=' + (($sessionSummary.backend_groups | ForEach-Object { [string]$_.backend_type + '/' + [string]$_.state + '=' + [string]$_.count }) -join ','))
    Write-Host 'IMPORTACAO=NAO_INICIADA; CONFIRMACAO=NAO_APRESENTADA; SESSOES_NAO_ENCERRADAS'
  } else {
  $backup = Test-ApprovedBackup $script:PrivateRoot

  Set-Phase 'catalogo custom e confirmação do backup aprovado'
  $catalog = Invoke-Tool 'pg_restore.exe' @('--list',$backup.Path) 'Catálogo do backup aprovado'
  $catalogCheck = Test-AmoresPetCustomArchiveCatalog -CatalogOutput ([string]$catalog.StandardOutput) -ArchiveSize 159721
  if (-not $catalogCheck.Success) { Stop-Import 'AP-NEON-APPROVED-CATALOG' 'O arquivo não foi confirmado como backup custom íntegro.' }
  if ([string]$catalog.StandardOutput -match '(?m)^;\s*\d+\s+\d+\s+DATABASE\b') { Stop-Import 'AP-NEON-ARCHIVE-CREATE-DATABASE' 'O catálogo inclui criação de banco, opção proibida para esta importação.' }
  $script:Report.backup.catalog_validated = $true
  Write-ImportReport

  Set-Phase 'validacao operacional de backup em PostgreSQL 17 descartavel'
  if ([string]::IsNullOrWhiteSpace([string]$script:OperationDirectory)) { Stop-Import 'AP-NEON-OPERATION-DIRECTORY-MISSING' 'O diretório privado da operação não foi inicializado; nenhum cluster ou banco foi iniciado.' }
  $selfTestDir = Join-Path $script:OperationDirectory 'selftest'
  # Created only under the already validated private operation directory.
  if (-not (Test-Path -LiteralPath $selfTestDir)) { [void][IO.Directory]::CreateDirectory($selfTestDir) }
  Assert-NoReparsePoint $selfTestDir; Assert-PrivateAcl $selfTestDir
  $script:SelfTestRoot = $selfTestDir
  # The exhaustive negative TLS/rollback suite is the developer suite, invoked
  # only by /selfTestOnly after code changes. Operational execution still runs
  # the full approved-archive restore and comparisons below, plus live read-only
  # TLS, target identity, empty-destination and permission preflight checks.
  $script:Report.disposable.self_tests_passed = $false
  $script:Report.disposable.developer_suite_status = 'NAO_EXECUTADA_SEPARADA_DO_PREFLIGHT'

  Set-Phase 'restauracao do backup aprovado em banco descartavel Neon-compatible'
  $runId = [guid]::NewGuid().ToString('N')
  $script:TempDataDirectory = Join-Path $selfTestDir ('cluster-' + $runId)
  $script:ExpectedDisposable = $null
  $null = Test-ApprovedArchiveInDisposable $backup.Path $backup.Report $true
  $expected = $script:ExpectedDisposable
  $script:Report.disposable.source_restore_passed = $true
  $script:Report.disposable.structure_compared = $true
  $script:Report.disposable.data_compared = $true
  $script:Report.disposable.sequence_states_compared = $true
  if ($expected.Data.TableCount -ne 30 -or $expected.Data.RowCount -ne 153 -or $expected.Sequences.Count -ne 24) { Stop-Import 'AP-NEON-DISPOSABLE-SNAPSHOT' 'Fingerprints e contagens do backup aprovado não correspondem ao snapshot esperado.' }

  Set-Phase 'captura local do endpoint direto Neon e certificado raiz'
  Write-Host ('Destino permitido: projeto ' + $script:ApprovedNeonTarget.ProjectId + ', branch ' + $script:ApprovedNeonTarget.Branch + ' (' + $script:ApprovedNeonTarget.BranchId + '), banco ' + $script:ApprovedNeonTarget.Database + ', role ' + $script:ApprovedNeonTarget.Role + '.')
  $script:NeonHost = Normalize-NeonEndpointInput (Read-Host 'Informe somente o hostname DIRETO (sem URL, usuário, senha ou parâmetros) copiado dos detalhes desta branch')
  Test-EndpointHost $script:NeonHost
  Write-Host ('Endpoint selecionado: ' + $script:NeonHost)
  $hostAttestationPrompt = 'Digite exatamente HOST ' + $script:ApprovedNeonTarget.ProjectId + ' ' + $script:ApprovedNeonTarget.BranchId + ' para confirmar a associação desta branch'
  $hostAttestation = Read-Host $hostAttestationPrompt
  $null = Confirm-NeonEndpointAttestation $hostAttestation
  $defaultRootCert = Join-Path $env:APPDATA 'postgresql\root.crt'
  if (Test-Path -LiteralPath $defaultRootCert -PathType Leaf) { $script:NeonRootCert = [IO.Path]::GetFullPath($defaultRootCert) }
  else { $script:NeonRootCert = [IO.Path]::GetFullPath((Read-Host 'Informe o caminho do certificado raiz CA oficial usado para validar o certificado do Neon')) }
  Assert-NoReparsePoint $script:NeonRootCert 'AP-NEON-ROOT-CERT'
  if (-not (Test-Path -LiteralPath $script:NeonRootCert -PathType Leaf)) { Stop-Import 'AP-NEON-ROOT-CERT-MISSING' 'O certificado raiz informado não existe.' }
  Save-PgEnvironment
  $env:PGPASSFILE = ''
  $env:PGSSLMODE = 'verify-full'
  $env:PGSSLROOTCERT = $script:NeonRootCert
  $env:PGGSSENCMODE = 'disable'
  $env:PGCONNECT_TIMEOUT = '10'
  $env:PGCLIENTENCODING = 'UTF8'
  $env:PGAPPNAME = $script:ExecutionApplicationName
  $env:PGSERVICE = ''
  $env:PGSERVICEFILE = ''
  $env:PGHOSTADDR = ''
  $script:NeonPassword = ConvertFrom-SecurePassword (Read-Host 'Senha da role autorizada (entrada oculta)' -AsSecureString)
  if ([string]::IsNullOrWhiteSpace($script:NeonPassword)) { Stop-Import 'AP-NEON-PASSWORD-EMPTY' 'Nenhuma senha utilizável foi informada; nenhuma conexão foi iniciada.' }

  Set-Phase 'criacao de relatorio privado e credencial temporaria protegida'
  $script:PassFile = New-PrivatePassfile $script:NeonHost $script:NeonPassword
  $script:NeonPassword = $null
  $env:PGPASSFILE = $script:PassFile
  $env:PGSSLMODE = 'verify-full'
  $env:PGSSLROOTCERT = $script:NeonRootCert
  $env:PGGSSENCMODE = 'disable'
  $env:PGCONNECT_TIMEOUT = '10'
  $env:PGCLIENTENCODING = 'UTF8'
  $env:PGAPPNAME = $script:ExecutionApplicationName
  $env:PGSERVICE = ''
  $env:PGSERVICEFILE = ''
  $env:PGHOSTADDR = ''

  Set-Phase 'preflight somente leitura do destino Neon'
  $identity = Get-ConnectionIdentity $script:NeonHost
  if (-not [bool]$identity.client_tls_verified) { Stop-Import 'AP-NEON-TLS-NOT-VERIFIED' 'O cliente libpq não comprovou TLS e validação verify-full.' }
  Assert-Identity $identity 'amores_pet_homologacao_owner' $true ([long]$backup.Report.source_snapshot.database_bytes)
  $permissions = Get-OwnershipAssessment $script:NeonHost 5432 'amores_pet_homologacao_owner' 'amores_pet_homologacao' ''
  if (-not [bool]$permissions.database_owner -or -not [bool]$permissions.database_create -or -not [bool]$permissions.schema_public_usage -or
      -not [bool]$permissions.schema_public_create -or [bool]$permissions.is_superuser) {
    Stop-Import 'AP-NEON-ROLE-PERMISSIONS' 'A role não é owner elegível ou não possui as permissões mínimas de restauração.'
  }
  $script:Report.destination.permissions_validated = $true
  $script:Report.expected.source_database_bytes = [long]$backup.Report.source_snapshot.database_bytes
  $script:Report.expected.timezone_origin = 'America/Sao_Paulo'
  $script:Report.expected.timezone_destination = [string]$identity.timezone
  Write-ImportReport

  $confirmation = 'IMPORTAR square-boat-15573195 br-holy-sunset-b6ykrr20 amores_pet_homologacao 2aa1ca41dea59e0150f198c544b05b05419b346dd93fc89237721bccb4faf7e0'
  Write-Host ''
  Write-Host 'PREFLIGHT APROVADO — nenhuma escrita foi iniciada.' -ForegroundColor Green
  Write-Host 'Projeto: square-boat-15573195 (aws-sa-east-1)'
  Write-Host 'Branch: main / br-holy-sunset-b6ykrr20'
  Write-Host ('Endpoint direto TLS: ' + $script:NeonHost)
  Write-Host 'Banco: amores_pet_homologacao; role: amores_pet_homologacao_owner; PostgreSQL 17; destino vazio; sem sessões concorrentes.'
  Write-Host 'Snapshot esperado: 30 tabelas, 153 registros, 3 views, 97 índices, 24 sequences, 54 FKs, 7 triggers, 6 funções; migrations 035/036/037 já no backup.'
  Write-Host ('Backup aprovado: ' + [string]$script:Report.backup.approved_id + '; bytes=159721; SHA-256=' + [string]$script:Report.backup.sha256)
  Write-Host ('Para autorizar esta única escrita local, digite exatamente: ' + $confirmation) -ForegroundColor Yellow
  $script:Report.import.local_confirmation_presented = $true
  Write-ImportReport
  $typedConfirmation = Read-Host 'Confirmação literal'
  Confirm-ImportAuthorization $typedConfirmation $confirmation

  Set-Phase 'revalidacao final antes da unica operacao de escrita'
  $backupNow = Test-ApprovedBackup $script:PrivateRoot
  if ($backupNow.Report.backup.sha256 -cne $script:Report.backup.sha256) { Stop-Import 'AP-NEON-BACKUP-CHANGED' 'O backup mudou desde o preflight; nenhuma escrita foi iniciada.' }
  $identity = Get-ConnectionIdentity $script:NeonHost
  Assert-Identity $identity 'amores_pet_homologacao_owner' $true ([long]$backup.Report.source_snapshot.database_bytes)
  $permissions = Get-OwnershipAssessment $script:NeonHost 5432 'amores_pet_homologacao_owner' 'amores_pet_homologacao' ''
  if (-not [bool]$permissions.database_owner -or -not [bool]$permissions.database_create -or -not [bool]$permissions.schema_public_create -or [bool]$permissions.is_superuser) {
    Stop-Import 'AP-NEON-ROLE-PERMISSIONS-CHANGED' 'As permissões mudaram após a confirmação; importação cancelada.'
  }
  Set-Phase 'última consulta conjunta somente leitura antes de iniciar pg_restore'
  $finalIdentity = Get-ConnectionIdentity $script:NeonHost
  Assert-Identity $finalIdentity 'amores_pet_homologacao_owner' $true ([long]$backup.Report.source_snapshot.database_bytes)
  $script:Report.import.launch_armed = $true
  $script:Report.import.state = 'TENTATIVA_INICIADA'
  Write-ImportReport
  $restoreArgs = Get-ImportRestoreArguments $script:NeonHost 5432 'amores_pet_homologacao_owner' 'amores_pet_homologacao' $backup.Path
  $restoreResult = Invoke-AmoresPetNativeProcess -Executable $script:PgTools['pg_restore.exe'] -Arguments $restoreArgs
  if (-not $restoreResult.Started) {
    $script:Report.import.state = if ([string]$restoreResult.FailureSummary -like 'PROCESS_START*') { 'NAO_INICIADA' } else { 'INCONCLUSIVA' }
    Stop-Import ('AP-NEON-PG-RESTORE-START-' + [string]$restoreResult.FailureSummary) 'O processo de restauração não forneceu comprovação de início; não haverá nova tentativa automática.'
  }
  $script:PersistentProcessStarted = $true
  $script:Report.import.process_started = $true
  $script:Report.import.exit_code = [int]$restoreResult.ExitCode
  if ([int]$restoreResult.ExitCode -ne 0) {
    $script:Report.import.state = 'FALHA_COM_PROCESSO_INICIADO_SEM_REPETICAO'
    $script:Code = 'AP-NEON-PG-RESTORE-EXIT-' + [string]$restoreResult.ExitCode
    $script:Message = 'pg_restore iniciou e retornou erro; stderr foi omitido, nenhuma repetição será executada.'
    $script:Report.technical_code = $script:Code; $script:Report.error = $script:Message
    Write-ImportReport
    Stop-Import $script:Code $script:Message
  }

  Set-Phase 'validacao pos-importacao somente leitura'
  $postIdentity = Get-ConnectionIdentity $script:NeonHost
  if ([string]$postIdentity.database -cne 'amores_pet_homologacao' -or [string]$postIdentity.user -cne 'amores_pet_homologacao_owner' -or
      [int]$postIdentity.version_num -lt 170000 -or [int]$postIdentity.version_num -ge 180000 -or -not [bool]$postIdentity.client_tls_verified -or
      -not [bool]$postIdentity.client_tls_hostname_verified -or -not [bool]$postIdentity.client_tls_root_verified -or
      [string]$postIdentity.timezone -cne 'GMT' -or [string]$postIdentity.locale_provider -cne 'builtin' -or [string]$postIdentity.locale -cne 'C.UTF-8' -or
      [bool]$postIdentity.is_superuser -or [bool]$postIdentity.in_recovery) {
    Stop-Import 'AP-NEON-POST-IDENTITY' 'A identidade do banco após restauração não corresponde ao destino autorizado.'
  }
  $null = Compare-ImportedSnapshot -ExpectedMetadata $expected.Metadata -ExpectedData $expected.Data -ExpectedSequences $expected.Sequences `
    -ExpectedSequenceMetadata $expected.SequenceMetadata -ExpectedFunctionHash $expected.FunctionHash -ExpectedSchemaHash $expected.SchemaHash `
    -HostName $script:NeonHost -Port 5432 -UserName 'amores_pet_homologacao_owner' -Database 'amores_pet_homologacao' -RoleName ''
  $script:Report.import.post_validation = $true
  $script:Report.import.state = 'IMPORTADA_E_VALIDADA'
  $script:Code = 'AP-NEON-IMPORT-OK'
  $script:Message = 'O backup autorizado foi restaurado uma vez e passou na validação posterior real.'
  $script:Report.status = 'APROVADO'
  Write-ImportReport
  Write-Host ''
  Write-Host 'IMPORTACAO=CONFIRMADA_E_VALIDADA' -ForegroundColor Green
  Write-Host 'Estruturas, 153 registros, fingerprints, migrations 035/036/037, sequences, funções, triggers, FKs e owners conferidos.'
  Write-Host 'Banco local preservado; backend ainda não foi homologado no Neon; nenhum arquivo externo foi enviado.'
  Write-Host 'Relatório sanitizado disponível em %LOCALAPPDATA%\AmoresPet\Homologacao\neon-imports\<execucao>\relatorio-sanitizado.txt'
  }
} catch {
  $caughtError = $_
  $caughtException = Get-OptionalPropertyValue $caughtError 'Exception'
  $caughtMessage = [string](Get-OptionalPropertyValue $caughtException 'Message')
  if ($caughtMessage -cne 'AP-NEON-IMPORT-STOP') {
    $script:Code = 'AP-NEON-IMPORT-UNEXPECTED'
    $script:Message = 'Falha interna PowerShell; tipo, etapa e localização sanitizados foram registrados.'
    Set-InternalFailureDiagnostic $caughtError
  }
  if ($script:Report.import.launch_armed -and -not $script:Report.import.process_started -and [string]$script:Report.import.state -eq 'TENTATIVA_INICIADA') { $script:Report.import.state = 'INCONCLUSIVA' }
  if ($script:Report.status -ne 'APROVADO') { $script:Report.status = 'INTERROMPIDO' }
  $script:Report.technical_code = $script:Code
  if ($script:OperationDirectory) {
    try { Write-ImportReport } catch { }
  }
  Write-Host ''
  Write-Host ('IMPORTACAO=' + [string]$script:Report.import.state)
  Write-Host ('ETAPA=' + [string]$script:Phase)
  Write-Host ('CODIGO_TECNICO=' + [string]$script:Code)
  Write-Host ('CAUSA=' + [string]$script:Message)
  $internalFailureType = [string](Get-OptionalPropertyValue $script:Report 'internal_failure_type')
  if ($internalFailureType) {
    Write-Host ('FALHA_INTERNA=' + [string]$script:Report.internal_failure_class + '; TIPO=' + [string]$script:Report.internal_failure_type + '; HRESULT=' + [string]$script:Report.internal_failure_hresult +
      '; FUNCAO=' + [string]$script:Report.failure_function + '; COMANDO=' + [string]$script:Report.failure_command +
      '; ERROR_ID=' + [string]$script:Report.failure_error_id + '; LOCALIZACAO=' + [string]$script:Report.failure_location)
  }
  Write-Host ('PROCESSO_RESTORE_INICIADO=' + [string]$script:Report.import.process_started + '; EXIT=' + [string]$script:Report.import.exit_code)
  Write-Host ('CONFIRMACAO_LOCAL_APRESENTADA=' + [string]$script:Report.import.local_confirmation_presented + '; ACEITA=' + [string]$script:Report.import.local_confirmation_accepted)
  Write-Host ('SESSOES_STATUS=' + [string]$script:Report.destination.session_summary.status + '; TOTAL=' + [string]$script:Report.destination.session_summary.total_observed + '; EXECUCAO=' + [string]$script:Report.destination.session_summary.execution_sessions + '; OUTRAS_DA_EXECUCAO=' + [string]$script:Report.destination.session_summary.same_execution_other_sessions + '; CLIENTES_EXTERNOS=' + [string]$script:Report.destination.session_summary.external_client_sessions + '; BACKENDS_NAO_CLIENTE=' + [string]$script:Report.destination.session_summary.non_client_sessions + '; PASSIVOS=' + [string]$script:Report.destination.session_summary.irrelevant_internal_sessions + '; CONCORRENTES=' + [string]$script:Report.destination.session_summary.concurrent_sessions + '; MOTIVO=' + [string]$script:Report.destination.session_summary.block_reason)
  Write-Host ('SESSOES_EXTERNAS_NAO_DA_EXECUCAO=' + [string]$script:Report.destination.session_summary.external_sessions)
  Write-Host ('TIPOS_E_ESTADOS=' + (($script:Report.destination.session_summary.backend_groups | ForEach-Object { [string]$_.backend_type + '/' + [string]$_.state + '=' + [string]$_.count }) -join ','))
  Write-Host ('RELATORIO_SANITIZADO=%LOCALAPPDATA%\AmoresPet\Homologacao\neon-imports\<execucao>\relatorio-sanitizado.txt')
  Write-Host 'Nenhuma repetição, rollback ou limpeza do destino será executada automaticamente.'
} finally {
  try { Remove-PrivatePassfile } catch { }
  $script:NeonPassword = $null
  if ($script:SavedPgEnvironment.Count -gt 0) { try { Restore-PgEnvironment } catch { } }
}

if ($TestEndpointOnly) {
  if ($script:Report.status -ne 'APROVADO') { exit 1 }
  exit 0
}
elseif ($DiagnoseSessionsOnly) {
  Write-Host 'O relatório sanitizado permanece no diretório privado desta execução. Pressione Enter para fechar.'
  [void](Read-Host)
}
elseif (-not $SelfTestOnly) {
  Write-Host 'Pressione Enter para fechar esta janela; o relatório privado permanece disponível.'
  [void](Read-Host)
}
elseif ($script:Report.status -ne 'APROVADO') { exit 1 }
else { exit 0 }
