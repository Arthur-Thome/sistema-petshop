import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const TEST_PASSWORD = 'L2-browser-synthetic-password';
const PROFILE_IDS = { funcionario: 1, gerente: 2, administrador: 3, super_administrador: 4 };
const PROFILES = [
  ['funcionario', { gallery: true, site: false, administration: false, hardDelete: false }],
  ['gerente', { gallery: true, site: false, administration: false, hardDelete: false }],
  ['administrador', { gallery: false, site: true, administration: true, hardDelete: false }],
  ['super_administrador', { gallery: false, site: true, administration: true, hardDelete: true }],
];

async function installApiMocks(page, { profile = 'super_administrador' } = {}) {
  const calls = [];
  let currentProfile = profile;
  let currentUser = { id: PROFILE_IDS[profile], nome: `L2 ${profile}`, email: `${profile}@example.invalid`, perfil: profile };
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf8sAAAAASUVORK5CYII=', 'base64');

  await page.route('**/health/ready', route => route.fulfill({ status: 200, json: { status: 'ready' } }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    const body = (() => { try { return request.postDataJSON(); } catch { return {}; } })();
    calls.push({ method, pathname, body, headers: request.headers() });

    if (pathname === '/auth/login' && method === 'POST') {
      currentProfile = profile;
      currentUser = { id: PROFILE_IDS[profile], nome: `L2 ${profile}`, email: body.email, perfil: profile };
      return route.fulfill({ status: 200, json: { token: 'synthetic-ui-token', usuario: currentUser } });
    }
    if (pathname === '/auth/me') return route.fulfill({ status: 200, json: { usuario: currentUser } });
    if (pathname === '/notificacoes' && method === 'GET') {
      return route.fulfill({ status: 200, json: {
        notificacoes: [{ id: 71, evento: 'ATENDIMENTO_CONFIRMADO', titulo: 'Solicitação confirmada', mensagem: 'Notificação sintética para o perfil atual.', destino: '/atendimentos', criado_em: '2026-10-17T12:00:00Z', lida_em: null }],
        nao_lidas: 1, preferencia: 'VISUAL',
      } });
    }
    if (pathname === '/site-conteudo/admin' && method === 'GET') {
      return route.fulfill({ status: 200, json: { configuracoes: {}, premios: [], galeria: [{ id: 9, titulo: 'Foto sintética L2', legenda: 'Teste isolado', texto_alternativo: 'Imagem de teste', categoria: 'Teste', ordem: 0, publicado: false, mime_type: 'image/png', tamanho_bytes: 1 }] } });
    }
    if (pathname === '/site-conteudo/admin/galeria' && method === 'GET') {
      return route.fulfill({ status: 200, json: { galeria: [{ id: 9, titulo: 'Foto sintética L2', legenda: 'Teste isolado', texto_alternativo: 'Imagem de teste', categoria: 'Teste', ordem: 0, publicado: false, mime_type: 'image/png', tamanho_bytes: 1 }] } });
    }
    if (/^\/site-conteudo\/admin\/galeria\/\d+\/imagem$/.test(pathname) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'image/png', body: image });
    }
    if (pathname === '/operacoes/autorizacoes/autorizadores' && method === 'GET') {
      return route.fulfill({ status: 200, json: [
        { id: 3, nome: 'Administrador sintético', email: 'admin@example.invalid', perfil: 'administrador' },
        { id: 4, nome: 'Super sintético', email: 'super@example.invalid', perfil: 'super_administrador' },
      ] });
    }
    if (pathname === '/operacoes/autorizacoes' && method === 'POST') {
      if (body.senha === 'senha-incorreta-sintetica') {
        return route.fulfill({ status: 401, json: { mensagem: 'Senha do autorizador incorreta.' } });
      }
      return route.fulfill({ status: 201, json: { autorizacao: 'synthetic-one-use-operation-token', expira_em_segundos: 300 } });
    }
    if (/^\/site-conteudo\/admin\/galeria\/\d+$/.test(pathname) && method === 'PUT') {
      return route.fulfill({ status: 200, json: { imagem: { id: 9, ...body } } });
    }
    if (/^\/exclusoes-definitivas\/tutores\/\d+$/.test(pathname) && method === 'GET') {
      const id = Number(pathname.split('/').at(-1));
      const blocked = id === 43;
      return route.fulfill({ status: 200, json: {
        entidade: 'Tutor', registro: { id, nome: `Tutor sintético ${id}`, ativo: false },
        elegivel: !blocked, dependencias: blocked ? ['pets'] : [],
        motivo_bloqueio: blocked ? 'Existem registros dependentes que precisam ser preservados.' : null,
      } });
    }
    if (/^\/exclusoes-definitivas\/tutores\/\d+$/.test(pathname) && method === 'DELETE') {
      return route.fulfill({ status: 200, json: { mensagem: 'Registro sintético excluído no mock.' } });
    }
    return route.fulfill({ status: 200, json: { configuracoes: {}, premios: [], galeria: [], notificacoes: [], nao_lidas: 0, preferencia: 'VISUAL' } });
  });
  return { calls, setProfile: value => { profile = value; }, getCurrentProfile: () => currentProfile };
}

