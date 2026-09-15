import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../services/api";

import "../styles/FormularioPet.css";
import SeletorTutor from "../components/SeletorTutor";


const formInicial = {
  tutor_id: "",
  nome: "",
  especie: "cachorro",
  raca: "",
  sexo: "",
  data_nascimento: "",
  peso: "",
  cor: "",
  observacoes: "",
};


function FormularioPet() {
  const navigate = useNavigate();

  const { id } = useParams();

  // A presença do ID determina se o formulário está
  // criando um novo pet ou alterando um cadastro existente.
  const modoEdicao = Boolean(id);

  const [form, setForm] =
    useState(formInicial);

  const [tutores, setTutores] =
    useState([]);

  const [carregandoTutores, setCarregandoTutores] =
    useState(true);

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] =
    useState("");

  const [sucesso, setSucesso] =
    useState("");

  const [carregandoPet, setCarregandoPet] =
  useState(modoEdicao);

  // Arquivo selecionado pelo usuário.
  // Ele permanece somente no navegador até o formulário ser salvo.
  const [arquivoFoto, setArquivoFoto] = useState(null);

  // URL temporária utilizada para mostrar a nova imagem
  // antes que ela seja enviada para o servidor.
  const [previewFoto, setPreviewFoto] = useState("");

  // Caminho da foto que já está armazenada no backend.
  // É utilizado principalmente durante a edição.
  const [fotoAtual, setFotoAtual] = useState("");


  // Carrega os tutores para permitir o relacionamento
  // obrigatório entre o responsável e o novo pet.
useEffect(() => {
  async function carregarTutores() {
    try {
      setCarregandoTutores(true);

      const resposta =
        await api.get("/tutores");

      // No cadastro de um novo pet, somente tutores ativos
      // podem ser selecionados.
      //
      // Na edição carregamos todos porque o tutor atual pode
      // ter sido inativado depois do cadastro do animal.
      if (modoEdicao) {
        setTutores(resposta.data);
      } else {
        const tutoresAtivos =
          resposta.data.filter(
            (tutor) => tutor.ativo
          );

        setTutores(tutoresAtivos);
      }
    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível carregar os tutores."
      );
    } finally {
      setCarregandoTutores(false);
    }
  }

  carregarTutores();
}, [modoEdicao]);

  // Quando estamos em modo de edição, recuperamos os dados
// atuais do pet para preencher o mesmo formulário.
useEffect(() => {
  if (!modoEdicao) {
    return;
  }

  async function carregarPet() {
    try {
      setCarregandoPet(true);
      setErro("");

      const resposta =
        await api.get(`/pets/${id}`);

      const pet =
        resposta.data.pet;
      
      // Mantém a foto atual para exibi-la no formulário de edição.
      setFotoAtual(pet.foto || "");

      setForm({
        tutor_id:
          String(pet.tutor_id || ""),

        nome:
          pet.nome || "",

        especie:
          pet.especie || "cachorro",

        raca:
          pet.raca || "",

        sexo:
          pet.sexo || "",

        // O PostgreSQL pode retornar a data acompanhada
        // de horário. O input date precisa somente YYYY-MM-DD.
        data_nascimento:
          pet.data_nascimento
            ? String(
                pet.data_nascimento
              ).split("T")[0]
            : "",

        peso:
          pet.peso || "",

        cor:
          pet.cor || "",

        observacoes:
          pet.observacoes || "",
      });
    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível carregar o pet."
      );
    } finally {
      setCarregandoPet(false);
    }
  }

  carregarPet();
}, [id, modoEdicao]);

// Libera a URL temporária criada para a pré-visualização
// quando outra imagem for escolhida ou o componente for fechado.
useEffect(() => {
  return () => {
    if (previewFoto) {
      URL.revokeObjectURL(previewFoto);
    }
  };
}, [previewFoto]);


  function atualizarCampo(event) {
    const { name, value } =
      event.target;

    setForm((anterior) => ({
      ...anterior,
      [name]: value,
    }));
  }

  function selecionarFoto(event) {
  const arquivo =
    event.target.files?.[0];

  if (!arquivo) {
    return;
  }

  // Mantemos no frontend as mesmas restrições existentes
  // no backend para dar retorno imediato ao usuário.
  const tiposPermitidos = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!tiposPermitidos.includes(arquivo.type)) {
    setErro(
      "Selecione uma imagem JPG, PNG ou WEBP."
    );

    event.target.value = "";
    return;
  }

  if (arquivo.size > 5 * 1024 * 1024) {
    setErro(
      "A imagem deve ter no máximo 5 MB."
    );

    event.target.value = "";
    return;
  }

  setErro("");
  setArquivoFoto(arquivo);

  // Cria um endereço temporário para mostrar a imagem
  // imediatamente, sem precisar enviá-la ao servidor.
  const preview =
    URL.createObjectURL(arquivo);

  setPreviewFoto(preview);
}

