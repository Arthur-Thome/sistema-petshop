jest.mock("../src/database/connection", () => ({ query: jest.fn() }));
jest.mock("../src/services/logService", () => ({ registrarLog: jest.fn() }));

const {
  validarTelefoneBrasil,
  validarEmailOpcional,
  UFS_BRASIL,
} = require("../src/utils/telefoneBrasil");
const pool = require("../src/database/connection");
const { cadastrarTutor, atualizarTutor, validarDadosTutor, normalizarDadosTutor } = require("../src/controllers/tutorController");

const tutor = (overrides = {}) => normalizarDadosTutor({
  nome: "Teste",
  telefone: "(11) 98765-4321",
  endereco: "Rua Fictícia, 1",
  ...overrides,
});

describe("validação cadastral de telefone", () => {
  test.each(["(11) 98765-4321", "(21) 2345-6789", "11987654321", "(51) 8765-4321"])("aceita número estruturalmente válido: %s", (telefone) => {
    expect(validarTelefoneBrasil(telefone)).toBe(true);
    expect(validarDadosTutor(tutor({ telefone }))).toBeNull();
  });

  test.each(["(00) 00000-0000", "00000000000", "(11) 11111-1111", "119876543", "(11) 1234-567", "(01) 98765-4321", "texto"])("rejeita número inválido: %s", (telefone) => {
    expect(validarTelefoneBrasil(telefone)).toBe(false);
    expect(validarDadosTutor(tutor({ telefone }))).toMatch(/telefone/i);
  });

  test("requisição direta ao controller rejeita DDD 00 antes de qualquer INSERT", async () => {
    pool.query.mockClear();
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await cadastrarTutor({
      body: {
        nome: "Tutor fictício",
        telefone: "(00) 00000-0000",
        endereco: "Rua de teste, 1",
      },
      usuario: { id: 1 },
      ip: "127.0.0.1",
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json.mock.calls[0][0].mensagem).toMatch(/telefone/i);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test("atualização direta preserva telefone legado inválido sem alterá-lo", async () => {
    const anterior = {
      id: 7,
      nome: "Tutor antigo",
      cpf: null,
      telefone: "(00) 00000-0000",
      endereco: "Rua antiga, 1",
      ativo: true,
    };
    pool.query.mockReset()
      .mockResolvedValueOnce({ rows: [anterior] })
      .mockResolvedValueOnce({ rows: [{ ...anterior, nome: "Tutor atualizado" }] });
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await atualizarTutor({
      params: { id: "7" },
      body: { nome: "Tutor atualizado", telefone: anterior.telefone, endereco: anterior.endereco },
      usuario: { id: 1 },
      ip: "127.0.0.1",
    }, response);

    expect(response.status).toHaveBeenCalledWith(200);
    const updateCall = pool.query.mock.calls.find(([sql]) => String(sql).includes("UPDATE tutores"));
    expect(updateCall).toBeDefined();
    expect(updateCall[1][2]).toBe(anterior.telefone);
  });

  test("atualização direta rejeita novo telefone inválido e não atualiza", async () => {
    pool.query.mockReset().mockResolvedValueOnce({
      rows: [{ id: 7, telefone: "(11) 98765-4321" }],
    });
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await atualizarTutor({
      params: { id: "7" },
      body: { nome: "Tutor atualizado", telefone: "(00) 00000-0000", endereco: "Rua de teste, 1" },
      usuario: { id: 1 },
      ip: "127.0.0.1",
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(pool.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE tutores"))).toBe(false);
  });

  test("atualização preserva e-mail e UF legados inválidos quando idênticos após normalização", async () => {
    const anterior = {
      id: 8,
      nome: "Tutor antigo",
      cpf: null,
      telefone: "(11) 98765-4321",
      email: "email-invalido",
      estado: "XX",
      endereco: "Rua antiga, 1",
      ativo: true,
    };
    pool.query.mockReset()
      .mockResolvedValueOnce({ rows: [anterior] })
      .mockResolvedValueOnce({ rows: [{ ...anterior, nome: "Tutor corrigido" }] });
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await atualizarTutor({
      params: { id: "8" },
      body: {
        nome: "Tutor corrigido",
        telefone: anterior.telefone,
        email: "EMAIL-INVALIDO",
        estado: "xx",
        endereco: anterior.endereco,
      },
      usuario: { id: 1 },
      ip: "127.0.0.1",
    }, response);

    expect(response.status).toHaveBeenCalledWith(200);
    const updateCall = pool.query.mock.calls.find(([sql]) => String(sql).includes("UPDATE tutores"));
    expect(updateCall[1][3]).toBe("email-invalido");
    expect(updateCall[1][9]).toBe("XX");
  });

  test("atualização rejeita alterações para e-mail ou UF inválidos", async () => {
    for (const body of [
      { email: "nao-e-email" },
      { estado: "XX" },
    ]) {
      pool.query.mockReset().mockResolvedValueOnce({
        rows: [{ id: 9, telefone: "(11) 98765-4321", email: "tutor@example.invalid", estado: "RS" }],
      });
      const response = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await atualizarTutor({
        params: { id: "9" },
        body: {
          nome: "Tutor atualizado",
          telefone: "(11) 98765-4321",
          endereco: "Rua de teste, 1",
          ...body,
        },
        usuario: { id: 1 },
        ip: "127.0.0.1",
      }, response);

      expect(response.status).toHaveBeenCalledWith(400);
      expect(pool.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE tutores"))).toBe(false);
    }
  });
});

describe("contrato do cadastro interno de tutor", () => {
  test("cidade e UF permanecem opcionais no cadastro interno", () => {
    expect(validarDadosTutor(tutor())).toBeNull();
    expect(UFS_BRASIL.has("RS")).toBe(true);
  });

  test("rejeita UF não brasileira quando preenchida", () => {
    expect(validarDadosTutor(tutor({ estado: "XX" }))).toMatch(/UF/i);
  });

  test("e-mail continua opcional, mas rejeita formato inválido quando informado", () => {
    expect(validarEmailOpcional("")).toBe(true);
    expect(validarDadosTutor(tutor({ email: "" }))).toBeNull();
    expect(validarDadosTutor(tutor({ email: "nao-e-email" }))).toMatch(/e-mail/i);
    expect(validarEmailOpcional("tutor@example.invalid")).toBe(true);
  });
});
