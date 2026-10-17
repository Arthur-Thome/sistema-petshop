param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Codigo', 'Contas', 'Auditoria', 'Diagnostico', 'InspecionarLote1', 'VerificarHML027', 'Encerrar', 'DescartarTemporaria')]
  [string]$Acao,
  [switch]$NaoInterativo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowedSids = @($currentSid, 'S-1-5-18', 'S-1-5-32-544')
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())

function Assert-PrivateAcl([string]$Path, [bool]$RequireProtected) {
  $acl = Get-Acl -LiteralPath $Path
  if ($RequireProtected -and -not $acl.AreAccessRulesProtected) {
    throw 'Diretorio da sessao sem protecao contra heranca de ACL.'
  }
  foreach ($rule in $acl.Access) {
    $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($sid -notin $allowedSids -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) {
      throw 'A ACL da sessao contem uma identidade ou regra nao autorizada.'
    }
    if (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) {
      throw 'A ACL da sessao nao corresponde ao perfil privado validado.'
    }
  }
  if (-not ($acl.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $currentSid })) {
    throw 'A ACL privada nao inclui a conta proprietaria atual.'
  }
}

function Invoke-HmlJsonRequest([string]$Uri, [string]$Method, [object]$Body, [hashtable]$Headers) {
  $parameters = @{ Uri = $Uri; Method = $Method; Headers = $Headers; TimeoutSec = 15; UseBasicParsing = $true }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json'
    $parameters.Body = $Body | ConvertTo-Json -Depth 10 -Compress
  }
  try {
    $response = Invoke-WebRequest @parameters
    $content = $null
    if ($response.Content) { $content = $response.Content | ConvertFrom-Json }
    return [pscustomobject]@{ Status = [int]$response.StatusCode; Headers = $response.Headers; Body = $content }
  } catch {
    $response = $_.Exception.Response
    if ($response) {
      $status = [int]$response.StatusCode
      $safeCode = $null
      try {
        $reader = [IO.StreamReader]::new($response.GetResponseStream())
        $payload = $reader.ReadToEnd() | ConvertFrom-Json
        if ($payload.codigo -match '^[A-Z0-9_-]{1,32}$') { $safeCode = $payload.codigo }
      } catch { }
      throw "API respondeu HTTP $status (codigo $safeCode)."
    }
    throw "API sem resposta HTTP ($($_.Exception.GetType().Name))."
  }
}

function Normalize-HmlText([string]$Value) {
  if ($null -eq $Value) { return '' }
  return $Value.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', ''
}

