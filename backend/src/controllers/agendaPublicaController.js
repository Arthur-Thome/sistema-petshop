const pool = require("../database/connection");

const {
  verificarAutorizacaoAgenda,
} = require("../services/agendaPublicaAutorizacaoService");

const {
  registrarLog,
} = require("../services/logService");


const LIMITE_OBSERVACAO = 1000;

const TRATAMENTOS_EXISTENTES = [
  "MANTER",
  "ADICIONAR",
  "SUBSTITUIR",
];


/*
 * ============================================================
 * FUNÇÕES AUXILIARES
 * ============================================================
 */

async function registrarLogSeguro(dados) {
  try {
    await registrarLog(dados);
  } catch (erro) {
    console.error(
      "Operação da agenda concluída, mas houve erro ao gerar o log:",
      erro
    );
  }
}


function dataValida(data) {
  if (
    typeof data !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data)
  ) {
    return false;
  }

  const [ano, mes, dia] =
    data.split("-").map(Number);

  const dataUTC = new Date(
    Date.UTC(
      ano,
      mes - 1,
      dia
    )
  );

  return (
    dataUTC.getUTCFullYear() === ano &&
    dataUTC.getUTCMonth() === mes - 1 &&
    dataUTC.getUTCDate() === dia
  );
}


function normalizarHorario(horario) {
  if (typeof horario !== "string") {
    return null;
  }

  const valor = horario.trim();

  const correspondencia = valor.match(
    /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/
  );

  if (!correspondencia) {
    return null;
  }

  const hora = correspondencia[1];
  const minuto = correspondencia[2];
  const segundo =
    correspondencia[3] || "00";

  return `${hora}:${minuto}:${segundo}`;
}


function normalizarHorarios(horarios) {
  if (!Array.isArray(horarios)) {
    return {
      valido: false,
      mensagem:
        "Os horários devem ser enviados em uma lista.",
    };
  }

  const normalizados = [];

  for (const horario of horarios) {
    const normalizado =
      normalizarHorario(horario);

    if (!normalizado) {
      return {
        valido: false,
        mensagem:
          `O horário "${horario}" é inválido.`,
      };
    }

    normalizados.push(normalizado);
  }

  return {
    valido: true,

    horarios: [
      ...new Set(normalizados),
    ].sort(),
  };
}


/*
 * Converte YYYY-MM-DD para Date utilizando UTC.
 *
 * Usamos UTC propositalmente para que a geração de períodos
 * não seja afetada pelo fuso horário da máquina.
 */
function criarDataUTC(data) {
  const [ano, mes, dia] =
    data.split("-").map(Number);

  return new Date(
    Date.UTC(
      ano,
      mes - 1,
      dia
    )
  );
}


function formatarDataUTC(data) {
  return data
    .toISOString()
    .slice(0, 10);
}


/*
 * JavaScript:
 *
 * 0 = domingo
 * 1 = segunda
 * ...
 * 6 = sábado
 *
 * Esse mesmo padrão será usado pelo frontend.
 */
function normalizarDiasSemana(
  diasSemana
) {
  if (
    !Array.isArray(diasSemana) ||
    diasSemana.length === 0
  ) {
    return {
      valido: false,
      mensagem:
        "Selecione pelo menos um dia da semana.",
    };
  }

  const normalizados = [];

  for (const dia of diasSemana) {
    const numero = Number(dia);

    if (
      !Number.isInteger(numero) ||
      numero < 0 ||
      numero > 6
    ) {
      return {
        valido: false,
        mensagem:
          "Existe um dia da semana inválido.",
      };
    }

    normalizados.push(numero);
  }

  return {
    valido: true,

    dias: [
      ...new Set(normalizados),
    ].sort(
      (a, b) => a - b
    ),
  };
}


/*
 * Gera somente as datas do período cujos dias da semana
 * foram selecionados.
 *
 * Não existe obrigação de intervalo fixo entre horários.
 */
function gerarDatasPeriodo({
  dataInicio,
  dataFim,
  diasSemana,
}) {
  const inicio =
    criarDataUTC(dataInicio);

  const fim =
    criarDataUTC(dataFim);

  const permitidos =
    new Set(diasSemana);

  const datas = [];

  const atual =
    new Date(inicio);

  while (atual <= fim) {
    if (
      permitidos.has(
        atual.getUTCDay()
      )
    ) {
      datas.push(
        formatarDataUTC(atual)
      );
    }

    atual.setUTCDate(
      atual.getUTCDate() + 1
    );
  }

  return datas;
}


function responderErroAutorizacao(
  res,
  erro
) {
  return res
    .status(erro.status || 403)
    .json({
      mensagem:
        erro.message ||
        "Não foi possível autorizar a alteração.",

      codigo:
        erro.codigo ||
        "ERRO_AUTORIZACAO",

      autorizacaoNecessaria:
        erro.codigo ===
          "AUTORIZACAO_NECESSARIA" ||
        erro.codigo ===
          "AUTORIZACAO_INVALIDA",
    });
}


/*
 * Retorna um dia completo com horários.
 *
 * Pode receber pool ou client de uma transação.
 */
