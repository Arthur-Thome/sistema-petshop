const pool = require("../database/connection");


/*
 * Retorna os indicadores utilizados no Dashboard.
 *
 * O próprio backend controla quais informações cada
 * perfil recebe. Isso é importante porque esconder
 * cards somente no React não seria uma proteção real.
 *
 * Perfis:
 *
 * funcionario:
 * - informações necessárias para a operação diária.
 *
 * gerente:
 * - operação diária;
 * - indicadores necessários para gestão.
 *
 * administrador:
 * - todos os indicadores disponíveis.
 */
async function buscarResumo(req, res) {
  try {
    const perfil = req.usuario.perfil;

    /*
    * O Dashboard trabalha somente com os três perfis
    * reconhecidos pelo sistema.
    *
    * Caso um perfil inválido chegue até este ponto por
    * inconsistência no banco, negamos o acesso em vez
    * de conceder permissões por padrão.
    */
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
     *
     * Estes indicadores podem ser utilizados pelos três
     * perfis porque fazem parte da rotina do pet shop.
     */


    /*
     * Conta somente pets ativos.
     *
     * Pets inativos continuam armazenados no banco,
     * mas não devem ser considerados na operação atual.
     */
    const resultadoPets =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM pets
        WHERE ativo = TRUE
      `);

    const totalPets =
      resultadoPets.rows[0].total;


    /*
     * Tutores ativos cadastrados.
     */
    const resultadoTutores =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM tutores
        WHERE ativo = TRUE
      `);

    const totalTutores =
      resultadoTutores.rows[0].total;


    /*
     * Conta somente permanências abertas na Creche.
     *
     * NA_CRECHE representa que o pet está fisicamente
     * no estabelecimento neste momento.
     */
    const resultadoCreche =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM creche
        WHERE status = 'NA_CRECHE'
      `);

    const naCreche =
      resultadoCreche.rows[0].total;


    /*
     * Reservas futuras do Hotel não contam como pets
     * presentes. Somente HOSPEDADO representa um animal
     * atualmente hospedado.
     */
    const resultadoHotel =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM hotel
        WHERE status = 'HOSPEDADO'
      `);

    const noHotel =
      resultadoHotel.rows[0].total;


    /*
     * Atendimentos de Banho e Tosa agendados para hoje.
     *
     * Cancelamentos não entram na contagem.
     */
    const resultadoAtendimentosHoje =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM banho_tosa
        WHERE agendado_para::DATE = CURRENT_DATE
          AND status <> 'CANCELADO'
      `);

    const atendimentosHoje =
      resultadoAtendimentosHoje.rows[0].total;


    /*
     * Próximos cinco atendimentos ainda agendados.
     *
     * Além do pet e tutor, retornamos os serviços
     * associados ao atendimento.
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

        INNER JOIN tutores t
          ON t.id = p.tutor_id

        WHERE
          bt.status = 'AGENDADO'
          AND bt.agendado_para >= CURRENT_TIMESTAMP

        ORDER BY
          bt.agendado_para ASC

        LIMIT 5
      `);


    /*
     * Mantemos também os campos antigos no nível
     * principal da resposta.
     *
     * Isso evita quebrar o Dashboard atual enquanto
     * fazemos a atualização do frontend.
     */
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
    };


    /*
     * =====================================================
     * FUNCIONÁRIO
     * =====================================================
     *
     * O funcionário recebe somente informações
     * necessárias para as atividades do dia a dia.
     *
     * Ele não recebe informações financeiras,
     * administrativas ou de segurança.
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
     *
     * A partir daqui entram indicadores necessários
     * para gestão da operação.
     */


    /*
     * Produtos ativos que chegaram ou ficaram abaixo
     * da quantidade mínima configurada.
     */
    const resultadoEstoqueBaixo =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM produtos
        WHERE ativo = TRUE
          AND quantidade_atual <= quantidade_minima
      `);

    const estoqueBaixo =
      resultadoEstoqueBaixo.rows[0].total;


    /*
     * Quantidade e valor total dos pagamentos de
     * Banho e Tosa que ainda estão pendentes.
     */
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


    /*
     * Reservas futuras do Hotel.
     *
     * Hóspedes que já fizeram check-in não entram aqui,
     * pois já são contabilizados em "no_hotel".
     */
    const resultadoReservasHotel =
      await pool.query(`
        SELECT COUNT(*)::INTEGER AS total
        FROM hotel
        WHERE status = 'AGENDADO'
          AND entrada_prevista >= CURRENT_TIMESTAMP
      `);


    resposta.estoque_baixo =
      resultadoEstoqueBaixo.rows[0].total;

    resposta.pagamentos_pendentes =
      resultadoPagamentosPendentes
        .rows[0]
        .quantidade;

    resposta.valor_pagamentos_pendentes =
      resultadoPagamentosPendentes
        .rows[0]
        .valor_total;

    resposta.reservas_hotel =
      resultadoReservasHotel.rows[0].total;


    /*
     * =====================================================
     * GERENTE
     * =====================================================
     *
     * O gerente possui os indicadores necessários para
     * administrar a operação, mas não recebe informações
     * exclusivas da Administração do sistema.
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
     *
     * Somente o administrador recebe informações
     * relacionadas à administração do sistema.
     */
    if (perfil === "administrador") {

      /*
       * Total de usuários ativos do sistema.
       */
      const resultadoUsuarios =
        await pool.query(`
          SELECT COUNT(*)::INTEGER AS total
          FROM usuarios
          WHERE ativo = TRUE
        `);


      /*
       * Quantidade de usuários ativos por perfil.
       *
       * Esses números serão úteis posteriormente
       * também na área Sistema -> Administração.
       */
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


      /*
       * Inicializamos todos com zero para que o frontend
       * sempre receba a mesma estrutura mesmo quando
       * ainda não existir usuário de determinado perfil.
       */
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
    }


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