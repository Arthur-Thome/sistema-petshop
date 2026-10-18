Set-StrictMode -Version Latest

function Get-AmoresPetPostmasterIdentity {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$ExpectedDataDirectory,
    [Parameter(Mandatory)][int]$ExpectedPort,
    [Parameter(Mandatory)][string]$ExpectedListenAddress,
    [Nullable[long]]$ExpectedStartEpoch
  )

  $postmasterLines = @(Get-Content -LiteralPath $Path -ErrorAction Stop)
  $postgresProcessId = 0
  $serverStartEpoch = [long]0
  $serverPort = 0
  $processIdValid = $postmasterLines.Count -ge 6 -and
    [int]::TryParse([string]$postmasterLines[0], [ref]$postgresProcessId)
  $startEpochValid = $postmasterLines.Count -ge 6 -and
    [long]::TryParse([string]$postmasterLines[2], [ref]$serverStartEpoch)
  $portValid = $postmasterLines.Count -ge 6 -and
    [int]::TryParse([string]$postmasterLines[3], [ref]$serverPort)

  if (-not $processIdValid -or $postgresProcessId -le 0 -or -not $startEpochValid -or -not $portValid) {
    throw [System.IO.InvalidDataException]::new('AP-POSTMASTER-IDENTITY-FORMAT')
  }

  try {
    $actualDataDirectory = [IO.Path]::GetFullPath([string]$postmasterLines[1])
    $expectedDirectory = [IO.Path]::GetFullPath($ExpectedDataDirectory)
  } catch {
    throw [System.IO.InvalidDataException]::new('AP-POSTMASTER-IDENTITY-DIRECTORY')
  }

  $listenAddresses = @(([string]$postmasterLines[5] -split ',') | ForEach-Object { $_.Trim() })
  if (-not $actualDataDirectory.Equals($expectedDirectory, [StringComparison]::OrdinalIgnoreCase) -or
      $serverPort -ne $ExpectedPort -or $ExpectedListenAddress -notin $listenAddresses -or
      ($null -ne $ExpectedStartEpoch -and [math]::Abs([double]($serverStartEpoch - [long]$ExpectedStartEpoch)) -gt 1)) {
    throw [System.IO.InvalidDataException]::new('AP-POSTMASTER-IDENTITY-MISMATCH')
  }

  return [pscustomobject]@{
    ProcessId = $postgresProcessId
    StartEpoch = $serverStartEpoch
    DataDirectory = $actualDataDirectory
    Port = $serverPort
    ListenAddresses = $listenAddresses
  }
}

function Assert-AmoresPetPostgresProcessAndListener {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][int]$PostgresProcessId,
    [Parameter(Mandatory)][string]$ExpectedExecutable,
    [Parameter(Mandatory)][string]$ExpectedDataDirectory,
    [Parameter(Mandatory)][string]$ExpectedListenAddress,
    [Parameter(Mandatory)][int]$ExpectedPort,
    [scriptblock]$ProcessReader,
    [scriptblock]$ListenerReader
  )

  if (-not $ProcessReader) {
    $ProcessReader = { param($processId) Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $processId) -ErrorAction SilentlyContinue }
  }
  if (-not $ListenerReader) {
    $ListenerReader = { param($port) @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) }
  }

  try { $processes = @(& $ProcessReader $PostgresProcessId) }
  catch { throw [System.InvalidOperationException]::new('AP-POSTGRES-PROCESS-QUERY') }
  if ($processes.Count -ne 1) { throw [System.InvalidOperationException]::new('AP-POSTGRES-PROCESS-COUNT') }

  try {
    $actualExecutable = [IO.Path]::GetFullPath([string]$processes[0].ExecutablePath)
    $expectedExecutablePath = [IO.Path]::GetFullPath($ExpectedExecutable)
  } catch {
    throw [System.InvalidOperationException]::new('AP-POSTGRES-PROCESS-PATH')
  }
  if (-not $actualExecutable.Equals($expectedExecutablePath, [StringComparison]::OrdinalIgnoreCase)) {
    throw [System.InvalidOperationException]::new('AP-POSTGRES-PROCESS-EXECUTABLE')
  }

  $commandLine = ([string]$processes[0].CommandLine).Replace('/','\')
  $hostArgumentPattern = '(?i)-h\s+"?' + [regex]::Escape($ExpectedListenAddress) + '(?:"|\s|$)'
  $portArgumentPattern = '(?i)-p\s+"?' + [regex]::Escape([string]$ExpectedPort) + '(?:"|\s|$)'
  if ($commandLine -notmatch [regex]::Escape([IO.Path]::GetFullPath($ExpectedDataDirectory)) -or
      $commandLine -notmatch $hostArgumentPattern -or $commandLine -notmatch $portArgumentPattern) {
    throw [System.InvalidOperationException]::new('AP-POSTGRES-PROCESS-COMMAND')
  }

  try { $listeners = @(& $ListenerReader $ExpectedPort) }
  catch { throw [System.InvalidOperationException]::new('AP-POSTGRES-LISTENER-QUERY') }
  if ($listeners.Count -ne 1 -or [int]$listeners[0].OwningProcess -ne $PostgresProcessId -or
      [string]$listeners[0].LocalAddress -cne $ExpectedListenAddress) {
    throw [System.InvalidOperationException]::new('AP-POSTGRES-LISTENER-MISMATCH')
  }

  return [pscustomobject]@{
    ProcessId = $PostgresProcessId
    Executable = $actualExecutable
    ListenAddress = [string]$listeners[0].LocalAddress
    Port = [int]$ExpectedPort
  }
}

Export-ModuleMember -Function Get-AmoresPetPostmasterIdentity,Assert-AmoresPetPostgresProcessAndListener
