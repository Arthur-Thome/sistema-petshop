Set-StrictMode -Version Latest

function Get-AmoresPetNeonAssetTree {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Path)

  $fullRoot = [IO.Path]::GetFullPath($Path)
  try { $rootItem = Get-Item -LiteralPath $fullRoot -Force -ErrorAction Stop }
  catch {
    $exception = $_.Exception
    $isAccessFailure = $_.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::PermissionDenied
    $isMissing = $_.FullyQualifiedErrorId -match 'PathNotFound|ItemNotFound|DirectoryNotFound|FileNotFound'
    while ($exception) {
      if ($exception -is [UnauthorizedAccessException] -or $exception -is [Security.SecurityException]) { $isAccessFailure = $true }
      if ($exception -is [IO.DirectoryNotFoundException] -or $exception -is [IO.FileNotFoundException]) { $isMissing = $true }
      $exception = $exception.InnerException
    }
    if ($isMissing -and -not $isAccessFailure) {
      return [pscustomobject]@{ Path = $fullRoot; Present = $false; Files = @(); Directories = @(); FileCount = [long]0; TotalBytes = [long]0; ImageCount = [long]0; ImageBytes = [long]0 }
    }
    throw 'AP-NEON-ASSET-ROOT-READ'
  }
  if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'AP-NEON-ASSET-ROOT-REPARSE' }

  $files = New-Object 'System.Collections.Generic.List[object]'
  $directories = New-Object 'System.Collections.Generic.List[string]'
  $pending = New-Object 'System.Collections.Generic.Stack[string]'
  $pending.Push($fullRoot)
  [long]$totalBytes = 0
  [long]$imageCount = 0
  [long]$imageBytes = 0

  while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    $items = @(Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop)
    foreach ($item in $items) {
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'AP-NEON-ASSET-REPARSE' }
      $rootPrefix = $fullRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
      if (-not ([string]$item.FullName).StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'AP-NEON-ASSET-OUTSIDE-ROOT' }
      $relative = ([string]$item.FullName).Substring($rootPrefix.Length)
      if ($item.PSIsContainer) {
        $directories.Add($relative)
        $pending.Push([string]$item.FullName)
        continue
      }

      $stream = [IO.File]::Open([string]$item.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
      try {
        $length = [long]$stream.Length
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
        $lastWriteUtc = [IO.File]::GetLastWriteTimeUtc([string]$item.FullName)
      } finally { $stream.Dispose() }

      $files.Add([pscustomobject]@{
        FullPath = [string]$item.FullName
        RelativePath = $relative
        Length = $length
        LastWriteUtcTicks = [long]$lastWriteUtc.Ticks
        Sha256 = $hash
      })
      $totalBytes += $length
      if ([string]$item.Extension -match '^(?i)\.(jpg|jpeg|png|webp)$') {
        $imageCount++
        $imageBytes += $length
      }
    }
  }

  return [pscustomobject]@{
    Path = $fullRoot
    Present = $true
    Files = @($files | Sort-Object RelativePath)
    Directories = @($directories | Sort-Object)
    FileCount = [long]$files.Count
    TotalBytes = $totalBytes
    ImageCount = $imageCount
    ImageBytes = $imageBytes
  }
}

function Test-AmoresPetNeonPathOverlap([string]$Left, [string]$Right) {
  $separator = [string][IO.Path]::DirectorySeparatorChar
  $leftFull = [IO.Path]::GetFullPath($Left).TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar))
  $rightFull = [IO.Path]::GetFullPath($Right).TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar))
  return $leftFull.Equals($rightFull,[StringComparison]::OrdinalIgnoreCase) -or
    $leftFull.StartsWith($rightFull + $separator,[StringComparison]::OrdinalIgnoreCase) -or
    $rightFull.StartsWith($leftFull + $separator,[StringComparison]::OrdinalIgnoreCase)
}

