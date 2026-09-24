import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/BanhoTosa.css";


function ComprovanteBanhoTosa() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [atendimento, setAtendimento] =
    useState(null);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");

  const [pix, setPix] =
    useState(null);

  const [carregandoPix, setCarregandoPix] =
    useState(false);

  const [erroPix, setErroPix] =
    useState("");

  const [pixCopiado, setPixCopiado] =
    useState(false);

  /*
   * Controla separadamente a geração do PDF.
   *
   * Isso impede múltiplos downloads simultâneos caso
   * o operador clique várias vezes no botão.
   */
  const [gerandoPdf, setGerandoPdf] =
    useState(false);


  /*
   * Sempre buscamos os dados atuais diretamente
   * do backend para montar o comprovante.
   *
   * Os valores dos serviços vêm do snapshot salvo
   * no momento do agendamento, portanto alterações
   * futuras no cadastro não modificam este documento.
   */
  useEffect(() => {
    async function carregarAtendimento() {
      try {
        setCarregando(true);
        setErro("");

        const resposta =
          await api.get(
            `/atendimentos/${id}`
          );

        setAtendimento(
          resposta.data.atendimento ||
          resposta.data
        );
      } catch (error) {
        console.error(
          "Erro ao carregar comprovante:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
          "Não foi possível carregar o comprovante."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregarAtendimento();
  }, [id]);


  useEffect(() => {
    /*
     * Não tentamos gerar cobrança para pagamentos
     * já concluídos ou cancelados.
     */
    if (
      atendimento?.pagamento_status ===
      "PENDENTE"
    ) {
      carregarPix();
    }
  }, [
    atendimento?.pagamento_status,
    id,
  ]);


  function formatarDataHora(data) {
    if (!data) {
      return "-";
    }

    return new Date(data).toLocaleString(
      "pt-BR",
      {
        dateStyle: "short",
        timeStyle: "short",
      }
    );
  }


  function formatarValor(valor) {
    return Number(
      valor || 0
    ).toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL",
      }
    );
  }


  function formatarMetodo(metodo) {
    const metodos = {
      PIX: "Pix",
      DINHEIRO: "Dinheiro",
      CARTAO_DEBITO:
        "Cartão de Débito",
      CARTAO_CREDITO:
        "Cartão de Crédito",
    };

    return (
      metodos[metodo] ||
      metodo ||
      "-"
    );
  }


  function formatarStatusPagamento(status) {
    const statusPagamento = {
      PENDENTE: "Pendente",
      PAGO: "Pago",
      CANCELADO: "Cancelado",
    };

    return (
      statusPagamento[status] ||
      status ||
      "Pendente"
    );
  }


  /*
   * Busca o QR Code e o Pix Copia e Cola somente
   * quando o pagamento ainda estiver pendente.
   *
   * O valor é definido pelo backend e nunca pelo
   * navegador.
   */
  async function carregarPix() {
    try {
      setCarregandoPix(true);
      setErroPix("");

      const resposta =
        await api.get(
          `/atendimentos/${id}/pix`
        );

      setPix(
        resposta.data.pix
      );
    } catch (error) {
      console.error(
        "Erro ao carregar Pix:",
        error
      );

      setErroPix(
        error.response?.data?.mensagem ||
        "Não foi possível gerar o Pix."
      );
    } finally {
      setCarregandoPix(false);
    }
  }


  /*
   * Copia o payload completo para que o cliente
   * também possa utilizar o Pix Copia e Cola.
   */
  async function copiarPix() {
    if (!pix?.copia_cola) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        pix.copia_cola
      );

      setPixCopiado(true);

      setTimeout(() => {
        setPixCopiado(false);
      }, 2000);
    } catch (error) {
      console.error(
        "Erro ao copiar Pix:",
        error
      );

      setErroPix(
        "Não foi possível copiar o código Pix."
      );
    }
  }


  /*
   * Solicita ao backend o comprovante oficial.
   *
   * responseType "blob" é necessário porque a resposta
   * não é JSON: ela contém os bytes do arquivo PDF.
   *
   * O axios configurado no projeto continua enviando
   * normalmente o JWT de autenticação.
   */
  async function baixarPdf() {
    try {
      setGerandoPdf(true);
      setErro("");

      const resposta =
        await api.get(
          `/atendimentos/${id}/comprovante/pdf`,
          {
            responseType: "blob",
          }
        );

      /*
       * Criamos uma URL temporária apontando para os
       * bytes recebidos e simulamos um clique em um link.
       *
       * Assim o navegador baixa o arquivo sem abrir uma
       * nova página e sem expor o token na URL.
       */
      const arquivo =
        new Blob(
          [resposta.data],
          {
            type: "application/pdf",
          }
        );

      const url =
        window.URL.createObjectURL(
          arquivo
        );

      const link =
        document.createElement("a");

      link.href = url;

      link.download =
        `Comprovante de Atendimento do ${atendimento.pet_nome}.pdf`;

      document.body.appendChild(
        link
      );

      link.click();

      document.body.removeChild(
        link
      );

      window.URL.revokeObjectURL(
        url
      );
    } catch (error) {
      console.error(
        "Erro ao baixar PDF:",
        error
      );

      /*
       * Como responseType é blob, respostas de erro do
       * backend também podem chegar como Blob.
       *
       * Tentamos recuperar a mensagem JSON antes de usar
       * uma mensagem genérica.
       */
      let mensagem =
        "Não foi possível gerar o PDF do comprovante.";

      const dadosErro =
        error.response?.data;

      if (dadosErro instanceof Blob) {
        try {
          const texto =
            await dadosErro.text();

          const json =
            JSON.parse(texto);

          if (json.mensagem) {
            mensagem =
              json.mensagem;
          }
        } catch {
          // Mantemos a mensagem genérica.
        }
      } else if (
        dadosErro?.mensagem
      ) {
        mensagem =
          dadosErro.mensagem;
      }

      setErro(mensagem);
    } finally {
      setGerandoPdf(false);
    }
  }


  /*
   * Mantemos a impressão do navegador como recurso
   * independente do PDF oficial gerado pelo backend.
   */
  function imprimirComprovante() {
    window.print();
  }


  /*
   * Abre a conversa do WhatsApp utilizando o telefone
   * cadastrado no tutor e prepara uma mensagem referente
   * ao atendimento.
   *
   * Nesta versão o WhatsApp é aberto pelo navegador.
   * O PDF deve ser anexado manualmente na conversa.
   */
  function enviarWhatsApp() {
    const telefone =
      atendimento?.tutor_telefone;

    if (!telefone) {
      alert(
        "O tutor não possui telefone cadastrado."
      );

      return;
    }

    /*
     * O WhatsApp espera somente números.
     *
     * Como o sistema é utilizado no Brasil, adicionamos
     * o código do país 55 caso ainda não esteja presente.
     */
    let numero =
      String(telefone).replace(
        /\D/g,
        ""
      );

    if (!numero.startsWith("55")) {
      numero = `55${numero}`;
    }

    const nomeTutor =
      atendimento.tutor_nome ||
      "cliente";

    const nomePet =
      atendimento.pet_nome ||
      "pet";

    const mensagem =
      `Olá, ${nomeTutor}! 😊\n\n` +
      `O atendimento de ${nomePet} foi concluído.\n\n` +
      `Segue o comprovante referente aos serviços realizados.\n\n` +
      `Agradecemos pela preferência!`;

    const url =
      `https://wa.me/${numero}` +
      `?text=${encodeURIComponent(
        mensagem
      )}`;

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  }


  if (carregando) {
    return (
      <div className="banho-tosa-page">

        <div className="banho-tosa-mensagem">
          Carregando comprovante...
        </div>

      </div>
    );
  }


  if (!atendimento) {
    return (
      <div className="banho-tosa-page">

        <div className="banho-tosa-erro">
          {erro ||
            "Atendimento não encontrado."}
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate("/atendimentos")
          }
        >
          Voltar
        </button>

      </div>
    );
  }


  return (
    <div className="banho-tosa-page">

      <div className="banho-tosa-header">

        <div>
          <h1>Comprovante</h1>

          <p>
            Comprovante do atendimento
            e dos serviços contratados.
          </p>
        </div>


        <div className="banho-tosa-header-acoes">

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                `/atendimentos/${id}`
              )
            }
          >
            Voltar
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={baixarPdf}
            disabled={gerandoPdf}
          >
            {gerandoPdf
              ? "Gerando PDF..."
              : "Baixar PDF"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={imprimirComprovante}
          >
            Imprimir
          </button>

          {atendimento.status ===
            "FINALIZADO" &&
            atendimento.tutor_telefone && (

              <button
                type="button"
                className="secondary-button"
                onClick={enviarWhatsApp}
              >
                Enviar pelo WhatsApp
              </button>

            )}

        </div>

      </div>


      {erro && (
        <div className="banho-tosa-erro">
          {erro}
        </div>
      )}


      <div className="banho-tosa-comprovante">

        <div className="banho-tosa-comprovante-cabecalho">

          <div className="banho-tosa-comprovante-logo">
            🐾
          </div>


          <div>
            <h2>
              Sistema Pet Shop
            </h2>

            <span>
              Comprovante de Atendimento
            </span>
          </div>


          <div className="banho-tosa-comprovante-numero">

            <span>
              Atendimento
            </span>

            <strong>
              #{atendimento.id}
            </strong>

          </div>

        </div>


        <div className="banho-tosa-comprovante-secao">

          <h3>
            Cliente e Pet
          </h3>


          <div className="banho-tosa-comprovante-grid">

            <div>
              <span>Tutor</span>

              <strong>
                {atendimento.tutor_nome}
              </strong>
            </div>


            <div>
              <span>Telefone</span>

              <strong>
                {atendimento.tutor_telefone ||
                  "-"}
              </strong>
            </div>


            <div>
              <span>Pet</span>

              <strong>
                {atendimento.pet_nome}
              </strong>
            </div>


            <div>
              <span>Agendamento</span>

              <strong>
                {formatarDataHora(
                  atendimento.agendado_para
                )}
              </strong>
            </div>

          </div>

        </div>


        <div className="banho-tosa-comprovante-secao">

          <h3>Serviços</h3>


          <div className="banho-tosa-comprovante-tabela">

            <div className="banho-tosa-comprovante-tabela-cabecalho">

              <span>Serviço</span>

              <span>Duração</span>

              <span>Valor</span>

            </div>


            {(atendimento.servicos || []).map(
              (servico) => (

                <div
                  className="banho-tosa-comprovante-tabela-linha"
                  key={servico.id}
                >

                  <strong>
                    {servico.nome}
                  </strong>


                  <span>
                    {servico.duracao_minutos
                      ? `${servico.duracao_minutos} min`
                      : "-"}
                  </span>


                  <strong>
                    {formatarValor(
                      servico.valor
                    )}
                  </strong>

                </div>

              )
            )}

          </div>


          <div className="banho-tosa-comprovante-total">

            <span>
              Total
            </span>

            <strong>
              {formatarValor(
                atendimento.valor_total
              )}
            </strong>

          </div>

        </div>


        <div className="banho-tosa-comprovante-secao">

          <h3>Pagamento</h3>


          <div className="banho-tosa-comprovante-grid">

            {atendimento.pagamento_status ===
              "PENDENTE" && (

              <div className="banho-tosa-pix">

                <div className="banho-tosa-pix-titulo">

                  <h4>
                    Pagamento via Pix
                  </h4>

                  <p>
                    Escaneie o QR Code com o
                    aplicativo do seu banco ou utilize
                    o Pix Copia e Cola.
                  </p>

                </div>


                {carregandoPix && (

                  <div className="banho-tosa-mensagem">
                    Gerando Pix...
                  </div>

                )}


                {erroPix && (

                  <div className="banho-tosa-erro">
                    {erroPix}
                  </div>

                )}


                {pix && !carregandoPix && (

                  <>
                    <div className="banho-tosa-pix-conteudo">

                      <div className="banho-tosa-pix-qrcode">

                        <img
                          src={pix.qr_code}
                          alt="QR Code para pagamento via Pix"
                        />

                      </div>


                      <div className="banho-tosa-pix-informacoes">

                        <div>
                          <span>
                            Valor
                          </span>

                          <strong className="banho-tosa-pix-valor">
                            {formatarValor(
                              pix.valor
                            )}
                          </strong>
                        </div>


                        <div>
                          <span>
                            Identificação
                          </span>

                          <strong>
                            {pix.txid}
                          </strong>
                        </div>

                      </div>

                    </div>


                    <div className="banho-tosa-pix-copia-cola">

                      <label>
                        Pix Copia e Cola
                      </label>

                      <textarea
                        value={pix.copia_cola}
                        readOnly
                        rows="4"
                      />


                      <button
                        type="button"
                        className="secondary-button"
                        onClick={copiarPix}
                      >
                        {pixCopiado
                          ? "Código copiado!"
                          : "Copiar código Pix"}
                      </button>

                    </div>
                  </>

                )}

              </div>

            )}


            <div>
              <span>Status</span>

              <strong>
                {formatarStatusPagamento(
                  atendimento.pagamento_status
                )}
              </strong>
            </div>


            {atendimento.pagamento_metodo && (

              <div>
                <span>
                  Forma de pagamento
                </span>

                <strong>
                  {formatarMetodo(
                    atendimento.pagamento_metodo
                  )}
                </strong>
              </div>

            )}


            {atendimento.pagamento_pago_em && (

              <div>
                <span>Pago em</span>

                <strong>
                  {formatarDataHora(
                    atendimento
                      .pagamento_pago_em
                  )}
                </strong>
              </div>

            )}

          </div>

        </div>


        {atendimento.observacoes_atendimento && (

          <div className="banho-tosa-comprovante-secao">

            <h3>
              Observações do Atendimento
            </h3>

            <p className="banho-tosa-comprovante-observacao">
              {
                atendimento
                  .observacoes_atendimento
              }
            </p>

          </div>

        )}


        <div className="banho-tosa-comprovante-rodape">

          <p>
            Documento interno referente aos
            serviços realizados.
          </p>

          <span>
            Este documento não substitui
            documento fiscal.
          </span>

        </div>

      </div>

    </div>
  );
}


export default ComprovanteBanhoTosa;