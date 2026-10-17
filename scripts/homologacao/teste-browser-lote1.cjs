const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const EDGE_CANDIDATES = [
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
];
const EDGE = EDGE_CANDIDATES.find((candidate) => fs.existsSync(candidate));
const SESSION_PREFIX = 'amores-pet-lote1-';
const ALLOWED_SIDS = new Set(['S-1-5-18', 'S-1-5-32-544']);

function findSessionRoot() {
  const temp = path.resolve(os.tmpdir());
  const candidates = fs.readdirSync(temp, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()
      && new RegExp(`^${SESSION_PREFIX}[a-f0-9-]{36}$`).test(entry.name))
    .map((entry) => path.join(temp, entry.name))
    .filter((root) => fs.existsSync(path.join(root, 'session.private.json')));
  assert.equal(candidates.length, 1, 'A sessão Lote 1 ativa e privada precisa ser única.');
  return { temp, root: path.resolve(candidates[0]) };
}

function validatePrivateAcl(root) {
  const statePath = path.join(root, 'session.private.json');
  const command = String.raw`
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($env:AMORES_SESSION_ROOT)
$state = [IO.Path]::GetFullPath($env:AMORES_SESSION_STATE)
$temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $root.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetDirectoryName($state) -ne $root) { exit 21 }
if ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 22 }
if ((Get-Item -LiteralPath $state -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 23 }
$ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed = @($ownerSid, 'S-1-5-18', 'S-1-5-32-544')
foreach ($item in @(@{ Path = $root; Protected = $true }, @{ Path = $state; Protected = $false })) {
  $acl = Get-Acl -LiteralPath $item.Path
  if ($item.Protected -and -not $acl.AreAccessRulesProtected) { exit 24 }
  $owner = $acl.Owner
  try { $owner = ([Security.Principal.NTAccount]$owner).Translate([Security.Principal.SecurityIdentifier]).Value } catch { }
  if ($owner -notin $allowed) { exit 25 }
  foreach ($rule in $acl.Access) {
    $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($sid -notin $allowed -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { exit 26 }
    if (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) { exit 27 }
  }
  if (-not ($acl.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $ownerSid })) { exit 28 }
}
exit 0
`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 15000,
    env: { ...process.env, AMORES_SESSION_ROOT: root, AMORES_SESSION_STATE: statePath },
  });
  assert.equal(result.status, 0, 'A ACL privada da sessão não passou na validação; estado privado não foi lido.');
  return statePath;
}

function safeState() {
  const { temp, root } = findSessionRoot();
  const statePath = validatePrivateAcl(root);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.formato, 'amores-pet-lote1-manual-v1');
  assert.equal(path.basename(root), `${SESSION_PREFIX}${state.id}`);
  assert.equal(state.host, '127.0.0.1');
  assert.ok(Number.isInteger(state.appPort) && state.appPort > 1024 && state.appPort !== 3001);
  assert.ok(path.relative(temp, root) && !path.relative(temp, root).startsWith('..'));
  return { temp, root, state };
}

function listenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitFor(check, message, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${message}${lastError ? ` (${lastError.message})` : ''}`);
}

class BrowserPage {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.requests = new Map();
    this.responses = [];
    this.externalOrigins = new Set();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
        return;
      }
      if (message.method === 'Network.requestWillBeSent') {
        const { requestId } = message;
        const request = message.params.request;
        this.requests.set(requestId, { url: request.url, method: request.method });
        if (/^https?:/i.test(request.url)) {
          const url = new URL(request.url);
          if (url.origin !== this.origin && url.origin !== 'https://viacep.com.br') this.externalOrigins.add(url.origin);
          if (/^(localhost|127\.0\.0\.1):3001$/i.test(url.host)) this.externalOrigins.add('backend-principal-3001');
        }
      }
      if (message.method === 'Network.responseReceived') {
        const request = this.requests.get(message.params.requestId);
        if (!request) return;
        this.responses.push({
          url: request.url,
          method: request.method,
          status: Number(message.params.response.status),
        });
      }
    });
  }

  setOrigin(origin) { this.origin = origin; }

  command(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.command('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (response.exceptionDetails) throw new Error('A execução de script na página falhou.');
    return response.result?.value;
  }

  async navigate(url) {
    await this.command('Page.navigate', { url });
    await waitFor(async () => this.evaluate('document.readyState === "complete"'), 'A navegação não terminou.');
  }

  async close() {
    try { await this.command('Page.close'); } catch { }
    this.socket.close();
  }
}

async function openBrowser(root, origin) {
  assert.ok(EDGE, 'Microsoft Edge não está instalado no caminho esperado.');
  const debugPort = await listenPort();
  const profile = path.join(root, `browser-profile-${process.pid}-${crypto.randomBytes(5).toString('hex')}`);
  fs.mkdirSync(profile, { recursive: false });
  const browser = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-features=MediaRouter,OptimizationHints', '--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, '--lang=pt-BR', '--accept-lang=pt-BR,pt;q=0.9,en;q=0.8',
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  const version = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    if (!response.ok) return null;
    return response.json();
  }, 'Edge não abriu a interface DevTools.', 20000);
  assert.match(version.Browser || '', /Edg\//i);
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about%3Ablank`, { method: 'PUT' });
  assert.equal(targetResponse.ok, true, 'Edge não criou uma aba de teste.');
  const target = await targetResponse.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await waitFor(() => socket.readyState === WebSocket.OPEN, 'A conexão DevTools não foi estabelecida.');
  const page = new BrowserPage(socket);
  page.setOrigin(origin);
  await page.command('Page.enable');
  await page.command('Runtime.enable');
  await page.command('Network.enable');
  return { page, browser, profile };
}

