import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import ModalConfirmacaoSenha from "../components/ModalConfirmacaoSenha";

import "../styles/DetalhesPet.css";


function DetalhesPet() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pet, setPet] =
    useState(null);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  /*
   * Estados do gerenciamento dos tutores.
   *
   * O pet pode possuir vários tutores, porém somente
   * um deles será considerado o principal.
   */
  const [
    modalTutorAberto,
    setModalTutorAberto,
  ] = useState(false);

  const [
    tutoresDisponiveis,
    setTutoresDisponiveis,
  ] = useState([]);

  const [
    tutorSelecionado,
    setTutorSelecionado,
  ] = useState("");

  const [
    carregandoTutores,
    setCarregandoTutores,
  ] = useState(false);

  const [
    processandoTutor,
    setProcessandoTutor,
  ] = useState(false);

  const [
    erroTutor,
    setErroTutor,
  ] = useState("");

  const [
    mensagemTutor,
    setMensagemTutor,
  ] = useState("");


  // Estados utilizados pela confirmação de operações críticas.
  const [
    modalAberto,
    setModalAberto,
  ] = useState(false);

  const [
    processandoStatus,
    setProcessandoStatus,
  ] = useState(false);

  const [
    erroConfirmacao,
    setErroConfirmacao,
  ] = useState("");


  /*
   * Centralizamos a consulta porque ela também será
   * utilizada depois de vincular, desvincular ou
   * alterar o tutor principal.
   */
  async function carregarPet() {
    try {
      setCarregando(true);
      setErro("");

      const resposta =
        await api.get(
          `/pets/${id}`
        );

      setPet(
        resposta.data.pet
      );
    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível carregar o pet."
      );
    } finally {
      setCarregando(false);
    }
  }


  useEffect(() => {
    carregarPet();
  }, [id]);


  /*
   * Abre a seleção de tutores existentes.
   *
   * Tutores que já estão vinculados ao pet são
   * removidos da lista para evitar duplicidades.
   */
  async function abrirModalTutor() {
    try {
      setModalTutorAberto(true);
      setCarregandoTutores(true);
      setErroTutor("");
      setMensagemTutor("");
      setTutorSelecionado("");

      const resposta =
        await api.get(
          "/tutores"
        );

      const vinculados =
        new Set(
          (pet.tutores || []).map(
            (tutor) =>
              Number(tutor.id)
          )
        );

      const disponiveis =
        (resposta.data || []).filter(
          (tutor) =>
            tutor.ativo &&
            !vinculados.has(
              Number(tutor.id)
            )
        );

      setTutoresDisponiveis(
        disponiveis
      );
    } catch (error) {
      setErroTutor(
        error.response?.data?.mensagem ||
          "Não foi possível carregar os tutores."
      );
    } finally {
      setCarregandoTutores(false);
    }
  }


  /*
   * Cria apenas o relacionamento.
   *
   * Nenhum cadastro de tutor ou pet é duplicado.
   */
  async function vincularTutor() {
    if (!tutorSelecionado) {
      setErroTutor(
        "Selecione um tutor."
      );

      return;
    }

    try {
      setProcessandoTutor(true);
      setErroTutor("");

      await api.post(
        `/pets/${pet.id}/tutores`,
        {
          tutor_id:
            Number(
              tutorSelecionado
            ),
        }
      );

      setModalTutorAberto(false);
      setTutorSelecionado("");

      await carregarPet();

      setMensagemTutor(
        "Tutor vinculado com sucesso."
      );
    } catch (error) {
      setErroTutor(
        error.response?.data?.mensagem ||
          "Não foi possível vincular o tutor."
      );
    } finally {
      setProcessandoTutor(false);
    }
  }


  /*
   * Troca o tutor principal.
   *
   * O backend também mantém pets.tutor_id sincronizado
   * enquanto os módulos antigos ainda dependem dele.
   */
  async function definirComoPrincipal(
    tutorId
  ) {
    try {
      setProcessandoTutor(true);
      setErroTutor("");
      setMensagemTutor("");

      await api.patch(
        `/pets/${pet.id}/tutores/${tutorId}/principal`
      );

      await carregarPet();

      setMensagemTutor(
        "Tutor principal alterado com sucesso."
      );
    } catch (error) {
      setErroTutor(
        error.response?.data?.mensagem ||
          "Não foi possível alterar o tutor principal."
      );
    } finally {
      setProcessandoTutor(false);
    }
  }


  /*
   * Desvincular remove somente a relação Pet <-> Tutor.
   *
   * O tutor e o pet continuam cadastrados no sistema.
   * O backend também impede que o último tutor seja removido.
   */
  async function desvincularTutor(
    tutor
  ) {
    const confirmar =
      window.confirm(
        `Deseja desvincular ${tutor.nome} deste pet?`
      );

    if (!confirmar) {
      return;
    }

    try {
      setProcessandoTutor(true);
      setErroTutor("");
      setMensagemTutor("");

      await api.delete(
        `/pets/${pet.id}/tutores/${tutor.id}`
      );

      await carregarPet();

      setMensagemTutor(
        "Tutor desvinculado com sucesso."
      );
    } catch (error) {
      setErroTutor(
        error.response?.data?.mensagem ||
          "Não foi possível desvincular o tutor."
      );
    } finally {
      setProcessandoTutor(false);
    }
  }


  // Inativar ou reativar um pet é considerado uma operação
  // crítica e exige novamente a senha do usuário autenticado.
  async function confirmarAlteracaoStatus(
    senha
  ) {
    try {
      setProcessandoStatus(true);
      setErroConfirmacao("");

      const novoStatus =
        !pet.ativo;

      const resposta =
        await api.patch(
          `/pets/${pet.id}/status`,
          {
            ativo: novoStatus,
          },
          {
            headers: {
              "X-Confirm-Password":
                senha,
            },
          }
        );

      setPet((anterior) => ({
        ...anterior,
        ...resposta.data.pet,
      }));

      setModalAberto(false);
    } catch (error) {
      setErroConfirmacao(
        error.response?.data?.mensagem ||
          "Não foi possível alterar o status do pet."
      );
    } finally {
      setProcessandoStatus(false);
    }
  }


  if (carregando) {
    return (
      <div className="pet-details-message">
        Carregando pet...
      </div>
    );
  }


  if (erro || !pet) {
    return (
      <div className="pet-details-message error">
        <p>
          {erro ||
            "Pet não encontrado."}
        </p>

        <button
          type="button"
          onClick={() =>
            navigate("/pets")
          }
        >
          Voltar para Pets
        </button>
      </div>
    );
  }


  const tutores =
    Array.isArray(pet.tutores)
      ? pet.tutores
      : [];


  return (
    <div className="pet-details-page">

      <div className="page-header">
        <div>
          <div className="pet-title-row">
            <h1>{pet.nome}</h1>

            <span
              className={
                pet.ativo
                  ? "status-badge active"
                  : "status-badge inactive"
              }
            >
              {pet.ativo
                ? "Ativo"
                : "Inativo"}
            </span>
          </div>

          <p>
            {formatarEspecie(
              pet.especie
            )}

            {pet.raca
              ? ` • ${pet.raca}`
              : ""}

            {pet.sexo
              ? ` • ${formatarSexo(
                  pet.sexo
                )}`
              : ""}
          </p>
        </div>

        <div className="pet-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate("/pets")
            }
          >
            Voltar
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() =>
              navigate(
                `/pets/${pet.id}/editar`
              )
            }
          >
            Editar
          </button>
        </div>
      </div>


      <div className="pet-details-main">

        <section className="pet-photo-card">
          <FotoPet pet={pet} />

          <div>
            <h3>Foto do pet</h3>

            <p>
              A foto ajuda na identificação
              durante atendimentos, creche e
              hospedagem.
            </p>
          </div>
        </section>


        <div className="pet-details-content">

          <section className="pet-details-card">
            <h2>Dados do pet</h2>

            <div className="pet-info-grid">
              <Informacao
                titulo="Nome"
                valor={pet.nome}
              />

              <Informacao
                titulo="Espécie"
                valor={formatarEspecie(
                  pet.especie
                )}
              />

              <Informacao
                titulo="Raça"
                valor={pet.raca}
              />

              <Informacao
                titulo="Sexo"
                valor={formatarSexo(
                  pet.sexo
                )}
              />

              <Informacao
                titulo="Nascimento"
                valor={formatarData(
                  pet.data_nascimento
                )}
              />

              <Informacao
                titulo="Peso"
                valor={
                  pet.peso
                    ? `${formatarPeso(
                        pet.peso
                      )} kg`
                    : "-"
                }
              />

              <Informacao
                titulo="Cor"
                valor={pet.cor}
              />
            </div>
          </section>


          <section className="pet-tutors-card">
            <div className="pet-tutors-header">
              <div>
                <span className="pet-tutors-label">
                  Responsáveis
                </span>

                <h2>
                  Tutores vinculados
                </h2>

                <p>
                  Este pet possui{" "}
                  <strong>
                    {tutores.length}
                  </strong>{" "}
                  {tutores.length === 1
                    ? "tutor vinculado."
                    : "tutores vinculados."}
                </p>
              </div>

              <div className="pet-tutors-header-actions">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    navigate(
                      `/tutores/novo?pet=${pet.id}`
                    )
                  }
                >
                  + Cadastrar Novo Tutor
                </button>


                <button
                  type="button"
                  className="primary-button"
                  onClick={
                    abrirModalTutor
                  }
                >
                  + Vincular Tutor Existente
                </button>

              </div>
            </div>


            {mensagemTutor && (
              <div className="pet-tutor-feedback success">
                {mensagemTutor}
              </div>
            )}


            {erroTutor &&
              !modalTutorAberto && (
                <div className="pet-tutor-feedback error">
                  {erroTutor}
                </div>
              )}


            {tutores.length === 0 ? (
              <div className="pet-no-tutors">

                <h3>
                  Nenhum tutor vinculado
                </h3>

                <p>
                  Este pet ainda não possui
                  responsáveis vinculados.
                  Utilize uma das opções acima
                  para cadastrar ou vincular
                  um tutor.
                </p>

              </div>
            ) : (
              <div className="pet-tutors-list">
                {tutores.map(
                  (tutor) => (
                    <article
                      className={
                        tutor.principal
                          ? "pet-tutor-item principal"
                          : "pet-tutor-item"
                      }
                      key={tutor.id}
                    >
                      <div className="pet-tutor-identity">
                        <div className="pet-tutor-avatar">
                          {tutor.nome
                            ?.charAt(0)
                            ?.toUpperCase() ||
                            "T"}
                        </div>

                        <div>
                          <div className="pet-tutor-name-row">
                            <h3>
                              {tutor.nome}
                            </h3>

                            {tutor.principal && (
                              <span className="pet-main-tutor-badge">
                                Principal
                              </span>
                            )}

                            {!tutor.ativo && (
                              <span className="pet-inactive-tutor-badge">
                                Inativo
                              </span>
                            )}
                          </div>

                          <p>
                            {tutor.telefone ||
                              "Telefone não informado"}
                          </p>

                          <span>
                            {tutor.email ||
                              "E-mail não informado"}
                          </span>
                        </div>
                      </div>


                      <div className="pet-tutor-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            navigate(
                              `/tutores/${tutor.id}`
                            )
                          }
                        >
                          Ver Tutor
                        </button>

                        {!tutor.principal &&
                          tutor.ativo && (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={
                                processandoTutor
                              }
                              onClick={() =>
                                definirComoPrincipal(
                                  tutor.id
                                )
                              }
                            >
                              Tornar Principal
                            </button>
                          )}

                        {tutores.length > 1 && (
                          <button
                            type="button"
                            className="pet-unlink-button"
                            disabled={
                              processandoTutor
                            }
                            onClick={() =>
                              desvincularTutor(
                                tutor
                              )
                            }
                          >
                            Desvincular
                          </button>
                        )}
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </section>


          <section className="pet-details-card">
            <h2>Observações</h2>

            <p className="pet-observations">
              {pet.observacoes ||
                "Nenhuma observação cadastrada."}
            </p>
          </section>

        </div>
      </div>


      <section className="pet-danger-zone">
        <div>
          <h2>
            {pet.ativo
              ? "Inativar Pet"
              : "Reativar Pet"}
          </h2>

          <p>
            {pet.ativo
              ? "O pet permanecerá no histórico do sistema, mas ficará marcado como inativo."
              : "O pet voltará a ficar disponível como cadastro ativo."}
          </p>
        </div>

        <button
          type="button"
          className={
            pet.ativo
              ? "danger-button"
              : "reactivate-button"
          }
          onClick={() => {
            setErroConfirmacao("");
            setModalAberto(true);
          }}
        >
          {pet.ativo
            ? "Inativar Pet"
            : "Reativar Pet"}
        </button>
      </section>


      {modalTutorAberto && (
        <div
          className="pet-tutor-modal-overlay"
          onMouseDown={(evento) => {
            if (
              evento.target ===
              evento.currentTarget
            ) {
              setModalTutorAberto(
                false
              );
            }
          }}
        >
          <div className="pet-tutor-modal">
            <div className="pet-tutor-modal-header">
              <div>
                <span>
                  Novo vínculo
                </span>

                <h2>
                  Vincular Tutor
                </h2>
              </div>

              <button
                type="button"
                className="pet-tutor-modal-close"
                onClick={() =>
                  setModalTutorAberto(
                    false
                  )
                }
              >
                ×
              </button>
            </div>


            <p>
              Selecione um tutor ativo
              para vinculá-lo a{" "}
              <strong>
                {pet.nome}
              </strong>.
            </p>


            {erroTutor && (
              <div className="pet-tutor-feedback error">
                {erroTutor}
              </div>
            )}


            {carregandoTutores ? (
              <div className="pet-tutor-modal-loading">
                Carregando tutores...
              </div>
            ) : tutoresDisponiveis.length ===
              0 ? (
              <div className="pet-no-available-tutors">
                <strong>
                  Nenhum tutor disponível
                </strong>

                <p>
                  Todos os tutores ativos
                  já estão vinculados a
                  este pet ou ainda não
                  existem outros cadastros.
                </p>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    navigate(
                      "/tutores/novo"
                    )
                  }
                >
                  Cadastrar Novo Tutor
                </button>
              </div>
            ) : (
              <>
                <label className="pet-tutor-select-field">
                  <span>
                    Tutor
                  </span>

                  <select
                    value={
                      tutorSelecionado
                    }
                    onChange={(evento) => {
                      setTutorSelecionado(
                        evento.target.value
                      );

                      setErroTutor("");
                    }}
                  >
                    <option value="">
                      Selecione...
                    </option>

                    {tutoresDisponiveis.map(
                      (tutor) => (
                        <option
                          key={tutor.id}
                          value={tutor.id}
                        >
                          {tutor.nome}
                          {tutor.telefone
                            ? ` — ${tutor.telefone}`
                            : ""}
                        </option>
                      )
                    )}
                  </select>
                </label>


                <div className="pet-tutor-modal-actions">

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      processandoTutor
                    }
                    onClick={() =>
                      setModalTutorAberto(
                        false
                      )
                    }
                  >
                    Cancelar
                  </button>


                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      processandoTutor
                    }
                    onClick={() =>
                      navigate(
                        `/tutores/novo?pet=${pet.id}`
                      )
                    }
                  >
                    Cadastrar Novo Tutor
                  </button>


                  <button
                    type="button"
                    className="primary-button"
                    disabled={
                      processandoTutor ||
                      !tutorSelecionado
                    }
                    onClick={
                      vincularTutor
                    }
                  >
                    {processandoTutor
                      ? "Vinculando..."
                      : "Vincular Tutor"}
                  </button>

                </div>
              </>
            )}
          </div>
        </div>
      )}


      <ModalConfirmacaoSenha
        aberto={modalAberto}
        titulo={
          pet.ativo
            ? "Inativar pet?"
            : "Reativar pet?"
        }
        mensagem={
          pet.ativo
            ? "Confirme sua senha para inativar este pet. O histórico do animal será preservado."
            : "Confirme sua senha para reativar este pet."
        }
        textoConfirmar={
          pet.ativo
            ? "Inativar Pet"
            : "Reativar Pet"
        }
        processando={
          processandoStatus
        }
        erro={erroConfirmacao}
        onConfirmar={
          confirmarAlteracaoStatus
        }
        onCancelar={() => {
          setModalAberto(false);
          setErroConfirmacao("");
        }}
      />

    </div>
  );
}