async function buscarDiaCompleto(
  executor,
  diaId
) {
  const resultado =
    await executor.query(
      `
        SELECT
          d.*,

          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', h.id,
                  'horario', h.horario,
                  'status', h.status,
                  'observacao', h.observacao
                )
                ORDER BY h.horario
              )

              FROM agenda_publica_horarios h

              WHERE
                h.agenda_dia_id = d.id
            ),
            '[]'::json
          ) AS horarios

        FROM agenda_publica_dias d

        WHERE
          d.id = $1
      `,
      [diaId]
    );

  return resultado.rows[0] || null;
}


/*
 * ============================================================
 * CONSULTAR AGENDA POR PERÍODO
 * ============================================================
 */

async function consultarAgendaPeriodo(
  req,
  res
) {
  try {
    const dataInicio =
      req.query.data_inicio;

    const dataFim =
      req.query.data_fim;


    if (
      !dataValida(dataInicio) ||
      !dataValida(dataFim)
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um período válido.",
      });
    }


    if (dataFim < dataInicio) {
      return res.status(400).json({
        mensagem:
          "A data final não pode ser anterior à data inicial.",
      });
    }


    const resultado =
      await pool.query(
        `
          SELECT
            d.id,
            d.data,
            d.aberto,
            d.publicado,
            d.observacao,
            d.criado_por,
            d.atualizado_por,
            d.criado_em,
            d.atualizado_em,

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', h.id,
                    'horario', h.horario,
                    'status', h.status,
                    'observacao', h.observacao
                  )
                  ORDER BY h.horario
                )

                FROM agenda_publica_horarios h

                WHERE
                  h.agenda_dia_id = d.id
              ),
              '[]'::json
            ) AS horarios

          FROM agenda_publica_dias d

          WHERE
            d.data BETWEEN $1 AND $2

          ORDER BY
            d.data ASC
        `,
        [
          dataInicio,
          dataFim,
        ]
      );


    return res.status(200).json({
      data_inicio:
        dataInicio,

      data_fim:
        dataFim,

      dias:
        resultado.rows,
    });

  } catch (erro) {
    console.error(
      "Erro ao consultar agenda pública:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar a agenda.",
    });
  }
}


/*
 * ============================================================
 * CONSULTAR UMA DATA
 * ============================================================
 */

async function consultarDiaAgenda(
  req,
  res
) {
  try {
    const data =
      req.params.data;


    if (!dataValida(data)) {
      return res.status(400).json({
        mensagem:
          "Informe uma data válida.",
      });
    }


    const resultado =
      await pool.query(
        `
          SELECT
            id

          FROM agenda_publica_dias

          WHERE
            data = $1

          LIMIT 1
        `,
        [data]
      );


    if (
      resultado.rows.length === 0
    ) {
      return res.status(200).json({
        configurado: false,

        dia: {
          data,
          aberto: false,
          publicado: false,
          observacao: null,
          horarios: [],
        },
      });
    }


    const dia =
      await buscarDiaCompleto(
        pool,
        resultado.rows[0].id
      );


    return res.status(200).json({
      configurado: true,
      dia,
    });

  } catch (erro) {
    console.error(
      "Erro ao consultar dia da agenda:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar o dia da agenda.",
    });
  }
}

/*
 * ============================================================
 * SALVAR CONFIGURAÇÃO INDIVIDUAL
 * ============================================================
 */

