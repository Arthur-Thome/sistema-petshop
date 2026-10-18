Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Neon-Backup-Arquivos.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Acl-Privada.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Postmaster-Identity.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$testRoot = Join-Path $tempRoot ('Amores Pet Neon Assets Test ' + [guid]::NewGuid().ToString('N'))
$results = New-Object 'System.Collections.Generic.List[string]'

function Assert-AssetTest([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
  $results.Add($Message)
  Write-Output ('[PASS] ' + $Message)
}

try {
  foreach ($helper in @('Test-AmoresPetPrivateAcl','Get-AmoresPetPostmasterIdentity','Assert-AmoresPetPostgresProcessAndListener',
      'Invoke-AmoresPetNativeProcess','Get-AmoresPetPsqlFailureDiagnostic','Test-AmoresPetCustomArchiveCatalog',
      'Resolve-AmoresPetNeonStorageRoots','New-AmoresPetNeonAssetArchive')) {
    Assert-AssetTest ($null -ne (Get-Command $helper -ErrorAction SilentlyContinue)) ('Módulo operacional carregado: ' + $helper)
  }
  $checkpointProbe = [ordered]@{ started = $false }
  $checkpointProbe.stability_checked = $false
  Assert-AssetTest ($checkpointProbe.Contains('stability_checked') -and -not $checkpointProbe.stability_checked) 'Relatório ordered mantém checkpoints com campos dinâmicos no PowerShell 5.1.'

  $pets = Join-Path $testRoot 'pets root'
  $gallery = Join-Path $testRoot 'gallery vazia'
  $missing = Join-Path $testRoot 'nao existe'
  $nested = Join-Path $pets 'subdir com acentuação'
  [void][IO.Directory]::CreateDirectory($nested)
  [void][IO.Directory]::CreateDirectory($gallery)
  [IO.File]::WriteAllText((Join-Path $pets 'Foto da Aurora.jpg'), 'conteudo sintetico 1', (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $nested 'imagem cão.png'), 'conteudo sintetico 2', (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllBytes((Join-Path $pets 'marcador vazio.bin'), (New-Object byte[] 0))

  $petTree = Get-AmoresPetNeonAssetTree -Path $pets
  $emptyTree = Get-AmoresPetNeonAssetTree -Path $gallery
  $missingTree = Get-AmoresPetNeonAssetTree -Path $missing
  Assert-AssetTest ($petTree.Present -and $petTree.FileCount -eq 3 -and $petTree.TotalBytes -eq 40 -and $petTree.ImageCount -eq 2) 'Diretório com arquivos: contagem, bytes e imagens calculados.'
  Assert-AssetTest ($emptyTree.Present -and $emptyTree.FileCount -eq 0 -and $emptyTree.TotalBytes -eq 0) 'Diretório vazio reconhecido como completo.'
  Assert-AssetTest (-not $missingTree.Present -and $missingTree.FileCount -eq 0) 'Diretório ausente reconhecido sem leitura fora do escopo.'
  Assert-AssetTest (@($petTree.Files | Where-Object { $_.RelativePath -ceq 'subdir com acentuação\imagem cão.png' }).Count -eq 1) 'Nomes com espaços, acentos e subdiretórios preservados.'

  $archivePath = Join-Path $testRoot 'arquivos externos com espaço.zip'
  $repoRoot = Join-Path $testRoot 'repo'
  $backendRoot = Join-Path $repoRoot 'backend'
  $runtimeRoot = Join-Path $testRoot 'runtime privado'
  [void][IO.Directory]::CreateDirectory((Join-Path $backendRoot 'src\uploads\pets'))
  [void][IO.Directory]::CreateDirectory((Join-Path $backendRoot 'storage\site-gallery'))
  [void][IO.Directory]::CreateDirectory($runtimeRoot)
  $defaultRoots = @(Resolve-AmoresPetNeonStorageRoots -Environment @{} -BackendRoot $backendRoot -RuntimeDirectory $runtimeRoot)
  Assert-AssetTest ($defaultRoots.Count -eq 2 -and [string]$defaultRoots[0].label -ceq 'pet-uploads') 'Raizes locais padrao resolvidas sem abrir arquivos privados.'
  $customRoots = @(Resolve-AmoresPetNeonStorageRoots -Environment @{ SITE_GALLERY_STORAGE_DIR = 'galeria personalizada' } -BackendRoot $backendRoot -RuntimeDirectory $runtimeRoot)
  Assert-AssetTest ($customRoots.Count -eq 3 -and [string]$customRoots[2].path -ceq (Join-Path $runtimeRoot 'galeria personalizada')) 'Diretorio personalizado relativo resolvido a partir do runtime.'
  $remoteStorageRejected = $false
  try { $null = Resolve-AmoresPetNeonStorageRoots -Environment @{ FILE_STORAGE_MODE = 's3' } -BackendRoot $backendRoot -RuntimeDirectory $runtimeRoot }
  catch { $remoteStorageRejected = $_.Exception.Message -ceq 'AP-NEON-ASSET-REMOTE-STORE' }
  Assert-AssetTest $remoteStorageRejected 'Modo S3 bloqueia a coleta sem tentar acesso remoto.'
  $publicGalleryRejected = $false
  try { $null = Resolve-AmoresPetNeonStorageRoots -Environment @{ SITE_GALLERY_STORAGE_DIR = (Join-Path $backendRoot 'src\uploads\pets\galeria') } -BackendRoot $backendRoot -RuntimeDirectory $runtimeRoot }
  catch { $publicGalleryRejected = $_.Exception.Message -ceq 'AP-NEON-ASSET-GALLERY-PATH' }
  Assert-AssetTest $publicGalleryRejected 'Galeria sobre uploads privados e recusada.'
  $overlappingGalleryRejected = $false
  try { $null = Resolve-AmoresPetNeonStorageRoots -Environment @{ SITE_GALLERY_STORAGE_DIR = (Join-Path $backendRoot 'storage\site-gallery\subpasta') } -BackendRoot $backendRoot -RuntimeDirectory $runtimeRoot }
  catch { $overlappingGalleryRejected = $_.Exception.Message -ceq 'AP-NEON-ASSET-GALLERY-OVERLAP' }
  Assert-AssetTest $overlappingGalleryRejected 'Galeria personalizada sobre o diretorio padrao e recusada.'

  $roots = @(
    @{ label = 'pet-uploads'; path = $pets },
    @{ label = 'site-gallery'; path = $gallery },
    @{ label = 'gallery-custom'; path = $missing }
  )
  $archiveResult = New-AmoresPetNeonAssetArchive -Roots $roots -ArchivePath $archivePath
  Assert-AssetTest ($archiveResult.Success -and $archiveResult.FileCount -eq 3 -and $archiveResult.TotalBytes -eq 40) 'Arquivo ZIP criado e cada entrada validada por SHA-256.'
  Assert-AssetTest (@($archiveResult.FileManifest | Where-Object { $_.path -ceq 'pet-uploads/subdir com acentuação/imagem cão.png' }).Count -eq 1) 'Estrutura relativa de arquivos mantida no arquivo separado.'
  Assert-AssetTest ((Test-AmoresPetNeonAssetArchive -ArchivePath $archivePath).Success) 'Manifesto e conteúdo do arquivo verificados após fechamento.'

  $afterTree = Get-AmoresPetNeonAssetTree -Path $pets
  Assert-AssetTest (Compare-AmoresPetNeonAssetTrees -Expected $petTree -Actual $afterTree) 'Arquivos de origem permaneceram inalterados.'

  $corruptPath = Join-Path $testRoot 'arquivo truncado.zip'
  $archiveBytes = [IO.File]::ReadAllBytes($archivePath)
  [IO.File]::WriteAllBytes($corruptPath, $archiveBytes[0..([Math]::Max(0, $archiveBytes.Length - 24))])
  $rejected = $false
  try { $null = Test-AmoresPetNeonAssetArchive -ArchivePath $corruptPath } catch { $rejected = $true }
  Assert-AssetTest $rejected 'Arquivo truncado ou inválido rejeitado.'

  Write-Output 'RESULTADO: APROVADO'
  Write-Output ('TESTES_PASSARAM=' + $results.Count)
  Write-Output 'TESTES_FALHARAM=0'
} finally {
  $fullRoot = [IO.Path]::GetFullPath($testRoot)
  $prefix = $tempRoot.TrimEnd('\') + '\'
  if ($fullRoot.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($fullRoot) -match '^Amores Pet Neon Assets Test [a-f0-9]{32}$' -and
      (Test-Path -LiteralPath $fullRoot)) {
    Remove-Item -LiteralPath $fullRoot -Recurse -Force
  }
}
