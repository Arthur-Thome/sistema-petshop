const express = require("express");

const {
  criarReserva,
  listarReservasAtivas,
  realizarCheckin,
  realizarCheckout,
  cancelarReserva,
  listarHistorico,
  buscarHotelPorId,
} = require(
  "../controllers/hotelController"
);

const autenticar = require(
  "../middleware/authMiddleware"
);

const router = express.Router();


/*
 * Qualquer funcionário autenticado pode consultar
 * e registrar reservas do Hotel.
 */
router.use(autenticar);


router.get(
  "/ativos",
  listarReservasAtivas
);


router.post(
  "/reservas",
  criarReserva
);

/*
 * Transforma uma reserva AGENDADO em HOSPEDADO.
 */
router.patch(
  "/:id/checkin",
  realizarCheckin
);

/*
 * Finaliza uma hospedagem atualmente aberta.
 */
router.patch(
  "/:id/checkout",
  realizarCheckout
);

/*
 * Cancela uma reserva que ainda não recebeu check-in.
 */
router.patch(
  "/:id/cancelar",
  cancelarReserva
);

/*
 * Histórico completo das reservas e hospedagens.
 */
router.get(
  "/historico",
  listarHistorico
);

/*
 * Detalhes completos de uma reserva/hospedagem.
 */
router.get(
  "/:id",
  buscarHotelPorId
);


module.exports = router;