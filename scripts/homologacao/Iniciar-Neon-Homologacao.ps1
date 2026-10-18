param([switch]$SelfTestOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$privateRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao' } else { $null }
$localConfigPath = if ($privateRoot) { Join-Path $privateRoot 'config.json' } else { $null }
$neonConfigPath = if ($privateRoot) { Join-Path $privateRoot 'neon-runtime.json' } else { $null }
$aclModulePath = Join-Path $PSScriptRoot 'Acl-Privada.psm1'
$logsDirectory = if ($privateRoot) { Join-Path $privateRoot 'neon-logs' } else { $null }
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$backendProcess = $null
$localConfig = $null
$config = $null
$securePassword = $null
$secureJwt = $null
$securePepper = $null
$passwordPlain = $null
$jwtPlain = $null
$pepperPlain = $null
$nodePath = $null
$currentSid = $null
try { $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value } catch { }
$allowedSids = @('S-1-5-18', 'S-1-5-32-544')
if ($currentSid) { $allowedSids = @($currentSid) + $allowedSids }
$script:LauncherStage = 'Inicializacao'
$script:PrivateRootAclValidated = $false
$script:FailureReportName = $null
$script:LaunchProcessStarted = $false
$script:SecretsCleared = $false
$script:EnvironmentNamePattern = '^(DB_|PG|DATABASE_URL$|NODE_OPTIONS$|NODE_TLS_REJECT_UNAUTHORIZED$|NODE_EXTRA_CA_CERTS$|NODE_USE_SYSTEM_CA$|SSL_CERT_FILE$|SSL_CERT_DIR$|EMAIL_|SMTP_PROVIDER_|AWS_|WHATSAPP_|CRON_SECRET$|AMORES_PET_DATABASE_MODE$|AMORES_NEON_|JWT_SECRET$|CLIENTE_PUBLICO_PEPPER$|AMORES_EMAIL_DISABLED$|AMORES_NEON_READ_ONLY$|AMORES_NEON_SERVE_FRONTEND$|SERVIR_FRONTEND_LOCAL$|HOST$|PORT$|FRONTEND_URL$|FILE_STORAGE_MODE$)'

function Fail([string]$Message) { throw $Message }

function Set-LauncherStage([string]$Stage) {
  $script:LauncherStage = $Stage
}

function Get-PropertyValue($Object, [string]$Name) {
  if ($null -eq $Object) { return $null }
  try {
    if ($Object -is [System.Collections.IDictionary]) {
      if ($Object.Contains($Name)) { return $Object[$Name] }
      return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
  } catch { return $null }
}

function Get-NeonLauncherEnvironmentNamesToClear([System.Collections.IDictionary]$EnvironmentMap) {
  $names = New-Object 'System.Collections.Generic.List[string]'
  if ($null -eq $EnvironmentMap) { return $names.ToArray() }
  foreach ($key in $EnvironmentMap.Keys) {
    $environmentName = [string]$key
    if ($environmentName -match $script:EnvironmentNamePattern) { $names.Add($environmentName) }
  }
  return $names.ToArray()
}

function Clear-NeonLauncherEnvironment {
  $environmentMap = [Environment]::GetEnvironmentVariables([EnvironmentVariableTarget]::Process)
  $names = @(Get-NeonLauncherEnvironmentNamesToClear $environmentMap)
  foreach ($environmentName in $names) {
    try {
      [Environment]::SetEnvironmentVariable([string]$environmentName, $null, [EnvironmentVariableTarget]::Process)
    } catch {
      Fail 'Não foi possível limpar uma configuração herdada do processo; o backend não será iniciado.'
    }
  }
  return $names.Count
}

function Get-SafeLauncherErrorContext([object]$ErrorRecord) {
  $exception = Get-PropertyValue $ErrorRecord 'Exception'
  $invocation = Get-PropertyValue $ErrorRecord 'InvocationInfo'
  $command = Get-PropertyValue $invocation 'MyCommand'
  $errorId = [string](Get-PropertyValue $ErrorRecord 'FullyQualifiedErrorId')
  if ($errorId) { $errorId = ($errorId -split ',')[0] }
  if ($errorId -notmatch '^[A-Za-z0-9_.-]{1,96}$') { $errorId = 'UNCLASSIFIED' }
  $commandName = [string](Get-PropertyValue $command 'Name')
  if ($commandName -notmatch '^[A-Za-z0-9_.-]{1,96}$') { $commandName = $null }
  $line = 0
  $lineValue = Get-PropertyValue $invocation 'ScriptLineNumber'
  if (-not [int]::TryParse([string]$lineValue, [ref]$line) -or $line -lt 1 -or $line -gt 10000) { $line = 0 }
  $exceptionType = 'System.Exception'
  if ($null -ne $exception) {
    try {
      $candidateType = [string]$exception.GetType().FullName
      if ($candidateType -match '^[A-Za-z0-9_.+`\[\]]{1,160}$') { $exceptionType = $candidateType }
    } catch { }
  }
  return [pscustomobject]@{
    ErrorId = $errorId
    CommandName = $commandName
    ScriptLine = $line
    ExceptionType = $exceptionType
  }
}

function Get-NeonLauncherFailureSummary([object]$ErrorRecord) {
  $context = Get-SafeLauncherErrorContext $ErrorRecord
  if ($context.ErrorId -eq 'PropertyNotFoundStrict') {
    return [pscustomobject]@{
      Code = 'AP-NEON-LAUNCH-STRICT-PROPERTY'
      Description = 'O PowerShell tentou ler uma propriedade ausente; a inicialização foi interrompida antes da prontidão.'
      Context = $context
    }
  }
  if ($context.ErrorId -match 'UnauthorizedAccess|SecurityException' -or
      $context.ExceptionType -match 'UnauthorizedAccessException|SecurityException') {
    return [pscustomobject]@{
      Code = 'AP-NEON-LAUNCH-ACCESS'
      Description = 'O Windows negou acesso a um recurso local; nenhuma ACL foi alterada.'
      Context = $context
    }
  }
  if ($context.ExceptionType -match 'FileNotFoundException|DirectoryNotFoundException') {
    return [pscustomobject]@{
      Code = 'AP-NEON-LAUNCH-RESOURCE-MISSING'
      Description = 'Um arquivo ou diretório obrigatório não foi encontrado.'
      Context = $context
    }
  }
  return [pscustomobject]@{
    Code = 'AP-NEON-LAUNCH-UNEXPECTED'
    Description = 'O launcher encontrou uma falha interna; consulte o resumo local sanitizado.'
    Context = $context
  }
}

function Write-NeonLauncherFailureReport([object]$Summary) {
  if (-not $script:PrivateRootAclValidated -or -not (Test-Path -LiteralPath $privateRoot -PathType Container)) { return $null }
  $reportPath = Join-Path $privateRoot ('neon-launcher-failure-' + [guid]::NewGuid().ToString('N') + '.json')
  $report = [ordered]@{
    format = 'amores-pet-neon-launcher-diagnostic-v1'
    stage = [string]$script:LauncherStage
    technical_code = [string]$Summary.Code
    description = [string]$Summary.Description
    exception_type = [string]$Summary.Context.ExceptionType
    error_id = [string]$Summary.Context.ErrorId
    command = $Summary.Context.CommandName
    script = 'Iniciar-Neon-Homologacao.ps1'
    line = [int]$Summary.Context.ScriptLine
    backend_process_started = [bool]$script:LaunchProcessStarted
    private_configuration_acl_validated = [bool]$script:PrivateRootAclValidated
    credentials_or_error_text_included = $false
  }
  $stream = $null
  try {
    $stream = [IO.File]::Open($reportPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    $stream.Dispose(); $stream = $null
    Assert-PrivatePath $reportPath
    $json = ConvertTo-Json -InputObject $report -Depth 5
    [IO.File]::WriteAllText($reportPath, $json + "`n", (New-Object Text.UTF8Encoding($false)))
    Assert-PrivatePath $reportPath
    $script:FailureReportName = [IO.Path]::GetFileName($reportPath)
    return $reportPath
  } catch {
    if ($stream) { try { $stream.Dispose() } catch { } }
    return $null
  }
}

function Test-NeonLauncherSupport {
  $tests = 0
  Import-Module -Name $aclModulePath -Force -ErrorAction Stop
  foreach ($functionName in @('ConvertTo-AmoresPetSid','Get-AmoresPetPrivateAclSnapshot','Test-AmoresPetPrivateAclSnapshot','Test-AmoresPetPrivateAcl')) {
    if (-not (Get-Command -Name $functionName -CommandType Function -ErrorAction SilentlyContinue)) {
      throw 'Self-test nao resolveu todas as funcoes exportadas pelo modulo de ACL.'
    }
  }
  $tests++
  $environmentCases = @(
    @{ Map = @{}; Expected = @() },
    @{ Map = @{ DATABASE_URL = 'sensitive-fixture'; PATH = 'keep-fixture'; PGHOST = 'sensitive-fixture' }; Expected = @('DATABASE_URL','PGHOST') },
    @{ Map = @{ LOCALAPPDATA = 'keep-fixture'; HOST = 'fixture'; PORT = '3002'; JWT_SECRET = 'sensitive-fixture' }; Expected = @('HOST','PORT','JWT_SECRET') }
  )
  foreach ($case in $environmentCases) {
    $actual = @(Get-NeonLauncherEnvironmentNamesToClear $case.Map | Sort-Object)
    $expected = @($case.Expected | Sort-Object)
    if (($actual -join '|') -cne ($expected -join '|')) { throw 'Self-test falhou na seleção de nomes de ambiente.' }
    $tests++
  }
  $legacyAccessError = $null
  try {
    $emptyEnvironmentRecords = @()
    $emptyFilteredRecords = @($emptyEnvironmentRecords | Where-Object { $_.Name -match $script:EnvironmentNamePattern })
    $null = $emptyFilteredRecords.Name
  } catch { $legacyAccessError = $_ }
  if ((Get-PropertyValue $legacyAccessError 'FullyQualifiedErrorId') -notmatch '^PropertyNotFoundStrict') {
    throw 'Self-test nao reproduziu a falha Name do codigo anterior em uma colecao vazia.'
  }
  $emptyCorrectedNames = @(Get-NeonLauncherEnvironmentNamesToClear -EnvironmentMap @{})
  if ($emptyCorrectedNames.Count -ne 0) {
    throw 'Self-test falhou: a limpeza corrigida nao aceitou o ambiente sem chaves correspondentes.'
  }
  $tests++
  $processEnvironment = [Environment]::GetEnvironmentVariables([EnvironmentVariableTarget]::Process)
  $actualProcessNames = @(Get-NeonLauncherEnvironmentNamesToClear $processEnvironment)
  foreach ($environmentName in $actualProcessNames) {
    if ($environmentName -notmatch $script:EnvironmentNamePattern) { throw 'Self-test retornou uma chave de ambiente fora da allowlist de limpeza.' }
  }
  if (([Environment]::GetEnvironmentVariables([EnvironmentVariableTarget]::Process).Count) -ne $processEnvironment.Count) {
    throw 'Self-test alterou o ambiente do processo.'
  }
  $tests++
  if ($null -ne (Get-PropertyValue ([pscustomobject]@{}) 'Name')) { throw 'Self-test falhou para propriedade ausente.' }
  if ((Get-PropertyValue @{ Other = 'fixture' } 'Name') -ne $null) { throw 'Self-test falhou para chave inexistente.' }
  if ((Get-PropertyValue @{ Name = 'present' } 'Name') -cne 'present') { throw 'Self-test falhou para dicionário.' }
  if ((Get-PropertyValue ([pscustomobject]@{ Name = 'present' }) 'Name') -cne 'present') { throw 'Self-test falhou para objeto JSON.' }
  $tests += 4

  $strictError = $null
  try { $missing = [pscustomobject]@{}; $null = $missing.Name } catch { $strictError = $_ }
  $strictSummary = Get-NeonLauncherFailureSummary $strictError
  if ($strictSummary.Code -cne 'AP-NEON-LAUNCH-STRICT-PROPERTY' -or
      $strictSummary.Context.ErrorId -cne 'PropertyNotFoundStrict') { throw 'Self-test não classificou a exceção PropertyNotFoundStrict reproduzida.' }
  $tests++

  $sparseRecord = [pscustomobject]@{
    Exception = [Exception]::new('synthetic-sensitive-message')
    FullyQualifiedErrorId = 'Synthetic.NoOptionalMetadata'
    InvocationInfo = [pscustomobject]@{ MyCommand = [pscustomobject]@{} }
  }
  $sparseContext = Get-SafeLauncherErrorContext $sparseRecord
  if ($sparseContext.CommandName -or $sparseContext.ScriptLine -ne 0 -or
      ($sparseContext | ConvertTo-Json -Compress) -match 'synthetic-sensitive-message') {
    throw 'Self-test falhou no tratamento de metadados opcionais ou incluiu texto da exceção.'
  }
  $emptyRecord = [pscustomobject]@{ Exception = [Exception]::new('synthetic-sensitive-message'); FullyQualifiedErrorId = 'Synthetic.NoInvocationInfo' }
  $emptyContext = Get-SafeLauncherErrorContext $emptyRecord
  if ($emptyContext.CommandName -or $emptyContext.ScriptLine -ne 0) { throw 'Self-test falhou para InvocationInfo ausente.' }
  $tests += 2
  Set-ProcessEnvironment 'PGPASSWORD' 'synthetic-never-real'
  Set-ProcessEnvironment 'AMORES_PET_DATABASE_MODE' 'SELFTEST_ONLY'
  $null = Clear-NeonLauncherEnvironment
  $clearedEnvironment = [Environment]::GetEnvironmentVariables([EnvironmentVariableTarget]::Process)
  if ($clearedEnvironment.Contains('PGPASSWORD') -or $clearedEnvironment.Contains('AMORES_PET_DATABASE_MODE')) {
    throw 'Self-test falhou ao limpar variaveis sinteticas do processo.'
  }
  if (-not $clearedEnvironment.Contains('PATH')) { throw 'Self-test removeu PATH do processo.' }
  $tests++
  return $tests
}

function Assert-PrivatePath([string]$Path, [switch]$RequireProtected) {
  if (-not (Test-Path -LiteralPath $Path)) { Fail 'Um recurso privado obrigatório está ausente.' }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Fail 'Um recurso privado é link/junction; inicialização recusada.' }
  $aclResult = Test-AmoresPetPrivateAcl -Path $Path -CurrentSid $currentSid `
    -OwnerAllowedSids $allowedSids -AccessAllowedSids $allowedSids `
    -RequireProtected:$RequireProtected -AllowAdministrators
  if (-not $aclResult.Success) { Fail ("ACL privada recusada ({0})." -f $aclResult.TechnicalCode) }
}

function Get-PlainText([Security.SecureString]$SecureValue) {
  $pointer = [IntPtr]::Zero
  try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  }
}

function New-RandomSecret([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

function Assert-PrivateDpapiAvailable {
  $probe = $null; $restored = $null; $pointer = [IntPtr]::Zero
  try {
    $probe = ConvertTo-SecureString 'synthetic-dpapi-probe' -AsPlainText -Force
    $protected = ConvertFrom-SecureString $probe
    $restored = ConvertTo-SecureString $protected
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($restored)
    if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) -cne 'synthetic-dpapi-probe') {
      Fail 'A proteção privada DPAPI não passou na verificação local.'
    }
  } catch {
    Fail 'A proteção DPAPI desta conta Windows não está disponível; nenhum segredo será solicitado ou gravado.'
  } finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($probe) { $probe.Dispose() }
    if ($restored) { $restored.Dispose() }
  }
}

