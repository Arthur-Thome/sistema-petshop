Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Passed = 0
$script:Failed = 0
$scriptRoot = $PSScriptRoot
$provisionerPath = Join-Path $scriptRoot 'Criar-Super-Administrador-Lote2.ps1'
$aclModulePath = Join-Path $scriptRoot 'Acl-Privada.psm1'
$vbsPath = Join-Path $scriptRoot 'Criar-Super-Administrador-Lote2.vbs'
$databaseHelperPath = Join-Path $scriptRoot '..\..\backend\src\database\criarSuperAdministradorHomologacao.cjs'

function Assert-Pass([string]$Name, [scriptblock]$Action) {
  try {
    & $Action
    $script:Passed++
    Write-Output "PROVISIONER_TEST_PASS=$Name"
  } catch {
    $script:Failed++
    Write-Output "PROVISIONER_TEST_FAIL=$Name"
    throw
  }
}

function New-AclRule([string]$Sid, [string]$Type = 'Allow', [bool]$Inherited = $false) {
  [pscustomobject]@{
    IdentityReference = $Sid
    AccessControlType = $Type
    IsInherited = $Inherited
  }
}

$script:AclModule = $null
Assert-Pass 'PowerShell 5.1 loads ACL module from PSScriptRoot and exports required functions' {
  $script:AclModule = Import-Module -Name $aclModulePath -Force -PassThru -ErrorAction Stop
  foreach ($name in @('ConvertTo-AmoresPetSid','Get-AmoresPetPrivateAclSnapshot','Test-AmoresPetPrivateAclSnapshot','Test-AmoresPetPrivateAcl')) {
    if (-not $script:AclModule.ExportedFunctions.ContainsKey($name)) { throw "Missing module export: $name" }
    $command = Get-Command -Name $name -CommandType Function -ErrorAction Stop
    if ($command.ModuleName -ne $script:AclModule.Name) { throw "Function resolved from unexpected module: $name" }
  }
}

Assert-Pass 'all provisioner-local functions are defined and ACL dependencies resolve' {
  $tokens = $null
  $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($provisionerPath, [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count) { throw 'The provisioner contains PowerShell parse errors.' }
  $defined = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true) |
    ForEach-Object { $_.Name })
  foreach ($name in @('Write-PrivateResult','Stop-Local','Assert-PrivateResource','Test-NoReparsePoint','Get-RequiredValue',
      'Assert-PostgresIdentity','Quote-Argument','Invoke-Provisioner')) {
    if ($name -notin $defined) { throw "Undefined local helper: $name" }
  }
  foreach ($name in @('Get-AmoresPetPrivateAclSnapshot','Test-AmoresPetPrivateAclSnapshot')) {
    $command = Get-Command -Name $name -CommandType Function -ErrorAction Stop
    if ($command.ModuleName -ne $script:AclModule.Name) { throw "ACL helper did not resolve from imported module: $name" }
  }
}

Assert-Pass 'real filesystem ACL snapshot is readable without changing ACLs' {
  $snapshot = Get-AmoresPetPrivateAclSnapshot -Path $provisionerPath
  if (-not $snapshot.Exists -or $snapshot.TargetReadFailed -or $snapshot.PathCheckFailed) {
    throw 'Could not read the provisioner file ACL snapshot.'
  }
}

$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$systemSid = 'S-1-5-18'
$ownerAllowed = @($currentSid, $systemSid)
$accessAllowed = @($currentSid, $systemSid)

Assert-Pass 'explicit private ACL with owner and SYSTEM is accepted' {
  $mockAcl = [pscustomobject]@{
    AreAccessRulesProtected = $true
    Owner = $currentSid
    Access = @((New-AclRule $currentSid), (New-AclRule $systemSid))
  }
  $snapshot = Get-AmoresPetPrivateAclSnapshot -Path 'C:\synthetic\config.json' `
    -PathReader { param($path) $true } -AclReader { param($path) $mockAcl }
  $result = Test-AmoresPetPrivateAclSnapshot -Snapshot $snapshot -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed
  if (-not $result.Success) { throw "Valid private ACL rejected: $($result.TechnicalCode)" }
}

Assert-Pass 'inherited ACL is accepted only with a protected ancestor' {
  $script:aclReadIndex = 0
  $aclReader = {
    param($path)
    $script:aclReadIndex++
    $protected = $script:aclReadIndex -eq 3
    [pscustomobject]@{
      AreAccessRulesProtected = $protected
      Owner = $currentSid
      Access = @((New-AclRule $currentSid -Inherited $true), (New-AclRule $systemSid -Inherited $true))
    }
  }.GetNewClosure()
  $snapshot = Get-AmoresPetPrivateAclSnapshot -Path 'C:\synthetic\one\two\postmaster.pid' `
    -PathReader { param($path) $true } -AclReader $aclReader
  $result = Test-AmoresPetPrivateAclSnapshot -Snapshot $snapshot -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed
  if (-not $result.Success -or -not $result.ProtectedAncestorFound) { throw "Protected ancestor not accepted: $($result.TechnicalCode)" }
}

Assert-Pass 'Users permission remains rejected' {
  $snapshot = [pscustomobject]@{
    Exists = $true; PathCheckFailed = $false; TargetReadFailed = $false; ParentPathCheckFailed = $false
    ParentMissing = $false; ParentReadFailed = $false; TargetProtected = $true; OwnerIdentity = $currentSid
    AccessRules = @((New-AclRule $currentSid), (New-AclRule $systemSid), (New-AclRule 'S-1-5-32-545'))
    ParentChain = @(); ProtectedAncestorFound = $false
  }
  $result = Test-AmoresPetPrivateAclSnapshot -Snapshot $snapshot -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed
  if ($result.Success -or $result.TechnicalCode -ne 'AP-DIAG-ACL-UNAUTHORIZED-RULE') { throw 'Users ACE was not rejected.' }
}