async function salvarDiaAgenda(
  req,
  res
) {
  let client;
  let transacaoIniciada = false;

  try {
    const data =
      req.params.data;


    if (!dataValida(data)) {
      return res.status(400).json({
        mensagem:
          "Informe uma data válida.",
      });
    }


    const aberto =
      req.body.aberto;

    const publicado =
      req.body.publicado;


    if (typeof aberto !== "boolean") {
      return res.status(400).json({
        mensagem:
          "Informe se a data está aberta.",
      });
    }


    if (
      typeof publicado !== "boolean"
    ) {
      return res.status(400).json({
        mensagem:
          "Informe se a data está publicada.",
      });
    }


    if (
      !aberto &&
      publicado
    ) {
      return res.status(400).json({
        mensagem:
          "Uma data fechada não pode ser publicada.",
      });
    }


    const observacao =
      typeof req.body.observacao ===
      "string"
        ? req.body.observacao.trim()
        : "";


    if (
      observacao.length >
      LIMITE_OBSERVACAO
    ) {
      return res.status(400).json({
        mensagem:
          `A observação deve possuir no máximo ${LIMITE_OBSERVACAO} caracteres.`,
      });
    }


    const resultadoHorarios =
      normalizarHorarios(
        req.body.horarios
      );


    if (!resultadoHorarios.valido) {
      return res.status(400).json({
        mensagem:
          resultadoHorarios.mensagem,
      });
    }


    const horarios =
      resultadoHorarios.horarios;


    if (
      aberto &&
      horarios.length === 0
    ) {
      return res.status(400).json({
        mensagem:
          "Uma data aberta precisa possuir pelo menos um horário.",
      });
    }


    let autorizacao;

    try {
      autorizacao =
        await verificarAutorizacaoAgenda({
          usuarioLogado:
            req.usuario,

          senhaAutorizacao:
            req.body.senha_autorizacao,
        });

    } catch (erroAutorizacao) {
      return responderErroAutorizacao(
        res,
        erroAutorizacao
      );
    }


    client =
      await pool.connect();

    await client.query("BEGIN");

    transacaoIniciada = true;


    const resultadoAnterior =
      await client.query(
        `
          SELECT *

          FROM agenda_publica_dias

          WHERE
            data = $1

          FOR UPDATE
        `,
        [data]
      );


    let diaAnterior = null;

    if (
      resultadoAnterior.rows.length > 0
    ) {
      diaAnterior =
        await buscarDiaCompleto(
          client,
          resultadoAnterior.rows[0].id
        );
    }


    let dia;


    if (!diaAnterior) {
      const resultadoDia =
        await client.query(
          `
            INSERT INTO agenda_publica_dias (
              data,
              aberto,
              publicado,
              observacao,
              criado_por,
              atualizado_por
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $5
            )

            RETURNING *
          `,
          [
            data,
            aberto,
            publicado,
            observacao || null,
            req.usuario.id,
          ]
        );

      dia =
        resultadoDia.rows[0];

    } else {
      const resultadoDia =
        await client.query(
          `
            UPDATE agenda_publica_dias

            SET
              aberto = $1,
              publicado = $2,
              observacao = $3,
              atualizado_por = $4,
              atualizado_em =
                CURRENT_TIMESTAMP

            WHERE
              id = $5

            RETURNING *
          `,
          [
            aberto,
            publicado,
            observacao || null,
            req.usuario.id,
            diaAnterior.id,
          ]
        );

      dia =
        resultadoDia.rows[0];
    }


    const resultadoOcupados =
      await client.query(
        `
          SELECT
            horario

          FROM agenda_publica_horarios

          WHERE
            agenda_dia_id = $1
            AND status = 'OCUPADO'
        `,
        [dia.id]
      );


    const horariosOcupados =
      resultadoOcupados.rows.map(
        (item) =>
          String(item.horario)
      );


    const ocupadoSeriaRemovido =
      horariosOcupados.some(
        (horarioOcupado) =>
          !horarios.includes(
            horarioOcupado
          )
      );


    if (ocupadoSeriaRemovido) {
      await client.query("ROLLBACK");

      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "A configuração não pode remover um horário que já está ocupado.",
      });
    }


    /*
     * Quando a lista está vazia não usamos ANY(time[]),
     * evitando ambiguidades de tipo no PostgreSQL.
     */
    if (horarios.length === 0) {
      await client.query(
        `
          DELETE FROM agenda_publica_horarios

          WHERE
            agenda_dia_id = $1
            AND status <> 'OCUPADO'
        `,
        [dia.id]
      );

    } else {
      await client.query(
        `
          DELETE FROM agenda_publica_horarios

          WHERE
            agenda_dia_id = $1
            AND status <> 'OCUPADO'
            AND NOT (
              horario = ANY(
                $2::time[]
              )
            )
        `,
        [
          dia.id,
          horarios,
        ]
      );
    }


    for (const horario of horarios) {
      await client.query(
        `
          INSERT INTO agenda_publica_horarios (
            agenda_dia_id,
            horario,
            status,
            criado_por,
            atualizado_por
          )

          VALUES (
            $1,
            $2,
            'DISPONIVEL',
            $3,
            $3
          )

          ON CONFLICT (
            agenda_dia_id,
            horario
          )
          DO NOTHING
        `,
        [
          dia.id,
          horario,
          req.usuario.id,
        ]
      );
    }


    const diaFinal =
      await buscarDiaCompleto(
        client,
        dia.id
      );


    await client.query("COMMIT");

    transacaoIniciada = false;


    await registrarLogSeguro({
      usuarioId:
        req.usuario.id,

      acao:
        diaAnterior
          ? "ALTERAR_AGENDA_PUBLICA_DIA"
          : "CRIAR_AGENDA_PUBLICA_DIA",

      entidade:
        "agenda_publica_dias",

      registroId:
        diaFinal.id,

      valorAnterior:
        diaAnterior,

      valorNovo: {
        ...diaFinal,

        autorizacao_agenda:
          autorizacao.autorizadoPor
            ? {
                usuario_id:
                  autorizacao
                    .autorizadoPor
                    .id,

                nome:
                  autorizacao
                    .autorizadoPor
                    .nome,

                perfil:
                  autorizacao
                    .autorizadoPor
                    .perfil,
              }
            : null,
      },

      ip:
        req.ip,
    });


    return res.status(200).json({
      mensagem:
        diaAnterior
          ? "Agenda da data atualizada com sucesso."
          : "Agenda da data criada com sucesso.",

      dia:
        diaFinal,

      autorizado_por:
        autorizacao.autorizadoPor,
    });

  } catch (erro) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer alteração da agenda:",
          erroRollback
        );
      }
    }


    console.error(
      "Erro ao salvar dia da agenda:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao salvar a agenda.",
    });

  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * ============================================================
 * ABERTURA / ALTERAÇÃO EM MASSA
 * ============================================================
 *
 * A operação recebe:
 *
 * data_inicio
 * data_fim
 * dias_semana
 * horarios
 * tratamento_existentes
 *
 * Exemplo:
 *
 * 01/11 até 30/11
 * segunda a sexta
 * 08:00, 09:30, 14:00
 *
 * A regra é MATERIALIZADA.
 *
 * Isso significa que cada data e cada horário são gravados
 * individualmente nas tabelas da agenda.
 *
 * Alterar uma terça-feira depois não altera as demais.
 * ============================================================
 */

