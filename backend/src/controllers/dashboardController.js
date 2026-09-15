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

    return res.status(200).json({
      pets_cadastrados: totalPets,

      /*
       * Estes indicadores serão implementados quando
       * seus respectivos módulos forem criados.
       */
      na_creche: null,
      no_hotel: null,
      atendimentos_hoje: null,
      estoque_baixo: null,
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