// Apresenta a foto armazenada no backend.
// Quando não existir foto, utilizamos a inicial do nome.
function FotoPet({ pet }) {
  if (!pet.foto) {
    return (
      <div className="pet-details-photo-placeholder">
        {pet.nome
          ?.charAt(0)
          ?.toUpperCase() ||
          "P"}
      </div>
    );
  }

  const apiUrl =
    import.meta.env.VITE_API_URL ||
    "http://localhost:3001/api";

  const servidorUrl =
    apiUrl.replace(
      /\/api\/?$/,
      ""
    );

  return (
    <img
      className="pet-details-photo"
      src={`${servidorUrl}${pet.foto}`}
      alt={`Foto de ${pet.nome}`}
    />
  );
}


function Informacao({
  titulo,
  valor,
}) {
  return (
    <div className="pet-info-item">
      <span>{titulo}</span>

      <strong>
        {valor || "-"}
      </strong>
    </div>
  );
}


function formatarSexo(sexo) {
  if (sexo === "macho") {
    return "Macho";
  }

  if (sexo === "femea") {
    return "Fêmea";
  }

  return "-";
}


function formatarEspecie(especie) {
  if (!especie) {
    return "-";
  }

  return (
    especie
      .charAt(0)
      .toUpperCase() +
    especie.slice(1)
  );
}


function formatarData(data) {
  if (!data) {
    return "-";
  }

  // O valor YYYY-MM-DD é tratado manualmente para evitar
  // alterações de dia causadas por conversão de fuso horário.
  const dataLimpa =
    String(data).split("T")[0];

  const [ano, mes, dia] =
    dataLimpa.split("-");

  if (
    !ano ||
    !mes ||
    !dia
  ) {
    return "-";
  }

  return `${dia}/${mes}/${ano}`;
}


function formatarPeso(peso) {
  const numero =
    Number(peso);

  if (
    Number.isNaN(numero)
  ) {
    return "-";
  }

  return numero.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );
}


export default DetalhesPet;