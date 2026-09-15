import { useState } from "react";
import "../styles/ModalConfirmacaoSenha.css";

function ModalConfirmacaoSenha({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = "Confirmar",
  processando = false,
  erro = "",
  onConfirmar,
  onCancelar,
}) {
  // A senha fica somente no estado temporário do modal.
  // Ela não deve ser armazenada no localStorage.
  const [senha, setSenha] = useState("");

  if (!aberto) {
    return null;
  }

  function confirmar(event) {
    event.preventDefault();

    if (!senha) {
      return;
    }

    onConfirmar(senha);
  }

  function cancelar() {
    // Limpa a senha antes de fechar o modal.
    setSenha("");
    onCancelar();
  }

  return (
    <div className="modal-overlay">
      <div className="confirmation-modal">
        <div className="confirmation-icon">
          !
        </div>

        <h2>{titulo}</h2>

        <p>{mensagem}</p>

        <form onSubmit={confirmar}>
          <div className="confirmation-field">
            <label htmlFor="senha-confirmacao">
              Confirme sua senha
            </label>

            <input
              id="senha-confirmacao"
              type="password"
              value={senha}
              onChange={(event) =>
                setSenha(event.target.value)
              }
              placeholder="Digite sua senha"
              autoComplete="current-password"
              autoFocus
              disabled={processando}
            />
          </div>

          {erro && (
            <div className="confirmation-error">
              {erro}
            </div>
          )}

          <div className="confirmation-actions">
            <button
              type="button"
              className="confirmation-cancel"
              onClick={cancelar}
              disabled={processando}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="confirmation-confirm"
              disabled={!senha || processando}
            >
              {processando
                ? "Processando..."
                : textoConfirmar}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ModalConfirmacaoSenha;