function Resolve-AmoresPetNeonStorageRoots {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][System.Collections.IDictionary]$Environment,
    [Parameter(Mandatory)][string]$BackendRoot,
    [Parameter(Mandatory)][string]$RuntimeDirectory
  )

  $backend = [IO.Path]::GetFullPath($BackendRoot)
  $runtime = [IO.Path]::GetFullPath($RuntimeDirectory)
  $mode = 'local'
  if ($Environment.Contains('FILE_STORAGE_MODE') -and -not [string]::IsNullOrWhiteSpace([string]$Environment['FILE_STORAGE_MODE'])) {
    $mode = ([string]$Environment['FILE_STORAGE_MODE']).Trim().ToLowerInvariant()
  }
  if ($mode -notin @('local','s3')) { throw 'AP-NEON-ASSET-STORAGE-MODE' }
  if ($mode -eq 's3') { throw 'AP-NEON-ASSET-REMOTE-STORE' }

  $petRoot = [IO.Path]::GetFullPath((Join-Path $backend 'src\uploads\pets'))
  $defaultGallery = [IO.Path]::GetFullPath((Join-Path $backend 'storage\site-gallery'))
  $roots = New-Object 'System.Collections.Generic.List[System.Collections.IDictionary]'
  $roots.Add(@{ label = 'pet-uploads'; path = $petRoot })
  $roots.Add(@{ label = 'site-gallery-default'; path = $defaultGallery })

  $custom = $null
  if ($Environment.Contains('SITE_GALLERY_STORAGE_DIR') -and -not [string]::IsNullOrWhiteSpace([string]$Environment['SITE_GALLERY_STORAGE_DIR'])) {
    $candidate = ([string]$Environment['SITE_GALLERY_STORAGE_DIR']).Trim()
    if ([IO.Path]::IsPathRooted($candidate)) { $custom = [IO.Path]::GetFullPath($candidate) }
    else { $custom = [IO.Path]::GetFullPath((Join-Path $runtime $candidate)) }
  }
  if ($null -ne $custom -and -not $custom.Equals($defaultGallery,[StringComparison]::OrdinalIgnoreCase)) {
    $protectedRoots = @($petRoot,(Join-Path ([IO.Path]::GetFullPath((Split-Path -Parent $backend))) 'frontend\public'),
      (Join-Path ([IO.Path]::GetFullPath((Split-Path -Parent $backend))) 'frontend\dist'),(Join-Path $backend 'src\uploads'))
    foreach ($protectedRoot in $protectedRoots) {
      if (Test-AmoresPetNeonPathOverlap $custom $protectedRoot) { throw 'AP-NEON-ASSET-GALLERY-PATH' }
    }
    if (Test-AmoresPetNeonPathOverlap $custom $defaultGallery) { throw 'AP-NEON-ASSET-GALLERY-OVERLAP' }
    $roots.Add(@{ label = 'site-gallery-custom'; path = $custom })
  }
  return @($roots.ToArray())
}

function Compare-AmoresPetNeonAssetTrees {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][object]$Expected,
    [Parameter(Mandatory)][object]$Actual
  )

  if ([bool]$Expected.Present -ne [bool]$Actual.Present -or
      [long]$Expected.FileCount -ne [long]$Actual.FileCount -or
      [long]$Expected.TotalBytes -ne [long]$Actual.TotalBytes -or
      @($Expected.Directories).Count -ne @($Actual.Directories).Count -or
      @($Expected.Files).Count -ne @($Actual.Files).Count) { return $false }

  for ($index = 0; $index -lt @($Expected.Directories).Count; $index++) {
    if ([string]$Expected.Directories[$index] -cne [string]$Actual.Directories[$index]) { return $false }
  }
  for ($index = 0; $index -lt @($Expected.Files).Count; $index++) {
    $left = $Expected.Files[$index]
    $right = $Actual.Files[$index]
    if ([string]$left.RelativePath -cne [string]$right.RelativePath -or
        [long]$left.Length -ne [long]$right.Length -or
        [long]$left.LastWriteUtcTicks -ne [long]$right.LastWriteUtcTicks -or
        [string]$left.Sha256 -cne [string]$right.Sha256) { return $false }
  }
  return $true
}