// Envia a foto separadamente dos dados cadastrais.
// O Pet precisa existir primeiro porque o ID faz parte da rota.
async function enviarFoto(petId) {
  if (!arquivoFoto) {
    return;
  }

  const formData = new FormData();

  formData.append("foto", arquivoFoto);

  await api.post(
    `/pets/${petId}/foto`,
    formData
  );
}


// Salva primeiro os dados cadastrais.
//
// Quando uma nova imagem foi selecionada, o upload acontece
// somente depois que existe um ID válido para o Pet.
async function salvarPet(event) {
  event.preventDefault();

  setErro("");
  setSucesso("");

  if (
    !form.tutor_id ||
    !form.nome.trim() ||
    !form.especie
  ) {
    setErro(
      "Tutor, nome e espécie são obrigatórios."
    );

    return;
  }

  try {
    setSalvando(true);

    const dados = {
      ...form,

      tutor_id: Number(form.tutor_id),

      nome: form.nome.trim(),

      peso:
        form.peso !== ""
          ? Number(form.peso)
          : null,

      data_nascimento:
        form.data_nascimento || null,

      raca:
        form.raca.trim() || null,

      sexo:
        form.sexo || null,

      cor:
        form.cor.trim() || null,

      observacoes:
        form.observacoes.trim() || null,
    };


    let petId;


    if (modoEdicao) {
      // Atualiza primeiro os dados do Pet.
      await api.put(
        `/pets/${id}`,
        dados
      );

      petId = id;
    } else {
      // No cadastro precisamos recuperar o ID criado
      // antes de conseguir enviar uma fotografia.
      const resposta =
        await api.post("/pets", dados);

      petId =
        resposta.data.pet.id;
    }


    // A falha da fotografia não desfaz um cadastro
    // que já foi salvo corretamente.
    if (arquivoFoto) {
      try {
        await enviarFoto(petId);
      } catch (error) {
        console.error(
          "Pet salvo, mas houve erro no upload da foto:",
          error
        );

        setSucesso(
          modoEdicao
            ? "Os dados do Pet foram atualizados, mas não foi possível atualizar a foto."
            : "O Pet foi cadastrado, mas não foi possível enviar a foto."
        );

        setTimeout(() => {
          navigate(`/pets/${petId}`);
        }, 1500);

        return;
      }
    }


    setSucesso(
      modoEdicao
        ? "Pet atualizado com sucesso."
        : "Pet cadastrado com sucesso."
    );


    setTimeout(() => {
      navigate(`/pets/${petId}`);
    }, 700);
  } catch (error) {
    setErro(
      error.response?.data?.mensagem ||
        (modoEdicao
          ? "Não foi possível atualizar o Pet."
          : "Não foi possível cadastrar o Pet.")
    );
  } finally {
    setSalvando(false);
  }
}

