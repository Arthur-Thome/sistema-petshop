import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import "../styles/FormularioTutor.css";

function FormularioTutor() {
  const navigate = useNavigate();
  const { id } = useParams();

  const modoEdicao = Boolean(id);

  const numeroRef = useRef(null);

  const [carregando, setCarregando] = useState(modoEdicao);

  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    telefone: "",
    email: "",
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    observacoes: "",
  });

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState("");

  // O mesmo formulário atende cadastro e edição.
  // Quando existe um ID na URL, carregamos os dados existentes.
  useEffect(() => {
  if (!modoEdicao) {
    return;
  }

  async function carregarTutor() {
    try {
      setCarregando(true);
      setErro("");

      const resposta = await api.get(`/tutores/${id}`);

      const tutor = resposta.data;

      setForm({
        nome: tutor.nome || "",
        cpf: tutor.cpf || "",
        telefone: tutor.telefone || "",
        email: tutor.email || "",
        cep: tutor.cep || "",
        endereco: tutor.endereco || "",
        numero: tutor.numero || "",
        complemento: tutor.complemento || "",
        bairro: tutor.bairro || "",
        cidade: tutor.cidade || "",
        estado: tutor.estado || "",
        observacoes: tutor.observacoes || "",
      });
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
}, [id, modoEdicao]);

  // Centraliza alterações dos campos e aplica máscaras somente
  // para melhorar a experiência de digitação.
  // A validação definitiva continua sendo feita pelo backend.
  function atualizarCampo(event) {
    const { name, value } = event.target;

    let novoValor = value;

    if (name === "cpf") {
      novoValor = formatarCPF(value);
    }

    if (name === "telefone") {
      novoValor = formatarTelefone(value);
    }

    if (name === "cep") {
      novoValor = formatarCEP(value);
    }

    if (name === "estado") {
      novoValor = value
        .replace(/[^a-zA-Z]/g, "")
        .toUpperCase()
        .slice(0, 2);
    }

    setForm((anterior) => ({
      ...anterior,
      [name]: novoValor,
    }));
  }

  // Consulta o CEP para agilizar o cadastro.
  // Se a consulta falhar, os campos continuam editáveis e podem
  // ser preenchidos manualmente.
  async function buscarCEP() {
  const cepNumeros = form.cep.replace(/\D/g, "");

  if (cepNumeros.length !== 8) {
    return;
  }

  try {
    setBuscandoCep(true);
    setErroCep("");

    const resposta = await fetch(
      `https://viacep.com.br/ws/${cepNumeros}/json/`
    );

    if (!resposta.ok) {
      throw new Error("Erro ao consultar CEP.");
    }

    const dados = await resposta.json();

    if (dados.erro) {
      setErroCep("CEP não encontrado.");
      return;
    }

    setForm((anterior) => ({
      ...anterior,
      endereco: dados.logradouro || "",
      bairro: dados.bairro || "",
      cidade: dados.localidade || "",
      estado: dados.uf || "",
    }));

    // Aguarda o React atualizar os campos preenchidos pelo CEP
    // e direciona o usuário para o próximo dado que precisa digitar.
    setTimeout(() => {
        numeroRef.current?.focus();
    }, 0);
  } catch (error) {
    setErroCep(
      "Não foi possível consultar o CEP. Preencha o endereço manualmente."
    );
  } finally {
    setBuscandoCep(false);
  }
}

  // Decide entre criação (POST) e edição (PUT)
  // conforme a presença do ID na rota.
  async function salvarTutor(event) {
    event.preventDefault();

    setErro("");
    setSucesso("");

    if (!form.nome.trim()) {
      setErro("Informe o nome do tutor.");
      return;
    }

    if (!form.telefone.trim()) {
      setErro("Informe o telefone do tutor.");
      return;
    }

    if (!form.endereco.trim()) {
      setErro("Informe o endereço do tutor.");
      return;
    }

    try {
      setSalvando(true);

      if (modoEdicao) {
        await api.put(`/tutores/${id}`, form);
    } else {
        await api.post("/tutores", form);
    }

      setSucesso(
            modoEdicao
                ? "Tutor atualizado com sucesso."
                : "Tutor cadastrado com sucesso."
        );

    setTimeout(() => {
        if (modoEdicao) {
            navigate(`/tutores/${id}`);
        } else {
            navigate("/tutores");
        }
    }, 800);
    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
            (modoEdicao
                ? "Não foi possível atualizar o tutor."
                : "Não foi possível cadastrar o tutor.")
      );
    } finally {
      setSalvando(false);
    }
  }

    if (carregando) {
        return (
            <div className="details-message">
            Carregando tutor...
            </div>
                );
    }

  return (
    <div className="form-page">
      <div className="page-header">
        <div>
          <h1>
            {modoEdicao ? "Editar Tutor" : "Novo Tutor"}
          </h1>

            <p>
            {modoEdicao
                ? "Atualize os dados do responsável."
                : "Cadastre os dados do responsável pelo pet."}
            </p>
        </div>

        <button
          className="back-button"
          onClick={() =>
            modoEdicao
                ? navigate(`/tutores/${id}`)
                : navigate("/tutores")
            }
        >
          ← Voltar
        </button>
      </div>

      <form
        className="tutor-form"
        onSubmit={salvarTutor}
      >
        {erro && (
          <div className="form-alert form-alert-error">
            {erro}
          </div>
        )}

        {sucesso && (
          <div className="form-alert form-alert-success">
            {sucesso}
          </div>
        )}

        <section className="form-section">
          <div className="form-section-header">
            <h2>Dados pessoais</h2>
            <p>Informações principais do tutor.</p>
          </div>

          <div className="form-grid">
            <Campo
              label="Nome"
              name="nome"
              value={form.nome}
              onChange={atualizarCampo}
              required
              full
            />

            <Campo
              label="CPF"
              name="cpf"
              value={form.cpf}
              onChange={atualizarCampo}
              placeholder="000.000.000-00"
              maxLength={14}
            />

            <Campo
              label="Telefone"
              name="telefone"
              value={form.telefone}
              onChange={atualizarCampo}
              placeholder="(00) 00000-0000"
              maxLength={15}
              required
            />

            <Campo
              label="E-mail"
              name="email"
              type="email"
              value={form.email}
              onChange={atualizarCampo}
              placeholder="email@exemplo.com"
              full
            />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-header">
            <h2>Endereço</h2>
            <p>Endereço residencial do tutor.</p>
          </div>

          <div className="form-grid">
            <Campo
            label="CEP"
            name="cep"
            value={form.cep}
            onChange={atualizarCampo}
            onBlur={buscarCEP}
            placeholder="00000-000"
            maxLength={9}
            />
              {buscandoCep && (
                    <span className="cep-message">
                    Buscando endereço...
                    </span>
                )}

                {erroCep && (
                    <span className="cep-error">
                    {erroCep}
                    </span>
                )}
            <div />

            <Campo
              label="Endereço"
              name="endereco"
              value={form.endereco}
              onChange={atualizarCampo}
              required
              full
            />

            <Campo
              label="Número"
              name="numero"
              value={form.numero}
              onChange={atualizarCampo}
              inputRef={numeroRef}
            />

            <Campo
              label="Complemento"
              name="complemento"
              value={form.complemento}
              onChange={atualizarCampo}
            />

            <Campo
              label="Bairro"
              name="bairro"
              value={form.bairro}
              onChange={atualizarCampo}
            />

            <Campo
              label="Cidade"
              name="cidade"
              value={form.cidade}
              onChange={atualizarCampo}
            />

            <Campo
              label="Estado"
              name="estado"
              value={form.estado}
              onChange={atualizarCampo}
              placeholder="RS"
              maxLength={2}
            />
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-header">
            <h2>Observações</h2>
            <p>
              Informações adicionais sobre o tutor.
            </p>
          </div>

          <textarea
            className="form-textarea"
            name="observacoes"
            value={form.observacoes}
            onChange={atualizarCampo}
            rows="5"
            placeholder="Digite alguma observação, se necessário..."
          />
        </section>

        <div className="form-actions">
          <button
            type="button"
            className="cancel-button"
            onClick={() => navigate("/tutores")}
            disabled={salvando}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="save-button"
            disabled={salvando}
          >
            {salvando
                ? "Salvando..."
                : modoEdicao
                    ? "Salvar Alterações"
                    : "Salvar Tutor"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({
  label,
  name,
  value,
  onChange,
  onBlur,
  inputRef,
  type = "text",
  placeholder = "",
  required = false,
  full = false,
  maxLength,
}) {
  return (
    <div
      className={`form-field ${
        full ? "form-field-full" : ""
      }`}
    >
      <label htmlFor={name}>
        {label}
        {required && <span> *</span>}
      </label>

      <input
            ref={inputRef}
            id={name}
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            placeholder={placeholder}
            required={required}
            maxLength={maxLength}
        />
    </div>
  );
}

// Máscaras utilizadas apenas para apresentação/digitação.
// O backend não deve depender delas para validar os dados.
function formatarCPF(valor) {
  return valor
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatarTelefone(valor) {
  const numeros = valor
    .replace(/\D/g, "")
    .slice(0, 11);

  if (numeros.length <= 10) {
    return numeros
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return numeros
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function formatarCEP(valor) {
  return valor
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export default FormularioTutor;