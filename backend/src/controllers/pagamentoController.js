const bcrypt = require("bcrypt");
const pool = require("../database/connection");
const {
  registrarLog,
} = require("../services/logService");

const LIMITE_BUSCA = 100;
const LIMITE_MAXIMO_POR_PAGINA = 100;
const LIMITE_MOTIVO_ESTORNO = 1000;

const PERFIS_AUTORIZADORES_ESTORNO = [
  "administrador",
  "gerente",
];


/*
 * Registra auditoria sem transformar uma operação financeira
 * já concluída em erro para o operador.
 *
 * O estorno continua sendo efetivado mesmo se houver uma
 * indisponibilidade isolada no serviço de auditoria.
 */
async function registrarLogSeguro(dados) {
  try {
    await registrarLog(dados);
  } catch (erro) {
    console.error(
      "Estorno concluído, mas houve erro ao gerar o log:",
      erro
    );
  }
}


/*
 * Lista os pagamentos de atendimentos que ainda estão
 * pendentes.
 *
 * Este controller pertence à área financeira/administrativa.
 * A rota deve permitir acesso somente para Administrador
 * e Gerente.
 *
 * A consulta parte da tabela de pagamentos para que a lista
 * utilize exatamente a mesma regra do indicador exibido
 * no Dashboard: pagamento com status PENDENTE.
 */
