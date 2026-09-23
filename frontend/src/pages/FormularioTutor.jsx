import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/FormularioTutor.css";


function FormularioTutor() {
  const navigate = useNavigate();

  const { id } = useParams();

  const [searchParams] =
    useSearchParams();


  const modoEdicao =
    Boolean(id);


  /*
   * Quando o cadastro é iniciado pela ficha de um Pet,
   * recebemos:
   *
   * /tutores/novo?pet=123
   *
   * Esse ID será utilizado somente no cadastro.
   */
  const petOrigemId =
    !modoEdicao
      ? searchParams.get("pet")
      : null;


  const numeroRef =
    useRef(null);


  const [
    carregando,
    setCarregando,
  ] = useState(modoEdicao);


  const [form, setForm] =
    useState({
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


  const [erro, setErro] =
    useState("");


  const [sucesso, setSucesso] =
    useState("");


  const [salvando, setSalvando] =
    useState(false);


  const [
    buscandoCep,
    setBuscandoCep,
  ] = useState(false);


  const [
    erroCep,
    setErroCep,
  ] = useState("");


  /*
   * Guarda informações básicas do Pet de origem.
   *
   * Isso permite mostrar claramente ao usuário que,
   * após o cadastro, o novo Tutor será vinculado
   * automaticamente àquele Pet.
   */
  const [
    petOrigem,
    setPetOrigem,
  ] = useState(null);


  /*
   * =====================================================
   * CARREGAMENTO DO TUTOR
   * =====================================================
   *
   * O mesmo formulário atende cadastro e edição.
   *
   * Quando existe um ID na rota, carregamos o cadastro
   * atual para edição.
   */
  useEffect(() => {
    if (!modoEdicao) {
      return;
    }


    async function carregarTutor() {
      try {
        setCarregando(true);

        setErro("");


        const resposta =
          await api.get(
            `/tutores/${id}`
          );


        const tutor =
          resposta.data;


        setForm({
          nome:
            tutor.nome || "",

          cpf:
            tutor.cpf || "",

          telefone:
            tutor.telefone || "",

          email:
            tutor.email || "",

          cep:
            tutor.cep || "",

          endereco:
            tutor.endereco || "",

          numero:
            tutor.numero || "",

          complemento:
            tutor.complemento || "",

          bairro:
            tutor.bairro || "",

          cidade:
            tutor.cidade || "",

          estado:
            tutor.estado || "",

          observacoes:
            tutor.observacoes || "",
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

  }, [
    id,
    modoEdicao,
  ]);


  /*
   * =====================================================
   * PET DE ORIGEM
   * =====================================================
   *
   * Se o cadastro começou através da ficha de um Pet,
   * buscamos esse Pet antes de permitir o vínculo
   * automático.
   *
   * O parâmetro recebido pela URL não é utilizado
   * cegamente.
   */
  useEffect(() => {
    if (
      modoEdicao ||
      !petOrigemId
    ) {
      setPetOrigem(null);

      return;
    }


    async function carregarPetOrigem() {
      try {
        const resposta =
          await api.get(
            `/pets/${petOrigemId}`
          );


        setPetOrigem(
          resposta.data.pet
        );

      } catch (error) {
        setPetOrigem(null);


        setErro(
          error.response?.data?.mensagem ||
            "O pet informado na origem não foi encontrado."
        );
      }
    }


    carregarPetOrigem();

  }, [
    modoEdicao,
    petOrigemId,
  ]);


  /*
   * Centraliza alterações dos campos.
   *
   * As máscaras existem apenas para melhorar a
   * experiência de digitação.
   *
   * A validação definitiva continua sendo realizada
   * pelo backend.
   */
  function atualizarCampo(event) {
    const {
      name,
      value,
    } = event.target;


    let novoValor =
      value;


    if (name === "cpf") {
      novoValor =
        formatarCPF(value);
    }


    if (name === "telefone") {
      novoValor =
        formatarTelefone(
          value
        );
    }


    if (name === "cep") {
      novoValor =
        formatarCEP(value);
    }


    if (name === "estado") {
      novoValor =
        value
          .replace(
            /[^a-zA-Z]/g,
            ""
          )
          .toUpperCase()
          .slice(0, 2);
    }


    setForm(
      (anterior) => ({
        ...anterior,

        [name]:
          novoValor,
      })
    );
  }


  /*
   * =====================================================
   * CONSULTA DO CEP
   * =====================================================
   *
   * Se a consulta falhar, os campos continuam
   * editáveis e podem ser preenchidos manualmente.
   */
  async function buscarCEP() {
    const cepNumeros =
      form.cep.replace(
        /\D/g,
        ""
      );


    if (
      cepNumeros.length !== 8
    ) {
      return;
    }


    try {
      setBuscandoCep(true);

      setErroCep("");


      const resposta =
        await fetch(
          `https://viacep.com.br/ws/${cepNumeros}/json/`
        );


      if (!resposta.ok) {
        throw new Error(
          "Erro ao consultar CEP."
        );
      }


      const dados =
        await resposta.json();


      if (dados.erro) {
        setErroCep(
          "CEP não encontrado."
        );

        return;
      }


      setForm(
        (anterior) => ({
          ...anterior,

          endereco:
            dados.logradouro ||
            "",

          bairro:
            dados.bairro ||
            "",

          cidade:
            dados.localidade ||
            "",

          estado:
            dados.uf ||
            "",
        })
      );


      /*
       * Depois que o CEP preenche o endereço,
       * direcionamos o usuário para o número.
       */
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


  /*
   * =====================================================
   * VOLTAR
   * =====================================================
   *
   * Se o cadastro começou pela ficha de um Pet,
   * cancelar ou voltar retorna para esse Pet.
   */
  function voltar() {
    if (
      !modoEdicao &&
      petOrigemId
    ) {
      navigate(
        `/pets/${petOrigemId}`
      );

      return;
    }


    if (modoEdicao) {
      navigate(
        `/tutores/${id}`
      );

      return;
    }


    navigate(
      "/tutores"
    );
  }


  /*
   * =====================================================
   * SALVAR TUTOR
   * =====================================================
   *
   * Existem três fluxos possíveis:
   *
   * 1. Editar Tutor existente.
   *
   * 2. Cadastrar Tutor normalmente.
   *
   * 3. Cadastrar Tutor a partir da ficha de um Pet.
   *
   * No terceiro caso:
   *
   * Tutor é criado
   *       ↓
   * relacionamento pet_tutores é criado
   *       ↓
   * usuário retorna para a ficha do Pet
   */
  async function salvarTutor(event) {
    event.preventDefault();


    setErro("");

    setSucesso("");


    if (!form.nome.trim()) {
      setErro(
        "Informe o nome do tutor."
      );

      return;
    }


    if (!form.telefone.trim()) {
      setErro(
        "Informe o telefone do tutor."
      );

      return;
    }


    if (!form.endereco.trim()) {
      setErro(
        "Informe o endereço do tutor."
      );

      return;
    }


    try {
      setSalvando(true);


      /*
       * =================================================
       * EDIÇÃO
       * =================================================
       */
      if (modoEdicao) {
        await api.put(
          `/tutores/${id}`,
          form
        );


        setSucesso(
          "Tutor atualizado com sucesso."
        );


        setTimeout(() => {
          navigate(
            `/tutores/${id}`
          );
        }, 800);


        return;
      }


      /*
       * =================================================
       * CADASTRO
       * =================================================
       */
      const resposta =
        await api.post(
          "/tutores",
          form
        );


      /*
       * O backend pode devolver o Tutor diretamente
       * ou dentro da propriedade tutor.
       *
       * Aceitamos os dois formatos para manter o
       * frontend compatível com a resposta atual.
       */
      const tutorCriado =
        resposta.data.tutor ||
        resposta.data;


      const tutorCriadoId =
        tutorCriado?.id;


      if (!tutorCriadoId) {
        throw new Error(
          "O tutor foi cadastrado, mas a API não retornou o ID do novo cadastro."
        );
      }


      /*
       * =================================================
       * CADASTRO INICIADO PELO PET
       * =================================================
       *
       * Se existe um Pet de origem válido, criamos
       * imediatamente o relacionamento.
       */
      if (
        petOrigemId &&
        petOrigem
      ) {
        try {
          await api.post(
            `/pets/${petOrigemId}/tutores`,
            {
              tutor_id:
                Number(
                  tutorCriadoId
                ),
            }
          );

        } catch (erroVinculo) {
          /*
           * Neste ponto o Tutor JÁ FOI CADASTRADO.
           *
           * Portanto não informamos simplesmente que
           * "o cadastro falhou", pois isso induziria
           * o usuário a tentar cadastrá-lo novamente.
           */
          setErro(
            erroVinculo.response?.data?.mensagem ||
              "O tutor foi cadastrado, mas não foi possível vinculá-lo ao pet."
          );


          setSucesso(
            "O cadastro do tutor foi concluído. O vínculo com o pet precisa ser feito manualmente."
          );


          return;
        }


        setSucesso(
          `Tutor cadastrado e vinculado a ${petOrigem.nome} com sucesso.`
        );


        setTimeout(() => {
          navigate(
            `/pets/${petOrigemId}`
          );
        }, 800);


        return;
      }


      /*
       * Cadastro normal, iniciado pela área de Tutores.
       */
      setSucesso(
        "Tutor cadastrado com sucesso."
      );


      setTimeout(() => {
        navigate(
          `/tutores/${tutorCriadoId}`
        );
      }, 800);

    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          error.message ||
          (
            modoEdicao
              ? "Não foi possível atualizar o tutor."
              : "Não foi possível cadastrar o tutor."
          )
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
            {modoEdicao
              ? "Editar Tutor"
              : "Novo Tutor"}
          </h1>


          <p>
            {modoEdicao
              ? "Atualize os dados do responsável."
              : petOrigem
                ? `Cadastre um novo responsável para ${petOrigem.nome}.`
                : "Cadastre os dados do responsável pelo pet."}
          </p>
        </div>


        <button
          type="button"
          className="back-button"
          onClick={voltar}
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


        {/*
         * Mostra claramente quando o cadastro está
         * associado a um Pet específico.
         */}
        {!modoEdicao &&
          petOrigem && (
            <div className="tutor-pet-origin">

              <div>
                <span>
                  Pet selecionado
                </span>

                <strong>
                  {petOrigem.nome}
                </strong>
              </div>


              <p>
                Após salvar, este tutor será
                vinculado automaticamente ao pet.
              </p>

            </div>
          )}


        <section className="form-section">

          <div className="form-section-header">
            <h2>
              Dados pessoais
            </h2>

            <p>
              Informações principais do tutor.
            </p>
          </div>


          <div className="form-grid">

            <Campo
              label="Nome"
              name="nome"
              value={form.nome}
              onChange={
                atualizarCampo
              }
              required
              full
            />


            <Campo
              label="CPF"
              name="cpf"
              value={form.cpf}
              onChange={
                atualizarCampo
              }
              placeholder="000.000.000-00"
              maxLength={14}
            />


            <Campo
              label="Telefone"
              name="telefone"
              value={form.telefone}
              onChange={
                atualizarCampo
              }
              placeholder="(00) 00000-0000"
              maxLength={15}
              required
            />


            <Campo
              label="E-mail"
              name="email"
              type="email"
              value={form.email}
              onChange={
                atualizarCampo
              }
              placeholder="email@exemplo.com"
              full
            />

          </div>

        </section>


        <section className="form-section">

          <div className="form-section-header">
            <h2>
              Endereço
            </h2>

            <p>
              Endereço residencial do tutor.
            </p>
          </div>


          <div className="form-grid">

            <Campo
              label="CEP"
              name="cep"
              value={form.cep}
              onChange={
                atualizarCampo
              }
              onBlur={
                buscarCEP
              }
              placeholder="00000-000"
              maxLength={9}
            />


            <div className="cep-status">
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
            </div>


            <Campo
              label="Endereço"
              name="endereco"
              value={form.endereco}
              onChange={
                atualizarCampo
              }
              required
              full
            />


            <Campo
              label="Número"
              name="numero"
              value={form.numero}
              onChange={
                atualizarCampo
              }
              inputRef={
                numeroRef
              }
            />


            <Campo
              label="Complemento"
              name="complemento"
              value={
                form.complemento
              }
              onChange={
                atualizarCampo
              }
            />


            <Campo
              label="Bairro"
              name="bairro"
              value={form.bairro}
              onChange={
                atualizarCampo
              }
            />


            <Campo
              label="Cidade"
              name="cidade"
              value={form.cidade}
              onChange={
                atualizarCampo
              }
            />


            <Campo
              label="Estado"
              name="estado"
              value={form.estado}
              onChange={
                atualizarCampo
              }
              placeholder="RS"
              maxLength={2}
            />

          </div>

        </section>


        <section className="form-section">

          <div className="form-section-header">
            <h2>
              Observações
            </h2>

            <p>
              Informações adicionais sobre o tutor.
            </p>
          </div>


          <textarea
            className="form-textarea"
            name="observacoes"
            value={
              form.observacoes
            }
            onChange={
              atualizarCampo
            }
            rows="5"
            placeholder="Digite alguma observação, se necessário..."
          />

        </section>


        <div className="form-actions">

          <button
            type="button"
            className="cancel-button"
            onClick={voltar}
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
              ? petOrigem
                ? "Salvando e vinculando..."
                : "Salvando..."
              : modoEdicao
                ? "Salvar Alterações"
                : petOrigem
                  ? "Salvar e Vincular"
                  : "Salvar Tutor"}
          </button>

        </div>

      </form>

    </div>
  );
}


/*
 * Campo reutilizável utilizado para manter a estrutura
 * visual dos inputs do formulário.
 */
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
        full
          ? "form-field-full"
          : ""
      }`}
    >

      <label htmlFor={name}>
        {label}

        {required && (
          <span> *</span>
        )}
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


/*
 * Máscaras utilizadas somente para apresentação.
 *
 * O backend não deve depender dessas máscaras para
 * realizar a validação dos dados.
 */
function formatarCPF(valor) {
  return valor
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(
      /(\d{3})(\d)/,
      "$1.$2"
    )
    .replace(
      /(\d{3})(\d)/,
      "$1.$2"
    )
    .replace(
      /(\d{3})(\d{1,2})$/,
      "$1-$2"
    );
}


function formatarTelefone(valor) {
  const numeros =
    valor
      .replace(/\D/g, "")
      .slice(0, 11);


  if (
    numeros.length <= 10
  ) {
    return numeros
      .replace(
        /(\d{2})(\d)/,
        "($1) $2"
      )
      .replace(
        /(\d{4})(\d)/,
        "$1-$2"
      );
  }


  return numeros
    .replace(
      /(\d{2})(\d)/,
      "($1) $2"
    )
    .replace(
      /(\d{5})(\d)/,
      "$1-$2"
    );
}


function formatarCEP(valor) {
  return valor
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(
      /(\d{5})(\d)/,
      "$1-$2"
    );
}


export default FormularioTutor;