Assert-Pass 'incorrect owner is rejected' {
  $snapshot = [pscustomobject]@{
    Exists = $true; PathCheckFailed = $false; TargetReadFailed = $false; ParentPathCheckFailed = $false
    ParentMissing = $false; ParentReadFailed = $false; TargetProtected = $true; OwnerIdentity = 'S-1-5-32-545'
    AccessRules = @((New-AclRule $currentSid)); ParentChain = @(); ProtectedAncestorFound = $false
  }
  $result = Test-AmoresPetPrivateAclSnapshot -Snapshot $snapshot -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed
  if ($result.Success -or $result.TechnicalCode -ne 'AP-DIAG-ACL-OWNER-UNAUTHORIZED') { throw 'Unauthorized owner was not rejected.' }
}

Assert-Pass 'ACL query failure and missing resource stay blocked' {
  $readFailure = Get-AmoresPetPrivateAclSnapshot -Path 'C:\synthetic\config.json' `
    -PathReader { param($path) $true } -AclReader { param($path) throw 'synthetic read failure' }
  $failedResult = Test-AmoresPetPrivateAclSnapshot -Snapshot $readFailure -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed
  if ($failedResult.TechnicalCode -ne 'AP-DIAG-ACL-READ-FAILED') { throw 'ACL query failure did not remain blocked.' }

  $missing = Get-AmoresPetPrivateAclSnapshot -Path 'C:\synthetic\missing.json' -PathReader { param($path) $false }
  $missingResult = Test-AmoresPetPrivateAclSnapshot -Snapshot $missing -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed
  if ($missingResult.TechnicalCode -ne 'AP-DIAG-ACL-RESOURCE-MISSING') { throw 'Missing resource did not remain blocked.' }
}

Assert-Pass 'VBS launcher points to colocated PowerShell script and keeps synchronous visible launch' {
  $vbs = Get-Content -LiteralPath $vbsPath -Raw
  if ($vbs -notmatch 'GetParentFolderName\(WScript\.ScriptFullName\).*Criar-Super-Administrador-Lote2\.ps1' -or
      $vbs -notmatch 'shell\.Run command, 1, True' -or $vbs -notmatch 'ExecutionPolicy RemoteSigned' -or
      $vbs -match 'ExecutionPolicy Bypass') {
    throw 'The VBS launcher path or visible wait behavior diverged.'
  }
}

Assert-Pass 'read-only preflight precedes local confirmation and password uses hidden prompts' {
  $source = Get-Content -LiteralPath $provisionerPath -Raw
  $preflightIndex = $source.IndexOf('$script:Stage = ''PREFLIGHT_SQL_SOMENTE_LEITURA''')
  $confirmationIndex = $source.IndexOf("Read-Host 'Para autorizar")
  $passwordPromptIndex = $source.IndexOf("Read-Host 'Defina a senha da nova conta (entrada oculta)' -AsSecureString")
  $confirmPromptIndex = $source.IndexOf("Read-Host 'Confirme a senha da nova conta (entrada oculta)' -AsSecureString")
  if ($preflightIndex -lt 0 -or $confirmationIndex -lt 0 -or $passwordPromptIndex -lt $confirmationIndex -or
      $confirmPromptIndex -lt $passwordPromptIndex) {
    throw 'The preflight, explicit confirmation, or hidden password prompt is missing or out of order.'
  }
  if ($source -match '(?im)^\s*Set-Acl\b') { throw 'The provisioner must not modify ACLs.' }
}

Assert-Pass 'SQL cluster identity avoids privileged data_directory and reports labeled SQLSTATEs' {
  $helper = [IO.File]::ReadAllText([IO.Path]::GetFullPath($databaseHelperPath))
  $provisioner = [IO.File]::ReadAllText($provisionerPath)
  if ($helper -match 'current_setting\([''\"]data_directory[''\"]\)') {
    throw 'The Node provisioner must not query the privileged data_directory setting.'
  }
  if ($helper -notmatch 'pg_postmaster_start_time' -or $helper -notmatch 'postmaster\.pid' -or
      $helper -notmatch 'SQLSTATE \$\{sqlState\}' -or $helper -notmatch 'SQL-\$\{step' -or
      -not $provisioner.Contains('AP-SUPER-PROVISION-SQL-[A-Z-]+):.*SQLSTATE ([0-9A-Z]{5})')) {
    throw 'The provisioner does not bind SQL identity to the local postmaster or label SQL errors.'
  }
  $sample = 'AP-SUPER-PROVISION-SQL-AUDIT: Falha na etapa registro de auditoria inicial; SQLSTATE 42501.'
  $safeCode = 'AP-SUPER-PROVISION-FAILED'
  if ($sample -match '^(AP-SUPER-PROVISION-SQL-[A-Z-]+):.*SQLSTATE ([0-9A-Z]{5})') {
    $safeCode = $Matches[1] + '-' + $Matches[2]
  }
  if ($safeCode -ne 'AP-SUPER-PROVISION-SQL-AUDIT-42501') { throw 'Sanitized SQLSTATE classification failed.' }
}

Write-Output ("PROVISIONER_TESTS_PASSED={0}; PROVISIONER_TESTS_FAILED={1}" -f $script:Passed,$script:Failed)
if ($script:Failed -gt 0) { exit 1 }
