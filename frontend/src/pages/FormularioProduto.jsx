import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../services/api";

import "../styles/FormularioProduto.css";


function FormularioProduto() {
  const navigate = useNavigate();

  const { id } = useParams();

  const modoEdicao = Boolean(id);

  const [form, setForm] = useState({
    nome: "",
    categoria: "",
    descricao: "",
    unidade: "unidade",
    outraUnidade: "",
    valor_unitario: "",
    quantidade_atual: "",
    quantidade_minima: "",
    observacoes: "",
  });

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] =
    useState("");

  useEffect(() => {
  if (!modoEdicao) {
    return;
  }


  async function carregarProduto() {
    try {
      const resposta =
        await api.get(`/produtos/${id}`);

      const produto =
        resposta.data.produto;


      const unidadesPadrao = [
        "unidade",
        "caixa",
        "pacote",
      ];


      const unidadePadrao =
        unidadesPadrao.includes(
          produto.unidade
        );


      setForm({
        nome:
          produto.nome || "",

        categoria:
          produto.categoria || "",

        descricao:
          produto.descricao || "",

        unidade:
          unidadePadrao
            ? produto.unidade
            : "outro",

        outraUnidade:
          unidadePadrao
            ? ""
            : produto.unidade || "",

        valor_unitario:
          produto.valor_unitario ?? "",

        /*
         * Mantemos a quantidade no estado somente
         * porque o formulário também serve para cadastro.
         * Ela NÃO será enviada durante uma edição.
         */
        quantidade_atual:
          produto.quantidade_atual ?? 0,

        quantidade_minima:
          produto.quantidade_minima ?? 0,

        observacoes:
          produto.observacoes || "",
      });

    } catch (error) {
      console.error(
        "Erro ao carregar produto:",
        error
      );

      setErro(
        "Não foi possível carregar o produto."
      );
    }
  }


  carregarProduto();

}, [id, modoEdicao]);


  function alterarCampo(event) {
    const {
      name,
      value,
    } = event.target;

    setForm((anterior) => ({
      ...anterior,
      [name]: value,
    }));
  }


