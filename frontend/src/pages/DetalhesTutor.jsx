import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/DetalhesTutor.css";

import ModalConfirmacaoSenha from "../components/ModalConfirmacaoSenha";

import ModalConfirmacao from "../components/ModalConfirmacao";


function DetalhesTutor() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [tutor, setTutor] =
    useState(null);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  // Controla a confirmação das operações críticas do tutor.
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
   * Pets vinculados ao tutor através de pet_tutores.
   *
   * O mesmo tutor pode possuir vários pets e cada pet
   * também pode possuir mais de um tutor.
   */
  const [
    petsTutor,
    setPetsTutor,
  ] = useState([]);

  const [
    carregandoPets,
    setCarregandoPets,
  ] = useState(true);


  /*
   * Estados usados para vincular um pet já existente
   * ao tutor atualmente exibido.
   */
  const [
    modalPetAberto,
    setModalPetAberto,
  ] = useState(false);

  const [
    petsDisponiveis,
    setPetsDisponiveis,
  ] = useState([]);

  const [
    petSelecionado,
    setPetSelecionado,
  ] = useState("");

  const [
    carregandoDisponiveis,
    setCarregandoDisponiveis,
  ] = useState(false);

  const [
    processandoPet,
    setProcessandoPet,
  ] = useState(false);

  const [
    erroPet,
    setErroPet,
  ] = useState("");

  const [
    mensagemPet,
    setMensagemPet,
  ] = useState("");

  /*
 * Pet aguardando confirmação de desvinculação.
 *
 * Nenhum cadastro será excluído nesta operação.
 * Apenas o relacionamento entre Pet e Tutor será removido.
 */
