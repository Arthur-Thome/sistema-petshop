Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$modulePath = Join-Path $PSScriptRoot 'Inventario-Arquivos.psm1'
Import-Module $modulePath -Force -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot 'Process-Execution.psm1') -Force -ErrorAction Stop
$passed = 0
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('AmoresPet-InventoryFiles-' + [guid]::NewGuid().ToString('N'))
$script:SafeCode = ''
$script:Stage = ''

function Stop-Inventory([string]$Code) {
  $script:SafeCode = $Code
  throw 'INVENTORY_STOP'
}

function Assert-Test([bool]$Condition, [string]$Name) {
  if (-not $Condition) { throw ('ASSERTION_FAILED:' + $Name) }
  $script:passed++
}

function New-TestFile([string]$Path, [int]$Size, [byte]$Byte) {
  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $content = New-Object byte[] $Size
  for ($index = 0; $index -lt $content.Length; $index++) { $content[$index] = $Byte }
  [IO.File]::WriteAllBytes($Path, $content)
}

try {
  New-Item -ItemType Directory -Path $testRoot -ErrorAction Stop | Out-Null
  $tree = Join-Path $testRoot 'arquivos com espacos e acentuacao'
  $nested = Join-Path $tree 'subdiretorio'
  $imageA = Join-Path $tree 'foto da galeria.png'
  $imageB = Join-Path $nested 'Nuvem-área.jpeg'
  $other = Join-Path $nested 'documento de teste.bin'
  New-TestFile $imageA 17 0x31
  New-TestFile $imageB 29 0x32
  New-TestFile $other 7 0x33
  $empty = Join-Path $testRoot 'vazio'
  New-Item -ItemType Directory -Path $empty | Out-Null

  $hashesBefore = @{}
  foreach ($filePath in @($imageA, $imageB, $other)) {
    $hashesBefore[$filePath] = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash
  }

  # Reproduz a atribuicao que gerava SetValueInvocationException no runner original.
  $legacyReport = '{"identity":{"database":"amores_pet_homologacao"}}' | ConvertFrom-Json
  $legacyFailure = $null
  try { $legacyReport.external_files = [ordered]@{ site_gallery_default = @{} } }
  catch { $legacyFailure = $_.Exception }
  Assert-Test ($legacyFailure -is [Management.Automation.SetValueInvocationException]) 'reproducao-do-setvalueinvocationexception'

  # Executa o proprio wrapper de processo do inventariador contra um Node sintetico,
  # sem conexao ou credencial real. O arquivo e o caminho de trabalho contem espacos.
  $runnerPath = Join-Path $PSScriptRoot 'Inventariar-Homologacao-Neon.ps1'
  $tokens = $null; $parseErrors = $null
  $runnerAst = [Management.Automation.Language.Parser]::ParseFile($runnerPath, [ref]$tokens, [ref]$parseErrors)
  $invokeNodeAst = $runnerAst.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-InventoryNode' }, $true)
  if ($parseErrors.Count -ne 0 -or -not $invokeNodeAst) { throw 'ASSERTION_FAILED:funcao-inventario-node-ausente' }
  Invoke-Expression $invokeNodeAst.Extent.Text
  $nodeFixture = Join-Path $testRoot 'node inventory fixture.cjs'
  $nodeFixtureSource = @'
'use strict';
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;});
process.stdin.on('end',()=>{
  try {
    const payload=JSON.parse(input);
    if(payload.password!=='synthetic-only-password' || Number(payload.expectedStartEpoch)!==1792260000) { process.exitCode=41; return; }
    if(process.argv.join(' ').includes('synthetic-only-password')) { process.exitCode=42; return; }
    process.stdout.write(JSON.stringify({status:'READ_ONLY_OK',report:{identity:{database:'amores_pet_homologacao',role:'amores_pet_homologacao_app',port:55432}}})+'\n');
  } catch { process.exitCode=43; }
});
'@
  [IO.File]::WriteAllText($nodeFixture, $nodeFixtureSource, (New-Object Text.UTF8Encoding($false)))
  $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $pipelineReport = Invoke-InventoryNode -NodePath ([string]$nodeCommand.Source) -HelperPath $nodeFixture `
    -Password 'synthetic-only-password' -ExpectedStartEpoch 1792260000 -WorkingDirectory $testRoot
  Assert-Test ($pipelineReport.identity.database -eq 'amores_pet_homologacao' -and $pipelineReport.identity.port -eq 55432) 'processo-node-stdin-json-e-identidade'
  Assert-Test (($pipelineReport | ConvertTo-Json -Depth 10) -notmatch 'synthetic-only-password') 'segredo-sintetico-nao-retornado-no-relatorio'

  # Confirma a forma usada na correcao para acrescentar propriedades JSON em PS 5.1.
  $fixedReport = '{"identity":{"database":"amores_pet_homologacao"}}' | ConvertFrom-Json
  $null = $fixedReport | Add-Member -MemberType NoteProperty -Name external_files -Value ([ordered]@{ complete = $true }) -ErrorAction Stop
  $null = $fixedReport | Add-Member -MemberType NoteProperty -Name source -Value ([ordered]@{ port = 55432 }) -ErrorAction Stop
  Assert-Test ($fixedReport.external_files.complete -and $fixedReport.source.port -eq 55432) 'add-member-em-pscustomobject-json'
  $roundTrip = (($fixedReport | ConvertTo-Json -Depth 10) | ConvertFrom-Json)
  Assert-Test ($roundTrip.external_files.complete -and $roundTrip.source.port -eq 55432 -and $roundTrip.identity.database -eq 'amores_pet_homologacao') 'continuidade-e-serializacao-do-relatorio'

  $summary = Get-AmoresPetAssetSummary -Path $tree
  Assert-Test ($summary.present -and $summary.readable -and $summary.complete) 'diretorio-com-arquivos-legivel'
  Assert-Test ($summary.files -eq 3 -and $summary.total_bytes -eq 53) 'quantidade-e-bytes-totais'
  Assert-Test ($summary.image_files -eq 2 -and $summary.image_bytes -eq 46 -and $summary.other_files -eq 1) 'fotos-e-arquivos-divididos'

  $emptySummary = Get-AmoresPetAssetSummary -Path $empty
  Assert-Test ($emptySummary.present -and $emptySummary.complete -and $emptySummary.files -eq 0 -and $emptySummary.total_bytes -eq 0) 'diretorio-vazio'

  $missingSummary = Get-AmoresPetAssetSummary -Path (Join-Path $testRoot 'nao-existe')
  Assert-Test (-not $missingSummary.present -and $missingSummary.complete -and $missingSummary.files -eq 0) 'diretorio-inexistente'

  $fileInfo = Get-Item -LiteralPath $imageA
  $lengthProperty = [IO.FileInfo].GetProperty('Length')
  $lengthBefore = $fileInfo.Length
  $null = Get-AmoresPetAssetSummary -Path $tree
  Assert-Test (-not $lengthProperty.CanWrite -and $fileInfo.Length -eq $lengthBefore) 'propriedade-somente-leitura-nao-alterada'

  $blockedDirectory = [IO.Path]::GetFullPath($nested)
  $deniedReader = {
    param($DirectoryPath)
    if ([IO.Path]::GetFullPath($DirectoryPath).Equals($blockedDirectory, [StringComparison]::OrdinalIgnoreCase)) {
      throw (New-Object UnauthorizedAccessException 'synthetic access denied')
    }
    Get-ChildItem -LiteralPath $DirectoryPath -Force -ErrorAction Stop
  }
  $deniedSummary = Get-AmoresPetAssetSummary -Path $tree -ChildItemReader $deniedReader
  Assert-Test (-not $deniedSummary.complete -and -not $deniedSummary.readable -and $deniedSummary.files -eq $null -and $deniedSummary.failure_code -eq 'AP-INV-FILES-ACCESS') 'acesso-negado-simulado-sem-acl-real'

  $unexpectedReader = { param($DirectoryPath) throw 'synthetic enumeration failure' }
  $failedSummary = Get-AmoresPetAssetSummary -Path $tree -ChildItemReader $unexpectedReader
  Assert-Test (-not $failedSummary.complete -and $failedSummary.failure_code -eq 'AP-INV-FILES-ENUMERATION') 'erro-de-enumeracao-incompleto'

  $storageEnv = @{
    FILE_STORAGE_MODE = 's3'
    SITE_GALLERY_STORAGE_DIR = 'galeria personalizada'
    AWS_ENDPOINT_URL_S3 = 'https://objects.example.invalid'
    AWS_REGION = 'sa-east-1'
    PET_PHOTO_BUCKET = 'pet-bucket-synthetic'
    SITE_GALLERY_BUCKET = 'gallery-bucket-synthetic'
  }
  $storageSettings = Get-AmoresPetStorageSettings -Environment $storageEnv -RuntimeDirectory $testRoot -DefaultGalleryDirectory $empty
  $safeStorageJson = $storageSettings | Select-Object valid, mode, custom_gallery_configured, s3_endpoint_configured, s3_region_configured, pet_bucket_configured, gallery_bucket_configured | ConvertTo-Json -Compress
  Assert-Test ($storageSettings.valid -and $storageSettings.mode -eq 's3' -and $storageSettings.custom_gallery_configured) 'configuracao-storage-reconhecida'
  Assert-Test ($safeStorageJson -notmatch 'objects\.example|pet-bucket|gallery-bucket|galeria personalizada') 'configuracao-sem-caminhos-endpoints-ou-buckets'

  $invalidStorage = Get-AmoresPetStorageSettings -Environment @{ FILE_STORAGE_MODE = 'other' } -RuntimeDirectory $testRoot -DefaultGalleryDirectory $empty
  Assert-Test (-not $invalidStorage.valid -and $invalidStorage.failure_code -eq 'AP-INV-STORAGE-MODE') 'modo-storage-invalido-bloqueado'

  $filesPreserved = $true
  foreach ($filePath in @($imageA, $imageB, $other)) {
    if ((Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash -cne $hashesBefore[$filePath]) { $filesPreserved = $false }
  }
  Assert-Test $filesPreserved 'arquivos-sinteticos-preservados'

  [Management.Automation.Language.Parser]::ParseFile($runnerPath, [ref]$tokens, [ref]$parseErrors) | Out-Null
  Assert-Test ($parseErrors.Count -eq 0) 'sintaxe-do-runner'

  Write-Output ('INVENTARIO_ARQUIVOS_TESTS=PASSOU ' + $passed + '/18')
} catch {
  Write-Error ('INVENTARIO_ARQUIVOS_TESTS=FALHOU; aprovados=' + $passed + '; causa=' + $_.Exception.Message)
  throw
} finally {
  if ($testRoot -and (Test-Path -LiteralPath $testRoot -PathType Container)) {
    $safeTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $safeTarget = [IO.Path]::GetFullPath($testRoot)
    if ($safeTarget.StartsWith($safeTemp, [StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($safeTarget) -match '^AmoresPet-InventoryFiles-[a-f0-9]{32}$') {
      Remove-Item -LiteralPath $safeTarget -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Module Inventario-Arquivos -ErrorAction SilentlyContinue
  Remove-Module Process-Execution -ErrorAction SilentlyContinue
}
