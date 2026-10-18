Set-StrictMode -Version Latest

function ConvertTo-AmoresPetSid([object]$Identity) {
  if ($null -eq $Identity) { return $null }
  try {
    if ($Identity -is [Security.Principal.SecurityIdentifier]) { return $Identity.Value }
    if ($Identity -is [Security.Principal.IdentityReference]) {
      return $Identity.Translate([Security.Principal.SecurityIdentifier]).Value
    }
    $text = [string]$Identity
    try { return ([Security.Principal.NTAccount]::new($text)).Translate([Security.Principal.SecurityIdentifier]).Value }
    catch { return ([Security.Principal.SecurityIdentifier]::new($text)).Value }
  } catch { return $null }
}

function New-AmoresPetAclSnapshotFailure([string]$Failure, [bool]$Exists = $true) {
  return [pscustomobject]@{
    Exists = $Exists
    PathCheckFailed = ($Failure -eq 'PathCheckFailed')
    TargetReadFailed = ($Failure -eq 'TargetReadFailed')
    ParentPathCheckFailed = ($Failure -eq 'ParentPathCheckFailed')
    ParentMissing = ($Failure -eq 'ParentMissing')
    ParentReadFailed = ($Failure -eq 'ParentReadFailed')
    TargetProtected = $false
    OwnerIdentity = $null
    AccessRules = @()
    ParentChain = @()
    ProtectedAncestorFound = $false
  }
}

function Get-AmoresPetPrivateAclSnapshot {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Path,
    [scriptblock]$AclReader,
    [scriptblock]$PathReader
  )

  if (-not $AclReader) { $AclReader = { param($ItemPath) Get-Acl -LiteralPath $ItemPath -ErrorAction Stop } }
  if (-not $PathReader) { $PathReader = { param($ItemPath) Test-Path -LiteralPath $ItemPath -ErrorAction Stop } }

  try { $exists = [bool](& $PathReader $Path) }
  catch { return New-AmoresPetAclSnapshotFailure 'PathCheckFailed' }
  if (-not $exists) { return New-AmoresPetAclSnapshotFailure '' $false }

  try { $acl = & $AclReader $Path }
  catch { return New-AmoresPetAclSnapshotFailure 'TargetReadFailed' }
  if ($null -eq $acl) { return New-AmoresPetAclSnapshotFailure 'TargetReadFailed' }

  $parentChain = New-Object 'System.Collections.Generic.List[bool]'
  if (-not $acl.AreAccessRulesProtected) {
    $parent = Split-Path -Parent $Path
    while ($parent) {
      try { $parentExists = [bool](& $PathReader $parent) }
      catch { return New-AmoresPetAclSnapshotFailure 'ParentPathCheckFailed' }
      if (-not $parentExists) { return New-AmoresPetAclSnapshotFailure 'ParentMissing' }
      try { $parentAcl = & $AclReader $parent }
      catch { return New-AmoresPetAclSnapshotFailure 'ParentReadFailed' }
      if ($null -eq $parentAcl) { return New-AmoresPetAclSnapshotFailure 'ParentReadFailed' }
      $isProtected = [bool]$parentAcl.AreAccessRulesProtected
      $parentChain.Add($isProtected)
      if ($isProtected) { break }
      $nextParent = Split-Path -Parent $parent
      if (-not $nextParent -or $nextParent -eq $parent) { break }
      $parent = $nextParent
    }
  }

  $rules = @(
    foreach ($rule in $acl.Access) {
      [pscustomobject]@{
        IdentityReference = $rule.IdentityReference
        Sid = $null
        AccessControlType = [string]$rule.AccessControlType
        IsInherited = [bool]$rule.IsInherited
      }
    }
  )
  return [pscustomobject]@{
    Exists = $true
    PathCheckFailed = $false
    TargetReadFailed = $false
    ParentPathCheckFailed = $false
    ParentMissing = $false
    ParentReadFailed = $false
    TargetProtected = [bool]$acl.AreAccessRulesProtected
    OwnerIdentity = $acl.Owner
    AccessRules = $rules
    ParentChain = @($parentChain.ToArray())
    ProtectedAncestorFound = [bool](@($parentChain | Where-Object { $_ }).Count -gt 0)
  }
}

