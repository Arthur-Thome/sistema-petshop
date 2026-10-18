Set-StrictMode -Version Latest

function Get-AmoresPetAssetSummary {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Path,
    [scriptblock]$ChildItemReader
  )

  if (-not $ChildItemReader) {
    $ChildItemReader = { param($DirectoryPath) Get-ChildItem -LiteralPath $DirectoryPath -Force -ErrorAction Stop }
  }

  $rootItem = $null
  try { $rootItem = Get-Item -LiteralPath $Path -Force -ErrorAction Stop }
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
      return [ordered]@{
        present = $false; readable = $true; complete = $true; files = [long]0; total_bytes = [long]0
        image_files = [long]0; image_bytes = [long]0; other_files = [long]0; skipped_links = [long]0; failure_code = $null
      }
    }
    return [ordered]@{
      present = $null; readable = $false; complete = $false; files = $null; total_bytes = $null
      image_files = $null; image_bytes = $null; other_files = $null; skipped_links = [long]0
      failure_code = if ($isAccessFailure) { 'AP-INV-FILES-ACCESS' } else { 'AP-INV-FILES-ROOT-READ' }
    }
  }

  if (-not $rootItem.PSIsContainer) {
    return [ordered]@{
      present = $false; readable = $false; complete = $false; files = $null; total_bytes = $null
      image_files = $null; image_bytes = $null; other_files = $null; skipped_links = [long]0
      failure_code = 'AP-INV-FILES-NOT-DIRECTORY'
    }
  }

  [long]$fileCount = 0
  [long]$totalBytes = 0
  [long]$imageCount = 0
  [long]$imageBytes = 0
  [long]$otherCount = 0
  [long]$skippedLinks = 0
  $pendingDirectories = New-Object 'System.Collections.Generic.Stack[string]'
  $pendingDirectories.Push([IO.Path]::GetFullPath($Path))

  try {
    while ($pendingDirectories.Count -gt 0) {
      $directoryPath = $pendingDirectories.Pop()
      foreach ($item in @(& $ChildItemReader $directoryPath)) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
          $skippedLinks++
          continue
        }
        if ($item.PSIsContainer) {
          $pendingDirectories.Push([string]$item.FullName)
          continue
        }

        [long]$itemBytes = $item.Length
        $fileCount++
        $totalBytes += $itemBytes
        if ([string]$item.Extension -match '^(?i)\.(jpg|jpeg|png|webp)$') {
          $imageCount++
          $imageBytes += $itemBytes
        } else {
          $otherCount++
        }
      }
    }
    return [ordered]@{
      present = $true; readable = $true; complete = $true; files = $fileCount; total_bytes = $totalBytes
      image_files = $imageCount; image_bytes = $imageBytes; other_files = $otherCount; skipped_links = $skippedLinks
      failure_code = $null
    }
  } catch {
    $exception = $_.Exception
    $isAccessFailure = $_.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::PermissionDenied
    while ($exception) {
      if ($exception -is [UnauthorizedAccessException] -or $exception -is [Security.SecurityException]) { $isAccessFailure = $true }
      $exception = $exception.InnerException
    }
    return [ordered]@{
      present = $true; readable = $false; complete = $false; files = $null; total_bytes = $null
      image_files = $null; image_bytes = $null; other_files = $null; skipped_links = $skippedLinks
      failure_code = if ($isAccessFailure) { 'AP-INV-FILES-ACCESS' } else { 'AP-INV-FILES-ENUMERATION' }
    }
  }
}

function Get-AmoresPetStorageSettings {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][System.Collections.IDictionary]$Environment,
    [Parameter(Mandatory)][string]$RuntimeDirectory,
    [Parameter(Mandatory)][string]$DefaultGalleryDirectory
  )

  $mode = 'local'
  if ($Environment.Contains('FILE_STORAGE_MODE') -and -not [string]::IsNullOrWhiteSpace([string]$Environment['FILE_STORAGE_MODE'])) {
    $mode = ([string]$Environment['FILE_STORAGE_MODE']).Trim().ToLowerInvariant()
  }
  if ($mode -notin @('local', 's3')) {
    return [ordered]@{
      valid = $false; mode = 'invalid'; custom_gallery_configured = $false; custom_gallery_directory = $null
      default_gallery_directory = [IO.Path]::GetFullPath($DefaultGalleryDirectory); s3_endpoint_configured = $false
      s3_region_configured = $false; pet_bucket_configured = $false; gallery_bucket_configured = $false
      failure_code = 'AP-INV-STORAGE-MODE'
    }
  }

  $customGallery = $null
  if ($Environment.Contains('SITE_GALLERY_STORAGE_DIR') -and -not [string]::IsNullOrWhiteSpace([string]$Environment['SITE_GALLERY_STORAGE_DIR'])) {
    $candidate = ([string]$Environment['SITE_GALLERY_STORAGE_DIR']).Trim()
    if ([IO.Path]::IsPathRooted($candidate)) { $customGallery = [IO.Path]::GetFullPath($candidate) }
    else { $customGallery = [IO.Path]::GetFullPath((Join-Path $RuntimeDirectory $candidate)) }
  }

  return [ordered]@{
    valid = $true
    mode = $mode
    custom_gallery_configured = ($null -ne $customGallery)
    custom_gallery_directory = $customGallery
    default_gallery_directory = [IO.Path]::GetFullPath($DefaultGalleryDirectory)
    s3_endpoint_configured = ($Environment.Contains('AWS_ENDPOINT_URL_S3') -and -not [string]::IsNullOrWhiteSpace([string]$Environment['AWS_ENDPOINT_URL_S3']))
    s3_region_configured = ($Environment.Contains('AWS_REGION') -and -not [string]::IsNullOrWhiteSpace([string]$Environment['AWS_REGION']))
    pet_bucket_configured = ($Environment.Contains('PET_PHOTO_BUCKET') -and -not [string]::IsNullOrWhiteSpace([string]$Environment['PET_PHOTO_BUCKET']))
    gallery_bucket_configured = ($Environment.Contains('SITE_GALLERY_BUCKET') -and -not [string]::IsNullOrWhiteSpace([string]$Environment['SITE_GALLERY_BUCKET']))
    failure_code = $null
  }
}

Export-ModuleMember -Function Get-AmoresPetAssetSummary, Get-AmoresPetStorageSettings