try {
  $candidates = @()
  foreach ($directory in Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'amores-pet-lote1-*' -ErrorAction SilentlyContinue) {
    if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    if ($directory.Name -notmatch '^amores-pet-lote1-[a-f0-9-]{36}$') { continue }
    $resolvedDirectory = [IO.Path]::GetFullPath($directory.FullName)
    $resolvedTemp = $tempRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedDirectory.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) { continue }
    $statePath = Join-Path $directory.FullName 'session.private.json'
    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { continue }
    if (((Get-Item -LiteralPath $statePath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    Assert-PrivateAcl $directory.FullName $true
    Assert-PrivateAcl $statePath $false
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($state.formato -ne 'amores-pet-lote1-manual-v1' -or $state.id -ne $directory.Name.Substring('amores-pet-lote1-'.Length)) { continue }
    $headers = @{ 'X-Amores-Session' = [string]$state.token }
    try {
      $audit = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$($state.appPort)/__amores/session/audit" -Headers $headers -TimeoutSec 3
      $candidates += [pscustomobject]@{ State = $state; Headers = $headers; Audit = $audit; Directory = $directory.FullName }
    } catch { }
  }
  if ($candidates.Count -ne 1) { throw 'Deve existir exatamente uma sessao Lote 1 ativa e privada.' }
  $session = $candidates[0]

  switch ($Acao) {
    'Codigo' {
      $emails = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$($session.State.appPort)/__amores/session/codes" -Headers $session.Headers -TimeoutSec 5
      if (@($emails.emails).Count -eq 0) {
        $message = 'A caixa local ainda esta vazia. Solicite o codigo na pagina de homologacao e abra esta janela novamente.'
      } else {
        $latest = @($emails.emails)[-1]
        $message = "Codigo mais recente do SMTP sink local:`n$($latest.code)`n`nRecebido: $($latest.receivedAt)`nAssunto: $($latest.subject)`n`nNao inclua este codigo em capturas ou registros."
      }
      [void][Windows.Forms.MessageBox]::Show($message, 'Codigo local de homologacao', 'OK', 'Information')
    }
    'Contas' {
      $lines = @($session.State.fixtures.accounts | ForEach-Object { "$($_.label)`nE-mail: $($_.email)`nSenha temporaria: $($_.password)" })
      [void][Windows.Forms.MessageBox]::Show(($lines -join "`n`n"), 'Contas ficticias da sessao', 'OK', 'Information')
    }
    'Auditoria' {
      $summary = $session.Audit | ConvertTo-Json -Depth 6
      [void][Windows.Forms.MessageBox]::Show($summary, 'Resumo sintetico da homologacao', 'OK', 'Information')
    }
    'Diagnostico' {
      $verificationRows = 0
      $confirmedRows = 0
      foreach ($entry in @($session.Audit.verificacao_email)) {
        $verificationRows += [int]$entry.solicitacoes
        $confirmedRows += [int]$entry.confirmacoes
      }
      $requestRows = 0
      foreach ($entry in @($session.Audit.solicitacoes)) { $requestRows += [int]$entry.quantidade }
      [pscustomobject]@{
        sessao_temporaria_ativa = $true
        registros_verificacao_email = $verificationRows
        verificacoes_com_confirmacao = $confirmedRows
        solicitacoes_publicas = $requestRows
        mensagens_aceitas_pelo_sink = [int]$session.Audit.emails_no_sink
        somente_destinatarios_sinteticos_aceitos = [bool]$session.Audit.destinatarios_todos_sinteticos
        destinatarios_nao_sinteticos_persistidos = [int]$session.Audit.destinatarios_nao_sinteticos_persistidos
        novo_tutor_sintetico_presente = [bool]$session.Audit.fixtures.novo_tutor_cadastrado
        pets_vinculados_ao_tutor_existente = [int]$session.Audit.fixtures.pets_vinculados_ao_existente
        movimentos_de_estoque = [int]$session.Audit.estoque.movimentacoes
      } | ConvertTo-Json -Compress
    }
    'InspecionarLote1' {
      $base = "http://127.0.0.1:$($session.State.appPort)"
      $admin = @($session.State.fixtures.accounts | Where-Object { $_.label -eq 'Administrador de homologacao' })[0]
      if (-not $admin) { throw 'A conta sintetica de leitura nao esta disponivel.' }
      $login = Invoke-HmlJsonRequest "$base/api/auth/login" 'Post' @{ email = [string]$admin.email; senha = [string]$admin.password } @{}
      if ($login.Status -ne 200 -or -not $login.Body.token) { throw 'Nao foi possivel autenticar a conta sintetica da sessao.' }
      $apiHeaders = @{ Authorization = "Bearer $($login.Body.token)" }
      $ativos = Invoke-HmlJsonRequest "$base/api/atendimentos/ativos" 'Get' $null $apiHeaders
      $historico = Invoke-HmlJsonRequest "$base/api/atendimentos/historico" 'Get' $null $apiHeaders
      $pets = Invoke-HmlJsonRequest "$base/api/pets" 'Get' $null $apiHeaders
      $ativosRows = if ($ativos.Body -is [array]) { @($ativos.Body) } elseif ($ativos.Body.atendimentos) { @($ativos.Body.atendimentos) } else { @() }
      $historicoRows = if ($historico.Body -is [array]) { @($historico.Body) } elseif ($historico.Body.atendimentos) { @($historico.Body.atendimentos) } else { @() }
      $petRows = if ($pets.Body -is [array]) { @($pets.Body) } elseif ($pets.Body.pets) { @($pets.Body.pets) } else { @() }
      $nuvemMatches = @($ativosRows | Where-Object { $_.pet_nome -eq 'HML Nuvem' })
      $faiscaMatches = @($historicoRows | Where-Object { (Normalize-HmlText ([string]$_.pet_nome)).Trim() -ieq 'Faisca HML' -and ([string]$_.status).Trim() -ieq 'RECUSADO' })
      $nuvem = if (@($nuvemMatches).Count -gt 0) { $nuvemMatches[0] } else { $null }
      $faisca = if (@($faiscaMatches).Count -gt 0) { $faiscaMatches[0] } else { $null }
      if (-not $nuvem) { throw "O atendimento HML Nuvem nao foi localizado em /ativos (registros=$(@($ativosRows).Count))." }
      if (-not $faisca) {
        $estadoSeguro = @($historicoRows | ForEach-Object { "$(Normalize-HmlText ([string]$_.pet_nome)):$([string]$_.status)" }) -join ', '
        throw "O atendimento Faísca HML nao foi localizado em /historico (registros=$(@($historicoRows).Count); itens=$estadoSeguro)."
      }
      $nuvemDetail = Invoke-HmlJsonRequest "$base/api/atendimentos/$($nuvem.id)" 'Get' $null $apiHeaders
      $faiscaDetail = Invoke-HmlJsonRequest "$base/api/atendimentos/$($faisca.id)" 'Get' $null $apiHeaders
      $nuvemEvents = Invoke-HmlJsonRequest "$base/api/atendimentos/$($nuvem.id)/historico" 'Get' $null $apiHeaders
      $faiscaEvents = Invoke-HmlJsonRequest "$base/api/atendimentos/$($faisca.id)/historico" 'Get' $null $apiHeaders
      $nuvemPetMatches = @($petRows | Where-Object { $_.nome -eq 'HML Nuvem' })
      $nuvemPet = if (@($nuvemPetMatches).Count -gt 0) { $nuvemPetMatches[0] } else { $null }
      $nuvemEventTypes = @($nuvemEvents.Body.eventos | ForEach-Object { [string]$_.evento })
      $faiscaEventRows = @($faiscaEvents.Body.eventos)
      $faiscaEventTypes = @($faiscaEventRows | ForEach-Object { [string]$_.evento })
      $recusa = @($faiscaEventRows | Where-Object { $_.evento -eq 'SOLICITACAO_RECUSADA' })[0]
      $snapshotTotal = [decimal]0
      foreach ($servico in @($faiscaDetail.Body.atendimento.servicos)) { $snapshotTotal += [decimal]$servico.valor }
      $distDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\frontend\dist')).Path
      $distIndex = Get-Content -LiteralPath (Join-Path $distDirectory 'index.html') -Raw
      $expectedBundle = [regex]::Match($distIndex, '(?:src|href)="(/assets/index-[^"]+\.js)"').Groups[1].Value
      if (-not $expectedBundle) { throw 'O build local nao possui o bundle principal esperado.' }
      $servedIndex = Invoke-WebRequest -Uri "$base/agendar" -TimeoutSec 5 -UseBasicParsing
      if ([int]$servedIndex.StatusCode -ne 200 -or -not $servedIndex.Content.Contains($expectedBundle)) {
        throw 'A sessao nao esta servindo o bundle frontend gerado mais recente.'
      }
      [pscustomobject]@{
        sessao_isolada_ativa = $true
        frontend_build_served = $true
        nuvem = [pscustomobject]@{
          status = [string]$nuvem.status
          total = [decimal]$nuvemDetail.Body.atendimento.valor_total
          pagamento_status = [string]$nuvemDetail.Body.atendimento.pagamento_status
          forma_pagamento_definida = [bool]$nuvemDetail.Body.atendimento.pagamento_metodo
          fotografia_cadastrada = [bool]$nuvemPet.foto
          eventos = $nuvemEventTypes
          recebeu_solicitacao = ($nuvemEventTypes -contains 'SOLICITACAO_CRIADA')
          confirmou_solicitacao = ($nuvemEventTypes -contains 'SOLICITACAO_CONFIRMADA')
        }
        faisca = [pscustomobject]@{
          status = [string]$faisca.status
          valor_historico = [decimal]$faisca.valor_total
          valor_servicos_snapshot = $snapshotTotal
          pagamento_status = [string]$faiscaDetail.Body.atendimento.pagamento_status
          eventos = $faiscaEventTypes
          recebeu_solicitacao = ($faiscaEventTypes -contains 'SOLICITACAO_CRIADA')
          recusou_solicitacao = ($faiscaEventTypes -contains 'SOLICITACAO_RECUSADA')
          motivo_preservado = [bool]($recusa -and -not [string]::IsNullOrWhiteSpace([string]$recusa.motivo))
        }
      } | ConvertTo-Json -Depth 6 -Compress
    }
    'VerificarHML027' {
      $base = "http://127.0.0.1:$($session.State.appPort)"
      $before = [int]$session.Audit.emails_no_sink
      $start = Invoke-HmlJsonRequest "$base/api/agendamento-publico/identificacao/solicitar" 'Post' @{ cpf = '52998224725' } @{}
      if ($start.Status -ne 202 -or -not $start.Body.encontrado -or $start.Body.desafio -notmatch '^[A-Za-z0-9_-]{40,50}$') {
        throw 'HML-027: solicitacao de identificacao nao retornou o desafio esperado.'
      }
      $requestId = [string]$start.Headers['X-Request-Id']
      if ($requestId -notmatch '^[a-f0-9-]{36}$') { throw 'HML-027: requestId ausente ou invalido.' }

      $mailbox = Invoke-RestMethod -Method Get -Uri "$base/__amores/session/codes" -Headers $session.Headers -TimeoutSec 5
      $received = @($mailbox.emails)
      if ($received.Count -le $before) { throw 'HML-027: a mensagem nao chegou ao SMTP sink.' }
      $email = $received[-1]
      if ($email.code -notmatch '^\d{6}$') { throw 'HML-027: o sink nao retornou um codigo valido.' }

      $confirmation = Invoke-HmlJsonRequest "$base/api/agendamento-publico/identificacao/confirmar" 'Post' `
        @{ desafio = [string]$start.Body.desafio; codigo = [string]$email.code } @{}
      if ($confirmation.Status -ne 200 -or -not $confirmation.Body.token) { throw 'HML-027: a validacao do codigo falhou.' }

      $petHeaders = @{ Authorization = "Bearer $($confirmation.Body.token)" }
      $pets = Invoke-HmlJsonRequest "$base/api/agendamento-publico/meus-pets" 'Get' $null $petHeaders
      $petNames = @($pets.Body.pets | ForEach-Object { [string]$_.nome })
      if ($pets.Status -ne 200 -or $petNames.Count -ne 1 -or $petNames[0] -ne 'HML Nuvem') {
        throw 'HML-027: a sessao nao exibiu exclusivamente o Pet Nuvem.'
      }

      $finalAudit = Invoke-RestMethod -Method Get -Uri "$base/__amores/session/audit" -Headers $session.Headers -TimeoutSec 5
      if ([int]$finalAudit.emails_no_sink -ne ($before + 1) -or -not $finalAudit.destinatarios_todos_sinteticos -or
          [int]$finalAudit.destinatarios_nao_sinteticos_persistidos -ne 0 -or -not $finalAudit.fixtures.tutor_existente) {
        throw 'HML-027: auditoria da sessao descartavel nao corresponde ao esperado.'
      }
      [pscustomobject]@{
        teste = 'HML-027'
        solicitacao_http = $start.Status
        requestId = $requestId
        mensagem_recebida_no_sink = $true
        validacao_http = $confirmation.Status
        lista_de_pets_http = $pets.Status
        somente_pet_nuvem = $true
        destinatarios_sinteticos = [bool]$finalAudit.destinatarios_todos_sinteticos
      } | ConvertTo-Json -Compress
    }
    'DescartarTemporaria' {
      Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$($session.State.appPort)/__amores/session/stop" -Headers $session.Headers -TimeoutSec 5 | Out-Null
      'Encerramento solicitado para a sessao temporaria validada; o proprio inicializador vai parar e remover somente seu cluster aleatorio em TEMP.'
    }
    'Encerrar' {
      $confirmed = [Windows.Forms.MessageBox]::Show('Encerrar a sessao e remover o cluster PostgreSQL descartavel? A auditoria sintetica sera registrada no terminal do inicializador.', 'Encerrar sessao Lote 1', 'YesNo', 'Question')
      if ($confirmed -eq [Windows.Forms.DialogResult]::Yes) {
        Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$($session.State.appPort)/__amores/session/stop" -Headers $session.Headers -TimeoutSec 5 | Out-Null
        [void][Windows.Forms.MessageBox]::Show('Encerramento solicitado. Aguarde a confirmacao no terminal do inicializador.', 'Sessao Lote 1', 'OK', 'Information')
      }
    }
  }
} catch {
  if ($NaoInterativo) {
    [Console]::Error.WriteLine($_.Exception.Message)
  } else {
    [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Sessao Lote 1', 'OK', 'Warning')
  }
  exit 1
}
