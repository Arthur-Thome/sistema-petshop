const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");
const QRCode = require("qrcode");

const {
  gerarPayloadPix,
} = require("../utils/pix");


const LIMITE_OBSERVACOES = 2000;
const LIMITE_MOTIVO_CANCELAMENTO = 1000;
const LIMITE_SERVICOS_POR_ATENDIMENTO = 50;

const METODOS_PAGAMENTO = [
  "PIX",
  "DINHEIRO",
  "CARTAO_CREDITO",
  "CARTAO_DEBITO",
];


/*
 * Converte um valor em ID e garante que seja
 * um número inteiro positivo.
 */
function converterId(valor) {
  const id = Number(valor);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return id;
}


/*
 * Normaliza campos de texto opcionais.
 *
 * Campos vazios são armazenados como null para evitar
 * strings contendo somente espaços no banco.
 */
function normalizarTextoOpcional(valor) {
  if (
    valor === undefined ||
    valor === null
  ) {
    return null;
  }

  if (typeof valor !== "string") {
    return null;
  }

  const texto = valor.trim();

  return texto || null;
}


/*
 * Valida textos opcionais antes que qualquer .trim()
 * seja executado.
 */
function validarTextoOpcional(
  valor,
  nomeCampo,
  limite
) {
  if (
    valor !== undefined &&
    valor !== null &&
    typeof valor !== "string"
  ) {
    return `${nomeCampo} deve ser um texto.`;
  }

  const texto =
    normalizarTextoOpcional(valor);

  if (
    texto &&
    texto.length > limite
  ) {
    return `${nomeCampo} deve possuir no máximo ${limite} caracteres.`;
  }

  return null;
}


/*
 * Registra auditoria sem transformar uma operação
 * já concluída em erro para o operador.
 */
async function registrarLogSeguro(dados) {
  try {
    await registrarLog(dados);
  } catch (erro) {
    console.error(
      "Operação concluída, mas houve erro ao gerar o log:",
      erro
    );
  }
}


/*
 * Cria um novo agendamento.
 *
 * Os preços e durações são sempre obtidos do banco.
 * Nenhum valor financeiro recebido do frontend é utilizado.
 */
