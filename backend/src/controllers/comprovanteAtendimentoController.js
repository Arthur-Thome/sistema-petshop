const PDFDocument = require("pdfkit");

const pool = require("../database/connection");

/*
 * Converte o parâmetro recebido pela URL em um ID válido.
 *
 * Mantemos a validação também neste controller para que
 * uma URL manipulada não chegue diretamente à consulta SQL.
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
 * Formata valores monetários no padrão brasileiro.
 */
function formatarMoeda(valor) {
  const numero = Number(valor || 0);

  return numero.toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  );
}


/*
 * Formata datas armazenadas pelo PostgreSQL.
 *
 * Caso não exista uma data, exibimos "-" para que o PDF
 * nunca mostre "Invalid Date" ao usuário.
 */
function formatarDataHora(valor) {
  if (!valor) {
    return "-";
  }

  const data = new Date(valor);

  if (
    Number.isNaN(
      data.getTime()
    )
  ) {
    return "-";
  }

  return data.toLocaleString(
    "pt-BR"
  );
}


/*
 * Converte valores internos para textos mais adequados
 * à leitura no comprovante.
 */
function formatarStatus(valor) {
  if (!valor) {
    return "-";
  }

  const status = {
    AGENDADO: "Agendado",
    EM_ATENDIMENTO: "Em atendimento",
    FINALIZADO: "Finalizado",
    CANCELADO: "Cancelado",
    PENDENTE: "Pendente",
    PAGO: "Pago",
  };

  return (
    status[valor] ||
    String(valor).replaceAll("_", " ")
  );
}


/*
 * Formata a forma de pagamento sem alterar o valor
 * armazenado no banco.
 */
function formatarMetodoPagamento(valor) {
  if (!valor) {
    return "-";
  }

  const metodos = {
    PIX: "Pix",
    DINHEIRO: "Dinheiro",
    CARTAO_CREDITO:
      "Cartão de crédito",
    CARTAO_DEBITO:
      "Cartão de débito",
  };

  return (
    metodos[valor] ||
    String(valor).replaceAll("_", " ")
  );
}


/*
 * Gera o comprovante oficial do atendimento em PDF.
 *
 * Os dados financeiros são obtidos diretamente do banco.
 * O navegador não informa valores, serviços ou situação
 * de pagamento para a geração do documento.
 */
