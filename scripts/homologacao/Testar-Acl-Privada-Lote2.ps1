Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'Acl-Privada.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Postmaster-Identity.psm1') -Force
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$ownerAllowed = @($currentSid, 'S-1-5-18')
$accessAllowed = @($currentSid, 'S-1-5-18')
$script:passed = 0
$script:failed = 0

function New-Snapshot {
  param(
    [bool]$Exists = $true,
    [object]$OwnerIdentity = $currentSid,
    [bool]$TargetProtected = $true,
    [bool]$ProtectedAncestorFound = $false,
    [object[]]$AccessRules = @(),
    [string]$Failure = ''
  )
  $snapshot = [ordered]@{
    Exists = $Exists
    PathCheckFailed = $false
    TargetReadFailed = $false
    ParentPathCheckFailed = $false
    ParentMissing = $false
    ParentReadFailed = $false
    TargetProtected = $TargetProtected
    OwnerIdentity = $OwnerIdentity
    AccessRules = @($AccessRules)
    ProtectedAncestorFound = $ProtectedAncestorFound
    ParentChain = @()
  }
  switch ($Failure) {
    'TARGET_ACL' { $snapshot.TargetReadFailed = $true }
    'TARGET_PATH' { $snapshot.PathCheckFailed = $true }
    'PARENT_ACL' { $snapshot.ParentReadFailed = $true }
    'PARENT_PATH' { $snapshot.ParentPathCheckFailed = $true }
    'PARENT_MISSING' { $snapshot.ParentMissing = $true }
  }
  return [pscustomobject]$snapshot
}

function New-Rule([object]$Identity, [string]$Type = 'Allow', [bool]$Inherited = $false) {
  return [pscustomobject]@{
    IdentityReference = $Identity
    Sid = $null
    AccessControlType = $Type
    IsInherited = $Inherited
  }
}

function Assert-Case {
  param(
    [string]$Name,
    [object]$Snapshot,
    [bool]$ExpectedSuccess,
    [string]$ExpectedCode = 'AP-DIAG-ACL-OK',
    [switch]$RequireProtected,
    [switch]$AllowAdministrators
  )
  $result = Test-AmoresPetPrivateAclSnapshot -Snapshot $Snapshot -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed `
    -RequireProtected:$RequireProtected -AllowAdministrators:$AllowAdministrators
  if ($result.Success -ne $ExpectedSuccess -or $result.TechnicalCode -cne $ExpectedCode) {
    $script:failed++
    throw "Falha no caso ACL '$Name': resultado inesperado ($($result.TechnicalCode))."
  }
  $script:passed++
  Write-Output "ACL_TEST_PASS=$Name"
}

function Assert-ProviderCase {
  param(
    [string]$Name,
    [string]$Path,
    [scriptblock]$AclReader,
    [scriptblock]$PathReader,
    [string]$ExpectedCode,
    [switch]$AllowAdministrators
  )
  $result = Test-AmoresPetPrivateAcl -Path $Path -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed `
    -AllowAdministrators:$AllowAdministrators -AclReader $AclReader -PathReader $PathReader
  if ($result.Success -or $result.TechnicalCode -cne $ExpectedCode) {
    throw "Falha no caso de coleta ACL '$Name': resultado inesperado ($($result.TechnicalCode))."
  }
  $script:passed++
  Write-Output "ACL_TEST_PASS=$Name"
}