async function criarAgendamento(req, res) {
  let client;
  let transacaoIniciada = false;

  try {
    const {
      pet_id,
      servicos,
      agendado_para,
      observacoes_agendamento,
    } = req.body;

    const petId = converterId(pet_id);

    if (!petId) {
      return res.status(400).json({
        mensagem: "Selecione um pet válido.",
      });
    }

    if (
      !Array.isArray(servicos) ||
      servicos.length === 0
    ) {
      return res.status(400).json({
        mensagem:
          "Selecione pelo menos um serviço.",
      });
    }

    /*
     * Também limitamos a quantidade recebida antes de
     * processar o array para evitar payloads abusivos.
     */
    if (
      servicos.length >
      LIMITE_SERVICOS_POR_ATENDIMENTO
    ) {
      return res.status(400).json({
        mensagem:
          `Selecione no máximo ${LIMITE_SERVICOS_POR_ATENDIMENTO} serviços por atendimento.`,
      });
    }

    const servicosUnicos = [
      ...new Set(
        servicos.map(converterId)
      ),
    ];

    if (
      servicosUnicos.some(
        (id) => id === null
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Existe um serviço inválido no agendamento.",
      });
    }

    /*
     * O horário precisa representar uma data válida.
     */
    if (
      typeof agendado_para !== "string" ||
      !agendado_para.trim()
    ) {
      return res.status(400).json({
        mensagem:
          "Informe a data e o horário do agendamento.",
      });
    }

    const dataAgendamento =
      new Date(agendado_para);

    if (
      Number.isNaN(
        dataAgendamento.getTime()
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Informe uma data de agendamento válida.",
      });
    }

    /*
     * Novos agendamentos não podem ser criados no passado.
     *
     * Esta regra vale somente para a criação. Um atendimento
     * já agendado não será impedido de iniciar apenas porque
     * seu horário previsto já passou.
     */
    if (
      dataAgendamento.getTime() <
      Date.now()
    ) {
      return res.status(400).json({
        mensagem:
          "Não é possível criar um agendamento para uma data ou horário que já passou.",
      });
    }

    const erroObservacoes =
      validarTextoOpcional(
        observacoes_agendamento,
        "As observações do agendamento",
        LIMITE_OBSERVACOES
      );

    if (erroObservacoes) {
      return res.status(400).json({
        mensagem: erroObservacoes,
      });
    }

    const observacoesNormalizadas =
      normalizarTextoOpcional(
        observacoes_agendamento
      );

    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    /*
     * Bloqueamos o cadastro do Pet durante a criação.
     * Isso evita que seu estado seja alterado enquanto
     * o agendamento está sendo validado.
     */
    const resultadoPet =
      await client.query(
        `
          SELECT
            p.id,
            p.nome,
            p.ativo,

            t.id AS tutor_id,
            t.nome AS tutor_nome,
            t.telefone AS tutor_telefone

          FROM pets p

          INNER JOIN tutores t
            ON t.id = p.tutor_id

          WHERE p.id = $1

          FOR UPDATE OF p
        `,
        [petId]
      );

    if (
      resultadoPet.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem: "Pet não encontrado.",
      });
    }

    const pet = resultadoPet.rows[0];

    if (!pet.ativo) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(400).json({
        mensagem:
          "Não é possível agendar atendimento para um pet inativo.",
      });
    }

    /*
     * O preço e a duração dos serviços são obtidos
     * diretamente do banco.
     */
    const resultadoServicos =
      await client.query(
        `
          SELECT
            id,
            nome,
            descricao,
            valor,
            duracao_minutos,
            ativo

          FROM servicos

          WHERE id = ANY($1::int[])

          ORDER BY nome
        `,
        [servicosUnicos]
      );

    if (
      resultadoServicos.rows.length !==
      servicosUnicos.length
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(400).json({
        mensagem:
          "Um ou mais serviços selecionados não existem.",
      });
    }

    const servicoInativo =
      resultadoServicos.rows.find(
        (servico) => !servico.ativo
      );

    if (servicoInativo) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(400).json({
        mensagem:
          `O serviço "${servicoInativo.nome}" está inativo.`,
      });
    }

    const resultadoAgendamento =
      await client.query(
        `
          INSERT INTO banho_tosa
          (
            pet_id,
            agendado_para,
            observacoes_agendamento,
            usuario_criacao_id
          )

          VALUES ($1, $2, $3, $4)

          RETURNING *
        `,
        [
          petId,
          agendado_para,
          observacoesNormalizadas,
          req.usuario.id,
        ]
      );

    const agendamento =
      resultadoAgendamento.rows[0];

    let valorTotal = 0;
    let duracaoTotal = 0;

    const servicosAgendamento = [];

    /*
     * O snapshot garante que alterações futuras no catálogo
     * não modifiquem atendimentos já contratados.
     */
    for (
      const servico
      of resultadoServicos.rows
    ) {
      const valor =
        Number(servico.valor || 0);

      const duracao =
        servico.duracao_minutos
          ? Number(
              servico.duracao_minutos
            )
          : null;

      const resultadoItem =
        await client.query(
          `
            INSERT INTO banho_tosa_servicos
            (
              banho_tosa_id,
              servico_id,
              valor_unitario,
              duracao_minutos
            )

            VALUES ($1, $2, $3, $4)

            RETURNING *
          `,
          [
            agendamento.id,
            servico.id,
            valor,
            duracao,
          ]
        );

      valorTotal += valor;

      if (duracao) {
        duracaoTotal += duracao;
      }

      servicosAgendamento.push({
        ...resultadoItem.rows[0],
        nome: servico.nome,
        descricao: servico.descricao,
      });
    }

    /*
     * O pagamento nasce PENDENTE e o valor é calculado
     * exclusivamente a partir dos snapshots dos serviços.
     */
    const resultadoPagamento =
      await client.query(
        `
          INSERT INTO pagamentos_banho_tosa
          (
            banho_tosa_id,
            valor_total,
            status
          )

          VALUES ($1, $2, 'PENDENTE')

          RETURNING *
        `,
        [
          agendamento.id,
          valorTotal,
        ]
      );

    const pagamento =
      resultadoPagamento.rows[0];

    await client.query("COMMIT");
    transacaoIniciada = false;

    await registrarLogSeguro({
      usuarioId: req.usuario.id,
      acao: "AGENDAR_BANHO_TOSA",
      entidade: "banho_tosa",
      registroId: agendamento.id,
      valorAnterior: null,
      valorNovo: {
        ...agendamento,
        servicos: servicosAgendamento,
        valor_total: valorTotal,
      },
      ip: req.ip,
    });

    return res.status(201).json({
      mensagem:
        "Atendimento agendado com sucesso.",

      atendimento: {
        ...agendamento,

        pet_nome: pet.nome,

        tutor_id:
          pet.tutor_id,

        tutor_nome:
          pet.tutor_nome,

        tutor_telefone:
          pet.tutor_telefone,

        servicos:
          servicosAgendamento,

        valor_total:
          Number(valorTotal.toFixed(2)),

        duracao_total_minutos:
          duracaoTotal,

        pagamento,
      },
    });
  } catch (erro) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query("ROLLBACK");
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer transação:",
          erroRollback
        );
      }
    }

    console.error(
      "Erro ao criar agendamento de banho e tosa:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * Lista agendamentos e atendimentos que ainda
 * fazem parte da operação atual.
 */
async function listarAtivos(req, res) {
  try {
    const resultado =
      await pool.query(
        `
          SELECT
            bt.*,

            p.nome AS pet_nome,
            p.especie AS pet_especie,
            p.raca AS pet_raca,

            t.id AS tutor_id,
            t.nome AS tutor_nome,
            t.telefone AS tutor_telefone,

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', s.id,
                    'nome', s.nome,
                    'valor', bts.valor_unitario,
                    'duracao_minutos', bts.duracao_minutos
                  )
                  ORDER BY s.nome
                )

                FROM banho_tosa_servicos bts

                INNER JOIN servicos s
                  ON s.id = bts.servico_id

                WHERE
                  bts.banho_tosa_id = bt.id
              ),
              '[]'::json
            ) AS servicos,

            COALESCE(
              (
                SELECT SUM(
                  bts.valor_unitario
                )
                FROM banho_tosa_servicos bts
                WHERE
                  bts.banho_tosa_id = bt.id
              ),
              0
            ) AS valor_total,

            COALESCE(
              (
                SELECT SUM(
                  bts.duracao_minutos
                )
                FROM banho_tosa_servicos bts
                WHERE
                  bts.banho_tosa_id = bt.id
              ),
              0
            ) AS duracao_total_minutos

          FROM banho_tosa bt

          INNER JOIN pets p
            ON p.id = bt.pet_id

          INNER JOIN tutores t
            ON t.id = p.tutor_id

          WHERE bt.status IN (
            'AGENDADO',
            'EM_ATENDIMENTO'
          )

          ORDER BY
            bt.agendado_para ASC
        `
      );

    return res.status(200).json(
      resultado.rows
    );
  } catch (erro) {
    console.error(
      "Erro ao listar atendimentos:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


/*
 * Lista atendimentos encerrados.
 */
async function listarHistorico(req, res) {
  try {
    const resultado =
      await pool.query(
        `
          SELECT
            bt.*,

            p.nome AS pet_nome,

            t.id AS tutor_id,
            t.nome AS tutor_nome,
            t.telefone AS tutor_telefone,

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', s.id,
                    'nome', s.nome,
                    'valor', bts.valor_unitario,
                    'duracao_minutos', bts.duracao_minutos
                  )
                  ORDER BY s.nome
                )

                FROM banho_tosa_servicos bts

                INNER JOIN servicos s
                  ON s.id = bts.servico_id

                WHERE
                  bts.banho_tosa_id = bt.id
              ),
              '[]'::json
            ) AS servicos,

            COALESCE(
              pg.valor_total,
              0
            ) AS valor_total,

            pg.status AS pagamento_status

          FROM banho_tosa bt

          INNER JOIN pets p
            ON p.id = bt.pet_id

          INNER JOIN tutores t
            ON t.id = p.tutor_id

          LEFT JOIN pagamentos_banho_tosa pg
            ON pg.banho_tosa_id = bt.id

          WHERE bt.status IN (
            'FINALIZADO',
            'CANCELADO'
          )

          ORDER BY
            bt.agendado_para DESC
        `
      );

    return res.status(200).json(
      resultado.rows
    );
  } catch (erro) {
    console.error(
      "Erro ao listar histórico:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


/*
 * Retorna todos os dados necessários para visualizar
 * um atendimento e seu pagamento.
 */
async function buscarAtendimentoPorId(
  req,
  res
) {
  try {
    const id =
      converterId(req.params.id);

    if (!id) {
      return res.status(400).json({
        mensagem:
          "Informe um atendimento válido.",
      });
    }

    const resultado =
      await pool.query(
        `
          SELECT
            bt.*,

            p.nome AS pet_nome,
            p.especie AS pet_especie,
            p.raca AS pet_raca,

            t.id AS tutor_id,
            t.nome AS tutor_nome,
            t.telefone AS tutor_telefone,
            t.email AS tutor_email,

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', s.id,
                    'nome', s.nome,
                    'descricao', s.descricao,
                    'valor', bts.valor_unitario,
                    'duracao_minutos', bts.duracao_minutos
                  )
                  ORDER BY s.nome
                )

                FROM banho_tosa_servicos bts

                INNER JOIN servicos s
                  ON s.id = bts.servico_id

                WHERE
                  bts.banho_tosa_id = bt.id
              ),
              '[]'::json
            ) AS servicos,

            pg.id AS pagamento_id,
            pg.valor_total AS valor_total,
            pg.status AS pagamento_status,
            pg.metodo AS pagamento_metodo,
            pg.codigo_pagamento AS pagamento_codigo,
            pg.pago_em AS pagamento_pago_em

          FROM banho_tosa bt

          INNER JOIN pets p
            ON p.id = bt.pet_id

          INNER JOIN tutores t
            ON t.id = p.tutor_id

          LEFT JOIN pagamentos_banho_tosa pg
            ON pg.banho_tosa_id = bt.id

          WHERE bt.id = $1
        `,
        [id]
      );

    if (
      resultado.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Atendimento não encontrado.",
      });
    }

    return res.status(200).json({
      atendimento:
        resultado.rows[0],
    });
  } catch (erro) {
    console.error(
      "Erro ao buscar atendimento:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}

/*
 * Inicia um atendimento atualmente AGENDADO.
 *
 * Utilizamos transação + FOR UPDATE para impedir que duas
 * requisições iniciem o mesmo atendimento simultaneamente.
 *
 * O horário previsto não bloqueia o início. Isso permite que
 * a operação seja iniciada alguns minutos antes ou depois
 * do horário agendado.
 */
async function iniciarAtendimento(req, res) {
  let client;
  let transacaoIniciada = false;

  try {
    const id =
      converterId(req.params.id);

    if (!id) {
      return res.status(400).json({
        mensagem:
          "Informe um atendimento válido.",
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    const resultadoAnterior =
      await client.query(
        `
          SELECT
            bt.*,
            p.nome AS pet_nome,
            p.ativo AS pet_ativo
          FROM banho_tosa bt

          INNER JOIN pets p
            ON p.id = bt.pet_id

          WHERE bt.id = $1

          FOR UPDATE OF bt
        `,
        [id]
      );

    if (
      resultadoAnterior.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "Atendimento não encontrado.",
      });
    }

    const anterior =
      resultadoAnterior.rows[0];

    if (
      anterior.status !== "AGENDADO"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Somente atendimentos agendados podem ser iniciados.",
      });
    }

    /*
     * Um Pet inativado depois da criação do agendamento
     * não deve iniciar um novo atendimento operacional.
     */
    if (!anterior.pet_ativo) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(400).json({
        mensagem:
          "Não é possível iniciar atendimento de um pet inativo.",
      });
    }

    const resultado =
      await client.query(
        `
          UPDATE banho_tosa

          SET
            status = 'EM_ATENDIMENTO',
            iniciado_em = CURRENT_TIMESTAMP,
            usuario_inicio_id = $1,
            atualizado_em = CURRENT_TIMESTAMP

          WHERE id = $2
            AND status = 'AGENDADO'

          RETURNING *
        `,
        [
          req.usuario.id,
          id,
        ]
      );

    if (
      resultado.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "O atendimento já foi alterado por outro usuário.",
      });
    }

    const atualizado =
      resultado.rows[0];

    await client.query("COMMIT");
    transacaoIniciada = false;

    await registrarLogSeguro({
      usuarioId: req.usuario.id,
      acao: "INICIAR_BANHO_TOSA",
      entidade: "banho_tosa",
      registroId: atualizado.id,
      valorAnterior: anterior,
      valorNovo: atualizado,
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem:
        "Atendimento iniciado com sucesso.",

      atendimento:
        atualizado,
    });
  } catch (erro) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query("ROLLBACK");
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer início do atendimento:",
          erroRollback
        );
      }
    }

    console.error(
      "Erro ao iniciar atendimento:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * Finaliza somente atendimentos que estão EM_ATENDIMENTO.
 *
 * O registro é bloqueado até o COMMIT para impedir duas
 * finalizações simultâneas.
 */
async function finalizarAtendimento(
  req,
  res
) {
  let client;
  let transacaoIniciada = false;

  try {
    const id =
      converterId(req.params.id);

    if (!id) {
      return res.status(400).json({
        mensagem:
          "Informe um atendimento válido.",
      });
    }

    const {
      observacoes_atendimento,
    } = req.body;

    const erroObservacoes =
      validarTextoOpcional(
        observacoes_atendimento,
        "As observações do atendimento",
        LIMITE_OBSERVACOES
      );

    if (erroObservacoes) {
      return res.status(400).json({
        mensagem: erroObservacoes,
      });
    }

    const observacoesNormalizadas =
      normalizarTextoOpcional(
        observacoes_atendimento
      );

    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    const resultadoAnterior =
      await client.query(
        `
          SELECT *
          FROM banho_tosa
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

    if (
      resultadoAnterior.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "Atendimento não encontrado.",
      });
    }

    const anterior =
      resultadoAnterior.rows[0];

    if (
      anterior.status !==
      "EM_ATENDIMENTO"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Somente atendimentos em andamento podem ser finalizados.",
      });
    }

    const resultado =
      await client.query(
        `
          UPDATE banho_tosa

          SET
            status = 'FINALIZADO',
            finalizado_em = CURRENT_TIMESTAMP,
            observacoes_atendimento = $1,
            usuario_finalizacao_id = $2,
            atualizado_em = CURRENT_TIMESTAMP

          WHERE id = $3
            AND status = 'EM_ATENDIMENTO'

          RETURNING *
        `,
        [
          observacoesNormalizadas,
          req.usuario.id,
          id,
        ]
      );

    if (
      resultado.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "O atendimento já foi alterado por outro usuário.",
      });
    }

    const atualizado =
      resultado.rows[0];

    await client.query("COMMIT");
    transacaoIniciada = false;

    await registrarLogSeguro({
      usuarioId: req.usuario.id,
      acao: "FINALIZAR_BANHO_TOSA",
      entidade: "banho_tosa",
      registroId: atualizado.id,
      valorAnterior: anterior,
      valorNovo: atualizado,
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem:
        "Atendimento finalizado com sucesso.",

      atendimento:
        atualizado,
    });
  } catch (erro) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query("ROLLBACK");
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer finalização do atendimento:",
          erroRollback
        );
      }
    }

    console.error(
      "Erro ao finalizar atendimento:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * Cancela somente um atendimento ainda AGENDADO.
 *
 * O atendimento permanece armazenado para histórico.
 * Se o pagamento ainda estiver PENDENTE, ele também passa
 * para CANCELADO na mesma transação.
 *
 * Pagamentos já confirmados não são automaticamente
 * estornados.
 */
async function cancelarAgendamento(
  req,
  res
) {
  let client;
  let transacaoIniciada = false;

  try {
    const id =
      converterId(req.params.id);

    if (!id) {
      return res.status(400).json({
        mensagem:
          "Informe um atendimento válido.",
      });
    }

    const {
      motivo_cancelamento,
    } = req.body;

    if (
      typeof motivo_cancelamento !==
        "string" ||
      !motivo_cancelamento.trim()
    ) {
      return res.status(400).json({
        mensagem:
          "Informe o motivo do cancelamento.",
      });
    }

    const motivoNormalizado =
      motivo_cancelamento.trim();

    if (
      motivoNormalizado.length >
      LIMITE_MOTIVO_CANCELAMENTO
    ) {
      return res.status(400).json({
        mensagem:
          `O motivo do cancelamento deve possuir no máximo ${LIMITE_MOTIVO_CANCELAMENTO} caracteres.`,
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    const resultadoAnterior =
      await client.query(
        `
          SELECT *
          FROM banho_tosa
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

    if (
      resultadoAnterior.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "Atendimento não encontrado.",
      });
    }

    const anterior =
      resultadoAnterior.rows[0];

    if (
      anterior.status !== "AGENDADO"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Somente atendimentos agendados podem ser cancelados.",
      });
    }

    /*
     * Bloqueamos também o pagamento associado antes de
     * modificar os dois registros.
     */
    const resultadoPagamentoAnterior =
      await client.query(
        `
          SELECT *
          FROM pagamentos_banho_tosa
          WHERE banho_tosa_id = $1
          FOR UPDATE
        `,
        [id]
      );

    if (
      resultadoPagamentoAnterior.rows.length ===
      0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "O atendimento não possui um registro financeiro válido.",
      });
    }

    const pagamentoAnterior =
      resultadoPagamentoAnterior.rows[0];

    /*
     * Não cancelamos automaticamente um atendimento cujo
     * pagamento já foi confirmado. Um fluxo de estorno será
     * tratado separadamente no futuro.
     */
    if (
      pagamentoAnterior.status === "PAGO"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Este atendimento possui pagamento confirmado. O pagamento precisa ser tratado antes do cancelamento.",
      });
    }

    if (
      pagamentoAnterior.status ===
      "CANCELADO"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "O pagamento deste atendimento já está cancelado.",
      });
    }

    const resultado =
      await client.query(
        `
          UPDATE banho_tosa

          SET
            status = 'CANCELADO',
            motivo_cancelamento = $1,
            usuario_cancelamento_id = $2,
            atualizado_em = CURRENT_TIMESTAMP

          WHERE id = $3
            AND status = 'AGENDADO'

          RETURNING *
        `,
        [
          motivoNormalizado,
          req.usuario.id,
          id,
        ]
      );

    if (
      resultado.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "O atendimento já foi alterado por outro usuário.",
      });
    }

    const atualizado =
      resultado.rows[0];

    const resultadoPagamento =
      await client.query(
        `
          UPDATE pagamentos_banho_tosa

          SET
            status = 'CANCELADO',
            atualizado_em = CURRENT_TIMESTAMP

          WHERE banho_tosa_id = $1
            AND status = 'PENDENTE'

          RETURNING *
        `,
        [id]
      );

    if (
      resultadoPagamento.rows.length ===
      0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "O pagamento foi alterado por outro usuário. O cancelamento não foi realizado.",
      });
    }

    const pagamentoAtualizado =
      resultadoPagamento.rows[0];

    await client.query("COMMIT");
    transacaoIniciada = false;

    await registrarLogSeguro({
      usuarioId: req.usuario.id,
      acao: "CANCELAR_BANHO_TOSA",
      entidade: "banho_tosa",
      registroId: atualizado.id,
      valorAnterior: anterior,
      valorNovo: atualizado,
      ip: req.ip,
    });

    await registrarLogSeguro({
      usuarioId: req.usuario.id,
      acao:
        "CANCELAR_PAGAMENTO_BANHO_TOSA",
      entidade:
        "pagamentos_banho_tosa",
      registroId:
        pagamentoAtualizado.id,
      valorAnterior:
        pagamentoAnterior,
      valorNovo:
        pagamentoAtualizado,
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem:
        "Agendamento cancelado com sucesso.",

      atendimento:
        atualizado,
    });
  } catch (erro) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query("ROLLBACK");
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer cancelamento:",
          erroRollback
        );
      }
    }

    console.error(
      "Erro ao cancelar agendamento:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * Confirma manualmente o pagamento.
 *
 * Esta operação continua restrita a Administrador e Gerente
 * através da rota.
 *
 * O valor não é recebido do frontend. Apenas a forma de
 * pagamento é informada pelo operador.
 */
async function confirmarPagamento(
  req,
  res
) {
  let client;
  let transacaoIniciada = false;

  try {
    const atendimentoId =
      converterId(req.params.id);

    if (!atendimentoId) {
      return res.status(400).json({
        mensagem:
          "Informe um atendimento válido.",
      });
    }

    const { metodo } = req.body;

    if (
      typeof metodo !== "string" ||
      !metodo.trim()
    ) {
      return res.status(400).json({
        mensagem:
          "Informe a forma de pagamento.",
      });
    }

    const metodoNormalizado =
      metodo.trim().toUpperCase();

    if (
      !METODOS_PAGAMENTO.includes(
        metodoNormalizado
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Forma de pagamento inválida.",
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    /*
     * Primeiro verificamos o atendimento e bloqueamos seu
     * registro durante a confirmação financeira.
     */
    const resultadoAtendimento =
      await client.query(
        `
          SELECT *
          FROM banho_tosa
          WHERE id = $1
          FOR UPDATE
        `,
        [atendimentoId]
      );

    if (
      resultadoAtendimento.rows.length ===
      0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "Atendimento não encontrado.",
      });
    }

    const atendimento =
      resultadoAtendimento.rows[0];

    if (
      atendimento.status === "CANCELADO"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Não é possível confirmar pagamento de um atendimento cancelado.",
      });
    }

    /*
     * O pagamento é bloqueado antes da leitura do status.
     * Assim duas confirmações simultâneas não podem ser
     * processadas como válidas.
     */
    const resultadoAnterior =
      await client.query(
        `
          SELECT *
          FROM pagamentos_banho_tosa
          WHERE banho_tosa_id = $1
          FOR UPDATE
        `,
        [atendimentoId]
      );

    if (
      resultadoAnterior.rows.length ===
      0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "Pagamento não encontrado para este atendimento.",
      });
    }

    const pagamentoAnterior =
      resultadoAnterior.rows[0];

    if (
      pagamentoAnterior.status !==
      "PENDENTE"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          pagamentoAnterior.status ===
          "PAGO"
            ? "Este pagamento já foi confirmado."
            : "Este pagamento não está pendente.",
      });
    }

    const resultado =
      await client.query(
        `
          UPDATE pagamentos_banho_tosa

          SET
            status = 'PAGO',
            metodo = $1,
            pago_em = CURRENT_TIMESTAMP,
            atualizado_em =
              CURRENT_TIMESTAMP

          WHERE banho_tosa_id = $2
            AND status = 'PENDENTE'

          RETURNING *
        `,
        [
          metodoNormalizado,
          atendimentoId,
        ]
      );

    if (
      resultado.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "O pagamento foi alterado por outro usuário.",
      });
    }

    const pagamento =
      resultado.rows[0];

    await client.query("COMMIT");
    transacaoIniciada = false;

    /*
     * Corrigimos aqui os nomes utilizados pelo logService.
     * Nenhum dado financeiro é recebido do navegador além
     * da forma de pagamento.
     */
    await registrarLogSeguro({
      usuarioId: req.usuario.id,
      acao:
        "CONFIRMAR_PAGAMENTO_BANHO_TOSA",
      entidade:
        "pagamentos_banho_tosa",
      registroId:
        pagamento.id,
      valorAnterior:
        pagamentoAnterior,
      valorNovo:
        pagamento,
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem:
        "Pagamento confirmado com sucesso.",
      pagamento,
    });
  } catch (erro) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query("ROLLBACK");
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer confirmação de pagamento:",
          erroRollback
        );
      }
    }

    console.error(
      "Erro ao confirmar pagamento:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao confirmar pagamento.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * Gera o Pix utilizando exclusivamente o valor armazenado
 * no banco.
 *
 * O frontend não consegue informar ou substituir o valor
 * utilizado na cobrança.
 */
async function gerarPixAtendimento(
  req,
  res
) {
  try {
    const atendimentoId =
      converterId(req.params.id);

    if (!atendimentoId) {
      return res.status(400).json({
        mensagem:
          "Informe um atendimento válido.",
      });
    }

    const resultado =
      await pool.query(
        `
          SELECT
            pg.id,
            pg.banho_tosa_id,
            pg.valor_total,
            pg.status,

            bt.status
              AS atendimento_status

          FROM pagamentos_banho_tosa pg

          INNER JOIN banho_tosa bt
            ON bt.id =
               pg.banho_tosa_id

          WHERE
            pg.banho_tosa_id = $1
        `,
        [atendimentoId]
      );

    if (
      resultado.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Pagamento não encontrado para este atendimento.",
      });
    }

    const pagamento =
      resultado.rows[0];

    if (
      pagamento.atendimento_status ===
      "CANCELADO"
    ) {
      return res.status(409).json({
        mensagem:
          "Não é possível gerar Pix para um atendimento cancelado.",
      });
    }

    if (
      pagamento.status ===
      "CANCELADO"
    ) {
      return res.status(409).json({
        mensagem:
          "Este pagamento foi cancelado.",
      });
    }

    if (
      pagamento.status === "PAGO"
    ) {
      return res.status(409).json({
        mensagem:
          "Este atendimento já está pago.",
      });
    }

    /*
     * Fail closed: somente o estado explicitamente esperado
     * pode gerar uma nova cobrança.
     */
    if (
      pagamento.status !== "PENDENTE"
    ) {
      return res.status(409).json({
        mensagem:
          "Este pagamento não está disponível para cobrança.",
      });
    }

    const valor =
      Number(pagamento.valor_total);

    if (
      !Number.isFinite(valor) ||
      valor < 0 ||
      valor > 99999999.99
    ) {
      console.error(
        "Valor inválido armazenado para pagamento:",
        pagamento.id
      );

      return res.status(500).json({
        mensagem:
          "O pagamento possui um valor inválido.",
      });
    }

    if (
      !process.env.PIX_CHAVE ||
      !process.env.PIX_NOME_RECEBEDOR ||
      !process.env.PIX_CIDADE
    ) {
      return res.status(500).json({
        mensagem:
          "Os dados Pix não estão configurados no servidor.",
      });
    }

    /*
     * O identificador deriva do atendimento e não contém
     * informações pessoais do tutor ou do Pet.
     */
    const txid =
      `ATEND${pagamento.banho_tosa_id}`;

    const payload =
      gerarPayloadPix({
        chave:
          process.env.PIX_CHAVE,

        nome:
          process.env.PIX_NOME_RECEBEDOR,

        cidade:
          process.env.PIX_CIDADE,

        valor,

        txid,
      });

    const qrCode =
      await QRCode.toDataURL(
        payload,
        {
          width: 350,
          margin: 2,
        }
      );

    return res.status(200).json({
      pix: {
        valor,
        txid,

        copia_cola:
          payload,

        qr_code:
          qrCode,
      },
    });
  } catch (erro) {
    console.error(
      "Erro ao gerar Pix:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Não foi possível gerar o Pix.",
    });
  }
}


module.exports = {
  criarAgendamento,
  listarAtivos,
  listarHistorico,
  buscarAtendimentoPorId,
  iniciarAtendimento,
  finalizarAtendimento,
  cancelarAgendamento,
  confirmarPagamento,
  gerarPixAtendimento,
};