function New-PrivateNeonConfig($LocalConfig) {
  $localApp = Get-PropertyValue $LocalConfig 'app'
  $pepper = [string](Get-PropertyValue $localApp 'clientePublicoPepper')
  if ([Text.Encoding]::UTF8.GetByteCount($pepper) -lt 32) { Fail 'O pepper persistente da homologação local não está disponível.' }
  Set-LauncherStage 'Autoteste DPAPI da conta Windows'
  Assert-PrivateDpapiAvailable

  Set-LauncherStage 'Confirmacao local do destino Neon'
  Write-Host ''
  Write-Host 'Destino fixo: Neon / projeto square-boat-15573195 / branch br-holy-sunset-b6ykrr20.'
  Write-Host 'Banco: amores_pet_homologacao; endpoint direto; role: amores_pet_homologacao_owner.'
  Write-Host 'A senha será protegida pelo DPAPI desta conta Windows; nenhum valor será exibido.'
  $confirmation = Read-Host 'Digite CONFIGURAR NEON SOMENTE LEITURA para preparar a configuração privada'
  if ($confirmation -cne 'CONFIGURAR NEON SOMENTE LEITURA') { Fail 'Preparação local cancelada; nenhum segredo foi gravado.' }
  $neonPassword = $null
  $jwtSecure = $null
  $pepperSecure = $null
  $jwtPlain = $null
  $stream = $null
  $contentWritten = $false
  try {
    Set-LauncherStage 'Entrada oculta da credencial Neon'
    $neonPassword = Read-Host 'Senha local da role Neon (entrada oculta)' -AsSecureString
    if ($null -eq $neonPassword -or $neonPassword.Length -lt 1) { Fail 'A senha Neon nao foi informada.' }

    $jwtPlain = New-RandomSecret 48
    $jwtSecure = ConvertTo-SecureString $jwtPlain -AsPlainText -Force
    $pepperSecure = ConvertTo-SecureString $pepper -AsPlainText -Force
    $record = [ordered]@{
      version = 1
      projectId = 'square-boat-15573195'
      branchId = 'br-holy-sunset-b6ykrr20'
      host = 'ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech'
      port = 5432
      database = 'amores_pet_homologacao'
      user = 'amores_pet_homologacao_owner'
      passwordProtected = ConvertFrom-SecureString $neonPassword
      jwtSecretProtected = ConvertFrom-SecureString $jwtSecure
      clientePublicoPepperProtected = ConvertFrom-SecureString $pepperSecure
    }

    Set-LauncherStage 'Gravacao privada DPAPI e validacao ACL'
    $stream = [IO.File]::Open($neonConfigPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Dispose(); $stream = $null
    Assert-PrivatePath $neonConfigPath
    $json = ConvertTo-Json -InputObject $record -Depth 8
    [IO.File]::WriteAllText($neonConfigPath, $json + "`n", (New-Object Text.UTF8Encoding($false)))
    $contentWritten = $true
    Assert-PrivatePath $neonConfigPath
    return ($json | ConvertFrom-Json)
  } catch {
    if ($stream) { try { $stream.Dispose() } catch { } }
    if (-not $contentWritten -and (Test-Path -LiteralPath $neonConfigPath -PathType Leaf)) {
      try { Remove-Item -LiteralPath $neonConfigPath -Force -ErrorAction Stop } catch { }
    }
    throw
  } finally {
    $jwtPlain = $null; $pepper = $null
    if ($neonPassword) { try { $neonPassword.Dispose() } catch { } }
    if ($jwtSecure) { try { $jwtSecure.Dispose() } catch { } }
    if ($pepperSecure) { try { $pepperSecure.Dispose() } catch { } }
  }
}

function Set-ProcessEnvironment([string]$Name, [string]$Value) {
  Set-Item -Path ("Env:{0}" -f $Name) -Value $Value
}

$script:logOut = $null
$script:logErr = $null
if ($SelfTestOnly) {
  try {
    $selfTestCount = Test-NeonLauncherSupport
    Write-Output ('LAUNCHER_SELF_TEST=APROVADO; TESTES=' + [string]$selfTestCount + '; REDE=NAO_USADA; ARQUIVOS_PRIVADOS=NAO_ACESSADOS; BANCO=NAO_CONSULTADO')
    exit 0
  } catch {
    $selfTestSummary = Get-NeonLauncherFailureSummary $_
    Write-Output ('LAUNCHER_SELF_TEST=FALHOU; CODIGO=' + [string]$selfTestSummary.Code + '; ERRO=' + [string]$selfTestSummary.Context.ErrorId)
    exit 1
  }
}

try {
  Set-LauncherStage 'Inicializacao do Windows PowerShell'
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -lt 1) { Fail 'Este launcher requer Windows PowerShell 5.1.' }
  if (-not $env:LOCALAPPDATA -or -not $nodeCommand) { Fail 'LOCALAPPDATA ou Node.js não está disponível.' }
  if (-not (Test-Path -LiteralPath $aclModulePath -PathType Leaf)) { Fail 'Módulo de ACL privada não encontrado no projeto.' }
  Set-LauncherStage 'Importacao do modulo de ACL'
  Import-Module $aclModulePath -Force
  if (-not (Test-Path -LiteralPath $privateRoot -PathType Container)) { Fail 'A raiz privada da homologação local não existe; execute primeiro o inicializador oficial local.' }
  Set-LauncherStage 'Validacao da raiz privada'
  Assert-PrivatePath $privateRoot -RequireProtected
  $script:PrivateRootAclValidated = $true
  if (-not (Test-Path -LiteralPath $localConfigPath -PathType Leaf)) { Fail 'A configuração privada local necessária para recuperar o pepper não existe.' }
  Set-LauncherStage 'Validacao da configuracao privada local'
  Assert-PrivatePath $localConfigPath
  Set-LauncherStage 'Leitura da configuracao privada local'
  $localConfig = Get-Content -LiteralPath $localConfigPath -Raw | ConvertFrom-Json

  Set-LauncherStage 'Recuperacao ou criacao da configuracao Neon protegida por DPAPI'
  if (Test-Path -LiteralPath $neonConfigPath -PathType Leaf) {
    Assert-PrivatePath $neonConfigPath
    $config = Get-Content -LiteralPath $neonConfigPath -Raw | ConvertFrom-Json
  } else {
    $config = New-PrivateNeonConfig $localConfig
  }
  $localConfig = $null
  Set-LauncherStage 'Validacao da identidade fixa do destino Neon'
  $targetValid = [int](Get-PropertyValue $config 'version') -eq 1 -and
    (Get-PropertyValue $config 'projectId') -ceq 'square-boat-15573195' -and
    (Get-PropertyValue $config 'branchId') -ceq 'br-holy-sunset-b6ykrr20' -and
    (Get-PropertyValue $config 'host') -ceq 'ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech' -and
    [int](Get-PropertyValue $config 'port') -eq 5432 -and
    (Get-PropertyValue $config 'database') -ceq 'amores_pet_homologacao' -and
    (Get-PropertyValue $config 'user') -ceq 'amores_pet_homologacao_owner'
  if (-not $targetValid) {
    Fail 'A configuração privada não corresponde ao destino Neon autorizado.'
  }
  $buildReady = (Test-Path -LiteralPath (Join-Path $repo 'frontend\dist\index.html') -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $repo 'backend\node_modules\pg') -PathType Container)
  Set-LauncherStage 'Validacao do build frontend e dependencia PostgreSQL'
  if (-not $buildReady) {
    Fail 'Build do frontend ou dependências do backend estão ausentes; prepare o projeto antes de iniciar.'
  }

  Set-LauncherStage 'Descriptografia local DPAPI e validacao dos segredos em memoria'
  $securePassword = ConvertTo-SecureString ([string](Get-PropertyValue $config 'passwordProtected'))
  $secureJwt = ConvertTo-SecureString ([string](Get-PropertyValue $config 'jwtSecretProtected'))
  $securePepper = ConvertTo-SecureString ([string](Get-PropertyValue $config 'clientePublicoPepperProtected'))
  $passwordPlain = Get-PlainText $securePassword
  $jwtPlain = Get-PlainText $secureJwt
  $pepperPlain = Get-PlainText $securePepper
  $secretsValid = -not [string]::IsNullOrWhiteSpace($passwordPlain) -and
    [Text.Encoding]::UTF8.GetByteCount($jwtPlain) -ge 32 -and
    [Text.Encoding]::UTF8.GetByteCount($pepperPlain) -ge 32
  if (-not $secretsValid) { Fail 'Segredos privados locais ausentes ou inválidos.' }

  Set-LauncherStage 'Verificacao da porta local 3002'
  $busy = @(Get-NetTCPConnection -State Listen -LocalPort 3002 -ErrorAction SilentlyContinue)
  if ($busy.Count -gt 0) { Fail 'A porta local 3002 já está ocupada; nenhum processo existente foi alterado.' }
  if (-not (Test-Path -LiteralPath $logsDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $logsDirectory | Out-Null
  }
  Set-LauncherStage 'Validacao e criacao dos logs privados'
  Assert-PrivatePath $logsDirectory
  $runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N')
  $script:logOut = Join-Path $logsDirectory ("backend-{0}.log" -f $runId)
  $script:logErr = Join-Path $logsDirectory ("backend-error-{0}.log" -f $runId)
  foreach ($logPath in @($script:logOut, $script:logErr)) {
    $logStream = [IO.File]::Open($logPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    $logStream.Dispose()
    Assert-PrivatePath $logPath
  }

  # Não herda .env, configuração local de PostgreSQL, SMTP, S3 nem URLs de banco.
  Set-LauncherStage 'Limpeza de configuracao herdada do processo'
  $null = Clear-NeonLauncherEnvironment

  Set-LauncherStage 'Configuracao somente leitura do processo backend'
  Set-ProcessEnvironment 'AMORES_PET_DATABASE_MODE' 'NEON_HOMOLOGACAO'
  Set-ProcessEnvironment 'AMORES_NEON_PROJECT_ID' ([string](Get-PropertyValue $config 'projectId'))
  Set-ProcessEnvironment 'AMORES_NEON_BRANCH_ID' ([string](Get-PropertyValue $config 'branchId'))
  Set-ProcessEnvironment 'AMORES_NEON_HOST' ([string](Get-PropertyValue $config 'host'))
  Set-ProcessEnvironment 'AMORES_NEON_PORT' ([string](Get-PropertyValue $config 'port'))
  Set-ProcessEnvironment 'AMORES_NEON_DATABASE' ([string](Get-PropertyValue $config 'database'))
  Set-ProcessEnvironment 'AMORES_NEON_USER' ([string](Get-PropertyValue $config 'user'))
  Set-ProcessEnvironment 'AMORES_NEON_PASSWORD' $passwordPlain
  Set-ProcessEnvironment 'AMORES_NEON_READ_ONLY' '1'
  Set-ProcessEnvironment 'AMORES_NEON_TLS_POLICY' 'verify-full'
  Set-ProcessEnvironment 'AMORES_NEON_SERVE_FRONTEND' '1'
  Set-ProcessEnvironment 'AMORES_EMAIL_DISABLED' '1'
  Set-ProcessEnvironment 'HOST' '127.0.0.1'
  Set-ProcessEnvironment 'PORT' '3002'
  Set-ProcessEnvironment 'SERVIR_FRONTEND_LOCAL' '1'
  Set-ProcessEnvironment 'FRONTEND_URL' 'http://127.0.0.1:3002'
  Set-ProcessEnvironment 'JWT_SECRET' $jwtPlain
  Set-ProcessEnvironment 'CLIENTE_PUBLICO_PEPPER' $pepperPlain
  Set-ProcessEnvironment 'FILE_STORAGE_MODE' 'local'

  $nodePath = [string](Get-PropertyValue $nodeCommand 'Source')
  if ([string]::IsNullOrWhiteSpace($nodePath) -or -not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    Fail 'O executavel Node.js nao possui um caminho valido; o backend nao foi iniciado.'
  }
  Set-LauncherStage 'Inicio do backend temporario local'
  $backendProcess = Start-Process -FilePath $nodePath -ArgumentList 'server.js' `
    -WorkingDirectory (Join-Path $repo 'backend') -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $script:logOut -RedirectStandardError $script:logErr
  if ($null -eq $backendProcess) { Fail 'O processo backend nao retornou identidade verificavel.' }
  $script:LaunchProcessStarted = $true
  $ready = $false
  Set-LauncherStage 'Readiness do backend, TLS e identidade Neon somente leitura'
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($backendProcess.HasExited) { break }
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3002/health/ready' -TimeoutSec 2
      if ((Get-PropertyValue $health 'status') -eq 'ready') { $ready = $true; break }
    } catch { }
  }
  if (-not $ready) { Fail 'Preflight Neon não confirmou TLS, identidade, schema e readiness; o backend deste launcher será encerrado. Consulte os logs privados desta execução.' }

  Set-LauncherStage 'Validacao da identidade do processo backend'
  $actualProcess = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $backendProcess.Id) -ErrorAction SilentlyContinue
  $ownedProcess = $actualProcess -and
    [IO.Path]::GetFullPath([string]$actualProcess.ExecutablePath) -eq [IO.Path]::GetFullPath($nodePath) -and
    $actualProcess.CommandLine -match '(?i)(^|\s)server\.js(?:\s|$)'
  if (-not $ownedProcess) {
    Fail 'Identidade do backend iniciado não foi comprovada; o processo não será encerrado automaticamente.'
  }

  $passwordPlain = $null; $jwtPlain = $null; $pepperPlain = $null
  $securePassword.Dispose(); $secureJwt.Dispose(); $securePepper.Dispose()
  $script:SecretsCleared = $true
  Write-Host ''
  Write-Host 'NEON_HOMOLOGACAO ativo em http://127.0.0.1:3002'
  Write-Host 'Readiness aprovada; TLS e hostname validados pelo cliente PostgreSQL.'
  Write-Host 'Modo somente leitura: gravações, login que registra auditoria e SMTP estão bloqueados.'
  Write-Host ("Logs locais desta execução (ACL validada): {0}" -f $logsDirectory)
  Set-LauncherStage 'Aplicacao local aberta; aguardando encerramento solicitado'
  Start-Process 'http://127.0.0.1:3002/'
  [void](Read-Host 'Pressione Enter para encerrar somente esta sessão Neon')
} catch {
  $caughtError = $_
  try { $summary = Get-NeonLauncherFailureSummary $caughtError } catch {
    $summary = [pscustomobject]@{
      Code = 'AP-NEON-LAUNCH-DIAGNOSTIC-FAILED'
      Description = 'Ocorreu uma falha no proprio diagnostico; nenhum detalhe privado foi exibido.'
      Context = [pscustomobject]@{ ScriptLine = 0; ExceptionType = 'System.Exception'; ErrorId = 'DIAGNOSTIC_FAILED'; CommandName = $null }
    }
  }
  $reportPath = Write-NeonLauncherFailureReport $summary
  $where = if ($summary.Context.ScriptLine -gt 0) { 'Linha ' + [string]$summary.Context.ScriptLine } else { 'localização não disponível' }
  $report = if ($reportPath) { [IO.Path]::GetFileName($reportPath) } else { 'relatório privado indisponível; nenhuma ACL foi alterada' }
  $safeMessage = 'Etapa: ' + [string]$script:LauncherStage + "`r`n" +
    'Código: ' + [string]$summary.Code + "`r`n" +
    'Causa: ' + [string]$summary.Description + "`r`n" +
    'Localização: Iniciar-Neon-Homologacao.ps1 / ' + $where + "`r`n" +
    'Processo backend iniciado: ' + [string]$script:LaunchProcessStarted + "`r`n" +
    'Relatório sanitizado: ' + [string]$report
  try { Write-Host $safeMessage } catch { }
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($safeMessage, 'Amores Pet - Homologação Neon', 'OK', 'Warning')
  } catch { }
  try { [void](Read-Host 'Pressione Enter para fechar esta janela de diagnóstico') } catch { }
} finally {
  Set-LauncherStage 'Encerramento seguro do backend e limpeza de segredos em memoria'
  if ($backendProcess) {
    try {
      if (-not $backendProcess.HasExited) {
        $check = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $backendProcess.Id) -ErrorAction SilentlyContinue
        $nodePathForStop = [string](Get-PropertyValue $nodeCommand 'Source')
        $ownedProcess = $check -and $nodePathForStop -and
          [IO.Path]::GetFullPath([string]$check.ExecutablePath) -eq [IO.Path]::GetFullPath($nodePathForStop) -and
          [string]$check.CommandLine -match '(?i)(^|\s)server\.js(?:\s|$)'
        if ($ownedProcess) { Stop-Process -Id $backendProcess.Id -ErrorAction Stop }
      }
    } catch { }
  }
  if ($securePassword) { try { $securePassword.Dispose() } catch { } }
  if ($secureJwt) { try { $secureJwt.Dispose() } catch { } }
  if ($securePepper) { try { $securePepper.Dispose() } catch { } }
  $passwordPlain = $null; $jwtPlain = $null; $pepperPlain = $null
  try { $null = Clear-NeonLauncherEnvironment } catch { }
}
