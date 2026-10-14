jest.mock('../src/middleware/clientePublicoMiddleware', () => (req, _res, next) => {
  req.clientePublico = { tutorId: 44, sessaoId: 9, tutorNome: 'Tutor teste' };
  next();
});

const request = require('supertest');
const app = require('../app');
const pool = require('../src/database/connection');
const { validarPet } = require('../src/controllers/petPublicoController');

const petValido = { nome: 'Luna', especie: 'cachorro', raca: 'SRD', porte: 'gigante' };

function clientFor({ failLink = false, linked = true } = {}) {
  const client = { release: jest.fn(), query: jest.fn(async (sql) => {
    const q = String(sql).replace(/\s+/g, ' ').toLowerCase();
    if (/^(begin|commit|rollback)$/.test(q) || q.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (q.startsWith('select janela_inicio')) return { rows: [] };
    if (q.startsWith('insert into limites_cliente_publico')) return { rows: [] };
    if (q.startsWith('select id from tutores')) return { rows: [{ id: 44 }] };
    if (q.startsWith('insert into pets')) return { rows: [{ id: 71, tutor_id: 44, nome: 'Luna', especie: 'cachorro', raca: 'SRD', porte: 'gigante' }] };
    if (q.startsWith('insert into pet_tutores')) { if (failLink) throw new Error('link-failure'); return { rows: [] }; }
    if (q.startsWith('select p.id, p.porte')) return { rows: linked ? [{ id: 71, porte: null }] : [] };
    if (q.startsWith('update pets set raca')) return { rows: [{ id: 71, raca: 'SRD', porte: 'medio' }] };
    return { rows: [] };
  }) };
  pool.connect.mockResolvedValue(client);
  return client;
}

beforeEach(() => {
  pool.connect.mockReset();
});

test('recusa raça vazia, aceita texto livre e SRD e exige porte se raça não identificada', () => {
  expect(validarPet({ ...petValido, raca: '  ' }).erros).toContain('Informe a raça do pet (até 100 caracteres).');
  expect(validarPet({ ...petValido, raca: 'Shih Tzu' }).erros).toHaveLength(0);
  expect(validarPet({ ...petValido, raca: 'SRD' }).erros).toHaveLength(0);
  expect(validarPet({ ...petValido, raca: 'Não sei informar', porte: '' }).erros.join(' ')).toMatch(/porte/i);
  expect(validarPet({ ...petValido, raca: 'Não sei informar', porte: 'medio' }).erros).toHaveLength(0);
});

test('cadastro de pet usa tutor da sessão, ignora tutor_id manipulado e grava vínculo na mesma transação', async () => {
  const client = clientFor();
  const response = await request(app).post('/api/agendamento-publico/meus-pets')
    .send({ pet: petValido, tutor_id: 999 });
  expect(response.status).toBe(201);
  const insertPet = client.query.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO pets'));
  const insertLink = client.query.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO pet_tutores'));
  expect(insertPet[1][0]).toBe(44);
  expect(insertLink[1]).toEqual([71, 44]);
  expect(client.query.mock.calls.map(([sql]) => String(sql).trim().toUpperCase())).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
});

test('pet de outro tutor não pode ter raça ou porte alterados', async () => {
  const client = clientFor({ linked: false });
  const response = await request(app).patch('/api/agendamento-publico/meus-pets/71/raca')
    .send({ raca: 'SRD', porte: 'medio', tutor_id: 999 });
  expect(response.status).toBe(404);
  expect(client.query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE pets'))).toBe(false);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
});

test('falha ao gravar vínculo desfaz a criação do pet', async () => {
  const client = clientFor({ failLink: true });
  const response = await request(app).post('/api/agendamento-publico/meus-pets').send({ pet: petValido });
  expect(response.status).toBe(500);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(client.query.mock.calls.some(([sql]) => String(sql).startsWith('COMMIT'))).toBe(false);
});

test('foto inválida falha antes de gravar pet', async () => {
  const client = clientFor();
  const response = await request(app).post('/api/agendamento-publico/meus-pets')
    .field('pet', JSON.stringify(petValido))
    .attach('foto', Buffer.from('not-an-image'), { filename: 'pet.txt', contentType: 'text/plain' });
  expect(response.status).toBe(400);
  expect(client.query).not.toHaveBeenCalled();
});