async function aplicarAgendaEmMassa(
  req,
  res
) {
  let client;
  let transacaoIniciada = false;

  try {
    const dataInicio =
      req.body.data_inicio;

    const dataFim =
      req.body.data_fim;


    if (
      !dataValida(dataInicio) ||
      !dataValida(dataFim)
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um período válido.",
      });
    }


    if (dataFim < dataInicio) {
      return res.status(400).json({
        mensagem:
          "A data final não pode ser anterior à data inicial.",
      });
    }


    const resultadoDiasSemana =
      normalizarDiasSemana(
        req.body.dias_semana
      );


    if (!resultadoDiasSemana.valido) {
      return res.status(400).json({
        mensagem:
          resultadoDiasSemana.mensagem,
      });
    }


    const resultadoHorarios =
      normalizarHorarios(
        req.body.horarios
      );


    if (!resultadoHorarios.valido) {
      return res.status(400).json({
        mensagem:
          resultadoHorarios.mensagem,
      });
    }


    const horarios =
      resultadoHorarios.horarios;


    if (horarios.length === 0) {
      return res.status(400).json({
        mensagem:
          "Informe pelo menos um horário para a abertura em massa.",
      });
    }


    const tratamentoExistentes =
      String(
        req.body
          .tratamento_existentes ||
        ""
      )
        .trim()
        .toUpperCase();


    if (
      !TRATAMENTOS_EXISTENTES.includes(
        tratamentoExistentes
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Informe como as datas existentes devem ser tratadas: MANTER, ADICIONAR ou SUBSTITUIR.",
      });
    }


    const publicado =
      req.body.publicado ===
      undefined
        ? true
        : req.body.publicado;


    if (
      typeof publicado !== "boolean"
    ) {
      return res.status(400).json({
        mensagem:
          "O campo publicado deve ser verdadeiro ou falso.",
      });
    }


    const observacao =
      typeof req.body.observacao ===
      "string"
        ? req.body.observacao.trim()
        : "";


    if (
      observacao.length >
      LIMITE_OBSERVACAO
    ) {
      return res.status(400).json({
        mensagem:
          `A observação deve possuir no máximo ${LIMITE_OBSERVACAO} caracteres.`,
      });
    }


    /*
     * SUBSTITUIR é uma ação destrutiva.
     *
     * O frontend deverá exibir uma confirmação clara e
     * enviar confirmacao_substituicao = true.
     *
     * O backend também exige essa confirmação para impedir
     * que a proteção seja contornada manipulando a interface.
     */
    if (
      tratamentoExistentes ===
        "SUBSTITUIR" &&
      req.body
        .confirmacao_substituicao !==
        true
    ) {
      return res.status(400).json({
        mensagem:
          "Confirme explicitamente a substituição das configurações existentes.",

        codigo:
          "CONFIRMACAO_SUBSTITUICAO_NECESSARIA",
      });
    }


    const datas =
      gerarDatasPeriodo({
        dataInicio,
        dataFim,

        diasSemana:
          resultadoDiasSemana.dias,
      });


    if (datas.length === 0) {
      return res.status(400).json({
        mensagem:
          "Nenhuma data do período corresponde aos dias da semana selecionados.",
      });
    }


    let autorizacao;

    try {
      autorizacao =
        await verificarAutorizacaoAgenda({
          usuarioLogado:
            req.usuario,

          senhaAutorizacao:
            req.body.senha_autorizacao,
        });

    } catch (erroAutorizacao) {
      return responderErroAutorizacao(
        res,
        erroAutorizacao
      );
    }


    client =
      await pool.connect();

    await client.query("BEGIN");

    transacaoIniciada = true;


    const resumo = {
      datas_selecionadas:
        datas.length,

      datas_criadas: 0,

      datas_alteradas: 0,

      datas_mantidas: 0,

      horarios_adicionados: 0,
    };


    /*
     * Guardamos um resumo das datas modificadas para
     * auditoria sem armazenar senha ou credencial.
     */
    const datasModificadas = [];

        for (const data of datas) {
      const resultadoExistente =
        await client.query(
          `
            SELECT *

            FROM agenda_publica_dias

            WHERE
              data = $1

            FOR UPDATE
          `,
          [data]
        );


      /*
       * ======================================================
       * DATA AINDA NÃO EXISTE
       * ======================================================
       */
      if (
        resultadoExistente.rows.length ===
        0
      ) {
        const resultadoNovoDia =
          await client.query(
            `
              INSERT INTO agenda_publica_dias (
                data,
                aberto,
                publicado,
                observacao,
                criado_por,
                atualizado_por
              )

              VALUES (
                $1,
                TRUE,
                $2,
                $3,
                $4,
                $4
              )

              RETURNING *
            `,
            [
              data,
              publicado,
              observacao || null,
              req.usuario.id,
            ]
          );


        const novoDia =
          resultadoNovoDia.rows[0];


        for (
          const horario
          of horarios
        ) {
          await client.query(
            `
              INSERT INTO agenda_publica_horarios (
                agenda_dia_id,
                horario,
                status,
                criado_por,
                atualizado_por
              )

              VALUES (
                $1,
                $2,
                'DISPONIVEL',
                $3,
                $3
              )
            `,
            [
              novoDia.id,
              horario,
              req.usuario.id,
            ]
          );

          resumo.horarios_adicionados++;
        }


        resumo.datas_criadas++;

        datasModificadas.push({
          data,
          acao: "CRIADA",
        });

        continue;
      }


      const diaExistente =
        resultadoExistente.rows[0];


      /*
       * ======================================================
       * MANTER
       * ======================================================
       *
       * A data existente não é modificada.
       */
      if (
        tratamentoExistentes ===
        "MANTER"
      ) {
        resumo.datas_mantidas++;

        continue;
      }


      /*
       * ======================================================
       * ADICIONAR
       * ======================================================
       *
       * Mantém os horários existentes e adiciona somente
       * aqueles que ainda não existem.
       *
       * Também abre/publica o dia conforme a operação.
       */
      if (
        tratamentoExistentes ===
        "ADICIONAR"
      ) {
        await client.query(
          `
            UPDATE agenda_publica_dias

            SET
              aberto = TRUE,
              publicado = $1,
              atualizado_por = $2,
              atualizado_em =
                CURRENT_TIMESTAMP

            WHERE
              id = $3
          `,
          [
            publicado,
            req.usuario.id,
            diaExistente.id,
          ]
        );


        let adicionadosNestaData = 0;


        for (
          const horario
          of horarios
        ) {
          const resultadoInsert =
            await client.query(
              `
                INSERT INTO agenda_publica_horarios (
                  agenda_dia_id,
                  horario,
                  status,
                  criado_por,
                  atualizado_por
                )

                VALUES (
                  $1,
                  $2,
                  'DISPONIVEL',
                  $3,
                  $3
                )

                ON CONFLICT (
                  agenda_dia_id,
                  horario
                )
                DO NOTHING

                RETURNING id
              `,
              [
                diaExistente.id,
                horario,
                req.usuario.id,
              ]
            );


          if (
            resultadoInsert.rows.length >
            0
          ) {
            adicionadosNestaData++;
            resumo.horarios_adicionados++;
          }
        }


        resumo.datas_alteradas++;

        datasModificadas.push({
          data,
          acao: "ADICIONADA",
          horarios_adicionados:
            adicionadosNestaData,
        });

        continue;
      }


      /*
       * ======================================================
       * SUBSTITUIR
       * ======================================================
       *
       * A lista enviada passa a representar a configuração
       * desejada daquela data.
       *
       * Horários OCUPADOS são protegidos.
       */
      if (
        tratamentoExistentes ===
        "SUBSTITUIR"
      ) {
        const resultadoOcupados =
          await client.query(
            `
              SELECT
                horario

              FROM agenda_publica_horarios

              WHERE
                agenda_dia_id = $1
                AND status = 'OCUPADO'
            `,
            [diaExistente.id]
          );


        const horariosOcupados =
          resultadoOcupados.rows.map(
            (item) =>
              String(item.horario)
          );


        const ocupadoSeriaRemovido =
          horariosOcupados.some(
            (horarioOcupado) =>
              !horarios.includes(
                horarioOcupado
              )
          );


        /*
         * Uma única data com conflito cancela toda a operação.
         *
         * Isso evita aplicar metade de um mês e deixar a outra
         * metade sem alteração.
         */
        if (ocupadoSeriaRemovido) {
          await client.query(
            "ROLLBACK"
          );

          transacaoIniciada = false;


          return res.status(409).json({
            mensagem:
              `A data ${data} possui horário ocupado que seria removido pela substituição.`,

            codigo:
              "HORARIO_OCUPADO_IMPEDE_SUBSTITUICAO",

            data_conflito:
              data,
          });
        }


        await client.query(
          `
            UPDATE agenda_publica_dias

            SET
              aberto = TRUE,
              publicado = $1,
              observacao = $2,
              atualizado_por = $3,
              atualizado_em =
                CURRENT_TIMESTAMP

            WHERE
              id = $4
          `,
          [
            publicado,
            observacao || null,
            req.usuario.id,
            diaExistente.id,
          ]
        );


        /*
         * BLOQUEADOS também são substituídos.
         *
         * Somente OCUPADOS são preservados porque representam
         * compromisso já assumido pela agenda.
         */
        await client.query(
          `
            DELETE FROM agenda_publica_horarios

            WHERE
              agenda_dia_id = $1
              AND status <> 'OCUPADO'
          `,
          [diaExistente.id]
        );


        let adicionadosNestaData = 0;


        for (
          const horario
          of horarios
        ) {
          const resultadoInsert =
            await client.query(
              `
                INSERT INTO agenda_publica_horarios (
                  agenda_dia_id,
                  horario,
                  status,
                  criado_por,
                  atualizado_por
                )

                VALUES (
                  $1,
                  $2,
                  'DISPONIVEL',
                  $3,
                  $3
                )

                ON CONFLICT (
                  agenda_dia_id,
                  horario
                )
                DO NOTHING

                RETURNING id
              `,
              [
                diaExistente.id,
                horario,
                req.usuario.id,
              ]
            );


          if (
            resultadoInsert.rows.length >
            0
          ) {
            adicionadosNestaData++;
            resumo.horarios_adicionados++;
          }
        }


        resumo.datas_alteradas++;

        datasModificadas.push({
          data,
          acao: "SUBSTITUIDA",
          horarios_adicionados:
            adicionadosNestaData,
        });
      }
    }


    /*
     * ========================================================
     * REGISTRAR A OPERAÇÃO EM MASSA
     * ========================================================
     *
     * Esta tabela serve apenas para rastreabilidade.
     *
     * A disponibilidade real está nas tabelas de dias
     * e horários.
     */
    const resultadoOperacao =
      await client.query(
        `
          INSERT INTO agenda_publica_operacoes (
            tipo,
            data_inicio,
            data_fim,
            configuracao,
            tratamento_existentes,
            executado_por,
            autorizado_por
          )

          VALUES (
            'ABERTURA_MASSA',
            $1,
            $2,
            $3::jsonb,
            $4,
            $5,
            $6
          )

          RETURNING *
        `,
        [
          dataInicio,
          dataFim,

          JSON.stringify({
            dias_semana:
              resultadoDiasSemana.dias,

            horarios,

            publicado,

            observacao:
              observacao || null,

            resumo,
          }),

          tratamentoExistentes,

          req.usuario.id,

          autorizacao.autorizadoPor
            ?.id || null,
        ]
      );


    const operacao =
      resultadoOperacao.rows[0];


    await client.query("COMMIT");

    transacaoIniciada = false;


    await registrarLogSeguro({
      usuarioId:
        req.usuario.id,

      acao:
        "ABERTURA_AGENDA_PUBLICA_MASSA",

      entidade:
        "agenda_publica_operacoes",

      registroId:
        operacao.id,

      valorAnterior:
        null,

      valorNovo: {
        operacao_id:
          operacao.id,

        data_inicio:
          dataInicio,

        data_fim:
          dataFim,

        dias_semana:
          resultadoDiasSemana.dias,

        horarios,

        tratamento_existentes:
          tratamentoExistentes,

        publicado,

        resumo,

        datas_modificadas:
          datasModificadas,

        autorizacao_agenda:
          autorizacao.autorizadoPor
            ? {
                usuario_id:
                  autorizacao
                    .autorizadoPor
                    .id,

                nome:
                  autorizacao
                    .autorizadoPor
                    .nome,

                perfil:
                  autorizacao
                    .autorizadoPor
                    .perfil,
              }
            : null,
      },

      ip:
        req.ip,
    });


    return res.status(200).json({
      mensagem:
        "Operação em massa concluída com sucesso.",

      operacao_id:
        operacao.id,

      periodo: {
        data_inicio:
          dataInicio,

        data_fim:
          dataFim,
      },

      tratamento_existentes:
        tratamentoExistentes,

      resumo,

      autorizado_por:
        autorizacao.autorizadoPor,
    });

  } catch (erro) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer operação em massa da agenda:",
          erroRollback
        );
      }
    }


    console.error(
      "Erro na operação em massa da agenda:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao realizar a operação em massa da agenda.",
    });

  } finally {
    if (client) {
      client.release();
    }
  }
}