function Set-TestAcl {
  param([string]$Path, [string[]]$Sids, [switch]$Directory)
  $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($entry in @($acl.Access)) { [void]$acl.RemoveAccessRuleAll($entry) }
  $inheritance = if ($Directory) {
    [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
  } else { [Security.AccessControl.InheritanceFlags]::None }
  foreach ($sidText in $Sids) {
    $identity = [Security.Principal.SecurityIdentifier]::new($sidText)
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
      $identity, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance,
      [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
    [void]$acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Path -AclObject $acl -ErrorAction Stop
}

function Assert-NoProtectedAutomaticWrites {
  param([string[]]$Paths)
  $readOnlyAutomaticNames = @(
    'PID','Host','PSHome','PSVersionTable','PSScriptRoot','PSCommandPath',
    'MyInvocation','ExecutionContext','PSBoundParameters','NestedPromptLevel',
    'ShellId','PSCulture','PSUICulture'
  )
  foreach ($filePath in $Paths) {
    $tokens = $null
    $parseErrors = $null
    $scriptAst = [System.Management.Automation.Language.Parser]::ParseFile($filePath, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) { throw "Erro de parsing em $(Split-Path -Leaf $filePath)." }
    $writeNodes = @($scriptAst.FindAll({
      param($node)
      return ($node -is [System.Management.Automation.Language.AssignmentStatementAst] -or
        $node -is [System.Management.Automation.Language.ParameterAst] -or
        $node -is [System.Management.Automation.Language.ForEachStatementAst] -or
        $node -is [System.Management.Automation.Language.CatchClauseAst])
    }, $true))
    foreach ($node in $writeNodes) {
      $variableNodes = @()
      if ($node -is [System.Management.Automation.Language.AssignmentStatementAst]) {
        if ($node.Left -is [System.Management.Automation.Language.VariableExpressionAst]) { $variableNodes += $node.Left }
      } elseif ($node -is [System.Management.Automation.Language.ParameterAst]) {
        $nameProperty = $node.PSObject.Properties['Name']
        if ($nameProperty -and $nameProperty.Value) { $variableNodes += $nameProperty.Value }
      } elseif ($node -is [System.Management.Automation.Language.ForEachStatementAst]) {
        $variableProperty = $node.PSObject.Properties['Variable']
        if ($variableProperty -and $variableProperty.Value) { $variableNodes += $variableProperty.Value }
      } elseif ($node -is [System.Management.Automation.Language.CatchClauseAst]) {
        $variableProperty = $node.PSObject.Properties['Variable']
        if ($variableProperty -and $variableProperty.Value) { $variableNodes += $variableProperty.Value }
      }
      foreach ($variableNode in $variableNodes) {
        $userPath = [string]$variableNode.VariablePath.UserPath
        $baseName = ($userPath -split ':')[-1]
        if ($readOnlyAutomaticNames -contains $baseName) {
          throw "Atribuicao/declaracao conflitante de variavel automatica em $(Split-Path -Leaf $filePath):$($node.Extent.StartLineNumber)."
        }
      }
    }
  }
  $script:passed++
  Write-Output 'ACL_TEST_PASS=ast-no-readonly-automatic-variable-writes'
}

function Assert-SanitizedFailureLocation {
  param([string]$ScriptPath)
  $tokens = $null
  $parseErrors = $null
  $scriptAst = [System.Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count -gt 0) { throw "Erro de parsing em $(Split-Path -Leaf $ScriptPath)." }
  $functionAst = $scriptAst.Find({
    param($node)
    return ($node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq 'Get-SanitizedFailureLocation')
  }, $true)
  if (-not $functionAst) { throw "Localizador de falha ausente em $(Split-Path -Leaf $ScriptPath)." }
  . ([ScriptBlock]::Create($functionAst.Extent.Text))
  try { throw [InvalidOperationException]::new('synthetic private path and credential marker') }
  catch { $location = Get-SanitizedFailureLocation $_ }
  if (-not $location.Function -or -not $location.Location -or
      [string]$location.Function -match '[\\/]' -or [string]$location.Location -match '[\\/]|[A-Za-z]:\\') {
    throw "A localizacao interna nao foi sanitizada em $(Split-Path -Leaf $ScriptPath)."
  }
  $script:passed++
  Write-Output ('ACL_TEST_PASS=sanitized-internal-location-' + [IO.Path]::GetFileNameWithoutExtension($ScriptPath))
}

$currentNtAccount = ([Security.Principal.SecurityIdentifier]::new($currentSid)).Translate([Security.Principal.NTAccount])
$adminNtAccount = ([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')).Translate([Security.Principal.NTAccount])
$baseRules = @((New-Rule $currentSid), (New-Rule 'S-1-5-18'))

Assert-Case 'directory-protected-owner-system-administrators' `
  (New-Snapshot -AccessRules @($baseRules + (New-Rule 'S-1-5-32-544'))) $true -AllowAdministrators
Assert-Case 'directory-inheritance-disabled' `
  (New-Snapshot -TargetProtected $true -AccessRules $baseRules) $true -RequireProtected
Assert-Case 'file-explicit-permissions' `
  (New-Snapshot -TargetProtected $true -AccessRules $baseRules) $true -RequireProtected
Assert-Case 'inherited-through-unprotected-parent-to-protected-ancestor' `
  (New-Snapshot -TargetProtected $false -ProtectedAncestorFound $true -AccessRules @((New-Rule $currentSid 'Allow' $true),(New-Rule 'S-1-5-18' 'Allow' $true))) $true
Assert-Case 'users-denied' `
  (New-Snapshot -AccessRules @($baseRules + (New-Rule 'S-1-5-32-545'))) $false 'AP-DIAG-ACL-UNAUTHORIZED-RULE'
Assert-Case 'everyone-denied' `
  (New-Snapshot -AccessRules @($baseRules + (New-Rule 'S-1-1-0'))) $false 'AP-DIAG-ACL-UNAUTHORIZED-RULE'
Assert-Case 'wrong-owner-denied' `
  (New-Snapshot -OwnerIdentity 'S-1-5-21-111111111-222222222-333333333-9999' -AccessRules $baseRules) $false 'AP-DIAG-ACL-OWNER-UNAUTHORIZED'
Assert-Case 'acl-query-failure-denied' `
  (New-Snapshot -Failure 'TARGET_ACL') $false 'AP-DIAG-ACL-READ-FAILED'
Assert-Case 'directory-missing-denied' `
  (New-Snapshot -Exists $false) $false 'AP-DIAG-ACL-RESOURCE-MISSING'
Assert-Case 'file-missing-denied' `
  (New-Snapshot -Exists $false) $false 'AP-DIAG-ACL-RESOURCE-MISSING'
Assert-Case 'localized-account-and-sid-normalize-identically' `
  (New-Snapshot -OwnerIdentity $currentNtAccount -AccessRules @((New-Rule $currentNtAccount),(New-Rule ([Security.Principal.SecurityIdentifier]::new('S-1-5-18'))),(New-Rule $adminNtAccount))) $true -AllowAdministrators
Assert-Case 'unprotected-without-protected-ancestor-denied' `
  (New-Snapshot -TargetProtected $false -ProtectedAncestorFound $false -AccessRules $baseRules) $false 'AP-DIAG-ACL-NO-PROTECTED-ANCESTOR'

$legacyVariableFailureReproduced = $false
try {
  $legacyAssignment = [ScriptBlock]::Create('$pid = 54321')
  & $legacyAssignment
} catch {
  $legacyVariableFailureReproduced = ([string]$_.FullyQualifiedErrorId -match 'VariableNotWritable')
}
if (-not $legacyVariableFailureReproduced) { throw 'O teste nao reproduziu a falha historica VariableNotWritable.' }
$script:passed++
Write-Output 'ACL_TEST_PASS=legacy-pid-assignment-reproduces-variable-not-writable'

Assert-NoProtectedAutomaticWrites @(
  (Join-Path $PSScriptRoot 'Acl-Privada.psm1'),
  (Join-Path $PSScriptRoot 'Postmaster-Identity.psm1'),
  (Join-Path $PSScriptRoot 'Process-Execution.psm1'),
  (Join-Path $PSScriptRoot 'Diagnosticar-Migrations-Lote2.ps1'),
  (Join-Path $PSScriptRoot 'Aplicar-Migrations-Lote2.ps1')
)
Assert-SanitizedFailureLocation (Join-Path $PSScriptRoot 'Diagnosticar-Migrations-Lote2.ps1')
Assert-SanitizedFailureLocation (Join-Path $PSScriptRoot 'Aplicar-Migrations-Lote2.ps1')

$alwaysExists = { param($ItemPath) $true }
$aclReadThrows = { param($ItemPath) throw 'synthetic ACL read failure' }
$pathCheckThrows = { param($ItemPath) throw 'synthetic path check failure' }
Assert-ProviderCase 'acl-provider-read-failure' 'C:\synthetic\file' $aclReadThrows $alwaysExists 'AP-DIAG-ACL-READ-FAILED'
Assert-ProviderCase 'path-provider-failure' 'C:\synthetic\file' $aclReadThrows $pathCheckThrows 'AP-DIAG-ACL-PATH-CHECK-FAILED'
Assert-ProviderCase 'directory-provider-missing' 'C:\synthetic\directory' $aclReadThrows ({ param($ItemPath) $false }) 'AP-DIAG-ACL-RESOURCE-MISSING'
Assert-ProviderCase 'file-provider-missing' 'C:\synthetic\file' $aclReadThrows ({ param($ItemPath) $false }) 'AP-DIAG-ACL-RESOURCE-MISSING'

$syntheticTarget = 'C:\synthetic\cluster\marker'
$syntheticAcl = [pscustomobject]@{
  Owner = $currentNtAccount
  AreAccessRulesProtected = $false
  Access = @((New-Rule $currentNtAccount 'Allow' $true),(New-Rule 'S-1-5-18' 'Allow' $true))
}
$targetAndParentReader = { param($ItemPath) if ($ItemPath -eq $syntheticTarget) { return $syntheticAcl }; return [pscustomobject]@{ AreAccessRulesProtected=$true } }
$parentReadThrows = { param($ItemPath) if ($ItemPath -eq $syntheticTarget) { return $syntheticAcl }; throw 'synthetic parent ACL read failure' }
Assert-ProviderCase 'ancestor-acl-read-failure' $syntheticTarget $parentReadThrows $alwaysExists 'AP-DIAG-ACL-ANCESTOR-READ-FAILED'
$targetParentMissing = { param($ItemPath) if ($ItemPath -eq $syntheticTarget) { $true } else { $false } }
Assert-ProviderCase 'ancestor-missing' $syntheticTarget $targetAndParentReader $targetParentMissing 'AP-DIAG-ACL-ANCESTOR-MISSING'

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('AmoresPetAclTests-' + [guid]::NewGuid().ToString('N'))
$resolvedRoot = [IO.Path]::GetFullPath($testRoot)
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (-not $resolvedRoot.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $resolvedRoot) -notmatch '^AmoresPetAclTests-[a-f0-9]{32}$') {
  throw 'A pasta temporaria de ACL nao passou na validacao de destino.'
}

try {
  [void][IO.Directory]::CreateDirectory($resolvedRoot)
  Set-TestAcl $resolvedRoot @($currentSid,'S-1-5-18','S-1-5-32-544') -Directory
  $realRoot = Test-AmoresPetPrivateAcl -Path $resolvedRoot -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed -RequireProtected -AllowAdministrators
  if (-not $realRoot.Success) { throw "ACL real de diretorio privado falhou: $($realRoot.TechnicalCode)" }
  $script:passed++
  Write-Output 'ACL_TEST_PASS=windows-protected-directory-real-dacl'

  $inheritedParent = Join-Path $resolvedRoot 'inherited-parent'
  $inheritedChild = Join-Path $inheritedParent 'inherited-child'
  [void][IO.Directory]::CreateDirectory($inheritedChild)
  $realInherited = Test-AmoresPetPrivateAcl -Path $inheritedChild -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed -AllowAdministrators
  if (-not $realInherited.Success -or -not $realInherited.ProtectedAncestorFound) {
    throw "ACL herdada sob ancestral protegido falhou: $($realInherited.TechnicalCode)"
  }
  $script:passed++
  Write-Output 'ACL_TEST_PASS=windows-inherited-child-through-unprotected-parent'

  $explicitFile = Join-Path $resolvedRoot 'explicit-file.dat'
  [IO.File]::WriteAllText($explicitFile,'synthetic ACL test')
  Set-TestAcl $explicitFile @($currentSid,'S-1-5-18')
  $realFile = Test-AmoresPetPrivateAcl -Path $explicitFile -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed -RequireProtected
  if (-not $realFile.Success -or $realFile.TargetAcl -ne 'protegida contra heranca') {
    throw "ACL explicita de arquivo falhou: $($realFile.TechnicalCode)"
  }
  $script:passed++
  Write-Output 'ACL_TEST_PASS=windows-explicit-file-real-dacl'

  $unsafeDir = Join-Path $resolvedRoot 'unsafe-users'
  [void][IO.Directory]::CreateDirectory($unsafeDir)
  Set-TestAcl $unsafeDir @($currentSid,'S-1-5-18','S-1-5-32-545') -Directory
  $realUnsafe = Test-AmoresPetPrivateAcl -Path $unsafeDir -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed -AllowAdministrators
  if ($realUnsafe.Success -or $realUnsafe.TechnicalCode -ne 'AP-DIAG-ACL-UNAUTHORIZED-RULE') {
    throw 'A DACL real com Users nao foi bloqueada.'
  }
  $script:passed++
  Write-Output 'ACL_TEST_PASS=windows-users-ace-real-dacl-rejected'

  $clusterCollection = Join-Path $resolvedRoot 'clusters'
  [void][IO.Directory]::CreateDirectory($clusterCollection)
  Set-TestAcl $clusterCollection @($currentSid,'S-1-5-18','S-1-5-32-544') -Directory
  $syntheticClusterId = [guid]::NewGuid().ToString('D')
  $clusterDataDirectory = Join-Path (Join-Path $clusterCollection $syntheticClusterId) 'data'
  [void][IO.Directory]::CreateDirectory($clusterDataDirectory)
  $markerPath = Join-Path $clusterDataDirectory '.amores-homologacao-cluster.json'
  [IO.File]::WriteAllText($markerPath, (@{ formato='amores-pet-homologacao-v1'; clusterId=$syntheticClusterId } | ConvertTo-Json -Compress), [Text.Encoding]::ASCII)
  $versionPath = Join-Path $clusterDataDirectory 'PG_VERSION'
  [IO.File]::WriteAllText($versionPath, '17', [Text.Encoding]::ASCII)
  $postmasterPath = Join-Path $clusterDataDirectory 'postmaster.pid'
  $postmasterContents = @(
    '54321', $clusterDataDirectory, '1792200000', '55432', 'synthetic-socket-directory',
    '127.0.0.1', 'synthetic-shared-memory-key', 'synthetic-shared-memory-id'
  )
  [IO.File]::WriteAllLines($postmasterPath, $postmasterContents, [Text.Encoding]::ASCII)

  foreach ($identityFile in @($markerPath,$versionPath,$postmasterPath)) {
    $identityAcl = Test-AmoresPetPrivateAcl -Path $identityFile -CurrentSid $currentSid `
      -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed -AllowAdministrators
    if (-not $identityAcl.Success -or $identityAcl.TargetAcl -ne 'herdada' -or $identityAcl.ProtectedAncestorDepth -ne 3) {
      throw "ACL herdada de recurso do diagnostico falhou: $($identityAcl.TechnicalCode)."
    }
  }
  $markerObject = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($markerObject.formato -cne 'amores-pet-homologacao-v1' -or $markerObject.clusterId -cne $syntheticClusterId -or
      (Get-Content -LiteralPath $versionPath -Raw).Trim() -cne '17') {
    throw 'O marcador ou a versao do cluster sintetico divergiu.'
  }

  $postmasterAcl = Test-AmoresPetPrivateAcl -Path $postmasterPath -CurrentSid $currentSid `
    -OwnerAllowedSids $ownerAllowed -AccessAllowedSids $accessAllowed -AllowAdministrators
  if (-not $postmasterAcl.Success -or $postmasterAcl.TargetAcl -ne 'herdada' -or
      $postmasterAcl.ProtectedAncestorDepth -ne 3 -or $postmasterAcl.Owner -ne 'conta atual') {
    throw "Validacao real da ACL do postmaster.pid falhou: $($postmasterAcl.TechnicalCode); profundidade $($postmasterAcl.ProtectedAncestorDepth)."
  }
  $postmasterIdentity = Get-AmoresPetPostmasterIdentity -Path $postmasterPath -ExpectedDataDirectory $clusterDataDirectory `
    -ExpectedPort 55432 -ExpectedListenAddress '127.0.0.1' -ExpectedStartEpoch ([long]1792200000)
  if ($postmasterIdentity.ProcessId -ne 54321 -or $postmasterIdentity.Port -ne 55432 -or
      $postmasterIdentity.DataDirectory -ine [IO.Path]::GetFullPath($clusterDataDirectory)) {
    throw 'A identidade sintetica do postmaster.pid retornou valores divergentes.'
  }

  $syntheticExecutable = Join-Path $resolvedRoot 'postgres.exe'
  $syntheticCommandLine = '"' + $syntheticExecutable + '" -D "' + $clusterDataDirectory + '" -h "127.0.0.1" -p "55432"'
  $processReader = {
    param($requestedProcessId)
    [pscustomobject]@{ ExecutablePath=$syntheticExecutable; CommandLine=$syntheticCommandLine }
  }.GetNewClosure()
  $listenerReader = {
    param($requestedPort)
    [pscustomobject]@{ OwningProcess=54321; LocalAddress='127.0.0.1'; LocalPort=$requestedPort }
  }.GetNewClosure()
  $processAndListener = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $postmasterIdentity.ProcessId `
    -ExpectedExecutable $syntheticExecutable -ExpectedDataDirectory $clusterDataDirectory `
    -ExpectedListenAddress '127.0.0.1' -ExpectedPort 55432 -ProcessReader $processReader -ListenerReader $listenerReader
  if ($processAndListener.ProcessId -ne 54321 -or $processAndListener.Port -ne 55432) {
    throw 'A verificacao sintetica de processo/listener retornou valores divergentes.'
  }
  $script:passed++
  Write-Output 'ACL_TEST_PASS=diagnostic-pre-sql-preflight-synthetic'

  $unsafeListenerReader = {
    param($requestedPort)
    [pscustomobject]@{ OwningProcess=99999; LocalAddress='127.0.0.1'; LocalPort=$requestedPort }
  }.GetNewClosure()
  $unsafeProcessOrListenerRejected = $false
  try {
    $null = Assert-AmoresPetPostgresProcessAndListener -PostgresProcessId $postmasterIdentity.ProcessId `
      -ExpectedExecutable $syntheticExecutable -ExpectedDataDirectory $clusterDataDirectory `
      -ExpectedListenAddress '127.0.0.1' -ExpectedPort 55432 -ProcessReader $processReader -ListenerReader $unsafeListenerReader
  } catch { $unsafeProcessOrListenerRejected = $_.Exception.Message -eq 'AP-POSTGRES-LISTENER-MISMATCH' }
  if (-not $unsafeProcessOrListenerRejected) { throw 'Listener pertencente a outro processo nao foi bloqueado.' }
  $script:passed++
  Write-Output 'ACL_TEST_PASS=foreign-process-listener-rejected'

  $script:passed++
  Write-Output 'ACL_TEST_PASS=postmaster-pid-real-acl-depth-3-owner-and-identity'

  $mismatchedPostmasterRejected = $false
  try {
    $null = Get-AmoresPetPostmasterIdentity -Path $postmasterPath -ExpectedDataDirectory $clusterDataDirectory `
      -ExpectedPort 5432 -ExpectedListenAddress '127.0.0.1'
  } catch { $mismatchedPostmasterRejected = $true }
  if (-not $mismatchedPostmasterRejected) { throw 'PID file com porta divergente foi aceito.' }
  $script:passed++
  Write-Output 'ACL_TEST_PASS=postmaster-pid-unsafe-identity-rejected'
} finally {
  if (Test-Path -LiteralPath $resolvedRoot) {
    $checkRoot = [IO.Path]::GetFullPath($resolvedRoot)
    if ($checkRoot.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $checkRoot) -match '^AmoresPetAclTests-[a-f0-9]{32}$') {
      Remove-Item -LiteralPath $checkRoot -Recurse -Force
    }
  }
}

Write-Output ("ACL_TESTS_PASSED={0}; ACL_TESTS_FAILED={1}" -f $script:passed,$script:failed)
if ($script:failed -gt 0) { exit 1 }
