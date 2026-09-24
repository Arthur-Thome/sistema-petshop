const pool = require("../database/connection");


/*
 * Retorna os indicadores e alertas utilizados no Dashboard.
 *
 * O backend controla quais informações cada perfil recebe.
 * Assim informações financeiras e administrativas não ficam
 * protegidas apenas pela interface do React.
 */
async function buscarResumo(req, res) {
  try {
    const perfil = req.usuario.perfil;

    const perfisPermitidos = [
      "funcionario",
      "gerente",
      "administrador",
    ];

    if (!perfisPermitidos.includes(perfil)) {
      return res.status(403).json({
        mensagem:
          "Perfil sem permissão para acessar o Dashboard.",
      });
    }


    /*
     * =====================================================
     * INDICADORES OPERACIONAIS
     * =====================================================
     */

    const resultadoPets =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM pets
        WHERE ativo = TRUE
      `);


    const resultadoTutores =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM tutores
        WHERE ativo = TRUE
      `);


    const resultadoCreche =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM creche
        WHERE status = 'NA_CRECHE'
      `);


    const resultadoHotel =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM hotel
        WHERE status = 'HOSPEDADO'
      `);


    /*
     * Atendimentos previstos para hoje.
     *
     * Cancelamentos não fazem parte da operação do dia.
     */
    const resultadoAtendimentosHoje =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM banho_tosa
        WHERE agendado_para::DATE = CURRENT_DATE
          AND status <> 'CANCELADO'
      `);


    /*
     * Reservas do Hotel cuja entrada está prevista para hoje.
     *
     * Este dado é utilizado como alerta operacional para que
     * a equipe consiga visualizar chegadas previstas.
     */
    const resultadoEntradasHotelHoje =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM hotel
        WHERE status = 'AGENDADO'
          AND entrada_prevista::DATE = CURRENT_DATE
      `);

    /*
     * Hospedagens cuja saída prevista já passou, mas que
     * continuam abertas.
     *
     * Diferentemente da Creche, o Hotel possui uma data de
     * saída prevista e permite identificar atraso sem
     * inventar uma regra de tempo arbitrária.
     */
    const resultadoSaidasHotelAtrasadas =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM hotel
        WHERE status = 'HOSPEDADO'
          AND saida_prevista < CURRENT_TIMESTAMP
      `);


    /*
     * Próximos cinco atendimentos ainda agendados.
     *
     * pet_tutores é a fonte oficial do relacionamento.
     * O tutor principal atual é utilizado no Dashboard.
     */
    const resultadoProximosAtendimentos =
      await pool.query(`
        SELECT
          bt.id,
          bt.agendado_para,
          bt.status,

          p.nome AS pet_nome,

          t.nome AS tutor_nome,

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

        FROM banho_tosa bt

        INNER JOIN pets p
          ON p.id = bt.pet_id

        INNER JOIN pet_tutores pt
          ON pt.pet_id = p.id
          AND pt.principal = TRUE

        INNER JOIN tutores t
          ON t.id = pt.tutor_id

        WHERE
          bt.status = 'AGENDADO'
          AND bt.agendado_para >= CURRENT_TIMESTAMP

        ORDER BY
          bt.agendado_para ASC

        LIMIT 5
      `);


    const totalPets =
      resultadoPets.rows[0].total;

    const totalTutores =
      resultadoTutores.rows[0].total;

    const naCreche =
      resultadoCreche.rows[0].total;

    const noHotel =
      resultadoHotel.rows[0].total;

    const atendimentosHoje =
      resultadoAtendimentosHoje.rows[0].total;

    const entradasHotelHoje =
      resultadoEntradasHotelHoje.rows[0].total;

    const saidasHotelAtrasadas =
      resultadoSaidasHotelAtrasadas.rows[0].total;


    /*
     * Alertas são enviados como objetos estruturados.
     *
     * O frontend não precisa conhecer regras do banco para
     * decidir quando determinada situação merece atenção.
     */
    const alertas = [];


    if (atendimentosHoje > 0) {
      alertas.push({
        id: "atendimentos-hoje",
        tipo: "informacao",
        titulo:
          "Atendimentos programados para hoje",
        mensagem:
          atendimentosHoje === 1
            ? "Existe 1 atendimento programado para hoje."
            : `Existem ${atendimentosHoje} atendimentos programados para hoje.`,
        quantidade: atendimentosHoje,
        destino:
          "/atendimentos?filtro=hoje",
      });
    }


    if (entradasHotelHoje > 0) {
      alertas.push({
        id: "entradas-hotel-hoje",
        tipo: "informacao",
        titulo:
          "Entradas no hotel previstas para hoje",
        mensagem:
          entradasHotelHoje === 1
            ? "Existe 1 entrada no hotel prevista para hoje."
            : `Existem ${entradasHotelHoje} entradas no hotel previstas para hoje.`,
        quantidade: entradasHotelHoje,
        destino:
          "/hotel?secao=reservas",
      });
    }

        if (saidasHotelAtrasadas > 0) {
      alertas.push({
        id: "saidas-hotel-atrasadas",
        tipo: "urgente",
        titulo:
          "Check-outs do hotel atrasados",
        mensagem:
          saidasHotelAtrasadas === 1
            ? "Existe 1 hospedagem com a saída prevista já vencida."
            : `Existem ${saidasHotelAtrasadas} hospedagens com a saída prevista já vencida.`,
        quantidade:
          saidasHotelAtrasadas,
        destino:
          "/hotel?secao=hospedados",
      });
    }


    const resposta = {
      pets_cadastrados:
        totalPets,

      tutores_cadastrados:
        totalTutores,

      na_creche:
        naCreche,

      no_hotel:
        noHotel,

      atendimentos_hoje:
        atendimentosHoje,

      proximos_atendimentos:
        resultadoProximosAtendimentos.rows,

      alertas,
    };


    /*
     * =====================================================
     * FUNCIONÁRIO
     * =====================================================
     *
     * Funcionários recebem somente alertas relacionados
     * diretamente à operação.
     */
    if (perfil === "funcionario") {
      return res.status(200).json(
        resposta
      );
    }


    /*
     * =====================================================
     * GERENTE E ADMINISTRADOR
     * =====================================================
     */

    const resultadoEstoqueBaixo =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM produtos
        WHERE ativo = TRUE
          AND quantidade_atual <= quantidade_minima
      `);


    const resultadoPagamentosPendentes =
      await pool.query(`
        SELECT
          COUNT(*)::INTEGER AS quantidade,

          COALESCE(
            SUM(valor_total),
            0
          )::NUMERIC AS valor_total

        FROM pagamentos_banho_tosa

        WHERE status = 'PENDENTE'
      `);


    const resultadoReservasHotel =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM hotel
        WHERE status = 'AGENDADO'
          AND entrada_prevista >= CURRENT_TIMESTAMP
      `);


    const estoqueBaixo =
      resultadoEstoqueBaixo.rows[0].total;

    const pagamentosPendentes =
      resultadoPagamentosPendentes
        .rows[0]
        .quantidade;

    const valorPagamentosPendentes =
      resultadoPagamentosPendentes
        .rows[0]
        .valor_total;

    const reservasHotel =
      resultadoReservasHotel.rows[0].total;


    resposta.estoque_baixo =
      estoqueBaixo;

    resposta.pagamentos_pendentes =
      pagamentosPendentes;

    resposta.valor_pagamentos_pendentes =
      valorPagamentosPendentes;

    resposta.reservas_hotel =
      reservasHotel;


    /*
     * Alertas gerenciais são acrescentados somente depois
     * da verificação de perfil, impedindo que dados
     * financeiros sejam enviados para Funcionários.
     */
    if (estoqueBaixo > 0) {
      alertas.push({
        id: "estoque-baixo",
        tipo: "atencao",
        titulo:
          "Produtos precisam de reposição",
        mensagem:
          estoqueBaixo === 1
            ? "Existe 1 produto com estoque baixo."
            : `Existem ${estoqueBaixo} produtos com estoque baixo.`,
        quantidade: estoqueBaixo,
        destino:
          "/produtos?estoque=baixo",
      });
    }


    if (pagamentosPendentes > 0) {
      alertas.push({
        id: "pagamentos-pendentes",
        tipo: "urgente",
        titulo:
          "Pagamentos aguardando confirmação",
        mensagem:
          pagamentosPendentes === 1
            ? "Existe 1 pagamento pendente."
            : `Existem ${pagamentosPendentes} pagamentos pendentes.`,
        quantidade:
          pagamentosPendentes,
        destino:
          "/administrativo/pagamentos-pendentes",
      });
    }


    /*
     * =====================================================
     * GERENTE
     * =====================================================
     */
    if (perfil === "gerente") {
      return res.status(200).json(
        resposta
      );
    }


    /*
     * =====================================================
     * ADMINISTRADOR
     * =====================================================
     */

    const resultadoUsuarios =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM usuarios
        WHERE ativo = TRUE
      `);


    const resultadoUsuariosPorPerfil =
      await pool.query(`
        SELECT
          perfil,
          COUNT(*)::INTEGER AS total

        FROM usuarios

        WHERE ativo = TRUE

        GROUP BY perfil
      `);


    resposta.usuarios_ativos =
      resultadoUsuarios.rows[0].total;


    resposta.usuarios_por_perfil = {
      administradores: 0,
      gerentes: 0,
      funcionarios: 0,
    };


    resultadoUsuariosPorPerfil.rows.forEach(
      (item) => {
        if (
          item.perfil ===
          "administrador"
        ) {
          resposta
            .usuarios_por_perfil
            .administradores =
              item.total;
        }


        if (
          item.perfil ===
          "gerente"
        ) {
          resposta
            .usuarios_por_perfil
            .gerentes =
              item.total;
        }


        if (
          item.perfil ===
          "funcionario"
        ) {
          resposta
            .usuarios_por_perfil
            .funcionarios =
              item.total;
        }
      }
    );


    return res.status(200).json(
      resposta
    );

  } catch (error) {
    console.error(
      "Erro ao buscar resumo do Dashboard:",
      error
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar o Dashboard.",
    });
  }
}


module.exports = {
  buscarResumo,
};