async function gerarComprovantePdf(
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

    /*
     * A consulta reúne os dados necessários para que
     * o PDF seja produzido exclusivamente pelo backend.
     *
     * O tutor exibido segue a regra atual do sistema:
     * o tutor principal cadastrado para o Pet.
     */
    const resultado =
      await pool.query(
        `
          SELECT
            bt.id,
            bt.status,
            bt.agendado_para,
            bt.iniciado_em,
            bt.finalizado_em,
            bt.observacoes_agendamento,
            bt.observacoes_atendimento,
            bt.motivo_cancelamento,
            bt.criado_em,

            p.id AS pet_id,
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
                    'duracao_minutos',
                      bts.duracao_minutos
                  )
                  ORDER BY s.nome
                )

                FROM banho_tosa_servicos bts

                INNER JOIN servicos s
                  ON s.id =
                     bts.servico_id

                WHERE
                  bts.banho_tosa_id =
                    bt.id
              ),
              '[]'::json
            ) AS servicos,

            pg.valor_total,
            pg.status
              AS pagamento_status,
            pg.metodo
              AS pagamento_metodo,
            pg.pago_em
              AS pagamento_pago_em

          FROM banho_tosa bt

          INNER JOIN pets p
            ON p.id = bt.pet_id

          INNER JOIN pet_tutores pt
            ON pt.pet_id = p.id
            AND pt.principal = TRUE

          INNER JOIN tutores t
            ON t.id = pt.tutor_id

          LEFT JOIN pagamentos_banho_tosa pg
            ON pg.banho_tosa_id =
               bt.id

          WHERE bt.id = $1
        `,
        [atendimentoId]
      );

    if (
      resultado.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Atendimento não encontrado.",
      });
    }

    const atendimento =
      resultado.rows[0];

    /*
     * O PDF é enviado como anexo. Dessa forma o navegador
     * pode baixá-lo sem criar arquivos permanentes no servidor.
     */
    const nomeArquivo =
      `Comprovante de Atendimento do ${atendimento.pet_nome}.pdf`;

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${nomeArquivo}"`
    );

    const doc =
      new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          Title:
            `Comprovante de Atendimento #${atendimento.id}`,
          Author:
            "Sistema Pet Shop",
          Subject:
            "Comprovante de Atendimento",
        },
      });

    /*
     * O PDF é escrito diretamente na resposta HTTP.
     * Isso evita deixar comprovantes temporários salvos
     * no disco do servidor.
     */
    doc.pipe(res);

    // ==================================================
    // CABEÇALHO
    // ==================================================

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .text(
        "Sistema Pet Shop",
        {
          align: "center",
        }
      );

    doc
      .moveDown(0.3)
      .font("Helvetica")
      .fontSize(10)
      .text(
        "Sistema de Gestão para Pet Shop",
        {
          align: "center",
        }
      );

    doc.moveDown(1);

    doc
      .font("Helvetica-Bold")
      .fontSize(17)
      .text(
        "Comprovante de Atendimento",
        {
          align: "center",
        }
      );

    doc.moveDown(1.5);

    // ==================================================
    // IDENTIFICAÇÃO
    // ==================================================

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Identificação");

    doc.moveDown(0.5);

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Atendimento: #${atendimento.id}`
      );

    doc.text(
      `Status: ${formatarStatus(
        atendimento.status
      )}`
    );

    doc.text(
      `Agendado para: ${formatarDataHora(
        atendimento.agendado_para
      )}`
    );

    doc.text(
      `Iniciado em: ${formatarDataHora(
        atendimento.iniciado_em
      )}`
    );

    doc.text(
      `Finalizado em: ${formatarDataHora(
        atendimento.finalizado_em
      )}`
    );

    doc.moveDown(1);

    // ==================================================
    // PET
    // ==================================================

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Pet");

    doc.moveDown(0.5);

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Nome: ${atendimento.pet_nome}`
      );

    doc.text(
      `Espécie: ${
        atendimento.pet_especie || "-"
      }`
    );

    doc.text(
      `Raça: ${
        atendimento.pet_raca || "-"
      }`
    );

    doc.moveDown(1);

    // ==================================================
    // TUTOR
    // ==================================================

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Tutor");

    doc.moveDown(0.5);

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Nome: ${atendimento.tutor_nome}`
      );

    doc.text(
      `Telefone: ${
        atendimento.tutor_telefone ||
        "-"
      }`
    );

    doc.text(
      `E-mail: ${
        atendimento.tutor_email ||
        "-"
      }`
    );

    doc.moveDown(1);

    // ==================================================
    // SERVIÇOS
    // ==================================================

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Serviços");

    doc.moveDown(0.5);

    const servicos =
      Array.isArray(
        atendimento.servicos
      )
        ? atendimento.servicos
        : [];

    if (servicos.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .text(
          "Nenhum serviço registrado."
        );
    } else {
      servicos.forEach(
        (servico, indice) => {
          doc
            .font("Helvetica")
            .fontSize(10)
            .text(
              `${indice + 1}. ${
                servico.nome
              }`
            );

          doc.text(
            `   Valor: ${formatarMoeda(
              servico.valor
            )}`
          );

          doc.moveDown(0.4);
        }
      );
    }

    doc.moveDown(0.5);

    // ==================================================
    // PAGAMENTO
    // ==================================================

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Pagamento");

    doc.moveDown(0.5);

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Valor total: ${formatarMoeda(
          atendimento.valor_total
        )}`
      );

    doc.text(
      `Situação: ${formatarStatus(
        atendimento.pagamento_status
      )}`
    );

    doc.text(
      `Forma de pagamento: ${formatarMetodoPagamento(
        atendimento.pagamento_metodo
      )}`
    );

    doc.text(
      `Pago em: ${formatarDataHora(
        atendimento.pagamento_pago_em
      )}`
    );

    // ==================================================
    // OBSERVAÇÕES
    // ==================================================

    if (
      atendimento
        .observacoes_atendimento
    ) {
      doc.moveDown(1);

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(
          "Observações do atendimento"
        );

      doc.moveDown(0.5);

      doc
        .font("Helvetica")
        .fontSize(10)
        .text(
          atendimento
            .observacoes_atendimento
        );
    }

    if (
      atendimento.status ===
        "CANCELADO" &&
      atendimento.motivo_cancelamento
    ) {
      doc.moveDown(1);

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(
          "Motivo do cancelamento"
        );

      doc.moveDown(0.5);

      doc
        .font("Helvetica")
        .fontSize(10)
        .text(
          atendimento
            .motivo_cancelamento
        );
    }

    /*
     * Finaliza o stream. Sem doc.end(), a resposta HTTP
     * permaneceria aberta e o download não terminaria.
     */
    doc.end();
  } catch (erro) {
    console.error(
      "Erro ao gerar comprovante em PDF:",
      erro
    );

    /*
     * Se o PDF ainda não começou a ser enviado, conseguimos
     * responder normalmente em JSON.
     *
     * Depois que os headers foram enviados não devemos tentar
     * iniciar uma segunda resposta HTTP.
     */
    if (!res.headersSent) {
      return res.status(500).json({
        mensagem:
          "Não foi possível gerar o comprovante em PDF.",
      });
    }

    res.end();
  }
}


module.exports = {
  gerarComprovantePdf,
};