const [
  petParaDesvincular,
  setPetParaDesvincular,
] = useState(null);


  /*
   * Busca os dados cadastrais atuais do tutor.
   */
  async function carregarTutor() {
    try {
      setCarregando(true);
      setErro("");

      const resposta =
        await api.get(
          `/tutores/${id}`
        );

      setTutor(
        resposta.data
      );
    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível carregar o tutor."
      );
    } finally {
      setCarregando(false);
    }
  }


  /*
   * Busca todos os pets relacionados ao tutor.
   *
   * O endpoint já utiliza pet_tutores, portanto também
   * retorna pets em que este tutor não é o principal.
   */
  async function carregarPetsTutor() {
    try {
      setCarregandoPets(true);

      const resposta =
        await api.get(
          `/pets/tutor/${id}`
        );

      setPetsTutor(
        Array.isArray(resposta.data)
          ? resposta.data
          : []
      );
    } catch (error) {
      console.error(
        "Erro ao carregar pets do tutor:",
        error
      );

      setPetsTutor([]);
    } finally {
      setCarregandoPets(false);
    }
  }


  useEffect(() => {
    carregarTutor();
    carregarPetsTutor();
  }, [id]);


  /*
   * Abre a seleção de pets existentes.
   *
   * Pets que já possuem vínculo com este tutor são
   * removidos da lista para impedir relações duplicadas.
   */
  async function abrirModalPet() {
    try {
      setModalPetAberto(true);
      setCarregandoDisponiveis(true);

      setErroPet("");
      setMensagemPet("");
      setPetSelecionado("");

      const resposta =
        await api.get("/pets");

      /*
       * A listagem de pets pode possuir paginação ou retornar
       * diretamente um array, dependendo da implementação
       * utilizada pela tela geral de pets.
       */
      const lista =
        Array.isArray(resposta.data)
          ? resposta.data
          : Array.isArray(
                resposta.data?.pets
              )
            ? resposta.data.pets
            : Array.isArray(
                  resposta.data?.dados
                )
              ? resposta.data.dados
              : [];

      const vinculados =
        new Set(
          petsTutor.map(
            (pet) =>
              Number(pet.id)
          )
        );

      const disponiveis =
        lista.filter(
          (pet) =>
            pet.ativo &&
            !vinculados.has(
              Number(pet.id)
            )
        );

      setPetsDisponiveis(
        disponiveis
      );
    } catch (error) {
      setErroPet(
        error.response?.data?.mensagem ||
          "Não foi possível carregar os pets."
      );
    } finally {
      setCarregandoDisponiveis(false);
    }
  }


  /*
   * Para vincular pelo lado do tutor utilizamos a mesma
   * API criada para Pet -> Tutor.
   *
   * Portanto o ID selecionado é usado na URL do pet e o
   * tutor atual é enviado no corpo da requisição.
   */
  async function vincularPet() {
    if (!petSelecionado) {
      setErroPet(
        "Selecione um pet."
      );

      return;
    }

    try {
      setProcessandoPet(true);
      setErroPet("");

      await api.post(
        `/pets/${petSelecionado}/tutores`,
        {
          tutor_id:
            Number(id),
        }
      );

      setModalPetAberto(false);
      setPetSelecionado("");

      await carregarPetsTutor();

      setMensagemPet(
        "Pet vinculado com sucesso."
      );
    } catch (error) {
      setErroPet(
        error.response?.data?.mensagem ||
          "Não foi possível vincular o pet."
      );
    } finally {
      setProcessandoPet(false);
    }
  }


  /*
   * Desvincula somente a relação entre este tutor e o pet.
   *
   * Nenhum dos dois cadastros é excluído.
   * O backend impede que um pet fique sem nenhum tutor.
   */
 async function desvincularPet() {
  if (!petParaDesvincular) {
    return;
  }

  try {
    setProcessandoPet(true);
    setErroPet("");
    setMensagemPet("");

    await api.delete(
      `/pets/${petParaDesvincular.id}/tutores/${id}`
    );

    setPetParaDesvincular(null);

    await carregarPetsTutor();

    setMensagemPet(
      "Pet desvinculado com sucesso."
    );
  } catch (error) {
    setErroPet(
      error.response?.data?.mensagem ||
        "Não foi possível desvincular o pet."
    );
  } finally {
    setProcessandoPet(false);
  }
}


  async function confirmarAlteracaoStatus(
    senha
  ) {
    try {
      setProcessandoStatus(true);
      setErroConfirmacao("");

      const novoStatus =
        !tutor.ativo;

      // O backend exige novamente a senha atual para
      // operações consideradas críticas.
      const resposta =
        await api.patch(
          `/tutores/${tutor.id}/status`,
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

      setTutor(
        resposta.data.tutor
      );

      setModalAberto(false);
    } catch (error) {
      setErroConfirmacao(
        error.response?.data?.mensagem ||
          "Não foi possível alterar o status do tutor."
      );
    } finally {
      setProcessandoStatus(false);
    }
  }


  if (carregando) {
    return (
      <div className="details-message">
        Carregando tutor...
      </div>
    );
  }


  if (erro) {
    return (
      <div>
        <div className="page-error">
          {erro}
        </div>

        <button
          className="back-button"
          onClick={() =>
            navigate("/tutores")
          }
        >
          ← Voltar
        </button>
      </div>
    );
  }


  if (!tutor) {
    return null;
  }


  return (
    <div className="details-page">

      <div className="page-header">
        <div>
          <div className="title-with-status">
            <h1>
              {tutor.nome}
            </h1>

            <span
              className={
                tutor.ativo
                  ? "status status-active"
                  : "status status-inactive"
              }
            >
              {tutor.ativo
                ? "Ativo"
                : "Inativo"}
            </span>
          </div>

          <p>
            Ficha cadastral do tutor.
          </p>
        </div>


        <div className="header-actions">
          <button
            className="back-button"
            onClick={() =>
              navigate("/tutores")
            }
          >
            ← Voltar
          </button>

          <button
            className="primary-button"
            onClick={() =>
              navigate(
                `/tutores/${tutor.id}/editar`
              )
            }
          >
            Editar
          </button>
        </div>
      </div>


      <section className="details-card">
        <div className="details-card-header">
          <h2>
            Dados pessoais
          </h2>
        </div>

        <div className="details-grid">
          <Informacao
            titulo="Nome"
            valor={tutor.nome}
          />

          <Informacao
            titulo="CPF"
            valor={tutor.cpf}
          />

          <Informacao
            titulo="Telefone"
            valor={tutor.telefone}
          />

          <Informacao
            titulo="E-mail"
            valor={tutor.email}
          />
        </div>
      </section>


      <section className="details-card">
        <div className="details-card-header">
          <h2>
            Endereço
          </h2>
        </div>

        <div className="details-grid">
          <Informacao
            titulo="CEP"
            valor={tutor.cep}
          />

          <Informacao
            titulo="Endereço"
            valor={tutor.endereco}
          />

          <Informacao
            titulo="Número"
            valor={tutor.numero}
          />

          <Informacao
            titulo="Complemento"
            valor={tutor.complemento}
          />

          <Informacao
            titulo="Bairro"
            valor={tutor.bairro}
          />

          <Informacao
            titulo="Cidade"
            valor={tutor.cidade}
          />

          <Informacao
            titulo="Estado"
            valor={tutor.estado}
          />
        </div>
      </section>


      {/*
       * A área de pets possui estrutura visual própria.
       * Ela representa relacionamentos do tutor, e não
       * simplesmente informações cadastrais.
       */}
      <section className="tutor-pets-panel">

        <div className="tutor-pets-panel-header">
          <div>
            <span className="tutor-pets-eyebrow">
              Animais vinculados
            </span>

            <h2>
              Pets deste tutor
            </h2>

            <p>
              {petsTutor.length === 0
                ? "Nenhum pet está vinculado a este tutor."
                : `${petsTutor.length} ${
                    petsTutor.length === 1
                      ? "pet vinculado"
                      : "pets vinculados"
                  } a este tutor.`}
            </p>
          </div>

          <div className="tutor-pets-header-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                navigate(
                  `/pets/novo?tutor=${tutor.id}`
                )
              }
            >
              + Cadastrar Novo Pet
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={
                abrirModalPet
              }
            >
              + Vincular Pet
            </button>
          </div>
        </div>


        {mensagemPet && (
          <div className="tutor-pet-feedback success">
            {mensagemPet}
          </div>
        )}


        {erroPet &&
          !modalPetAberto && (
            <div className="tutor-pet-feedback error">
              {erroPet}
            </div>
          )}


        {carregandoPets ? (
          <div className="tutor-pets-loading">
            Carregando pets...
          </div>
        ) : petsTutor.length === 0 ? (
          <div className="tutor-pets-empty">
            <div className="tutor-pets-empty-icon">
              +
            </div>

            <h3>
              Este tutor ainda não possui pets
            </h3>

            <p>
              Você pode cadastrar um novo pet
              para este tutor ou vinculá-lo a
              um pet que já existe no sistema.
            </p>

            <div className="tutor-pets-empty-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  navigate(
                    `/pets/novo?tutor=${tutor.id}`
                  )
                }
              >
                Cadastrar Novo Pet
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={
                  abrirModalPet
                }
              >
                Vincular Pet Existente
              </button>
            </div>
          </div>
        ) : (
          <div className="tutor-pets-grid">
            {petsTutor.map(
              (pet) => (
                <article
                  key={pet.id}
                  className="tutor-pet-card"
                >
                  <div className="tutor-pet-card-top">
                    <div className="tutor-pet-initial">
                      {pet.nome
                        ?.charAt(0)
                        ?.toUpperCase() ||
                        "P"}
                    </div>

                    <div className="tutor-pet-title">
                      <div className="tutor-pet-name-row">
                        <h3>
                          {pet.nome}
                        </h3>

                        {pet.principal && (
                          <span className="tutor-pet-principal-badge">
                            Tutor principal
                          </span>
                        )}
                      </div>

                      <p>
                        {pet.especie ||
                          "Espécie não informada"}

                        {pet.raca
                          ? ` • ${pet.raca}`
                          : ""}
                      </p>
                    </div>
                  </div>


                  <div className="tutor-pet-card-status">
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


                  <div className="tutor-pet-card-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        navigate(
                          `/pets/${pet.id}`
                        )
                      }
                    >
                      Visualizar Pet
                    </button>

                    <button
                      type="button"
                      className="tutor-pet-unlink-button"
                      disabled={
                        processandoPet
                      }
                      onClick={() =>{
                        setErroPet("");
                        setMensagemPet("");
                        setPetParaDesvincular(
                          pet
                        )
                      }}
                    >
                      Desvincular
                    </button>
                  </div>
                </article>
              )
            )}
          </div>
        )}
      </section>


      <section className="details-card">
        <div className="details-card-header">
          <h2>
            Observações
          </h2>
        </div>

        <p className="observations">
          {tutor.observacoes ||
            "Nenhuma observação cadastrada."}
        </p>
      </section>


      <div className="danger-zone">
        <div>
          <strong>
            {tutor.ativo
              ? "Inativar tutor"
              : "Reativar tutor"}
          </strong>

          <p>
            {tutor.ativo
              ? "O tutor continuará armazenado no sistema, mas ficará marcado como inativo."
              : "O tutor voltará a ficar disponível normalmente no sistema."}
          </p>
        </div>

        <button
          className={
            tutor.ativo
              ? "danger-button"
              : "reactivate-button"
          }
          onClick={() => {
            setErroConfirmacao("");
            setModalAberto(true);
          }}
        >
          {tutor.ativo
            ? "Inativar Tutor"
            : "Reativar Tutor"}
        </button>
      </div>


      {/*
       * Modal usado para selecionar um pet que já existe.
       * O vínculo é criado sem alterar ou duplicar o cadastro.
       */}
      {modalPetAberto && (
        <div
          className="tutor-pet-modal-overlay"
          onMouseDown={(evento) => {
            if (
              evento.target ===
              evento.currentTarget
            ) {
              setModalPetAberto(false);
            }
          }}
        >
          <div className="tutor-pet-modal">

            <div className="tutor-pet-modal-header">
              <div>
                <span>
                  Novo vínculo
                </span>

                <h2>
                  Vincular Pet
                </h2>
              </div>

              <button
                type="button"
                className="tutor-pet-modal-close"
                onClick={() =>
                  setModalPetAberto(
                    false
                  )
                }
              >
                ×
              </button>
            </div>


            <p>
              Selecione um pet ativo
              para vinculá-lo ao tutor{" "}
              <strong>
                {tutor.nome}
              </strong>.
            </p>


            {erroPet && (
              <div className="tutor-pet-feedback error">
                {erroPet}
              </div>
            )}


            {carregandoDisponiveis ? (
              <div className="tutor-pets-loading">
                Carregando pets...
              </div>
            ) : petsDisponiveis.length ===
              0 ? (
              <div className="tutor-no-available-pets">
                <strong>
                  Nenhum pet disponível
                </strong>

                <p>
                  Todos os pets ativos
                  encontrados já estão
                  vinculados a este tutor
                  ou ainda não existem
                  outros pets cadastrados.
                </p>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    navigate(
                      `/pets/novo?tutor=${tutor.id}`
                    )
                  }
                >
                  Cadastrar Novo Pet
                </button>
              </div>
            ) : (
              <>
                <label className="tutor-pet-select-field">
                  <span>
                    Pet
                  </span>

                  <select
                    value={
                      petSelecionado
                    }
                    onChange={(evento) => {
                      setPetSelecionado(
                        evento.target.value
                      );

                      setErroPet("");
                    }}
                  >
                    <option value="">
                      Selecione...
                    </option>

                    {petsDisponiveis.map(
                      (pet) => (
                        <option
                          key={pet.id}
                          value={pet.id}
                        >
                          {pet.nome}
                          {pet.raca
                            ? ` — ${pet.raca}`
                            : pet.especie
                              ? ` — ${pet.especie}`
                              : ""}
                        </option>
                      )
                    )}
                  </select>
                </label>


                <div className="tutor-pet-modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      processandoPet
                    }
                    onClick={() =>
                      setModalPetAberto(
                        false
                      )
                    }
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    className="primary-button"
                    disabled={
                      processandoPet
                    }
                    onClick={
                      vincularPet
                    }
                  >
                    {processandoPet
                      ? "Vinculando..."
                      : "Vincular Pet"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ModalConfirmacao
        aberto={
          Boolean(
            petParaDesvincular
          )
        }
        titulo="Desvincular pet?"
        mensagem={
          petParaDesvincular
            ? `Deseja desvincular ${petParaDesvincular.nome} de ${tutor.nome}? Os dois cadastros serão mantidos.`
            : ""
        }
        textoConfirmar="Desvincular"
        processando={
          processandoPet
        }
        onConfirmar={
          desvincularPet
        }
        onCancelar={() => {
          if (!processandoPet) {
            setPetParaDesvincular(
              null
            );
          }
        }}
      />


      <ModalConfirmacaoSenha
        aberto={modalAberto}
        titulo={
          tutor.ativo
            ? "Inativar tutor?"
            : "Reativar tutor?"
        }
        mensagem={
          tutor.ativo
            ? "Confirme sua senha para inativar este tutor. O cadastro permanecerá armazenado no sistema."
            : "Confirme sua senha para reativar este tutor."
        }
        textoConfirmar={
          tutor.ativo
            ? "Inativar Tutor"
            : "Reativar Tutor"
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


function Informacao({
  titulo,
  valor,
}) {
  return (
    <div className="information-item">
      <span>
        {titulo}
      </span>

      <strong>
        {valor || "-"}
      </strong>
    </div>
  );
}


export default DetalhesTutor;