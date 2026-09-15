import { useMemo, useState } from "react";

import "../styles/SeletorTutor.css";


function somenteNumeros(valor = "") {
  return String(valor).replace(/\D/g, "");
}


function SeletorTutor({
  tutores,
  tutorSelecionadoId,
  onSelecionar,
  desabilitado = false,
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);


  const tutorSelecionado = useMemo(() => {
    return tutores.find(
      (tutor) =>
        String(tutor.id) ===
        String(tutorSelecionadoId)
    );
  }, [tutores, tutorSelecionadoId]);


  // A pesquisa aceita nome e também números digitados
  // com ou sem a formatação de CPF/telefone.
  const resultados = useMemo(() => {
    const termo =
      busca.trim().toLowerCase();

    if (!termo) {
      return tutores;
    }

    const numerosBusca =
      somenteNumeros(termo);

    return tutores.filter((tutor) => {
      const nome =
        String(tutor.nome || "")
          .toLowerCase();

      const cpf =
        somenteNumeros(tutor.cpf);

      const telefone =
        somenteNumeros(tutor.telefone);

      const encontrouNome =
        nome.includes(termo);

      const encontrouCpf =
        numerosBusca &&
        cpf.includes(numerosBusca);

      const encontrouTelefone =
        numerosBusca &&
        telefone.includes(numerosBusca);

      return (
        encontrouNome ||
        encontrouCpf ||
        encontrouTelefone
      );
    });
  }, [busca, tutores]);


  function selecionarTutor(tutor) {
    onSelecionar(tutor);

    setBusca("");
    setAberto(false);
  }


  function limparTutor() {
    onSelecionar(null);

    setBusca("");
    setAberto(true);
  }


  return (
    <div className="tutor-selector">

      {tutorSelecionado ? (
        <div className="selected-tutor">
          <div>
            <span>Tutor selecionado</span>

            <strong>
              {tutorSelecionado.nome}
            </strong>

            <small>
              {tutorSelecionado.cpf ||
                "CPF não informado"}

              {" • "}

              {tutorSelecionado.telefone ||
                "Telefone não informado"}
            </small>

            {!tutorSelecionado.ativo && (
              <small className="inactive-tutor-warning">
                Tutor inativo
              </small>
            )}
          </div>

          {!desabilitado && (
            <button
              type="button"
              onClick={limparTutor}
            >
              Trocar
            </button>
          )}
        </div>
      ) : (
        <div className="tutor-search-container">
          <input
            type="text"
            value={busca}
            placeholder="Digite nome, CPF ou telefone..."
            disabled={desabilitado}
            autoComplete="off"
            onFocus={() => setAberto(true)}
            onChange={(event) => {
              setBusca(event.target.value);
              setAberto(true);
            }}
          />

          {aberto && !desabilitado && (
            <div className="tutor-search-results">

              {resultados.length === 0 ? (
                <div className="tutor-search-empty">
                  Nenhum tutor encontrado.
                </div>
              ) : (
                resultados
                  .filter(
                        (tutor) =>
                        tutor.ativo ||
                        String(tutor.id) ===
                            String(tutorSelecionadoId)
                    )
                  .slice(0, 8)
                  .map((tutor) => (
                    <button
                      key={tutor.id}
                      type="button"
                      className="tutor-search-result"
                      onClick={() =>
                        selecionarTutor(tutor)
                      }
                    >
                      <strong>
                        {tutor.nome}
                      </strong>

                      <span>
                        {tutor.cpf ||
                          "CPF não informado"}

                        {" • "}

                        {tutor.telefone ||
                          "Telefone não informado"}
                      </span>

                      {!tutor.ativo && (
                        <small>
                          Inativo
                        </small>
                      )}
                    </button>
                  ))
              )}

            </div>
          )}
        </div>
      )}

    </div>
  );
}


export default SeletorTutor;