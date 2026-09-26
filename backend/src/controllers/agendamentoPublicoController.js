const pool = require("../database/connection");


const LIMITE_SERVICOS = 50;
const LIMITE_OBSERVACOES = 2000;


/*
 * Converte valores recebidos pela API em IDs válidos.
 *
 * O portal é público, portanto nenhum ID enviado pelo
 * navegador é considerado confiável sem validação.
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
 * Normaliza textos opcionais.
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
 * =========================================================
 * SERVIÇOS PÚBLICOS
 * =========================================================
 *
 * O portal mostra somente serviços ativos.
 *
 * Valores e durações vêm exclusivamente do banco.
 * O frontend nunca será fonte confiável para preço.
 */
async function listarServicosPublicos(req, res) {
  try {
    const resultado = await pool.query(
      `
        SELECT
          id,
          nome,
          descricao,
          valor,
          duracao_minutos

        FROM servicos

        WHERE ativo = TRUE

        ORDER BY nome ASC
      `
    );

    return res.status(200).json(
      resultado.rows
    );
  } catch (erro) {
    console.error(
      "Erro ao listar serviços públicos:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Não foi possível carregar os serviços.",
    });
  }
}


/*
 * =========================================================
 * CONFIRMAR AGENDAMENTO PÚBLICO
 * =========================================================
 *
 * Esta operação precisa ser atômica.
 *
 * O mesmo horário não pode ser utilizado por duas pessoas.
 * Por isso o slot é bloqueado com FOR UPDATE antes da
 * criação do atendimento.
 */