if (carregandoPet) {
  return (
    <div className="pet-form-loading">
      Carregando pet...
    </div>
  );
}


  return (
    <div className="pet-form-page">
      <div className="page-header">
        <div>
          <h1>
            {modoEdicao
              ? "Editar Pet"
              : "Novo Pet"}
            </h1>

          <p>
            {modoEdicao
              ? "Atualize os dados cadastrais do animal."
              : "Cadastre os dados do animal e relacione-o ao tutor responsável."}
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate(
              modoEdicao
                ? `/pets/${id}`
                : "/pets"
            )
          }
        >
          Voltar
        </button>
      </div>


      <form
        className="pet-form"
        onSubmit={salvarPet}
      >
        {erro && (
          <div className="form-alert error">
            {erro}
          </div>
        )}

        {sucesso && (
          <div className="form-alert success">
            {sucesso}
          </div>
        )}


        <section className="pet-form-section">
          <div className="section-heading">
            <h2>Tutor responsável</h2>

            <p>
              Selecione quem é responsável
              pelo animal.
            </p>
          </div>

          <div className="pet-form-grid">
            <div className="pet-form-field full">
              <label htmlFor="tutor_id">
                Tutor *
              </label>

              <SeletorTutor
                tutores={tutores}
                tutorSelecionadoId={form.tutor_id}
                desabilitado={carregandoTutores}
                onSelecionar={(tutor) => {
                  setForm((anterior) => ({
                    ...anterior,

                    tutor_id:
                      tutor
                        ? String(tutor.id)
                        : "",
                  }));
                }}
              />

              {!carregandoTutores &&
                tutores.length === 0 && (
                  <span className="field-help">
                    Não existem tutores ativos.
                    Cadastre ou reative um tutor primeiro.
                  </span>
                )}
            </div>
          </div>
        </section>

        <section className="pet-form-section">
          <div className="section-heading">
            <h2>Foto do pet</h2>

            <p>
              Adicione uma foto para facilitar a
              identificação do animal.
            </p>
          </div>

          <div className="pet-photo-upload">
            <PreviewFoto
              preview={previewFoto}
              fotoAtual={fotoAtual}
              nome={form.nome}
            />

            <div className="pet-photo-upload-controls">
              <label
                htmlFor="foto"
                className="photo-select-button"
              >
                {fotoAtual || previewFoto
                  ? "Trocar foto"
                  : "Selecionar foto"}
              </label>

              <input
                id="foto"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={selecionarFoto}
              />

              <span>
                JPG, PNG ou WEBP. Máximo de 5 MB.
              </span>

              {arquivoFoto && (
                <strong>
                  {arquivoFoto.name}
                </strong>
              )}
            </div>
          </div>
        </section>


        <section className="pet-form-section">
          <div className="section-heading">
            <h2>Dados do pet</h2>

            <p>
              Informações principais para
              identificação do animal.
            </p>
          </div>

          <div className="pet-form-grid">
            <Campo
              label="Nome"
              name="nome"
              value={form.nome}
              onChange={atualizarCampo}
              required
            />

            <div className="pet-form-field">
              <label htmlFor="especie">
                Espécie *
              </label>

              <select
                id="especie"
                name="especie"
                value={form.especie}
                onChange={atualizarCampo}
                required
              >
                <option value="cachorro">
                  Cachorro
                </option>

                <option value="gato">
                  Gato
                </option>

                <option value="outro">
                  Outro
                </option>
              </select>
            </div>

            <Campo
              label="Raça"
              name="raca"
              value={form.raca}
              onChange={atualizarCampo}
            />

            <div className="pet-form-field">
              <label htmlFor="sexo">
                Sexo
              </label>

              <select
                id="sexo"
                name="sexo"
                value={form.sexo}
                onChange={atualizarCampo}
              >
                <option value="">
                  Não informado
                </option>

                <option value="macho">
                  Macho
                </option>

                <option value="femea">
                  Fêmea
                </option>
              </select>
            </div>

            <Campo
              label="Data de nascimento"
              name="data_nascimento"
              type="date"
              value={form.data_nascimento}
              onChange={atualizarCampo}
            />

            <Campo
              label="Peso (kg)"
              name="peso"
              type="number"
              value={form.peso}
              onChange={atualizarCampo}
              min="0.01"
              step="0.01"
            />

            <Campo
              label="Cor"
              name="cor"
              value={form.cor}
              onChange={atualizarCampo}
            />
          </div>
        </section>


        <section className="pet-form-section">
          <div className="section-heading">
            <h2>Observações</h2>

            <p>
              Informações adicionais sobre o animal.
            </p>
          </div>

          <div className="pet-form-field full">
            <textarea
              name="observacoes"
              value={form.observacoes}
              onChange={atualizarCampo}
              rows="5"
              placeholder="Comportamento, cuidados ou outras informações importantes..."
            />
          </div>
        </section>


        <div className="pet-form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                modoEdicao
                  ? `/pets/${id}`
                  : "/pets"
              )
            }
            disabled={salvando}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={
              salvando ||
              carregandoTutores ||
              tutores.length === 0
            }
          >
            {salvando
              ? "Salvando..."
              : modoEdicao
                ? "Salvar Alterações"
                : "Cadastrar Pet"}
          </button>
        </div>
      </form>
    </div>
  );
}


// Campo reutilizável para manter os inputs do formulário
// com a mesma estrutura e comportamento.
function Campo({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  min,
  step,
}) {
  return (
    <div className="pet-form-field">
      <label htmlFor={name}>
        {label}
        {required ? " *" : ""}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        min={min}
        step={step}
      />
    </div>
  );
}

function PreviewFoto({
  preview,
  fotoAtual,
  nome,
}) {
  let imagem = preview;

  // Se nenhuma nova foto foi selecionada, mostramos
  // a imagem que já está armazenada no backend.
  if (!imagem && fotoAtual) {
    const apiUrl =
      import.meta.env.VITE_API_URL ||
      "http://localhost:3001/api";

    const servidorUrl =
      apiUrl.replace(/\/api\/?$/, "");

    imagem =
      `${servidorUrl}${fotoAtual}`;
  }

  if (imagem) {
    return (
      <img
        className="pet-photo-preview"
        src={imagem}
        alt={`Foto de ${nome || "pet"}`}
      />
    );
  }

  // Enquanto não existir foto, usamos a inicial do nome.
  return (
    <div className="pet-photo-preview-placeholder">
      {nome?.charAt(0)?.toUpperCase() || "P"}
    </div>
  );
}

export default FormularioPet;