async function listarPagamentosPendentes(req, res) {
  try {
    const busca =
      typeof req.query.busca === "string"
        ? req.query.busca.trim()
        : "";

    const pagina =
      req.query.pagina === undefined
        ? 1
        : Number(req.query.pagina);

    const limite =
      req.query.limite === undefined
        ? 20
        : Number(req.query.limite);


    if (busca.length > LIMITE_BUSCA) {
      return res.status(400).json({
        mensagem:
          `A busca deve possuir no máximo ${LIMITE_BUSCA} caracteres.`,
      });
    }


    if (
      !Number.isInteger(pagina) ||
      pagina <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "A página informada é inválida.",
      });
    }


    if (
      !Number.isInteger(limite) ||
      limite <= 0 ||
      limite > LIMITE_MAXIMO_POR_PAGINA
    ) {
      return res.status(400).json({
        mensagem:
          `O limite deve ser um número inteiro entre 1 e ${LIMITE_MAXIMO_POR_PAGINA}.`,
      });
    }


    const parametros = [];
    const condicoes = [
      "pg.status = 'PENDENTE'",
    ];


    /*
     * A pesquisa pode localizar pelo nome do Pet ou Tutor.
     *
     * O Tutor utilizado é sempre o principal definido em
     * pet_tutores, que é a fonte oficial do relacionamento
     * entre Pets e Tutores.
     *
     * Os valores continuam sendo enviados por parâmetros,
     * evitando concatenar dados do usuário diretamente no SQL.
     */
    if (busca) {
      parametros.push(`%${busca}%`);

      condicoes.push(`
        (
          p.nome ILIKE $${parametros.length}
          OR
          t.nome ILIKE $${parametros.length}
        )
      `);
    }


    const where =
      `WHERE ${condicoes.join(" AND ")}`;


    /*
     * O total é calculado com os mesmos filtros utilizados
     * na consulta principal para manter a paginação correta.
     *
     * pet_tutores também é utilizado aqui para que a contagem
     * e a consulta principal sigam exatamente a mesma regra.
     */
    const resultadoTotal =
      await pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS total

          FROM pagamentos_banho_tosa pg

          INNER JOIN banho_tosa bt
            ON bt.id = pg.banho_tosa_id

          INNER JOIN pets p
            ON p.id = bt.pet_id

          INNER JOIN pet_tutores pt
            ON pt.pet_id = p.id
            AND pt.principal = TRUE

          INNER JOIN tutores t
            ON t.id = pt.tutor_id

          ${where}
        `,
        parametros
      );


    const total =
      resultadoTotal.rows[0].total;

    const totalPaginas =
      total === 0
        ? 0
        : Math.ceil(total / limite);

    const offset =
      (pagina - 1) * limite;


    const parametrosConsulta = [
      ...parametros,
      limite,
      offset,
    ];

    const indiceLimite =
      parametros.length + 1;

    const indiceOffset =
      parametros.length + 2;


    const resultado =
      await pool.query(
        `
          SELECT
            pg.id AS pagamento_id,
            pg.banho_tosa_id AS atendimento_id,
            pg.valor_total,
            pg.status AS pagamento_status,
            pg.metodo AS pagamento_metodo,
            pg.criado_em AS pagamento_criado_em,

            bt.status AS atendimento_status,
            bt.agendado_para,

            p.id AS pet_id,
            p.nome AS pet_nome,

            t.id AS tutor_id,
            t.nome AS tutor_nome,
            t.telefone AS tutor_telefone,

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', s.id,
                    'nome', s.nome
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
            ) AS servicos

          FROM pagamentos_banho_tosa pg

          INNER JOIN banho_tosa bt
            ON bt.id = pg.banho_tosa_id

          INNER JOIN pets p
            ON p.id = bt.pet_id

          INNER JOIN pet_tutores pt
            ON pt.pet_id = p.id
            AND pt.principal = TRUE

          INNER JOIN tutores t
            ON t.id = pt.tutor_id

          ${where}

          ORDER BY
            bt.agendado_para ASC,
            pg.id ASC

          LIMIT $${indiceLimite}
          OFFSET $${indiceOffset}
        `,
        parametrosConsulta
      );


    return res.status(200).json({
      pagamentos: resultado.rows,

      paginacao: {
        pagina,
        limite,
        total,
        total_paginas: totalPaginas,
      },
    });

  } catch (error) {
    console.error(
      "Erro ao listar pagamentos pendentes:",
      error
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar os pagamentos pendentes.",
    });
  }
}


/*
 * Retorna somente os dados mínimos necessários para que
 * um Funcionário escolha quem autorizará um estorno.
 *
 * Não reutilizamos a listagem administrativa de usuários,
 * pois ela contém informações que não precisam ser expostas
 * neste fluxo, como e-mail e datas administrativas.
 */
async function listarAutorizadoresEstorno(
  req,
  res
) {
  try {
    const resultado =
      await pool.query(
        `
          SELECT
            id,
            nome,
            perfil

          FROM usuarios

          WHERE
            ativo = TRUE
            AND perfil IN (
              'administrador',
              'gerente'
            )

          ORDER BY
            nome ASC,
            id ASC
        `
      );


    return res.status(200).json({
      autorizadores: resultado.rows,
    });

  } catch (erro) {
    console.error(
      "Erro ao listar autorizadores de estorno:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar os autorizadores do estorno.",
    });
  }
}


/*
 * Estorna um pagamento anteriormente confirmado.
 *
 * REGRAS DE AUTORIZAÇÃO:
 *
 * - Administrador e Gerente podem executar o estorno
 *   diretamente, sem informar novamente uma senha.
 *
 * - Funcionário precisa informar qual Administrador/Gerente
 *   ativo está autorizando e a senha desse autorizador.
 *
 * A senha de autorização existe somente durante a requisição.
 * Ela nunca é persistida nem enviada para os logs.
 *
 * O pagamento original não é apagado. Valor, método e data
 * original do pagamento são preservados para manter o
 * histórico financeiro íntegro.
 */
async function estornarPagamento(req, res) {
  let client;
  let transacaoIniciada = false;

  try {
    const atendimentoId =
      Number(req.params.id);

    if (
      !Number.isInteger(atendimentoId) ||
      atendimentoId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um atendimento válido.",
      });
    }


    const motivoEstorno =
      typeof req.body.motivo_estorno ===
        "string"
        ? req.body.motivo_estorno.trim()
        : "";


    if (!motivoEstorno) {
      return res.status(400).json({
        mensagem:
          "Informe o motivo do estorno.",
      });
    }


    if (
      motivoEstorno.length >
      LIMITE_MOTIVO_ESTORNO
    ) {
      return res.status(400).json({
        mensagem:
          `O motivo do estorno deve possuir no máximo ${LIMITE_MOTIVO_ESTORNO} caracteres.`,
      });
    }


    const perfilUsuario =
      String(
        req.usuario.perfil || ""
      )
        .trim()
        .toLowerCase();


    const usuarioPodeEstornarDiretamente =
      PERFIS_AUTORIZADORES_ESTORNO.includes(
        perfilUsuario
      );


    let usuarioAutorizacao = null;


    /*
     * Funcionários não podem autorizar o próprio estorno.
     *
     * Precisamos identificar explicitamente o Administrador
     * ou Gerente que está concedendo a autorização.
     */
    if (!usuarioPodeEstornarDiretamente) {
      if (perfilUsuario !== "funcionario") {
        return res.status(403).json({
          mensagem:
            "Seu perfil não possui permissão para realizar estornos.",
        });
      }


      const usuarioAutorizacaoId =
        Number(
          req.body.usuario_autorizacao_id
        );

      const senhaAutorizacao =
        typeof req.body.senha_autorizacao ===
          "string"
          ? req.body.senha_autorizacao
          : "";


      if (
        !Number.isInteger(
          usuarioAutorizacaoId
        ) ||
        usuarioAutorizacaoId <= 0
      ) {
        return res.status(400).json({
          mensagem:
            "Selecione um Gerente ou Administrador para autorizar o estorno.",
          autorizacaoNecessaria: true,
        });
      }


      if (!senhaAutorizacao) {
        return res.status(400).json({
          mensagem:
            "Informe a senha do Gerente ou Administrador que está autorizando o estorno.",
          autorizacaoNecessaria: true,
        });
      }


      /*
       * A consulta exige simultaneamente:
       *
       * - usuário existente;
       * - conta ativa;
       * - perfil atual de Administrador ou Gerente.
       *
       * Dessa forma, uma conta desativada ou cujo perfil tenha
       * sido reduzido não pode continuar autorizando estornos.
       */
      const resultadoAutorizador =
        await pool.query(
          `
            SELECT
              id,
              nome,
              perfil,
              senha_hash

            FROM usuarios

            WHERE
              id = $1
              AND ativo = TRUE
              AND perfil IN (
                'administrador',
                'gerente'
              )

            LIMIT 1
          `,
          [usuarioAutorizacaoId]
        );


      if (
        resultadoAutorizador.rows.length ===
        0
      ) {
        return res.status(403).json({
          mensagem:
            "O usuário selecionado não pode autorizar este estorno.",
          autorizacaoNecessaria: true,
        });
      }


      usuarioAutorizacao =
        resultadoAutorizador.rows[0];


      const senhaCorreta =
        await bcrypt.compare(
          senhaAutorizacao,
          usuarioAutorizacao.senha_hash
        );


      if (!senhaCorreta) {
        return res.status(401).json({
          mensagem:
            "Senha de autorização incorreta.",
          autorizacaoNecessaria: true,
        });
      }
    }


    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;


    /*
     * Bloqueamos o pagamento antes de verificar seu estado.
     * Isso impede que duas requisições consigam estornar o
     * mesmo pagamento simultaneamente.
     */
    const resultadoAnterior =
      await client.query(
        `
          SELECT
            pg.*,
            bt.status
              AS atendimento_status

          FROM pagamentos_banho_tosa pg

          INNER JOIN banho_tosa bt
            ON bt.id = pg.banho_tosa_id

          WHERE
            pg.banho_tosa_id = $1

          FOR UPDATE OF pg
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


    /*
     * Somente um pagamento efetivamente confirmado pode
     * sofrer estorno.
     *
     * PENDENTE e CANCELADO não representam dinheiro recebido.
     * ESTORNADO também não pode ser estornado novamente.
     */
    if (
      pagamentoAnterior.status !== "PAGO"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          pagamentoAnterior.status ===
          "ESTORNADO"
            ? "Este pagamento já foi estornado."
            : "Somente pagamentos confirmados podem ser estornados.",
      });
    }


    const usuarioAutorizacaoId =
      usuarioAutorizacao
        ? usuarioAutorizacao.id
        : null;


    const resultado =
      await client.query(
        `
          UPDATE pagamentos_banho_tosa

          SET
            status = 'ESTORNADO',
            motivo_estorno = $1,
            estornado_em = CURRENT_TIMESTAMP,
            usuario_estorno_id = $2,
            usuario_autorizacao_estorno_id = $3,
            atualizado_em = CURRENT_TIMESTAMP

          WHERE
            banho_tosa_id = $4
            AND status = 'PAGO'

          RETURNING *
        `,
        [
          motivoEstorno,
          req.usuario.id,
          usuarioAutorizacaoId,
          atendimentoId,
        ]
      );


    if (resultado.rows.length === 0) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "O pagamento foi alterado por outro usuário. O estorno não foi realizado.",
      });
    }


    const pagamento =
      resultado.rows[0];


    await client.query("COMMIT");
    transacaoIniciada = false;


    /*
     * O log registra quem executou a operação.
     *
     * Quando um Funcionário precisou de autorização, também
     * registramos somente a identidade do autorizador.
     * A senha nunca faz parte da auditoria.
     */
    await registrarLogSeguro({
      usuarioId: req.usuario.id,
      acao:
        "ESTORNAR_PAGAMENTO_BANHO_TOSA",
      entidade:
        "pagamentos_banho_tosa",
      registroId:
        pagamento.id,

      valorAnterior:
        pagamentoAnterior,

      valorNovo: {
        ...pagamento,

        autorizacao_estorno:
          usuarioAutorizacao
            ? {
                usuario_id:
                  usuarioAutorizacao.id,

                nome:
                  usuarioAutorizacao.nome,

                perfil:
                  usuarioAutorizacao.perfil,
              }
            : null,
      },

      ip: req.ip,
    });


    return res.status(200).json({
      mensagem:
        "Pagamento estornado com sucesso.",

      pagamento: {
        ...pagamento,

        autorizado_por:
          usuarioAutorizacao
            ? {
                id:
                  usuarioAutorizacao.id,

                nome:
                  usuarioAutorizacao.nome,

                perfil:
                  usuarioAutorizacao.perfil,
              }
            : null,
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
          "Erro ao desfazer estorno de pagamento:",
          erroRollback
        );
      }
    }


    console.error(
      "Erro ao estornar pagamento:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao estornar o pagamento.",
    });

  } finally {
    if (client) {
      client.release();
    }
  }
}


module.exports = {
  listarPagamentosPendentes,
  listarAutorizadoresEstorno,
  estornarPagamento,
};