async function confirmarAgendamentoPublico(
  req,
  res
) {
  let client;
  let transacaoIniciada = false;

  try {
    const {
      pet_id,
      horario_id,
      servicos,
      observacoes,
    } = req.body;


    /*
    * tutorId nunca é aceito do navegador.
    *
    * A identidade foi comprovada anteriormente e recuperada
    * pelo clientePublicoMiddleware.
    */
    const tutorId =
      req.clientePublico.tutorId;

    const petId =
      converterId(pet_id);

    const horarioId =
      converterId(horario_id);


    if (!tutorId) {
      return res.status(400).json({
        mensagem:
          "Tutor inválido.",
      });
    }


    if (!petId) {
      return res.status(400).json({
        mensagem:
          "Pet inválido.",
      });
    }


    if (!horarioId) {
      return res.status(400).json({
        mensagem:
          "Horário inválido.",
      });
    }


    /*
     * Não permitimos arrays vazios, IDs inválidos ou
     * quantidades excessivas de serviços.
     */
    if (
      !Array.isArray(servicos) ||
      servicos.length === 0 ||
      servicos.length > LIMITE_SERVICOS
    ) {
      return res.status(400).json({
        mensagem:
          "Selecione pelo menos um serviço válido.",
      });
    }


    const servicosNormalizados = [
      ...new Set(
        servicos.map(converterId)
      ),
    ];


    if (
      servicosNormalizados.some(
        (id) => id === null
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Existe um serviço inválido.",
      });
    }


    if (
      observacoes !== undefined &&
      observacoes !== null &&
      typeof observacoes !== "string"
    ) {
      return res.status(400).json({
        mensagem:
          "As observações são inválidas.",
      });
    }


    const observacoesNormalizadas =
      normalizarTextoOpcional(
        observacoes
      );


    if (
      observacoesNormalizadas &&
      observacoesNormalizadas.length >
        LIMITE_OBSERVACOES
    ) {
      return res.status(400).json({
        mensagem:
          `As observações devem possuir no máximo ${LIMITE_OBSERVACOES} caracteres.`,
      });
    }


    client = await pool.connect();

    await client.query("BEGIN");

    transacaoIniciada = true;


    /*
     * -----------------------------------------------------
     * 1. BLOQUEIA O SLOT
     * -----------------------------------------------------
     *
     * FOR UPDATE é essencial aqui.
     *
     * Se duas pessoas tentarem confirmar o mesmo horário,
     * uma das transações aguardará a outra terminar.
     */
    const resultadoHorario =
      await client.query(
        `
          SELECT
            h.id,
            h.horario,
            h.status,

            d.id AS agenda_dia_id,
            d.data,
            d.aberto,
            d.publicado

          FROM agenda_publica_horarios h

          INNER JOIN agenda_publica_dias d
            ON d.id = h.agenda_dia_id

          WHERE h.id = $1

          FOR UPDATE OF h
        `,
        [horarioId]
      );


    if (
      resultadoHorario.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "Horário não encontrado.",
      });
    }


    const horario =
      resultadoHorario.rows[0];


    /*
     * Mesmo que o usuário tenha aberto a página enquanto
     * o horário estava disponível, ele pode ter sido
     * fechado ou ocupado antes da confirmação.
     */
    if (
      !horario.aberto ||
      !horario.publicado ||
      horario.status !== "DISPONIVEL"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Este horário não está mais disponível. Escolha outro horário.",
      });
    }


    /*
     * Não confiamos apenas na consulta anterior da agenda.
     * A confirmação também impede horários no passado.
     */
    const resultadoHorarioValido =
      await client.query(
        `
          SELECT
            (
              $1::date +
              $2::time
            ) > CURRENT_TIMESTAMP
              AS futuro
        `,
        [
          horario.data,
          horario.horario,
        ]
      );


    if (
      !resultadoHorarioValido
        .rows[0]
        .futuro
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Este horário já passou.",
      });
    }


    /*
     * -----------------------------------------------------
     * 2. VALIDA TUTOR E PET
     * -----------------------------------------------------
     *
     * Não basta o frontend enviar tutor_id e pet_id.
     *
     * Precisamos confirmar no banco que o Pet realmente
     * pertence ao Tutor informado.
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
            t.telefone AS tutor_telefone,
            t.email AS tutor_email,
            t.ativo AS tutor_ativo

          FROM pets p

          INNER JOIN pet_tutores pt
            ON pt.pet_id = p.id

          INNER JOIN tutores t
            ON t.id = pt.tutor_id

          WHERE
            p.id = $1
            AND t.id = $2

          FOR UPDATE OF p
        `,
        [
          petId,
          tutorId,
        ]
      );


    if (
      resultadoPet.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "O Pet informado não está vinculado a este Tutor.",
      });
    }


    const pet =
      resultadoPet.rows[0];


    if (
      !pet.ativo ||
      !pet.tutor_ativo
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(400).json({
        mensagem:
          "Não é possível realizar o agendamento com um cadastro inativo.",
      });
    }


    /*
     * -----------------------------------------------------
     * 3. VALIDA SERVIÇOS
     * -----------------------------------------------------
     *
     * Preço e duração são sempre recuperados novamente
     * do banco durante a confirmação.
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

          ORDER BY nome ASC
        `,
        [servicosNormalizados]
      );


    if (
      resultadoServicos.rows.length !==
      servicosNormalizados.length
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

      return res.status(409).json({
        mensagem:
          `O serviço "${servicoInativo.nome}" não está mais disponível.`,
      });
    }


    /*
     * -----------------------------------------------------
     * 4. MONTA DATA/HORA DO ATENDIMENTO
     * -----------------------------------------------------
     *
     * Utilizamos exatamente a data e o horário pertencentes
     * ao slot escolhido. O navegador não pode inventar
     * agendado_para.
     */
    const resultadoDataHora =
      await client.query(
        `
          SELECT
            (
              $1::date +
              $2::time
            ) AS agendado_para
        `,
        [
          horario.data,
          horario.horario,
        ]
      );


    const agendadoPara =
      resultadoDataHora
        .rows[0]
        .agendado_para;


    /*
     * -----------------------------------------------------
     * 5. CRIA ATENDIMENTO
     * -----------------------------------------------------
     *
     * usuario_criacao_id permanece NULL porque este
     * atendimento foi criado pelo próprio cliente.
     */
    const resultadoAgendamento =
      await client.query(
        `
          INSERT INTO banho_tosa
          (
            pet_id,
            agendado_para,
            observacoes_agendamento,
            usuario_criacao_id,
            origem,
            agenda_publica_horario_id
          )

          VALUES
          (
            $1,
            $2,
            $3,
            NULL,
            'PUBLICO',
            $4
          )

          RETURNING *
        `,
        [
          petId,
          agendadoPara,
          observacoesNormalizadas,
          horarioId,
        ]
      );


    const atendimento =
      resultadoAgendamento.rows[0];


    /*
     * -----------------------------------------------------
     * 6. SNAPSHOT DOS SERVIÇOS
     * -----------------------------------------------------
     */
    let valorTotal = 0;
    let duracaoTotal = 0;

    const itens = [];


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

            VALUES
            (
              $1,
              $2,
              $3,
              $4
            )

            RETURNING *
          `,
          [
            atendimento.id,
            servico.id,
            valor,
            duracao,
          ]
        );


      valorTotal += valor;

      if (duracao) {
        duracaoTotal += duracao;
      }


      itens.push({
        ...resultadoItem.rows[0],
        nome: servico.nome,
        descricao:
          servico.descricao,
      });
    }


    /*
     * -----------------------------------------------------
     * 7. CRIA PAGAMENTO PENDENTE
     * -----------------------------------------------------
     *
     * O valor é calculado exclusivamente pelo backend.
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

          VALUES
          (
            $1,
            $2,
            'PENDENTE'
          )

          RETURNING *
        `,
        [
          atendimento.id,
          valorTotal,
        ]
      );


    /*
     * -----------------------------------------------------
     * 8. OCUPA O SLOT
     * -----------------------------------------------------
     *
     * Esta alteração acontece na mesma transação da criação
     * do atendimento.
     */
    await client.query(
      `
        UPDATE agenda_publica_horarios

        SET
          status = 'OCUPADO',
          atualizado_em =
            CURRENT_TIMESTAMP

        WHERE id = $1
      `,
      [horarioId]
    );


    /*
     * Somente agora todas as alterações são confirmadas.
     */
    await client.query("COMMIT");

    transacaoIniciada = false;


    return res.status(201).json({
      mensagem:
        "Agendamento realizado com sucesso.",

      atendimento: {
        id: atendimento.id,

        origem:
          atendimento.origem,

        pet: {
          id: pet.id,
          nome: pet.nome,
        },

        tutor: {
          id: pet.tutor_id,
          nome: pet.tutor_nome,
        },

        agendado_para:
          atendimento.agendado_para,

        servicos: itens,

        valor_total:
          Number(
            valorTotal.toFixed(2)
          ),

        duracao_total_minutos:
          duracaoTotal,

        pagamento:
          resultadoPagamento.rows[0],
      },
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
          "Erro ao desfazer agendamento público:",
          erroRollback
        );
      }
    }


    /*
     * O índice UNIQUE da migration também funciona como
     * uma segunda camada de proteção contra slot duplicado.
     */
    if (erro.code === "23505") {
      return res.status(409).json({
        mensagem:
          "Este horário acabou de ser reservado. Escolha outro horário.",
      });
    }


    console.error(
      "Erro ao confirmar agendamento público:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Não foi possível concluir o agendamento.",
    });

  } finally {

    if (client) {
      client.release();
    }
  }
}


module.exports = {
  listarServicosPublicos,
  confirmarAgendamentoPublico,
};