/*
 * ============================================================
 * FECHAMENTO EM MASSA DA AGENDA PÚBLICA
 * ============================================================
 *
 * Fecha um conjunto de datas já configuradas.
 *
 * IMPORTANTE:
 * fechar uma data NÃO significa cancelar atendimentos.
 *
 * Por isso:
 * - aberto passa para FALSE;
 * - publicado passa para FALSE;
 * - horários existentes são preservados;
 * - horários OCUPADOS são preservados;
 * - nenhum agendamento é excluído.
 *
 * Também não criamos dias inexistentes durante o fechamento.
 * Se uma data nunca foi configurada, ela já está indisponível
 * para o site público e não precisa ser criada apenas para
 * representar um fechamento.
 * ============================================================
 */
async function fecharAgendaEmMassa(
  req,
  res
) {
  let client;
  let transacaoIniciada = false;

  try {
    const dataInicio =
      req.body.data_inicio;

    const dataFim =
      req.body.data_fim;


    /*
     * ========================================================
     * VALIDAR PERÍODO
     * ========================================================
     */
    if (
      !dataValida(dataInicio) ||
      !dataValida(dataFim)
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um período válido.",
      });
    }


    if (dataFim < dataInicio) {
      return res.status(400).json({
        mensagem:
          "A data final não pode ser anterior à data inicial.",
      });
    }


    /*
     * ========================================================
     * VALIDAR DIAS DA SEMANA
     * ========================================================
     *
     * Mantemos o mesmo padrão utilizado na abertura:
     *
     * 0 = domingo
     * 1 = segunda
     * ...
     * 6 = sábado
     *
     * Isso permite, por exemplo, fechar somente sábados e
     * domingos de um mês.
     */
    const resultadoDiasSemana =
      normalizarDiasSemana(
        req.body.dias_semana
      );


    if (!resultadoDiasSemana.valido) {
      return res.status(400).json({
        mensagem:
          resultadoDiasSemana.mensagem,
      });
    }


    /*
     * ========================================================
     * OBSERVAÇÃO / MOTIVO
     * ========================================================
     */
    const observacao =
      typeof req.body.observacao ===
      "string"
        ? req.body.observacao.trim()
        : "";


    if (
      observacao.length >
      LIMITE_OBSERVACAO
    ) {
      return res.status(400).json({
        mensagem:
          `A observação deve possuir no máximo ${LIMITE_OBSERVACAO} caracteres.`,
      });
    }


    /*
     * ========================================================
     * CONFIRMAÇÃO EXPLÍCITA
     * ========================================================
     *
     * Fechar várias datas é uma operação relevante.
     *
     * Mesmo que o frontend mostre uma confirmação visual,
     * o backend também exige a confirmação para impedir que
     * alguém contorne essa proteção manipulando a requisição.
     */
    if (
      req.body.confirmacao_fechamento !==
      true
    ) {
      return res.status(400).json({
        mensagem:
          "Confirme explicitamente o fechamento do período.",

        codigo:
          "CONFIRMACAO_FECHAMENTO_NECESSARIA",
      });
    }


    /*
     * Gera somente as datas que realmente pertencem aos
     * dias da semana selecionados.
     */
    const datas =
      gerarDatasPeriodo({
        dataInicio,
        dataFim,

        diasSemana:
          resultadoDiasSemana.dias,
      });


    if (datas.length === 0) {
      return res.status(400).json({
        mensagem:
          "Nenhuma data do período corresponde aos dias da semana selecionados.",
      });
    }


    /*
     * ========================================================
     * AUTORIZAÇÃO
     * ========================================================
     *
     * Administrador e Gerente passam diretamente.
     *
     * Funcionário precisa informar a senha de um
     * Administrador ou Gerente ativo.
     *
     * A identificação do autorizador acontece no backend.
     * A senha nunca é salva em log ou banco.
     */
    let autorizacao;

    try {
      autorizacao =
        await verificarAutorizacaoAgenda({
          usuarioLogado:
            req.usuario,

          senhaAutorizacao:
            req.body.senha_autorizacao,
        });

    } catch (erroAutorizacao) {
      return responderErroAutorizacao(
        res,
        erroAutorizacao
      );
    }


    /*
     * ========================================================
     * INICIAR TRANSAÇÃO
     * ========================================================
     *
     * O fechamento inteiro é executado dentro da mesma
     * transação.
     *
     * Assim evitamos que apenas parte do período seja alterada
     * caso ocorra algum erro inesperado.
     */
    client =
      await pool.connect();

    await client.query("BEGIN");

    transacaoIniciada = true;


    const resumo = {
      datas_selecionadas:
        datas.length,

      datas_fechadas: 0,

      datas_ja_fechadas: 0,

      datas_nao_configuradas: 0,

      horarios_preservados: 0,

      horarios_ocupados_preservados: 0,
    };


    /*
     * Usado somente para auditoria.
     *
     * Não armazenamos senha ou qualquer credencial.
     */
    const datasModificadas = [];


    /*
     * ========================================================
     * PROCESSAR CADA DATA
     * ========================================================
     */
    for (const data of datas) {
      const resultadoDia =
        await client.query(
          `
            SELECT *

            FROM agenda_publica_dias

            WHERE
              data = $1

            FOR UPDATE
          `,
          [data]
        );


      /*
       * A data nunca foi configurada.
       *
       * Não precisamos criar um registro fechado porque uma
       * data inexistente já não aparece como disponível para
       * agendamento público.
       */
      if (
        resultadoDia.rows.length === 0
      ) {
        resumo.datas_nao_configuradas++;

        continue;
      }


      const dia =
        resultadoDia.rows[0];


      /*
       * Contamos os horários antes da alteração apenas para
       * retornar um resumo útil ao usuário e registrar auditoria.
       *
       * Nenhum desses horários será removido.
       */
      const resultadoHorarios =
        await client.query(
          `
            SELECT
              id,
              horario,
              status

            FROM agenda_publica_horarios

            WHERE
              agenda_dia_id = $1

            ORDER BY
              horario ASC
          `,
          [dia.id]
        );


      const horariosDoDia =
        resultadoHorarios.rows;


      const quantidadeOcupados =
        horariosDoDia.filter(
          (horario) =>
            horario.status === "OCUPADO"
        ).length;


      resumo.horarios_preservados +=
        horariosDoDia.length;

      resumo
        .horarios_ocupados_preservados +=
        quantidadeOcupados;


      /*
       * Se o dia já está fechado e não publicado, não há
       * necessidade de executar outro UPDATE.
       *
       * Ainda assim ele entra no resumo da operação.
       */
      if (
        dia.aberto === false &&
        dia.publicado === false
      ) {
        resumo.datas_ja_fechadas++;

        continue;
      }


      /*
       * ======================================================
       * FECHAR A DATA
       * ======================================================
       *
       * ATENÇÃO:
       *
       * Não existe DELETE em agenda_publica_horarios aqui.
       *
       * Isso é proposital.
       *
       * Um horário OCUPADO pode representar um atendimento
       * real já agendado. Fechar o dia apenas impede novos
       * agendamentos.
       */
      await client.query(
        `
          UPDATE agenda_publica_dias

          SET
            aberto = FALSE,
            publicado = FALSE,
            observacao = $1,
            atualizado_por = $2,
            atualizado_em =
              CURRENT_TIMESTAMP

          WHERE
            id = $3
        `,
        [
          observacao || dia.observacao,
          req.usuario.id,
          dia.id,
        ]
      );


      resumo.datas_fechadas++;


      datasModificadas.push({
        data,

        acao:
          "FECHADA",

        horarios_preservados:
          horariosDoDia.length,

        horarios_ocupados_preservados:
          quantidadeOcupados,
      });
    }


    /*
     * ========================================================
     * REGISTRAR OPERAÇÃO EM MASSA
     * ========================================================
     *
     * A tabela agenda_publica_operacoes é utilizada para
     * rastreabilidade.
     *
     * Ela NÃO é a fonte da disponibilidade da agenda.
     */
    const resultadoOperacao =
      await client.query(
        `
          INSERT INTO agenda_publica_operacoes (
            tipo,
            data_inicio,
            data_fim,
            configuracao,
            tratamento_existentes,
            executado_por,
            autorizado_por
          )

          VALUES (
            'FECHAMENTO_MASSA',
            $1,
            $2,
            $3::jsonb,
            NULL,
            $4,
            $5
          )

          RETURNING *
        `,
        [
          dataInicio,
          dataFim,

          JSON.stringify({
            dias_semana:
              resultadoDiasSemana.dias,

            observacao:
              observacao || null,

            resumo,
          }),

          req.usuario.id,

          autorizacao.autorizadoPor
            ?.id || null,
        ]
      );


    const operacao =
      resultadoOperacao.rows[0];


    /*
     * Somente depois de todas as datas terem sido processadas
     * confirmamos a transação.
     */
    await client.query("COMMIT");

    transacaoIniciada = false;


    /*
     * ========================================================
     * LOG DE AUDITORIA
     * ========================================================
     */
    await registrarLogSeguro({
      usuarioId:
        req.usuario.id,

      acao:
        "FECHAMENTO_AGENDA_PUBLICA_MASSA",

      entidade:
        "agenda_publica_operacoes",

      registroId:
        operacao.id,

      valorAnterior:
        null,

      valorNovo: {
        operacao_id:
          operacao.id,

        data_inicio:
          dataInicio,

        data_fim:
          dataFim,

        dias_semana:
          resultadoDiasSemana.dias,

        observacao:
          observacao || null,

        resumo,

        datas_modificadas:
          datasModificadas,

        autorizacao_agenda:
          autorizacao.autorizadoPor
            ? {
                usuario_id:
                  autorizacao
                    .autorizadoPor
                    .id,

                nome:
                  autorizacao
                    .autorizadoPor
                    .nome,

                perfil:
                  autorizacao
                    .autorizadoPor
                    .perfil,
              }
            : null,
      },

      ip:
        req.ip,
    });


    /*
     * ========================================================
     * RESPOSTA
     * ========================================================
     */
    return res.status(200).json({
      mensagem:
        "Fechamento em massa concluído com sucesso.",

      operacao_id:
        operacao.id,

      periodo: {
        data_inicio:
          dataInicio,

        data_fim:
          dataFim,
      },

      dias_semana:
        resultadoDiasSemana.dias,

      resumo,

      autorizado_por:
        autorizacao.autorizadoPor,
    });

  } catch (erro) {
    /*
     * Qualquer erro antes do COMMIT desfaz toda a operação.
     */
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query(
          "ROLLBACK"
        );

      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer fechamento em massa da agenda:",
          erroRollback
        );
      }
    }


    console.error(
      "Erro no fechamento em massa da agenda:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao fechar a agenda em massa.",
    });

  } finally {
    if (client) {
      client.release();
    }
  }
}


module.exports = {
  consultarAgendaPeriodo,
  consultarDiaAgenda,
  salvarDiaAgenda,
  aplicarAgendaEmMassa,
  fecharAgendaEmMassa,
};