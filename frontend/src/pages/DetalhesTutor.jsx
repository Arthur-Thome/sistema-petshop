import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import "../styles/DetalhesTutor.css";
import ModalConfirmacaoSenha from "../components/ModalConfirmacaoSenha";

function DetalhesTutor() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [tutor, setTutor] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  // Controla a confirmação das operações críticas do tutor.
  const [modalAberto, setModalAberto] = useState(false);
  const [processandoStatus, setProcessandoStatus] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState("");
  // Pets relacionados ao tutor atualmente exibido.
  const [petsTutor, setPetsTutor] = useState([]);
  const [carregandoPets, setCarregandoPets] = useState(true);

// Carrega os animais relacionados ao tutor.
// O relacionamento é feito através de pets.tutor_id.
useEffect(() => {
  async function carregarPetsTutor() {
    try {
      setCarregandoPets(true);

      const resposta = await api.get(
        `/pets/tutor/${id}`
      );

      setPetsTutor(resposta.data);
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

  carregarPetsTutor();
}, [id]);

  // Busca sempre os dados atuais do tutor diretamente da API.
  useEffect(() => {
    async function carregarTutor() {
      try {
        setCarregando(true);
        setErro("");

        const resposta = await api.get(`/tutores/${id}`);

        setTutor(resposta.data);
      } catch (error) {
        setErro(
          error.response?.data?.mensagem ||
            "Não foi possível carregar o tutor."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregarTutor();
  }, [id]);

  async function confirmarAlteracaoStatus(senha) {
  try {
    setProcessandoStatus(true);
    setErroConfirmacao("");

    const novoStatus = !tutor.ativo;

    // O backend exige a senha atual no cabeçalho para
    // autorizar operações consideradas críticas.
    const resposta = await api.patch(
      `/tutores/${tutor.id}/status`,
      {
        ativo: novoStatus,
      },
      {
        headers: {
          "X-Confirm-Password": senha,
        },
      }
    );

    // Atualiza a tela com o objeto retornado pelo backend,
    // evitando uma segunda consulta desnecessária.
    setTutor(resposta.data.tutor);

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
          onClick={() => navigate("/tutores")}
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
            <h1>{tutor.nome}</h1>

            <span
              className={
                tutor.ativo
                  ? "status status-active"
                  : "status status-inactive"
              }
            >
              {tutor.ativo ? "Ativo" : "Inativo"}
            </span>
          </div>

          <p>Ficha cadastral do tutor.</p>
        </div>

        <div className="header-actions">
          <button
            className="back-button"
            onClick={() => navigate("/tutores")}
          >
            ← Voltar
          </button>

          <button
            className="primary-button"
            onClick={() =>
              navigate(`/tutores/${tutor.id}/editar`)
            }
          >
            Editar
          </button>
        </div>
      </div>

      <section className="details-card">
        <div className="details-card-header">
          <h2>Dados pessoais</h2>
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
          <h2>Endereço</h2>
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

      <section className="details-card">
        <div className="details-card-header">
          <h2>Observações</h2>
        </div>

        <p className="observations">
          {tutor.observacoes ||
            "Nenhuma observação cadastrada."}
        </p>
      </section>

      <section className="details-card">
        <div className="details-card-header">
          <h2>Pets deste tutor</h2>
        </div>

          <div className="tutor-pets-list">
            {carregandoPets ? (
              <p>Carregando pets...</p>
            ) : petsTutor.length === 0 ? (
              <p>Nenhum pet cadastrado para este tutor.</p>
            ) : (
              petsTutor.map((pet) => (
                <div
                  key={pet.id}
                  className="tutor-pet-item"
                >
                  <div>
                    <strong>{pet.nome}</strong>

                    <span>
                      {pet.raca ||
                        pet.especie ||
                        "Não informado"}
                    </span>
                  </div>

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

                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/pets/${pet.id}`)
                    }
                  >
                    Visualizar
                  </button>
                </div>
              ))
            )}
          </div>
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
            processando={processandoStatus}
            erro={erroConfirmacao}
            onConfirmar={confirmarAlteracaoStatus}
            onCancelar={() => {
                setModalAberto(false);
                setErroConfirmacao("");
            }}
        />
    </div>
  );
}

function Informacao({ titulo, valor }) {
  return (
    <div className="information-item">
      <span>{titulo}</span>

      <strong>
        {valor || "-"}
      </strong>
    </div>
  );
}

export default DetalhesTutor;