async function callApi(origin, endpoint, { method = 'GET', token, body } = {}) {
  const url = new URL(endpoint, origin);
  assert.equal(url.origin, origin, 'Requisição da automação deve permanecer na origem da sessão.');
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch { }
  if (!response.ok) {
    const code = typeof payload?.codigo === 'string' && /^[A-Z0-9_-]{1,32}$/.test(payload.codigo)
      ? `; ${payload.codigo}` : '';
    throw new Error(`${method} ${url.pathname}: HTTP ${response.status}${code}`);
  }
  return payload;
}

async function clickButton(page, matcher, message) {
  const available = await waitFor(() => page.evaluate(`(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
    return [...document.querySelectorAll('button')].some((item) => ${matcher});
  })()`), message);
  assert.equal(available, true, message);
  const clicked = await page.evaluate(`(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
    const button = [...document.querySelectorAll('button')].find((item) => ${matcher});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, message);
}

async function fillRegistration(page, { breed, size } = {}) {
  const values = {
    'Nome completo': 'HML Tutor Brisa',
    CPF: '11144477735',
    'Celular / WhatsApp': '11987654321',
    'E-mail': 'brisa@example.invalid',
    CEP: '01000-000',
    Rua: 'Rua Fictícia HML',
    Número: '42',
    Bairro: 'Centro de Teste',
    Cidade: 'Cidade Teste',
    Estado: 'SP',
    Nome: 'Faísca HML',
    Espécie: 'cachorro',
    'Raça do pet': breed ?? '',
    Porte: size ?? '',
    Sexo: 'femea',
  };
  const filled = await page.evaluate(`(() => {
    const form = document.querySelector('.agendamento-cadastro form');
    if (!form) return false;
    const values = ${JSON.stringify(values)};
    for (const [labelText, value] of Object.entries(values)) {
      const label = [...form.querySelectorAll('label')].find((item) => {
        const text = item.textContent.replace(/\\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
        return labelText === 'Nome' ? /^nome\\s*\\*/.test(text) : text.startsWith(labelText.toLocaleLowerCase('pt-BR'));
      });
      const field = label?.querySelector('input:not([type="file"]), select');
      if (!field) return false;
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  })()`);
  assert.equal(filled, true, 'O formulário público não expôs um campo esperado.');
}

async function installNetworkRecorder(page) {
  const installed = await page.evaluate(`(() => {
    window.__amoresNetworkEvents = [];
    const record = (method, rawUrl, status) => {
      try {
        const url = new URL(String(rawUrl), location.href);
        window.__amoresNetworkEvents.push({ method: String(method).toUpperCase(), path: url.pathname, status: Number(status) || 0, sameOrigin: url.origin === location.origin });
      } catch {
        window.__amoresNetworkEvents.push({ method: String(method).toUpperCase(), path: 'invalid-url', status: Number(status) || 0, sameOrigin: false });
      }
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this.__amoresMethod = method;
      this.__amoresUrl = url;
      return originalOpen.call(this, method, url, ...args);
    };
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener('loadend', () => record(this.__amoresMethod, this.__amoresUrl, this.status), { once: true });
      return originalSend.apply(this, args);
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const rawUrl = args[0] instanceof Request ? args[0].url : args[0];
      try {
        const response = await originalFetch(...args);
        record(args[1]?.method || 'GET', rawUrl, response.status);
        return response;
      } catch (error) {
        record(args[1]?.method || 'GET', rawUrl, 0);
        throw error;
      }
    };
    return true;
  })()`);
  assert.equal(installed, true, 'Não foi possível instrumentar as requisições do navegador.');
}

async function verifyInvalidSubmission(page, label) {
  return page.evaluate(`(() => {
    const form = document.querySelector('.agendamento-cadastro form');
    if (!form) return { form: false };
    const fields = [...form.querySelectorAll('input:not([type="file"]), select')];
    const before = fields.map((field) => field.value);
    const invalid = fields.find((field) => !field.validity.valid);
    const message = invalid?.validationMessage || '';
    form.requestSubmit();
    const after = fields.map((field) => field.value);
    return { form: true, valid: form.checkValidity(), message, retained: JSON.stringify(before) === JSON.stringify(after) };
  })()`).then((result) => {
    assert.equal(result.form, true, `${label}: formulário ausente.`);
    assert.equal(result.valid, false, `${label}: formulário deveria bloquear o envio.`);
    assert.ok(result.message.trim(), `${label}: navegador não apresentou mensagem de validação.`);
    assert.equal(result.retained, true, `${label}: os dados digitados foram apagados.`);
    return result;
  });
}

async function postPublicRequest(origin, token, petId, slotId, serviceId) {
  return callApi(origin, '/api/agendamento-publico/confirmar', {
    method: 'POST', token,
    body: { pet_id: petId, horario_id: slotId, servicos: [serviceId], observacoes: 'Cenário sintético ATEND-02.' },
  });
}

async function main() {
  assert.equal(process.platform, 'win32', 'Esta automação requer Windows e Microsoft Edge.');
  const { root, state } = safeState();
  const origin = `http://127.0.0.1:${state.appPort}`;
  const healthResponse = await fetch(`${origin}/health/ready`);
  assert.equal(healthResponse.status, 200, 'Backend temporário não está pronto.');
  const sessionHeaders = { 'X-Amores-Session': state.token };
  const auditResponse = await fetch(`${origin}/__amores/session/audit`, { headers: sessionHeaders });
  assert.equal(auditResponse.status, 200, 'A auditoria privada da sessão não pôde ser validada.');
  const initialAudit = await auditResponse.json();
  assert.equal(initialAudit.emails_no_sink, 0, 'A sessão limpa já possuía mensagem local.');
  assert.equal(initialAudit.fixtures.tutor_existente, true);
  assert.equal(initialAudit.fixtures.novo_tutor_cadastrado, false);
  assert.equal(initialAudit.destinatarios_nao_sinteticos_persistidos, 0);
  assert.equal(initialAudit.destinatarios_todos_sinteticos, true);

  const { page, browser, profile } = await openBrowser(root, origin);
  let result;
  try {
    await page.navigate(`${origin}/agendar`);
    await waitFor(() => page.evaluate('document.querySelector("#root")?.children.length > 0'), 'Frontend público não renderizou.');
    await installNetworkRecorder(page);
    assert.equal(await page.evaluate('navigator.language'), 'pt-BR', 'Edge não adotou idioma de validação pt-BR.');
    await clickButton(page, 'normalize(item.innerText).includes("fazer meu cadastro")', 'A entrada de cadastro novo não apareceu.');
    await waitFor(() => page.evaluate('Boolean(document.querySelector(".agendamento-cadastro form"))'), 'Formulário de cadastro não abriu.');

    await fillRegistration(page, { breed: '', size: '' });
    const raceEmpty = await verifyInvalidSubmission(page, 'Raça obrigatória');
    assert.ok(raceEmpty.message.toLocaleLowerCase('pt-BR').includes('preencha')
      || raceEmpty.message.toLocaleLowerCase('pt-BR').includes('obrigat')
      || raceEmpty.message.toLocaleLowerCase('pt-BR').includes('campo'), 'Mensagem do campo raça não está compreensível em português.');
    await new Promise((resolve) => setTimeout(resolve, 400));
    const emptyRaceRequests = await page.evaluate('window.__amoresNetworkEvents.filter((item) => item.method === "POST" && item.path.endsWith("/cadastro/solicitar")).length');
    assert.equal(emptyRaceRequests, 0,
      'O backend recebeu uma solicitação com raça vazia.');

    await fillRegistration(page, { breed: 'Não sei informar', size: '' });
    const unknownSize = await verifyInvalidSubmission(page, 'Porte obrigatório para raça desconhecida');
    assert.ok(unknownSize.message.toLocaleLowerCase('pt-BR').includes('selecione')
      || unknownSize.message.toLocaleLowerCase('pt-BR').includes('obrigat')
      || unknownSize.message.toLocaleLowerCase('pt-BR').includes('campo'), 'Mensagem do campo porte não está compreensível em português.');
    await new Promise((resolve) => setTimeout(resolve, 400));
    const missingSizeRequests = await page.evaluate('window.__amoresNetworkEvents.filter((item) => item.method === "POST" && item.path.endsWith("/cadastro/solicitar")).length');
    assert.equal(missingSizeRequests, 0,
      'O backend recebeu uma solicitação sem porte.');

    await fillRegistration(page, { breed: 'SRD', size: 'medio' });
    const preSend = await page.evaluate('window.__amoresNetworkEvents.length');
    const submitValid = await page.evaluate(`(() => {
      const form = document.querySelector('.agendamento-cadastro form');
      if (!form || !form.checkValidity()) return false;
      form.requestSubmit();
      return true;
    })()`);
    assert.equal(submitValid, true, 'Cadastro sintético completo não passou pela validação do navegador.');
    await waitFor(async () => page.evaluate('document.body.innerText.includes("Código enviado") || document.body.innerText.includes("Confirme que é você")'),
      'A etapa de código não abriu após o cadastro válido.');
    try {
      await waitFor(() => page.evaluate(`window.__amoresNetworkEvents.slice(${preSend}).some((item) => item.method === 'POST' && item.path.endsWith('/cadastro/solicitar') && item.status === 202)`),
        'A solicitação válida de código não retornou HTTP 202.');
    } catch {
      const observed = await page.evaluate(`window.__amoresNetworkEvents.slice(${preSend})
        .filter((item) => item.path.endsWith('/cadastro/solicitar'))
        .map(({ method, path, status, sameOrigin }) => ({ method, path, status, sameOrigin }))`);
      throw new Error(`A solicitação válida de código não retornou HTTP 202; respostas=${JSON.stringify(observed)}.`);
    }

    const mailboxResponse = await fetch(`${origin}/__amores/session/codes`, { headers: sessionHeaders });
    assert.equal(mailboxResponse.status, 200, 'SMTP sink local não está acessível pelo apoio privado.');
    const mailbox = await mailboxResponse.json();
    const registrationEmail = mailbox.emails.at(-1);
    assert.equal(mailbox.emails.length, 1, 'Cadastro deve enviar exatamente uma mensagem local.');
    assert.match(registrationEmail.code || '', /^\d{6}$/);

    const codeInput = await page.evaluate(`(() => {
      const input = document.querySelector('.agendamento-formulario-identificacao input[autocomplete="one-time-code"]');
      if (!input) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(registrationEmail.code)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.closest('form').requestSubmit();
      return true;
    })()`);
    assert.equal(codeInput, true, 'O campo de código de verificação não abriu.');
    await waitFor(() => page.evaluate('document.body.innerText.includes("Quem vem para a Amores Pet?")'),
      'O código válido não concluiu o cadastro e abriu a seleção de Pet.', 20000);
    const emptyPhotoFallback = await page.evaluate(`(() => {
      const card = [...document.querySelectorAll('.agendamento-pets-grade button')].find((button) => button.innerText.includes('Faísca HML'));
      return Boolean(card && card.querySelector('.agendamento-pet-avatar span')?.innerText.trim() === 'F'
        && !card.querySelector('.agendamento-pet-avatar img'));
    })()`);
    assert.equal(emptyPhotoFallback, true, 'Pet sem foto não exibiu o estado vazio do avatar.');
    const currentClientToken = await page.evaluate('sessionStorage.getItem("amores_pet_token_cliente")');
    assert.equal(typeof currentClientToken, 'string');
    assert.ok(currentClientToken.length >= 32);
    const publicNetwork = await page.evaluate('window.__amoresNetworkEvents.map(({ path, sameOrigin }) => ({ path, sameOrigin }))');
    assert.ok(publicNetwork.every((item) => item.sameOrigin), 'O frontend enviou requisição para uma origem externa ou backend principal.');

    const pets = await callApi(origin, '/api/agendamento-publico/meus-pets', { token: currentClientToken });
    const brisaPet = pets.pets.find((pet) => pet.nome === 'Faísca HML');
    assert.ok(brisaPet?.id, 'O Pet sintético não foi vinculado após o cadastro.');
    const services = await callApi(origin, '/api/agendamento-publico/servicos');
    const service = services.find((item) => item.nome === state.fixtures.serviceName);
    assert.ok(service?.id && Number(service.valor) === 45, 'Serviço sintético não preservou o snapshot esperado.');
    const date = state.fixtures.appointmentDate;
    const availability = await callApi(origin, `/api/agenda-publica/disponibilidade?data_inicio=${date}&data_fim=${date}`);
    const availableDay = availability.dias.find((day) => String(day.data).slice(0, 10) === date);
    const slotNuvem = availableDay?.horarios?.find((slot) => String(slot.horario).startsWith('09:00'));
    const slotFaisca = availableDay?.horarios?.find((slot) => String(slot.horario).startsWith('10:30'));
    assert.ok(slotNuvem?.id && slotFaisca?.id, 'Slots sintéticos para confirmação e recusa não estão disponíveis.');

    const identification = await callApi(origin, '/api/agendamento-publico/identificacao/solicitar', {
      method: 'POST', body: { cpf: state.fixtures.existingTutorCpf },
    });
    assert.ok(identification.desafio, 'Não foi criado desafio local de identificação para Aurora.');
    const identityMailboxResponse = await fetch(`${origin}/__amores/session/codes`, { headers: sessionHeaders });
    const identityMailbox = await identityMailboxResponse.json();
    assert.equal(identityMailbox.emails.length, 2, 'A sessão deve conter somente os dois e-mails sintéticos do roteiro.');
    const identityEmail = identityMailbox.emails.at(-1);
    assert.match(identityEmail.code || '', /^\d{6}$/);
    const identity = await callApi(origin, '/api/agendamento-publico/identificacao/confirmar', {
      method: 'POST', body: { desafio: identification.desafio, codigo: identityEmail.code },
    });
    assert.ok(identity.token, 'Identificação sintética de Aurora não foi confirmada.');
    const auroraPets = await callApi(origin, '/api/agendamento-publico/meus-pets', { token: identity.token });
    const nuvem = auroraPets.pets.find((pet) => pet.nome === 'HML Nuvem');
    assert.ok(nuvem?.id, 'O fixture Nuvem não está ligado ao Tutor esperado.');
    assert.equal(auroraPets.pets.filter((pet) => pet.nome !== 'HML Nuvem').length, 0,
      'A sessão pública Aurora expôs Pet adicional.');

    const nuvemRequest = await postPublicRequest(origin, identity.token, nuvem.id, slotNuvem.id, service.id);
    assert.equal(nuvemRequest.atendimento.status, 'AGUARDANDO_CONFIRMACAO');
    const faiscaRequest = await postPublicRequest(origin, currentClientToken, brisaPet.id, slotFaisca.id, service.id);
    assert.equal(faiscaRequest.atendimento.status, 'AGUARDANDO_CONFIRMACAO');

    const manager = state.fixtures.accounts.find((account) => account.label === 'Gerente de homologacao');
    assert.ok(manager?.email && manager.password, 'Conta sintética de gestão não está disponível.');
    const managerSession = await callApi(origin, '/api/auth/login', {
      method: 'POST', body: { email: manager.email, senha: manager.password },
    });
    assert.ok(managerSession.token, 'Login sintético de gestão falhou.');
    const nuvemId = nuvemRequest.atendimento.id;
    const faiscaId = faiscaRequest.atendimento.id;
    await callApi(origin, `/api/atendimentos/${nuvemId}/confirmar`, { method: 'PATCH', token: managerSession.token, body: {} });
    const refusalReason = 'Motivo sintético: horário reservado para teste de histórico.';
    await callApi(origin, `/api/atendimentos/${faiscaId}/recusar`, {
      method: 'PATCH', token: managerSession.token, body: { motivo: refusalReason },
    });

    const [nuvemDetailPayload, faiscaDetailPayload, nuvemHistory, faiscaHistory, historicalRows] = await Promise.all([
      callApi(origin, `/api/atendimentos/${nuvemId}`, { token: managerSession.token }),
      callApi(origin, `/api/atendimentos/${faiscaId}`, { token: managerSession.token }),
      callApi(origin, `/api/atendimentos/${nuvemId}/historico`, { token: managerSession.token }),
      callApi(origin, `/api/atendimentos/${faiscaId}/historico`, { token: managerSession.token }),
      callApi(origin, '/api/atendimentos/historico', { token: managerSession.token }),
    ]);
    const nuvemDetail = nuvemDetailPayload.atendimento;
    const faiscaDetail = faiscaDetailPayload.atendimento;
    assert.equal(nuvemDetail.status, 'AGENDADO');
    assert.equal(nuvemDetail.pagamento_status, 'PENDENTE');
    assert.ok(nuvemDetail.pagamento_id, 'Confirmação de Nuvem deve criar somente a cobrança pendente esperada.');
    assert.equal(Number(nuvemDetail.valor_total), 45);
    assert.equal(faiscaDetail.status, 'RECUSADO');
    assert.ok(!faiscaDetail.pagamento_status, 'Solicitação recusada não deve ter cobrança.');
    assert.equal(faiscaDetail.pagamento_id, null, 'Solicitação recusada não deve ter registro de cobrança.');
    const snapshotTotalFaisca = faiscaDetail.servicos.reduce((total, item) => total + Number(item.valor || 0), 0);
    assert.equal(snapshotTotalFaisca, 45, 'Valor original do serviço recusado deve permanecer no snapshot.');
    const faiscaHistoricalRow = historicalRows.find((item) => Number(item.id) === Number(faiscaId));
    assert.equal(Number(faiscaHistoricalRow?.valor_total), 45, 'Lista do histórico deve mostrar o snapshot original, não zero.');
    assert.deepEqual(nuvemHistory.eventos.map((event) => event.evento), ['SOLICITACAO_CRIADA', 'SOLICITACAO_CONFIRMADA']);
    assert.deepEqual(faiscaHistory.eventos.map((event) => event.evento), ['SOLICITACAO_CRIADA', 'SOLICITACAO_RECUSADA']);
    for (const history of [nuvemHistory.eventos, faiscaHistory.eventos]) {
      assert.ok(new Date(history[0].criado_em) <= new Date(history[1].criado_em), 'Eventos não estão em ordem cronológica.');
    }
    assert.equal(faiscaHistory.eventos[1].motivo, refusalReason);

    const petInventory = await callApi(origin, '/api/produtos', { token: managerSession.token });
    const productRows = Array.isArray(petInventory) ? petInventory : (petInventory.produtos || []);
    const shampoo = productRows.find((product) => product.nome === state.fixtures.productName);
    assert.ok(shampoo && Number(shampoo.quantidade_atual) === 5 && Number(shampoo.quantidade_minima) === 2,
      'A fixture de estoque não preserva saldo e mínimo iniciais.');

    await page.evaluate(`(() => {
      localStorage.setItem('token', ${JSON.stringify(managerSession.token)});
      localStorage.setItem('usuario', JSON.stringify(${JSON.stringify(managerSession.usuario)}));
    })()`);
    await page.navigate(`${origin}/atendimentos/${nuvemId}`);
    await waitFor(() => page.evaluate('document.body.innerText.includes("Histórico operacional") && document.body.innerText.includes("Solicitação confirmada")'),
      'A interface não exibiu a linha do tempo de confirmação.', 20000);
    const nuvemUi = await page.evaluate(`(() => {
      const timeline = [...document.querySelectorAll('.atendimento-detalhes-card')]
        .find((card) => card.querySelector('h2')?.innerText.trim() === 'Histórico operacional');
      const text = timeline?.innerText || '';
      const received = text.indexOf('Solicitação recebida');
      const confirmed = text.indexOf('Solicitação confirmada');
      const pageText = document.body.innerText;
      return { received, confirmed, pending: pageText.includes('Pagamento') && pageText.includes('Pendente') };
    })()`);
    assert.ok(nuvemUi.received >= 0 && nuvemUi.confirmed > nuvemUi.received, 'A interface não mostrou recebimento antes da confirmação.');
    assert.equal(nuvemUi.pending, true, 'A interface não comunicou a cobrança pendente de Nuvem.');

    await page.navigate(`${origin}/atendimentos/${faiscaId}`);
    await waitFor(() => page.evaluate(`[...document.querySelectorAll('.atendimento-detalhes-card')]
      .some((card) => card.querySelector('h2')?.innerText.trim() === 'Histórico operacional'
        && card.innerText.includes(${JSON.stringify(refusalReason)}))`),
      'A interface não apresentou o motivo da recusa.', 20000);
    const faiscaUi = await page.evaluate(`(() => {
      const timeline = [...document.querySelectorAll('.atendimento-detalhes-card')]
        .find((card) => card.querySelector('h2')?.innerText.trim() === 'Histórico operacional');
      const text = timeline?.innerText || '';
      const received = text.indexOf('Solicitação recebida');
      const refused = text.indexOf('Solicitação recusada');
      const motive = text.indexOf(${JSON.stringify(refusalReason)});
      const pageText = document.body.innerText;
      return { received, refused, motive, petName: pageText.includes('Faísca HML'), serviceValue: pageText.includes('45,00'), noCharge: pageText.includes('Sem cobrança') };
    })()`);
    assert.ok(faiscaUi.received >= 0 && faiscaUi.refused > faiscaUi.received, 'A interface não ordenou recebimento antes da recusa.');
    assert.ok(faiscaUi.motive > faiscaUi.refused, 'O motivo não aparece junto ao evento de recusa.');
    assert.equal(faiscaUi.petName, true, 'A interface não exibiu o Pet da solicitação recusada.');
    assert.equal(faiscaUi.serviceValue, true, 'A interface não preservou o valor original do serviço recusado.');
    assert.equal(faiscaUi.noCharge, true, 'A interface não comunicou com clareza que a solicitação recusada não gerou cobrança.');
    assert.equal(page.externalOrigins.size, 0, 'O navegador atingiu origem externa ou backend principal.');

    const finalAuditResponse = await fetch(`${origin}/__amores/session/audit`, { headers: sessionHeaders });
    const finalAudit = await finalAuditResponse.json();
    assert.equal(finalAudit.fixtures.novo_tutor_cadastrado, true);
    assert.equal(finalAudit.destinatarios_nao_sinteticos_persistidos, 0);
    assert.equal(finalAudit.destinatarios_todos_sinteticos, true);
    assert.equal(finalAudit.emails_no_sink, 2);
    assert.equal(finalAudit.estoque.movimentacoes, 0, 'O smoke de estoque não deve criar movimentações.');

    result = {
      hml028: {
        navegadorEdgeHeadless: true,
        idiomaPtBr: true,
        racaVaziaBloqueada: true,
        porteObrigatorioBloqueado: true,
        dadosRetidosNasDuasValidacoes: true,
        mensagensNativasCompreensiveis: true,
        cadastroValidoVerificadoNoSinkLocal: true,
        petFaiscaVinculado: true,
      },
      atend02: {
        eventosRecebimentoConfirmacaoRecusa: true,
        ordemCronologicaApiEInterface: true,
        motivoRecusaExibido: true,
        cobrancaPendenteDeNuvem: true,
        recusadaSemCobranca: true,
        valorOriginalDaRecusadaPreservado: true,
      },
      smokes: {
        origemSameOriginSemPorta3001: true,
        fixtureEstoqueSaldo5Minimo2SemMovimentos: true,
        emailsSink: finalAudit.emails_no_sink,
        todosDestinatariosSinteticos: finalAudit.destinatarios_todos_sinteticos,
        postgresDescartavel: true,
      },
    };
  } finally {
    await page.close();
    if (browser.exitCode === null) browser.kill();
    await new Promise((resolve) => {
      if (browser.exitCode !== null) return resolve();
      browser.once('exit', resolve);
      setTimeout(resolve, 3000);
    });
    const profilePath = path.resolve(profile);
    const rootPath = path.resolve(root);
    const relative = path.relative(rootPath, profilePath);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Perfil temporário fora da pasta privada da sessão.');
    if (fs.existsSync(profilePath)) fs.rmSync(profilePath, { recursive: true, force: false });
  }

  process.stdout.write(`${JSON.stringify({ resultado: 'PASS', evidencia: 'automacao de navegador real Edge headless e integracao PostgreSQL/SMTP sink', ...result })}\n`);
}

main().catch((error) => {
  const location = error.stack?.split('\n').find((line) => line.includes('teste-browser-lote1.cjs:'))?.trim();
  process.stderr.write(`Falha segura na automacao Lote 1: ${error.message}${location ? ` (${location})` : ''}\n`);
  process.exitCode = 1;
});
