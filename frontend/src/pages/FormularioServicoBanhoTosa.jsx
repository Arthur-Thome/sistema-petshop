import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/BanhoTosa.css";


function FormularioServicoBanhoTosa() {
  const navigate = useNavigate();
  const { id } = useParams();

  /*
   * Quando existe ID na URL, estamos editando.
   * Sem ID, estamos cadastrando um novo serviço.
   */
  const editando = Boolean(id);

  const [formData, setFormData] =
    useState({
      nome: "",
      descricao: "",
      valor: "",
      duracao_minutos: "",
    });

  const [carregando, setCarregando] =
    useState(editando);

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] =
    useState("");


  /*
   * Na edição, carregamos os dados atuais
   * diretamente do backend.
   */
  useEffect(() => {
    if (!editando) {
      return;
    }


    async function carregarServico() {
      try {
        setCarregando(true);
        setErro("");

        const resposta =
          await api.get(
            `/servicos/${id}`
          );


        const servico =
          resposta.data.servico ||
          resposta.data;


        setFormData({
          nome:
            servico.nome || "",

          descricao:
            servico.descricao || "",

          valor:
            servico.valor ?? "",

          duracao_minutos:
            servico.duracao_minutos ?? "",
        });

      } catch (error) {
        console.error(
          "Erro ao carregar serviço:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
          "Não foi possível carregar o serviço."
        );

      } finally {
        setCarregando(false);
      }
    }


    carregarServico();
  }, [id, editando]);


  function alterarCampo(event) {
    const {
      name,
      value,
    } = event.target;


    setFormData(
      (dadosAnteriores) => ({
        ...dadosAnteriores,
        [name]: value,
      })
    );
  }


  async function salvar(event) {
    event.preventDefault();


    if (!formData.nome.trim()) {
      setErro(
        "Informe o nome do serviço."
      );

      return;
    }


    if (
      formData.valor !== "" &&
      Number(formData.valor) < 0
    ) {
      setErro(
        "O valor não pode ser negativo."
      );

      return;
    }


    if (
      formData.duracao_minutos !== "" &&
      (
        !Number.isInteger(
          Number(
            formData.duracao_minutos
          )
        ) ||
        Number(
          formData.duracao_minutos
        ) <= 0
      )
    ) {
      setErro(
        "A duração deve ser um número inteiro maior que zero."
      );

      return;
    }


    const dados = {
      nome:
        formData.nome.trim(),

      descricao:
        formData.descricao.trim() ||
        null,

      valor:
        formData.valor === ""
          ? null
          : Number(
              formData.valor
            ),

      duracao_minutos:
        formData.duracao_minutos === ""
          ? null
          : Number(
              formData.duracao_minutos
            ),
    };


    try {
      setSalvando(true);
      setErro("");


      if (editando) {
        await api.put(
          `/servicos/${id}`,
          dados
        );

      } else {
        await api.post(
          "/servicos",
          dados
        );
      }


      navigate(
        "/banho-tosa/servicos"
      );

    } catch (error) {
      console.error(
        "Erro ao salvar serviço:",
        error
      );


      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível salvar o serviço."
      );

    } finally {
      setSalvando(false);
    }
  }


  if (carregando) {
    return (
      <div className="banho-tosa-page">

        <div className="banho-tosa-mensagem">
          Carregando...
        </div>

      </div>
    );
  }


  return (
    <div className="banho-tosa-page">

      <div className="banho-tosa-header">

        <div>
          <h1>
            {editando
              ? "Editar Serviço"
              : "Novo Serviço"}
          </h1>

          <p>
            {editando
              ? "Altere as informações do serviço."
              : "Cadastre um novo serviço para utilizar nos atendimentos."}
          </p>
        </div>


        <div className="banho-tosa-header-acoes">

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                "/banho-tosa/servicos"
              )
            }
            disabled={salvando}
          >
            Voltar
          </button>

        </div>

      </div>


      {erro && (
        <div className="banho-tosa-erro">
          {erro}
        </div>
      )}


      <div className="banho-tosa-form-card">

        <form onSubmit={salvar}>

          <div className="banho-tosa-form-campo">

            <label htmlFor="nome">
              Nome do serviço *
            </label>

            <input
              id="nome"
              name="nome"
              type="text"
              value={formData.nome}
              onChange={alterarCampo}
              placeholder="Ex.: Banho"
              required
            />

          </div>


          <div className="banho-tosa-form-campo">

            <label htmlFor="descricao">
              Descrição
            </label>

            <textarea
              id="descricao"
              name="descricao"
              value={formData.descricao}
              onChange={alterarCampo}
              placeholder="Descrição do serviço..."
              rows="4"
            />

          </div>


          <div className="banho-tosa-form-linha">

            <div className="banho-tosa-form-campo">

              <label htmlFor="valor">
                Valor
              </label>

              <input
                id="valor"
                name="valor"
                type="number"
                min="0"
                step="0.01"
                value={formData.valor}
                onChange={alterarCampo}
                placeholder="0,00"
              />

            </div>


            <div className="banho-tosa-form-campo">

              <label htmlFor="duracao_minutos">
                Duração aproximada
              </label>

              <input
                id="duracao_minutos"
                name="duracao_minutos"
                type="number"
                min="1"
                step="1"
                value={
                  formData.duracao_minutos
                }
                onChange={alterarCampo}
                placeholder="Minutos"
              />

            </div>

          </div>


          <div className="banho-tosa-form-acoes">

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                navigate(
                  "/banho-tosa/servicos"
                )
              }
              disabled={salvando}
            >
              Cancelar
            </button>


            <button
              type="submit"
              className="primary-button"
              disabled={salvando}
            >
              {salvando
                ? "Salvando..."
                : editando
                  ? "Salvar Alterações"
                  : "Cadastrar Serviço"}
            </button>

          </div>

        </form>

      </div>

    </div>
  );
}


export default FormularioServicoBanhoTosa;