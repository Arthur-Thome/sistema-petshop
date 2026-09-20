const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");
const QRCode = require("qrcode");

const {
  gerarPayloadPix,
} = require("../utils/pix");


/*
 * Cria um novo agendamento de Banho e Tosa.
 *
 * Um único agendamento pode possuir vários serviços.
 *
 * Os valores utilizados são sempre buscados no banco.
 * Nunca confiamos em preços enviados pelo frontend.
 *
 * Todo o processo utiliza uma transação para impedir
 * que um agendamento seja criado parcialmente.
 */
async function criarAgendamento(req, res) {
  const client = await pool.connect();

  try {
    const {
      pet_id,
      servicos,
      agendado_para,
      observacoes_agendamento,
    } = req.body;


    if (!pet_id) {
      return res.status(400).json({
        mensagem: "Selecione um pet.",
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


    if (!agendado_para) {
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
     * Remove IDs duplicados.
     *
     * Assim, mesmo que o frontend envie acidentalmente
     * o mesmo serviço duas vezes, ele será considerado
     * apenas uma vez.
     */
    const servicosUnicos = [
      ...new Set(
        servicos.map(Number)
      ),
    ];


    if (
      servicosUnicos.some(
        (id) =>
          !Number.isInteger(id) ||
          id <= 0
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Existe um serviço inválido no agendamento.",
      });
    }


    await client.query("BEGIN");


    /*
     * Valida o pet e já recupera informações do tutor
     * que serão úteis na confirmação do agendamento.
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
        `,
        [pet_id]
      );


    if (resultadoPet.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        mensagem:
          "Pet não encontrado.",
      });
    }


    const pet = resultadoPet.rows[0];


    if (!pet.ativo) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        mensagem:
          "Não é possível agendar atendimento para um pet inativo.",
      });
    }


    /*
     * Busca todos os serviços selecionados diretamente
     * no banco, incluindo preço e duração atuais.
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


    /*
     * Se recebemos 3 IDs e encontramos somente 2,
     * algum dos serviços enviados não existe.
     */
    if (
      resultadoServicos.rows.length !==
      servicosUnicos.length
    ) {
      await client.query("ROLLBACK");

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

      return res.status(400).json({
        mensagem:
          `O serviço "${servicoInativo.nome}" está inativo.`,
      });
    }


    /*
     * Primeiro criamos o registro principal.
     * Os serviços serão relacionados logo depois.
     */
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
          pet_id,
          agendado_para,
          observacoes_agendamento?.trim()
            || null,
          req.usuario.id,
        ]
      );


    const agendamento =
      resultadoAgendamento.rows[0];


    let valorTotal = 0;
    let duracaoTotal = 0;

    const servicosAgendamento = [];


    /*
     * Guardamos um snapshot do preço e da duração.
     *
     * Se o cadastro do serviço for alterado no futuro,
     * este agendamento continuará mantendo os valores
     * que eram válidos no momento da contratação.
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
     * Cada agendamento possui um único registro financeiro.
     *
     * Neste momento ele nasce como PENDENTE.
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


    /*
     * O log é registrado depois que a transação principal
     * foi concluída com sucesso.
     */
    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "AGENDAR_BANHO_TOSA",
      entidade: "banho_tosa",
      registroId: agendamento.id,

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

        pet_nome:
          pet.nome,

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
    try {
      await client.query("ROLLBACK");
    } catch (erroRollback) {
      console.error(
        "Erro ao desfazer transação:",
        erroRollback
      );
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
    client.release();
  }
}


/*
 * Lista agendamentos e atendimentos ainda ativos.
 *
 * Os serviços são agregados em JSON porque agora um
 * atendimento pode possuir vários serviços.
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
 * Histórico de atendimentos encerrados.
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
 * Busca todos os dados necessários para visualizar
 * um atendimento e posteriormente gerar seu comprovante.
 */
async function buscarAtendimentoPorId(
  req,
  res
) {
  try {
    const { id } = req.params;

    const resultado =
      await pool.query(
        `
          SELECT
            bt.*,

            -- Dados do pet
            p.nome AS pet_nome,
            p.especie AS pet_especie,
            p.raca AS pet_raca,

            -- Dados do tutor
            t.id AS tutor_id,
            t.nome AS tutor_nome,
            t.telefone AS tutor_telefone,
            t.email AS tutor_email,

            /*
             * Serviços vinculados ao atendimento.
             *
             * O valor e a duração vêm da tabela
             * banho_tosa_servicos porque representam
             * o snapshot salvo no agendamento.
             */
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

            /*
             * Dados do pagamento.
             *
             * Utilizamos nomes específicos para evitar
             * conflito com campos do atendimento e para
             * manter o retorno padronizado no frontend.
             */
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


    if (resultado.rows.length === 0) {
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
 * Inicia somente registros ainda AGENDADOS.
 */
async function iniciarAtendimento(req, res) {
  try {
    const { id } = req.params;


    const resultadoAnterior =
      await pool.query(
        `
          SELECT *
          FROM banho_tosa
          WHERE id = $1
        `,
        [id]
      );


    if (
      resultadoAnterior.rows.length === 0
    ) {
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
      return res.status(400).json({
        mensagem:
          "Somente atendimentos agendados podem ser iniciados.",
      });
    }


    const resultado =
      await pool.query(
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


    if (resultado.rows.length === 0) {
      return res.status(409).json({
        mensagem:
          "O atendimento já foi alterado por outro usuário.",
      });
    }


    const atualizado =
      resultado.rows[0];


    await registrarLog({
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
    console.error(
      "Erro ao iniciar atendimento:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


/*
 * Finaliza somente atendimentos atualmente em andamento.
 */
async function finalizarAtendimento(
  req,
  res
) {
  try {
    const { id } = req.params;

    const {
      observacoes_atendimento,
    } = req.body;


    const resultadoAnterior =
      await pool.query(
        `
          SELECT *
          FROM banho_tosa
          WHERE id = $1
        `,
        [id]
      );


    if (
      resultadoAnterior.rows.length === 0
    ) {
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
      return res.status(400).json({
        mensagem:
          "Somente atendimentos em andamento podem ser finalizados.",
      });
    }


    const resultado =
      await pool.query(
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
          observacoes_atendimento
            ?.trim() || null,

          req.usuario.id,

          id,
        ]
      );


    if (resultado.rows.length === 0) {
      return res.status(409).json({
        mensagem:
          "O atendimento já foi alterado por outro usuário.",
      });
    }


    const atualizado =
      resultado.rows[0];


    await registrarLog({
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
    console.error(
      "Erro ao finalizar atendimento:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


/*
 * O cancelamento não apaga o agendamento.
 *
 * Mantemos o registro para histórico e auditoria.
 */
async function cancelarAgendamento(
  req,
  res
) {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    const {
      motivo_cancelamento,
    } = req.body;


    if (
      !motivo_cancelamento ||
      !motivo_cancelamento.trim()
    ) {
      return res.status(400).json({
        mensagem:
          "Informe o motivo do cancelamento.",
      });
    }


    await client.query("BEGIN");


    const resultadoAnterior =
      await client.query(
        `
          SELECT *
          FROM banho_tosa
          WHERE id = $1
        `,
        [id]
      );


    if (
      resultadoAnterior.rows.length === 0
    ) {
      await client.query("ROLLBACK");

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

      return res.status(400).json({
        mensagem:
          "Somente atendimentos agendados podem ser cancelados.",
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
          motivo_cancelamento.trim(),
          req.usuario.id,
          id,
        ]
      );


    if (resultado.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        mensagem:
          "O atendimento já foi alterado por outro usuário.",
      });
    }


    const atualizado =
      resultado.rows[0];


    /*
     * Se o atendimento ainda estava aguardando pagamento,
     * o registro financeiro também é cancelado.
     *
     * Um pagamento já marcado como PAGO não é alterado
     * automaticamente, pois posteriormente poderemos
     * implementar estorno de forma separada.
     */
    await client.query(
      `
        UPDATE pagamentos_banho_tosa

        SET
          status = 'CANCELADO',
          atualizado_em = CURRENT_TIMESTAMP

        WHERE banho_tosa_id = $1
          AND status = 'PENDENTE'
      `,
      [id]
    );


    await client.query("COMMIT");


    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "CANCELAR_BANHO_TOSA",
      entidade: "banho_tosa",
      registroId: atualizado.id,
      valorAnterior: anterior,
      valorNovo: atualizado,
      ip: req.ip,
    });


    return res.status(200).json({
      mensagem:
        "Agendamento cancelado com sucesso.",

      atendimento:
        atualizado,
    });

  } catch (erro) {
    try {
      await client.query("ROLLBACK");
    } catch (erroRollback) {
      console.error(
        "Erro ao desfazer transação:",
        erroRollback
      );
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
    client.release();
  }
}

/*
 * Confirma manualmente o pagamento de um atendimento.
 *
 * Nesta etapa a confirmação é feita pelo funcionário.
 * Futuramente esta mesma estrutura poderá receber
 * confirmações automáticas de um provedor Pix.
 */
async function confirmarPagamento(req, res) {
  const { id } = req.params;
  const { metodo } = req.body;

  const metodosPermitidos = [
    "PIX",
    "DINHEIRO",
    "CARTAO_CREDITO",
    "CARTAO_DEBITO",
  ];

  if (!metodo) {
    return res.status(400).json({
      mensagem: "Informe a forma de pagamento.",
    });
  }

  if (!metodosPermitidos.includes(metodo)) {
    return res.status(400).json({
      mensagem: "Forma de pagamento inválida.",
    });
  }

  try {
    /*
     * Somente pagamentos pendentes podem ser
     * confirmados. Isso evita confirmar duas vezes.
     */
    const resultado = await pool.query(
      `
        UPDATE pagamentos_banho_tosa
        SET
          status = 'PAGO',
          metodo = $1,
          pago_em = CURRENT_TIMESTAMP,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE banho_tosa_id = $2
          AND status = 'PENDENTE'
        RETURNING
          id,
          banho_tosa_id,
          valor_total,
          status,
          metodo,
          pago_em
      `,
      [
        metodo,
        id,
      ]
    );

    if (resultado.rowCount === 0) {
      const pagamentoExistente =
        await pool.query(
          `
            SELECT
              id,
              status
            FROM pagamentos_banho_tosa
            WHERE banho_tosa_id = $1
          `,
          [id]
        );

      if (
        pagamentoExistente.rowCount === 0
      ) {
        return res.status(404).json({
          mensagem:
            "Pagamento não encontrado para este atendimento.",
        });
      }

      return res.status(400).json({
        mensagem:
          "Este pagamento não está pendente.",
      });
    }

    const pagamento =
      resultado.rows[0];

    /*
     * Mantemos a confirmação registrada também
     * no sistema de auditoria.
     */
    await registrarLog({
      usuario_id: req.usuario.id,
      acao: "CONFIRMAR_PAGAMENTO_BANHO_TOSA",
      entidade: "pagamentos_banho_tosa",
      entidade_id: pagamento.id,
      dados_anteriores: {
        status: "PENDENTE",
      },
      dados_novos: {
        status: "PAGO",
        metodo: pagamento.metodo,
        pago_em: pagamento.pago_em,
      },
      ip: req.ip,
    });

    return res.json({
      mensagem:
        "Pagamento confirmado com sucesso.",
      pagamento,
    });

  } catch (error) {
    console.error(
      "Erro ao confirmar pagamento:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao confirmar pagamento.",
    });
  }
}

/*
 * Gera os dados necessários para pagamento via Pix.
 *
 * O valor nunca é recebido do frontend. Ele é buscado
 * diretamente no pagamento registrado no banco para
 * impedir que o navegador altere o valor da cobrança.
 */
async function gerarPixAtendimento(
  req,
  res
) {
  try {
    const { id } = req.params;


    const resultado =
      await pool.query(
        `
          SELECT
            pg.id,
            pg.banho_tosa_id,
            pg.valor_total,
            pg.status

          FROM pagamentos_banho_tosa pg

          INNER JOIN banho_tosa bt
            ON bt.id = pg.banho_tosa_id

          WHERE
            pg.banho_tosa_id = $1
            AND bt.status <> 'CANCELADO'
        `,
        [id]
      );


    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem:
          "Pagamento não encontrado para este atendimento.",
      });
    }


    const pagamento =
      resultado.rows[0];


    if (
      pagamento.status ===
      "CANCELADO"
    ) {
      return res.status(400).json({
        mensagem:
          "Este pagamento foi cancelado.",
      });
    }


    if (
      pagamento.status ===
      "PAGO"
    ) {
      return res.status(400).json({
        mensagem:
          "Este atendimento já está pago.",
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
     * Um TXID diferente é utilizado para cada
     * atendimento, facilitando sua identificação.
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

        valor:
          pagamento.valor_total,

        txid,
      });


    /*
     * O QR Code é retornado como Data URL para que
     * o React possa exibi-lo diretamente em <img>.
     */
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
        valor:
          pagamento.valor_total,

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