function Test-AmoresPetPrivateAclSnapshot {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][object]$Snapshot,
    [Parameter(Mandatory)][string]$CurrentSid,
    [Parameter(Mandatory)][string[]]$OwnerAllowedSids,
    [Parameter(Mandatory)][string[]]$AccessAllowedSids,
    [switch]$RequireProtected,
    [switch]$AllowAdministrators
  )

  $result = [ordered]@{
    Success = $false
    TechnicalCode = $null
    Message = $null
    TargetAcl = 'nao lida'
    ProtectedAncestor = 'nao verificado'
    ProtectedAncestorFound = [bool]$Snapshot.ProtectedAncestorFound
    ProtectedAncestorDepth = if ($Snapshot.ProtectedAncestorFound) { @($Snapshot.ParentChain).Count } else { 0 }
    Owner = 'nao verificado'
    Principals = 'nao verificadas'
    RuleCount = 0
    InheritedRuleCount = 0
  }
  $finish = { [pscustomobject]$result }

  if (-not $Snapshot.Exists) {
    $result.TechnicalCode = 'AP-DIAG-ACL-RESOURCE-MISSING'
    $result.Message = 'O recurso esperado para validacao da ACL nao existe.'
    return (& $finish)
  }
  if ($Snapshot.PathCheckFailed) {
    $result.TechnicalCode = 'AP-DIAG-ACL-PATH-CHECK-FAILED'
    $result.Message = 'Nao foi possivel verificar o acesso ao recurso ACL; a verificacao foi recusada.'
    return (& $finish)
  }
  if ($Snapshot.TargetReadFailed) {
    $result.TechnicalCode = 'AP-DIAG-ACL-READ-FAILED'
    $result.Message = 'Nao foi possivel consultar a ACL do recurso; nenhuma conexao foi iniciada.'
    return (& $finish)
  }
  if ($Snapshot.ParentPathCheckFailed) {
    $result.TechnicalCode = 'AP-DIAG-ACL-ANCESTOR-CHECK-FAILED'
    $result.Message = 'Nao foi possivel verificar um diretorio ancestral da ACL; a verificacao foi recusada.'
    return (& $finish)
  }
  if ($Snapshot.ParentMissing) {
    $result.TechnicalCode = 'AP-DIAG-ACL-ANCESTOR-MISSING'
    $result.Message = 'Um diretorio ancestral do recurso ACL esta ausente.'
    return (& $finish)
  }
  if ($Snapshot.ParentReadFailed) {
    $result.TechnicalCode = 'AP-DIAG-ACL-ANCESTOR-READ-FAILED'
    $result.Message = 'Nao foi possivel consultar a ACL de um diretorio ancestral; a verificacao foi recusada.'
    return (& $finish)
  }

  $result.TargetAcl = if ($Snapshot.TargetProtected) { 'protegida contra heranca' } else { 'herdada' }
  $result.ProtectedAncestor = if ($Snapshot.TargetProtected) {
    'nao necessario; DACL do recurso e explicita'
  } elseif ($Snapshot.ProtectedAncestorFound) {
    "encontrado a $(@($Snapshot.ParentChain).Count) nivel(is)"
  } else { 'nenhum encontrado' }

  $ownerSid = ConvertTo-AmoresPetSid $Snapshot.OwnerIdentity
  $ownerAllow = @($OwnerAllowedSids | ForEach-Object { ConvertTo-AmoresPetSid $_ } | Where-Object { $_ })
  if (-not $ownerSid) {
    $result.Owner = 'identidade nao resolvida'
    $result.TechnicalCode = 'AP-DIAG-ACL-OWNER-SID-UNRESOLVED'
    $result.Message = 'A identidade do proprietario da ACL nao pode ser convertida em SID.'
    return (& $finish)
  }
  $result.Owner = if ($ownerSid -eq $CurrentSid) { 'conta atual' }
    elseif ($ownerSid -eq 'S-1-5-18') { 'SYSTEM' }
    elseif ($ownerSid -eq 'S-1-5-32-544') { 'Administrators' }
    else { 'outra identidade' }
  if ($ownerSid -notin $ownerAllow) {
    $result.TechnicalCode = 'AP-DIAG-ACL-OWNER-UNAUTHORIZED'
    $result.Message = 'O proprietario da ACL nao pertence a allowlist privada.'
    return (& $finish)
  }

  if ($RequireProtected -and -not $Snapshot.TargetProtected) {
    $result.TechnicalCode = 'AP-DIAG-ACL-TARGET-NOT-PROTECTED'
    $result.Message = 'Este diretorio exige ACL explicitamente protegida contra heranca.'
    return (& $finish)
  }
  if (-not $Snapshot.TargetProtected -and -not $Snapshot.ProtectedAncestorFound) {
    $result.TechnicalCode = 'AP-DIAG-ACL-NO-PROTECTED-ANCESTOR'
    $result.Message = 'A ACL herdada nao possui um ancestral com heranca protegida.'
    return (& $finish)
  }

  $allowed = @($AccessAllowedSids | ForEach-Object { ConvertTo-AmoresPetSid $_ } | Where-Object { $_ })
  if ($AllowAdministrators -and 'S-1-5-32-544' -notin $allowed) { $allowed += 'S-1-5-32-544' }
  $seenCurrent = $false
  $labels = New-Object 'System.Collections.Generic.List[string]'
  $rules = @($Snapshot.AccessRules)
  $result.RuleCount = $rules.Count
  foreach ($rule in $rules) {
    if ($rule.IsInherited) { $result.InheritedRuleCount++ }
    $identity = if ($null -ne $rule.IdentityReference) { $rule.IdentityReference } else { $rule.Sid }
    $sid = ConvertTo-AmoresPetSid $identity
    if (-not $sid) {
      $result.TechnicalCode = 'AP-DIAG-ACL-RULE-SID-UNRESOLVED'
      $result.Message = 'Uma identidade de permissao da ACL nao pode ser convertida em SID.'
      return (& $finish)
    }
    $label = if ($sid -eq $CurrentSid) { 'conta atual' }
      elseif ($sid -eq 'S-1-5-18') { 'SYSTEM' }
      elseif ($sid -eq 'S-1-5-32-544') { 'Administrators' }
      elseif ($sid -eq 'S-1-5-32-545') { 'Users' }
      elseif ($sid -eq 'S-1-1-0') { 'Everyone' }
      else { 'outra identidade' }
    if (-not $labels.Contains($label)) { $labels.Add($label) }
    if ($sid -notin $allowed -or [string]$rule.AccessControlType -ne 'Allow') {
      $result.Principals = ($labels.ToArray() -join ', ')
      $result.TechnicalCode = 'AP-DIAG-ACL-UNAUTHORIZED-RULE'
      $result.Message = "A ACL contem regra nao autorizada para $label."
      return (& $finish)
    }
    if ($sid -eq $CurrentSid) { $seenCurrent = $true }
  }

  $result.Principals = if ($labels.Count) { $labels.ToArray() -join ', ' } else { 'nenhuma ACE' }
  if (-not $seenCurrent) {
    $result.TechnicalCode = 'AP-DIAG-ACL-CURRENT-USER-MISSING'
    $result.Message = 'A ACL privada nao concede permissao a conta Windows atual.'
    return (& $finish)
  }
  $result.Success = $true
  $result.TechnicalCode = 'AP-DIAG-ACL-OK'
  $result.Message = 'ACL valida para a politica privada.'
  return (& $finish)
}

function Test-AmoresPetPrivateAcl {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$CurrentSid,
    [Parameter(Mandatory)][string[]]$OwnerAllowedSids,
    [Parameter(Mandatory)][string[]]$AccessAllowedSids,
    [switch]$RequireProtected,
    [switch]$AllowAdministrators,
    [scriptblock]$AclReader,
    [scriptblock]$PathReader
  )
  $snapshot = Get-AmoresPetPrivateAclSnapshot -Path $Path -AclReader $AclReader -PathReader $PathReader
  return Test-AmoresPetPrivateAclSnapshot -Snapshot $snapshot -CurrentSid $CurrentSid `
    -OwnerAllowedSids $OwnerAllowedSids -AccessAllowedSids $AccessAllowedSids `
    -RequireProtected:$RequireProtected -AllowAdministrators:$AllowAdministrators
}

Export-ModuleMember -Function ConvertTo-AmoresPetSid,Get-AmoresPetPrivateAclSnapshot,Test-AmoresPetPrivateAclSnapshot,Test-AmoresPetPrivateAcl
