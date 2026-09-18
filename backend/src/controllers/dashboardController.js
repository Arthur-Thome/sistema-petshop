const pool = require("../database/connection");


/*
 * Retorna somente informações resumidas utilizadas
 * pelos cards do Dashboard.
 *
 * As contagens são feitas diretamente pelo PostgreSQL
 * para evitar carregar listas completas desnecessariamente.
 */
async function buscarResumo(req, res) {
  try {
    const resultadoPets = await pool.query(`
      SELECT COUNT(*)::INTEGER AS total
      FROM pets
    `);

    const totalPets =
      resultadoPets.rows[0].total;

    /*
    * Conta somente produtos ATIVOS cuja quantidade
    * chegou ou ficou abaixo do estoque mínimo.
    *
    * Produtos inativos não devem gerar alertas
    * de reposição no Dashboard.
    */
    const resultadoEstoqueBaixo = await pool.query(
      `
        SELECT COUNT(*)::INTEGER AS total
        FROM produtos
        WHERE ativo = TRUE
          AND quantidade_atual <= quantidade_minima
      `
    );

    const estoqueBaixo =
      resultadoEstoqueBaixo.rows[0].total;
    /*
    * Conta somente permanências abertas.
    *
    * Como o banco impede duas permanências abertas para
    * o mesmo pet, esse total corresponde à quantidade
    * de pets que estão na Creche neste momento.
    */
    const resultadoCreche = await pool.query(`
      SELECT COUNT(*)::INTEGER AS total
      FROM creche
      WHERE status = 'NA_CRECHE'
    `);

    const naCreche =
      resultadoCreche.rows[0].total;

    /*
    * Reservas futuras não contam como pets presentes
    * no Hotel. Somente HOSPEDADO representa um animal
    * fisicamente no estabelecimento.
    */
    const hospedadosResult =
      await pool.query(
        `
          SELECT COUNT(*)::INTEGER AS total
          FROM hotel
          WHERE status = 'HOSPEDADO'
        `
      );

    const hospedados =
      hospedadosResult.rows[0].total;

    return res.status(200).json({
      pets_cadastrados: totalPets,

      /*
       * Estes indicadores serão implementados quando
       * seus respectivos módulos forem criados.
       */
      na_creche: naCreche,
      no_hotel: hospedados,
      atendimentos_hoje: null,
      estoque_baixo: estoqueBaixo,
    });
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