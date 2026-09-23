import "../styles/ModalConfirmacaoSenha.css";


function ModalConfirmacao({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = "Confirmar",
  processando = false,
  onConfirmar,
  onCancelar,
}) {
  if (!aberto) {
    return null;
  }


  /*
   * Este modal é utilizado em ações que precisam de
   * confirmação visual, mas não exigem reautenticação.
   *
   * Operações críticas continuam utilizando
   * ModalConfirmacaoSenha.
   */
  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !processando
        ) {
          onCancelar();
        }
      }}
    >
      <div className="confirmation-modal">

        <div className="confirmation-icon">
          !
        </div>


        <h2>
          {titulo}
        </h2>


        <p>
          {mensagem}
        </p>


        <div className="confirmation-actions">

          <button
            type="button"
            className="confirmation-cancel"
            onClick={onCancelar}
            disabled={processando}
          >
            Cancelar
          </button>


          <button
            type="button"
            className="confirmation-confirm"
            onClick={onConfirmar}
            disabled={processando}
          >
            {processando
              ? "Processando..."
              : textoConfirmar}
          </button>

        </div>

      </div>
    </div>
  );
}


export default ModalConfirmacao;