async function salvarProduto(event) {
  event.preventDefault();

  try {
    setSalvando(true);
    setErro("");


    /*
     * Se o usuário escolher "Outro", usamos o texto
     * informado manualmente.
     */
    const unidadeFinal =
      form.unidade === "outro"
        ? form.outraUnidade.trim()
        : form.unidade;


    if (!unidadeFinal) {
      setErro(
        "Informe a unidade de controle."
      );

      return;
    }


    /*
     * -------------------------------------------------
     * MODO EDIÇÃO
     * -------------------------------------------------
     *
     * Quando existe um ID na URL, estamos editando
     * um produto já existente.
     *
     * IMPORTANTE:
     * quantidade_atual NÃO é enviada.
     * Alterações no estoque precisam ser feitas pela
     * tela de Entrada/Saída para gerar histórico.
     */
    if (modoEdicao) {

      const dadosEdicao = {
        nome: form.nome,

        categoria:
          form.categoria,

        descricao:
          form.descricao,

        unidade:
          unidadeFinal,

        valor_unitario:
          form.valor_unitario === ""
            ? null
            : Number(
                form.valor_unitario
              ),

        quantidade_minima:
          Number(
            form.quantidade_minima || 0
          ),

        observacoes:
          form.observacoes,
      };


      const resposta =
        await api.put(
          `/produtos/${id}`,
          dadosEdicao
        );


      /*
       * Depois de salvar, voltamos para
       * a ficha do produto.
       */
      navigate(
        `/produtos/${resposta.data.produto.id}`
      );

      return;
    }


    /*
     * -------------------------------------------------
     * MODO CADASTRO
     * -------------------------------------------------
     *
     * Aqui estamos criando um produto novo.
     * Por isso quantidade_atual pode ser informada.
     */
    const dadosCadastro = {
      nome:
        form.nome,

      categoria:
        form.categoria,

      descricao:
        form.descricao,

      unidade:
        unidadeFinal,

      valor_unitario:
        form.valor_unitario === ""
          ? null
          : Number(
              form.valor_unitario
            ),

      quantidade_atual:
        Number(
          form.quantidade_atual || 0
        ),

      quantidade_minima:
        Number(
          form.quantidade_minima || 0
        ),

      observacoes:
        form.observacoes,
    };


    const resposta =
      await api.post(
        "/produtos",
        dadosCadastro
      );


    navigate(
      `/produtos/${resposta.data.produto.id}`
    );

  } catch (error) {

    console.error(
      modoEdicao
        ? "Erro ao editar produto:"
        : "Erro ao cadastrar produto:",
      error
    );


    setErro(
      error.response?.data?.mensagem ||
      (
        modoEdicao
          ? "Não foi possível editar o produto."
          : "Não foi possível cadastrar o produto."
      )
    );

  } finally {

    setSalvando(false);

  }
}


  return (
    <div className="form-produto-page">

      <div className="form-produto-header">

        <div>
          <h1>
            {modoEdicao
              ? "Editar Produto"
              : "Novo Produto"}
          </h1>

          <p>
            {modoEdicao
              ? "Atualize as informações cadastrais do produto."
              : "Cadastre um produto utilizado nas atividades do pet shop."}
          </p>
        </div>

      </div>


      <form
        className="form-produto"
        onSubmit={salvarProduto}
      >

        {erro && (
          <div className="form-produto-erro">
            {erro}
          </div>
        )}


        <div className="form-group">

          <label>
            Nome *
          </label>

          <input
            type="text"
            name="nome"
            value={form.nome}
            onChange={alterarCampo}
            required
            placeholder="Ex.: Shampoo Neutro 5L"
          />

        </div>


        <div className="form-group">

          <label>
            Categoria
          </label>

          <input
            type="text"
            name="categoria"
            value={form.categoria}
            onChange={alterarCampo}
            placeholder="Ex.: Higiene"
          />

        </div>


        <div className="form-group">

          <label>
            Descrição
          </label>

          <textarea
            name="descricao"
            value={form.descricao}
            onChange={alterarCampo}
            rows="3"
          />

        </div>


        <div className="form-grid">

          <div className="form-group">

            <label>
              Unidade de controle *
            </label>

            <select
              name="unidade"
              value={form.unidade}
              onChange={alterarCampo}
            >
              <option value="unidade">
                Unidade
              </option>

              <option value="caixa">
                Caixa
              </option>

              <option value="pacote">
                Pacote
              </option>

              <option value="outro">
                Outro
              </option>
            </select>

          </div>


          {form.unidade === "outro" && (

            <div className="form-group">

              <label>
                Qual unidade? *
              </label>

              <input
                type="text"
                name="outraUnidade"
                value={form.outraUnidade}
                onChange={alterarCampo}
                placeholder="Ex.: rolo"
              />

            </div>

          )}

        </div>


        <div className="form-grid">
          {!modoEdicao && (
            <div className="form-group">

              <label>
                Quantidade inicial
              </label>

              <input
                type="number"
                name="quantidade_atual"
                min="0"
                step="1"
                value={form.quantidade_atual}
                onChange={alterarCampo}
                placeholder="0"
              />
          
            </div>
          )}


          <div className="form-group">

            <label>
              Quantidade mínima
            </label>

            <input
              type="number"
              name="quantidade_minima"
              min="0"
              step="1"
              value={form.quantidade_minima}
              onChange={alterarCampo}
              placeholder="0"
            />

          </div>

        </div>


        <div className="form-group">

          <label>
            Valor unitário
            <span className="campo-opcional">
              {" "}(opcional)
            </span>
          </label>

          <input
            type="number"
            name="valor_unitario"
            min="0"
            step="0.01"
            value={form.valor_unitario}
            onChange={alterarCampo}
            placeholder="0,00"
          />

        </div>


        <div className="form-group">

          <label>
            Observações
          </label>

          <textarea
            name="observacoes"
            value={form.observacoes}
            onChange={alterarCampo}
            rows="4"
          />

        </div>


        <div className="form-produto-acoes">

          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              navigate(
                modoEdicao
                  ? `/produtos/${id}`
                  : "/produtos"
              )
            }
          >
            Cancelar
          </button>


          <button
            type="submit"
            className="btn-primary"
            disabled={salvando}
          >
            {salvando
              ? "Salvando..."
              : modoEdicao
                ? "Salvar Alterações"
                : "Cadastrar Produto"}
          </button>

        </div>

      </form>

    </div>
  );
}


export default FormularioProduto;