function New-AmoresPetNeonAssetArchive {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][System.Collections.IDictionary[]]$Roots,
    [Parameter(Mandatory)][string]$ArchivePath
  )

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $snapshots = New-Object 'System.Collections.Generic.List[object]'
  $manifestRoots = New-Object 'System.Collections.Generic.List[object]'
  $manifestFiles = New-Object 'System.Collections.Generic.List[object]'
  $manifestDirectories = New-Object 'System.Collections.Generic.List[string]'
  foreach ($root in $Roots) {
    if ([string]$root.label -notmatch '^[a-z0-9][a-z0-9-]{0,39}$') { throw 'AP-NEON-ASSET-LABEL' }
    $snapshot = Get-AmoresPetNeonAssetTree -Path ([string]$root.path)
    $snapshots.Add([pscustomobject]@{ Label = [string]$root.label; Tree = $snapshot })
    $manifestRoots.Add([pscustomobject]@{ label = [string]$root.label; present = [bool]$snapshot.Present })
  }

  $archiveStream = [IO.File]::Open([IO.Path]::GetFullPath($ArchivePath), [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try {
    $archive = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Create, $false, [Text.Encoding]::UTF8)
    try {
      foreach ($rootSnapshot in $snapshots) {
        $label = [string]$rootSnapshot.Label
        $tree = $rootSnapshot.Tree
        foreach ($relativeDirectory in @($tree.Directories)) {
          $entryName = $label + '/' + ([string]$relativeDirectory).Replace('\', '/') + '/'
          $null = $archive.CreateEntry($entryName)
          $manifestDirectories.Add($entryName)
        }
        foreach ($file in @($tree.Files)) {
          $entryName = $label + '/' + ([string]$file.RelativePath).Replace('\', '/')
          $entry = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
          $input = [IO.File]::Open([string]$file.FullPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
          $output = $entry.Open()
          $sha = [Security.Cryptography.SHA256]::Create()
          try {
            if ([long]$input.Length -ne [long]$file.Length -or [long]([IO.File]::GetLastWriteTimeUtc([string]$file.FullPath).Ticks) -ne [long]$file.LastWriteUtcTicks) {
              throw 'AP-NEON-ASSET-CHANGED'
            }
            $buffer = New-Object byte[] 81920
            while (($read = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
              [void]$sha.TransformBlock($buffer, 0, $read, $buffer, 0)
              $output.Write($buffer, 0, $read)
            }
            [void]$sha.TransformFinalBlock((New-Object byte[] 0), 0, 0)
            $actualHash = [BitConverter]::ToString($sha.Hash).Replace('-', '').ToLowerInvariant()
            if ($actualHash -cne [string]$file.Sha256) { throw 'AP-NEON-ASSET-CHANGED' }
          } finally {
            $sha.Dispose()
            $output.Dispose()
            $input.Dispose()
          }
          $manifestFiles.Add([pscustomobject]@{ path = $entryName; bytes = [long]$file.Length; sha256 = [string]$file.Sha256 })
        }
      }

      $manifest = [ordered]@{
        format = 'amores-pet-assets-v1'
        created_utc = [DateTime]::UtcNow.ToString('o')
        roots = @($manifestRoots.ToArray())
        directories = @($manifestDirectories | Sort-Object)
        files = @($manifestFiles | Sort-Object path)
      }
      $manifestBytes = (New-Object Text.UTF8Encoding($false)).GetBytes(($manifest | ConvertTo-Json -Depth 8 -Compress))
      $manifestEntry = $archive.CreateEntry('manifest.json', [IO.Compression.CompressionLevel]::Optimal)
      $manifestStream = $manifestEntry.Open()
      try { $manifestStream.Write($manifestBytes, 0, $manifestBytes.Length) }
      finally { $manifestStream.Dispose() }
    } finally { $archive.Dispose() }
  } finally { $archiveStream.Dispose() }

  foreach ($rootSnapshot in $snapshots) {
    $after = Get-AmoresPetNeonAssetTree -Path ([string]$rootSnapshot.Tree.Path)
    if (-not (Compare-AmoresPetNeonAssetTrees -Expected $rootSnapshot.Tree -Actual $after)) {
      throw 'AP-NEON-ASSET-CHANGED'
    }
  }
  return Test-AmoresPetNeonAssetArchive -ArchivePath $ArchivePath
}

function Test-AmoresPetNeonAssetArchive {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$ArchivePath)

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($ArchivePath))
  try {
    $manifestEntry = @($archive.Entries | Where-Object { $_.FullName -ceq 'manifest.json' })
    if ($manifestEntry.Count -ne 1) { throw 'AP-NEON-ASSET-MANIFEST' }
    $reader = New-Object IO.StreamReader($manifestEntry[0].Open(), [Text.Encoding]::UTF8, $true)
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json -ErrorAction Stop }
    finally { $reader.Dispose() }
    if ($manifest.format -cne 'amores-pet-assets-v1' -or $null -eq $manifest.files -or $null -eq $manifest.roots -or $null -eq $manifest.directories) {
      throw 'AP-NEON-ASSET-MANIFEST'
    }

    $expectedFiles = @($manifest.files)
    $actualFileEntries = @($archive.Entries | Where-Object { -not $_.FullName.EndsWith('/') -and $_.FullName -cne 'manifest.json' })
    if ($actualFileEntries.Count -ne $expectedFiles.Count) { throw 'AP-NEON-ASSET-ARCHIVE-CONTENT' }
    $expectedDirectories = @($manifest.directories)
    $actualDirectories = @($archive.Entries | Where-Object { $_.FullName.EndsWith('/') } | ForEach-Object { [string]$_.FullName } | Sort-Object)
    if ($actualDirectories.Count -ne $expectedDirectories.Count) { throw 'AP-NEON-ASSET-ARCHIVE-CONTENT' }
    for ($directoryIndex = 0; $directoryIndex -lt $actualDirectories.Count; $directoryIndex++) {
      if ([string]$actualDirectories[$directoryIndex] -cne [string]$expectedDirectories[$directoryIndex]) { throw 'AP-NEON-ASSET-ARCHIVE-CONTENT' }
    }
    $expectedByPath = @{}
    foreach ($record in $expectedFiles) {
      $path = [string]$record.path
      if ($path -notmatch '^[a-z0-9][a-z0-9-]{0,39}/' -or $path.Contains('..') -or $path.StartsWith('/') -or $expectedByPath.ContainsKey($path)) {
        throw 'AP-NEON-ASSET-MANIFEST'
      }
      $expectedByPath[$path] = $record
    }

    [long]$totalBytes = 0
    foreach ($entry in $actualFileEntries) {
      if (-not $expectedByPath.ContainsKey([string]$entry.FullName)) { throw 'AP-NEON-ASSET-ARCHIVE-CONTENT' }
      $record = $expectedByPath[[string]$entry.FullName]
      $stream = $entry.Open()
      $sha = [Security.Cryptography.SHA256]::Create()
      try {
        $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
        $length = [long]$entry.Length
      } finally { $sha.Dispose(); $stream.Dispose() }
      if ($length -ne [long]$record.bytes -or $hash -cne [string]$record.sha256) { throw 'AP-NEON-ASSET-CHECKSUM' }
      $totalBytes += $length
    }
    return [pscustomobject]@{
      Success = $true
      FileCount = [long]$expectedFiles.Count
      TotalBytes = $totalBytes
      Roots = @($manifest.roots | ForEach-Object { [string]$_.label })
      FileManifest = $expectedFiles
    }
  } finally { $archive.Dispose() }
}

Export-ModuleMember -Function Get-AmoresPetNeonAssetTree,Resolve-AmoresPetNeonStorageRoots,Compare-AmoresPetNeonAssetTrees,New-AmoresPetNeonAssetArchive,Test-AmoresPetNeonAssetArchive
