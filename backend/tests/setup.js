process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'chave-ficticia-exclusiva-da-suite-http-d1';
process.env.FRONTEND_URL = 'http://localhost:5173';
jest.mock('dotenv', () => ({ config: () => { throw new Error('dotenv proibido nos testes'); } }));
// Nenhum teste padrao abre sockets PostgreSQL, mesmo com DB_* herdado.
jest.mock('../src/database/connection', () => ({
  query: jest.fn(() => { throw new Error('Consulta nao simulada'); }),
  connect: jest.fn(() => { throw new Error('Conexao real proibida na suite padrao'); }),
}));
jest.mock('../src/services/emailService', () => ({
  enviarEmail: jest.fn(() => { throw new Error('Envio real proibido em testes'); }),
  verificarConexaoEmail: jest.fn(),
}));
