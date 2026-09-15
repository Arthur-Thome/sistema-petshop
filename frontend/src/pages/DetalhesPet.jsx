import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../services/api";
import ModalConfirmacaoSenha from "../components/ModalConfirmacaoSenha";

import "../styles/DetalhesPet.css";


function DetalhesPet() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pet, setPet] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Estados utilizados pela confirmação de operações críticas.
  const [modalAberto, setModalAberto] = useState(false);
  const [processandoStatus, setProcessandoStatus] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState("");


  // Busca sempre a ficha atual do pet diretamente no backend.
  useEffect(() => {
    async function carregarPet() {
      try {
        setCarregando(true);
        setErro("");

        const resposta = await api.get(`/pets/${id}`);

        setPet(resposta.data.pet);
      } catch (error) {
        setErro(
          error.response?.data?.mensagem ||
            "Não foi possível carregar o pet."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregarPet();
  }, [id]);


  // Inativar ou reativar um pet é considerado uma operação
  // crítica e exige novamente a senha do usuário autenticado.
  async function confirmarAlteracaoStatus(senha) {
    try {
      setProcessandoStatus(true);
      setErroConfirmacao("");

      const novoStatus = !pet.ativo;

      const resposta = await api.patch(
        `/pets/${pet.id}/status`,
        {
          ativo: novoStatus,
        },
        {
          headers: {
            "X-Confirm-Password": senha,
          },
        }
      );

      // O retorno do backend contém os dados atualizados,
      // portanto não precisamos consultar novamente o pet.
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
        <p>{erro || "Pet não encontrado."}</p>

        <button
          type="button"
          onClick={() => navigate("/pets")}
        >
          Voltar para Pets
        </button>
      </div>
    );
  }


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
              {pet.ativo ? "Ativo" : "Inativo"}
            </span>
          </div>

          <p>
            {formatarEspecie(pet.especie)}
            {pet.raca ? ` • ${pet.raca}` : ""}
            {pet.sexo
              ? ` • ${formatarSexo(pet.sexo)}`
              : ""}
          </p>
        </div>

        <div className="pet-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate("/pets")}
          >
            Voltar
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() =>
              navigate(`/pets/${pet.id}/editar`)
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
              A foto ajuda na identificação durante
              atendimentos, creche e hospedagem.
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
                valor={formatarEspecie(pet.especie)}
              />

              <Informacao
                titulo="Raça"
                valor={pet.raca}
              />

              <Informacao
                titulo="Sexo"
                valor={formatarSexo(pet.sexo)}
              />

              <Informacao
                titulo="Nascimento"
                valor={formatarData(pet.data_nascimento)}
              />

              <Informacao
                titulo="Peso"
                valor={
                  pet.peso
                    ? `${formatarPeso(pet.peso)} kg`
                    : "-"
                }
              />

              <Informacao
                titulo="Cor"
                valor={pet.cor}
              />
            </div>
          </section>


          <section className="pet-details-card">
            <div className="pet-card-header">
              <h2>Tutor responsável</h2>

              <button
                type="button"
                onClick={() =>
                  navigate(`/tutores/${pet.tutor_id}`)
                }
              >
                Ver Tutor
              </button>
            </div>

            <div className="pet-info-grid">
              <Informacao
                titulo="Nome"
                valor={pet.tutor_nome}
              />

              <Informacao
                titulo="Telefone"
                valor={pet.tutor_telefone}
              />

              <Informacao
                titulo="E-mail"
                valor={pet.tutor_email}
              />

              <Informacao
                titulo="Status"
                valor={
                  pet.tutor_ativo
                    ? "Ativo"
                    : "Inativo"
                }
              />
            </div>
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


// Apresenta a foto armazenada no backend.
// Quando não existir foto, utilizamos a inicial do nome.
function FotoPet({ pet }) {
  if (!pet.foto) {
    return (
      <div className="pet-details-photo-placeholder">
        {pet.nome?.charAt(0)?.toUpperCase() || "P"}
      </div>
    );
  }

  const apiUrl =
    import.meta.env.VITE_API_URL ||
    "http://localhost:3001/api";

  const servidorUrl =
    apiUrl.replace(/\/api\/?$/, "");

  return (
    <img
      className="pet-details-photo"
      src={`${servidorUrl}${pet.foto}`}
      alt={`Foto de ${pet.nome}`}
    />
  );
}


function Informacao({ titulo, valor }) {
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
    especie.charAt(0).toUpperCase() +
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

  if (!ano || !mes || !dia) {
    return "-";
  }

  return `${dia}/${mes}/${ano}`;
}


function formatarPeso(peso) {
  const numero = Number(peso);

  if (Number.isNaN(numero)) {
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