async function loginAs(page, profile) {
  await page.goto('/login');
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await page.getByLabel('E-mail').fill(`${profile}@example.invalid`);
  await page.getByLabel('Senha').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('complementary').getByText(`L2 ${profile}`)).toBeVisible();
}

async function abrirGaleria(page, profile) {
  await page.getByRole('link', { name: profile === 'funcionario' || profile === 'gerente' ? /Galeria de Fotos/ : /Conteúdo do Site/ }).click();
  if (!['funcionario', 'gerente'].includes(profile)) await page.getByRole('button', { name: 'Galeria de fotos' }).click();
  await expect(page.getByRole('heading', { name: 'Galeria de fotos', exact: true, level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Editar / ordenar' }).click();
  await expect(page.getByRole('heading', { name: 'Editar fotografia' })).toBeVisible();
}

test.describe('Lote 2 — interface compilada com API isolada por mocks', () => {
  for (const [profile, expected] of PROFILES) {
    test(`login e menus: ${profile}`, async ({ page }) => {
      await installApiMocks(page, { profile });
      await loginAs(page, profile);
      await expect(page.getByRole('link', { name: /Galeria de Fotos/ })).toHaveCount(expected.gallery ? 1 : 0);
      await expect(page.getByRole('link', { name: /Conteúdo do Site/ })).toHaveCount(expected.site ? 1 : 0);
      await expect(page.getByRole('link', { name: /Agenda Pública/ })).toHaveCount(expected.site ? 1 : 0);
      await expect(page.getByRole('link', { name: /Administração/ })).toHaveCount(expected.administration ? 1 : 0);
      await expect(page.getByRole('link', { name: /Exclusões definitivas/ })).toHaveCount(expected.hardDelete ? 1 : 0);
      if (expected.administration) {
        await page.goto('/administracao/usuarios/novo');
        await expect(page.getByRole('heading', { name: 'Criar novo usuário' })).toBeVisible();
        const profileValues = await page.locator('#perfil option').evaluateAll(options => options.map(option => option.value));
        expect(profileValues).toEqual(['funcionario', 'gerente', 'administrador']);
      }
    });
  }

  test('Administrador edita a Galeria diretamente sem autorização adicional', async ({ page }) => {
    const { calls } = await installApiMocks(page, { profile: 'administrador' });
    await loginAs(page, 'administrador');
    await abrirGaleria(page, 'administrador');
    await page.getByLabel('Título').fill('Atualização direta sintética');
    await page.getByRole('button', { name: 'Salvar imagem' }).click();
    await expect(page.getByText('Imagem atualizada.')).toBeVisible();
    expect(calls.filter(call => call.pathname === '/operacoes/autorizacoes' && call.method === 'POST')).toHaveLength(0);
    expect(calls.some(call => call.pathname === '/site-conteudo/admin/galeria/9' && call.method === 'PUT')).toBe(true);
  });

  test('Gerente rejeita senha errada e conclui uma edição autorizada por outro Administrador', async ({ page }) => {
    const { calls } = await installApiMocks(page, { profile: 'gerente' });
    await loginAs(page, 'gerente');
    await abrirGaleria(page, 'gerente');
    await page.getByLabel('Título').fill('Atualização cruzada sintética');
    await page.getByRole('button', { name: 'Salvar imagem' }).click();
    const dialog = page.getByRole('dialog', { name: 'Autorizar alteração da Galeria' });
    await expect(dialog).toBeVisible();
    await dialog.locator('[name="autorizador_id"]').selectOption('3');
    await dialog.getByLabel('Senha do autorizador').fill('senha-incorreta-sintetica');
    await dialog.getByRole('button', { name: 'Autorizar operação' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Senha do autorizador incorreta');
    await dialog.locator('[name="autorizador_id"]').selectOption('3');
    await dialog.getByLabel('Senha do autorizador').fill(TEST_PASSWORD);
    await dialog.getByRole('button', { name: 'Autorizar operação' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Imagem atualizada.')).toBeVisible();
    const authCall = calls.find(call => call.pathname === '/operacoes/autorizacoes' && call.method === 'POST' && call.body.senha === TEST_PASSWORD);
    const editCall = calls.find(call => call.pathname === '/site-conteudo/admin/galeria/9' && call.method === 'PUT');
    expect(authCall.body.autorizador_id).toBe(3);
    expect(authCall.body.contexto.titulo).toBe('Atualização cruzada sintética');
    expect(editCall.headers['x-operation-authorization']).toBe('synthetic-one-use-operation-token');
  });

  test('Funcionário edita a Galeria com autorização de outro Super Administrador', async ({ page }) => {
    const { calls } = await installApiMocks(page, { profile: 'funcionario' });
    await loginAs(page, 'funcionario');
    await abrirGaleria(page, 'funcionario');
    await page.getByLabel('Título').fill('Alteração de Funcionário sintética');
    await page.getByRole('button', { name: 'Salvar imagem' }).click();
    const dialog = page.getByRole('dialog', { name: 'Autorizar alteração da Galeria' });
    await expect(dialog).toBeVisible();
    await dialog.locator('[name="autorizador_id"]').selectOption('4');
    await dialog.getByLabel('Senha do autorizador').fill(TEST_PASSWORD);
    await dialog.getByRole('button', { name: 'Autorizar operação' }).click();
    await expect(page.getByText('Imagem atualizada.')).toBeVisible();
    const call = calls.find(item => item.pathname === '/operacoes/autorizacoes' && item.method === 'POST');
    expect(call.body.autorizador_id).toBe(4);
  });

  test('prévia de dependências e Cancelar limpam a confirmação sem enviar autorização nem exclusão', async ({ page }) => {
    const { calls } = await installApiMocks(page, { profile: 'super_administrador' });
    await loginAs(page, 'super_administrador');
    await page.goto('/administracao/exclusoes-definitivas');
    await page.getByLabel('Identificador do registro').fill('43');
    await page.getByRole('button', { name: 'Verificar dependências' }).click();
    await expect(page.getByRole('status')).toContainText('registros dependentes');
    await expect(page.getByRole('button', { name: 'Excluir definitivamente' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Tutor · ID 43')).toHaveCount(0);
    await page.getByLabel('Identificador do registro').fill('42');
    await page.getByRole('button', { name: 'Verificar dependências' }).click();
    await expect(page.getByText('Não foram encontradas dependências.')).toBeVisible();
    await page.getByLabel(/Motivo obrigatório/).fill('Motivo sintético suficiente para teste.');
    await page.getByLabel('Digite EXCLUIR 42').fill('EXCLUIR 41');
    await page.getByLabel('Confirmo que a operação é irreversível').check();
    await page.getByLabel('Senha do Super Administrador').fill(TEST_PASSWORD);
    await expect(page.getByRole('button', { name: 'Excluir definitivamente' })).toBeDisabled();
    await page.getByLabel('Digite EXCLUIR 42').fill('EXCLUIR 42');
    await expect(page.getByRole('button', { name: 'Excluir definitivamente' })).toBeEnabled();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Tutor · ID 42')).toHaveCount(0);
    expect(calls.filter(call => call.pathname === '/operacoes/autorizacoes' && call.method === 'POST')).toHaveLength(0);
    expect(calls.filter(call => call.pathname.startsWith('/exclusoes-definitivas/') && call.method === 'DELETE')).toHaveLength(0);
  });

  test('exclusão sintética exige reautenticação, motivo, frase e confirmação antes de usar o mock', async ({ page }) => {
    const { calls } = await installApiMocks(page, { profile: 'super_administrador' });
    await loginAs(page, 'super_administrador');
    await page.goto('/administracao/exclusoes-definitivas');
    await page.getByLabel('Identificador do registro').fill('42');
    await page.getByRole('button', { name: 'Verificar dependências' }).click();
    await page.getByLabel(/Motivo obrigatório/).fill('Remoção controlada da fixture fictícia.');
    await page.getByLabel('Digite EXCLUIR 42').fill('EXCLUIR 42');
    await page.getByLabel('Confirmo que a operação é irreversível').check();
    await page.getByLabel('Senha do Super Administrador').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Excluir definitivamente' }).click();
    await expect(page.getByRole('status')).toContainText('excluído no mock');
    const authorization = calls.find(call => call.pathname === '/operacoes/autorizacoes' && call.method === 'POST');
    const deletion = calls.find(call => call.pathname === '/exclusoes-definitivas/tutores/42' && call.method === 'DELETE');
    expect(authorization.body.operacao).toBe('PERMANENT_DELETE');
    expect(authorization.body.senha).toBe(TEST_PASSWORD);
    expect(authorization.body.contexto.confirmacao).toBe('EXCLUIR 42');
    expect(authorization.body.contexto.confirmacao_irreversivel).toBe(true);
    expect(deletion.headers['x-operation-authorization']).toBe('synthetic-one-use-operation-token');
    expect(deletion.body.motivo).toContain('fixture fictícia');
  });

  test('painel de notificações mostra o item direcionado ao Super Administrador', async ({ page }) => {
    await installApiMocks(page, { profile: 'super_administrador' });
    await loginAs(page, 'super_administrador');
    await page.getByRole('button', { name: /Notificações não lidas: 1/ }).click();
    const panel = page.getByRole('region', { name: 'Central de notificações' });
    await expect(panel.getByText('Solicitação confirmada')).toBeVisible();
    await expect(panel.getByText('Notificação sintética para o perfil atual.')).toBeVisible();
  });
});
