Set-StrictMode -Version Latest

function Get-AmoresPetPepperPrivateRoot {
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    throw 'AP-PEPPER-PRIVATE-ROOT-MISSING'
  }
  return Join-Path $env:LOCALAPPDATA 'AmoresPet\Homologacao'
}

function Assert-AmoresPetPepperPrivatePath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Path,
    [switch]$RequireProtected
  )

  if (-not (Test-Path -LiteralPath $Path)) { throw 'AP-PEPPER-PRIVATE-RESOURCE-MISSING' }
  try { $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop }
  catch { throw 'AP-PEPPER-PRIVATE-RESOURCE-INACCESSIBLE' }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'AP-PEPPER-PRIVATE-REPARSE-POINT'
  }

  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $allowedSids = @($currentSid, 'S-1-5-18', 'S-1-5-32-544')
  $result = Test-AmoresPetPrivateAcl -Path $Path -CurrentSid $currentSid `
    -OwnerAllowedSids $allowedSids -AccessAllowedSids $allowedSids `
    -RequireProtected:$RequireProtected -AllowAdministrators
  if (-not $result.Success) { throw ('AP-PEPPER-ACL-' + [string]$result.TechnicalCode) }
}

function Initialize-AmoresPetPepperPrivateValidation {
  $aclModulePath = Join-Path $PSScriptRoot 'Acl-Privada.psm1'
  if (-not (Test-Path -LiteralPath $aclModulePath -PathType Leaf)) { throw 'AP-PEPPER-ACL-MODULE-MISSING' }
  Import-Module -Name $aclModulePath -Force -ErrorAction Stop
}

Export-ModuleMember -Function Get-AmoresPetPepperPrivateRoot,Assert-AmoresPetPepperPrivatePath,Initialize-AmoresPetPepperPrivateValidation
