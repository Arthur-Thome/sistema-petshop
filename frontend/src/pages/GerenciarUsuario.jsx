import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";
import ModalConfirmacaoSenha from "../components/ModalConfirmacaoSenha";

import "../styles/GerenciarUsuario.css";


function GerenciarUsuario() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");

  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [operacaoPendente, setOperacaoPendente] =
    useState(null);

  const [modalSenhaAberto, setModalSenhaAberto] =
    useState(false);

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarNovaSenha, setConfirmarNovaSenha] =
    useState("");

  const [mostrarNovaSenha, setMostrarNovaSenha] =
    useState(false);


  const carregarUsuario = useCallback(async () => {
    try {
      setCarregando(true);
      setErro("");

      const resposta = await api.get(
        `/usuarios/${id}`
      );

      setUsuario(resposta.data.usuario);
      setPerfil(resposta.data.usuario.perfil);
      setNome(resposta.data.usuario.nome);
      setEmail(resposta.data.usuario.email);
    } catch (erro) {
      console.error(
        "Erro ao carregar usuário:",
        erro
      );

      setErro(
        erro.response?.data?.mensagem ||
          "Não foi possível carregar o usuário."
      );
    } finally {
      setCarregando(false);
    }
  }, [id]);


  useEffect(() => {
    carregarUsuario();
  }, [carregarUsuario]);


  function formatarPerfil(valor) {
    const perfis = {
      administrador: "Administrador",
      gerente: "Gerente",
      funcionario: "Funcionário",
    };

    return perfis[valor] || valor;
  }


  function formatarData(data) {
    if (!data) {
      return "—";
    }

    return new Date(data).toLocaleString(
      "pt-BR"
    );
  }


  /*
   * Operações críticas não são executadas imediatamente.
   * Primeiro abrimos o modal para confirmar novamente
   * a senha do administrador autenticado.
   */
  function solicitarConfirmacao(operacao) {
    setErro("");
    setSucesso("");

    setOperacaoPendente(operacao);
    setModalSenhaAberto(true);
  }


  async function executarOperacao(senhaConfirmacao) {
    if (!operacaoPendente) {
      return;
    }

    try {
      setProcessando(true);
      setErro("");
      setSucesso("");

      const configuracao = {
        headers: {
          "X-Confirm-Password":
            senhaConfirmacao,
        },
      };

      if (operacaoPendente === "dados") {
        await api.patch(
          `/usuarios/${id}`,
          {
            nome: nome.trim(),
            email: email
              .trim()
              .toLowerCase(),
          },
          configuracao
        );

        setSucesso(
          "Nome e e-mail atualizados com sucesso."
        );
      }


      if (operacaoPendente === "perfil") {
        await api.patch(
          `/usuarios/${id}/perfil`,
          {
            perfil,
          },
          configuracao
        );

        setSucesso(
          "Perfil alterado com sucesso."
        );
      }


      if (operacaoPendente === "status") {
        await api.patch(
          `/usuarios/${id}/status`,
          {
            ativo: !usuario.ativo,
          },
          configuracao
        );

        setSucesso(
          usuario.ativo
            ? "Usuário desativado com sucesso."
            : "Usuário ativado com sucesso."
        );
      }


      if (operacaoPendente === "senha") {
        await api.patch(
          `/usuarios/${id}/senha`,
          {
            nova_senha: novaSenha,
          },
          configuracao
        );

        setNovaSenha("");
        setConfirmarNovaSenha("");

        setSucesso(
          "Senha redefinida com sucesso."
        );
      }


      setModalSenhaAberto(false);
      setOperacaoPendente(null);

      await carregarUsuario();
    } catch (erro) {
      console.error(
        "Erro na operação administrativa:",
        erro
      );

      setErro(
        erro.response?.data?.mensagem ||
          "Não foi possível concluir a operação."
      );
    } finally {
      setProcessando(false);
    }
  }

  function prepararAlteracaoDados() {
    setErro("");
    setSucesso("");

    const nomeTratado = nome.trim();
    const emailTratado = email
      .trim()
      .toLowerCase();


    if (!nomeTratado || !emailTratado) {
      setErro(
        "Nome e e-mail são obrigatórios."
      );

      return;
    }


    /*
    * Evita solicitar a senha do administrador quando
    * nenhum dado da conta realmente foi alterado.
    */
    if (
      nomeTratado === usuario.nome &&
      emailTratado === usuario.email.toLowerCase()
    ) {
      setErro(
        "Nenhuma alteração foi realizada nos dados da conta."
      );

      return;
    }


    solicitarConfirmacao("dados");
  }


  function prepararAlteracaoPerfil() {
    if (perfil === usuario.perfil) {
      setErro(
        "Selecione um perfil diferente do atual."
      );

      return;
    }

    solicitarConfirmacao("perfil");
  }


  function prepararRedefinicaoSenha() {
    setErro("");
    setSucesso("");


    if (novaSenha.length < 8) {
      setErro(
        "A nova senha deve possuir pelo menos 8 caracteres."
      );

      return;
    }


    if (
      novaSenha !==
      confirmarNovaSenha
    ) {
      setErro(
        "A confirmação da nova senha não corresponde."
      );

      return;
    }


    solicitarConfirmacao("senha");
  }


  if (carregando) {
    return (
      <div className="gerenciar-usuario-page">
        <p>Carregando usuário...</p>
      </div>
    );
  }


  if (!usuario) {
    return (
      <div className="gerenciar-usuario-page">

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate(
              "/administracao/usuarios"
            )
          }
        >
          ← Voltar
        </button>

        <div className="gerenciar-usuario-erro">
          {erro || "Usuário não encontrado."}
        </div>

      </div>
    );
  }


  return (
    <div className="gerenciar-usuario-page">

      <div className="gerenciar-usuario-navegacao">
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate(
              "/administracao/usuarios"
            )
          }
        >
          ← Voltar para usuários
        </button>
      </div>


      <header className="gerenciar-usuario-cabecalho">

        <div className="gerenciar-usuario-avatar">
          {usuario.nome
            ?.charAt(0)
            ?.toUpperCase() || "U"}
        </div>


        <div className="gerenciar-usuario-identidade">

          <span>
            CONTA DO SISTEMA
          </span>

          <h1>
            {usuario.nome}
          </h1>

          <p>
            {usuario.email}
          </p>

        </div>


        <div
          className={
            usuario.ativo
              ? "gerenciar-usuario-status gerenciar-usuario-status-ativo"
              : "gerenciar-usuario-status gerenciar-usuario-status-inativo"
          }
        >
          {usuario.ativo
            ? "● Ativo"
            : "● Inativo"}
        </div>

      </header>


      <div className="gerenciar-usuario-resumo">

        <div>
          <span>Perfil atual</span>

          <strong>
            {formatarPerfil(
              usuario.perfil
            )}
          </strong>
        </div>


        <div>
          <span>Cadastrado em</span>

          <strong>
            {formatarData(
              usuario.criado_em
            )}
          </strong>
        </div>


        <div>
          <span>Última alteração</span>

          <strong>
            {formatarData(
              usuario.atualizado_em
            )}
          </strong>
        </div>

      </div>


      {erro && (
        <div className="gerenciar-usuario-mensagem gerenciar-usuario-erro">
          {erro}
        </div>
      )}


      {sucesso && (
        <div className="gerenciar-usuario-mensagem gerenciar-usuario-sucesso">
          {sucesso}
        </div>
      )}


      <div className="gerenciar-usuario-paineis">
        <section className="gerenciar-usuario-painel gerenciar-usuario-painel-dados">

          <div className="gerenciar-usuario-painel-topo">
            <div>
              <span className="gerenciar-usuario-indice">
                DADOS
              </span>

              <h2>
                Identificação da conta
              </h2>
            </div>

            <span className="gerenciar-usuario-tag">
              CADASTRO
            </span>
          </div>


          <p>
            Altere o nome e o endereço de e-mail
            utilizados para identificar esta conta.
          </p>


          <div className="gerenciar-usuario-dados-grid">

            <div className="gerenciar-usuario-campo">
              <label htmlFor="nomeUsuario">
                Nome
              </label>

              <input
                id="nomeUsuario"
                type="text"
                value={nome}
                maxLength={150}
                onChange={(event) =>
                  setNome(event.target.value)
                }
              />
            </div>


            <div className="gerenciar-usuario-campo">
              <label htmlFor="emailUsuario">
                E-mail
              </label>

              <input
                id="emailUsuario"
                type="email"
                value={email}
                maxLength={255}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
              />
            </div>

          </div>


          <div className="gerenciar-usuario-dados-acoes">

            <button
              type="button"
              className="primary-button"
              disabled={
                processando ||
                (
                  nome.trim() === usuario.nome &&
                  email.trim().toLowerCase() ===
                    usuario.email.toLowerCase()
                )
              }
              onClick={prepararAlteracaoDados}
            >
              Salvar alterações
            </button>

          </div>

        </section>

        <section className="gerenciar-usuario-painel">

          <div className="gerenciar-usuario-painel-topo">
            <div>
              <span className="gerenciar-usuario-indice">
                01
              </span>

              <h2>
                Perfil de acesso
              </h2>
            </div>

            <span className="gerenciar-usuario-tag">
              PERMISSÕES
            </span>
          </div>


          <p>
            Define quais áreas e operações
            esta conta pode acessar.
          </p>


          <select
            value={perfil}
            onChange={(event) =>
              setPerfil(
                event.target.value
              )
            }
          >
            <option value="funcionario">
              Funcionário
            </option>

            <option value="gerente">
              Gerente
            </option>

            <option value="administrador">
              Administrador
            </option>
          </select>


          <button
            type="button"
            className="primary-button"
            disabled={
              processando ||
              perfil === usuario.perfil
            }
            onClick={
              prepararAlteracaoPerfil
            }
          >
            Alterar perfil
          </button>

        </section>


        <section className="gerenciar-usuario-painel">

          <div className="gerenciar-usuario-painel-topo">
            <div>
              <span className="gerenciar-usuario-indice">
                02
              </span>

              <h2>
                Estado da conta
              </h2>
            </div>

            <span className="gerenciar-usuario-tag">
              ACESSO
            </span>
          </div>


          <p>
            Contas desativadas não conseguem
            autenticar nem utilizar o sistema.
          </p>


          <div className="gerenciar-usuario-estado">
            <span>
              Estado atual
            </span>

            <strong>
              {usuario.ativo
                ? "Conta ativa"
                : "Conta desativada"}
            </strong>
          </div>


          <button
            type="button"
            className={
              usuario.ativo
                ? "gerenciar-usuario-botao-perigo"
                : "primary-button"
            }
            disabled={processando}
            onClick={() =>
              solicitarConfirmacao(
                "status"
              )
            }
          >
            {usuario.ativo
              ? "Desativar usuário"
              : "Ativar usuário"}
          </button>

        </section>


        <section className="gerenciar-usuario-painel gerenciar-usuario-painel-senha">

          <div className="gerenciar-usuario-painel-topo">
            <div>
              <span className="gerenciar-usuario-indice">
                03
              </span>

              <h2>
                Redefinição de senha
              </h2>
            </div>

            <span className="gerenciar-usuario-tag">
              SEGURANÇA
            </span>
          </div>


          <p>
            Defina uma nova senha diretamente.
            As sessões existentes desta conta
            serão invalidadas.
          </p>


          <div className="gerenciar-usuario-senha-grid">

            <div>
              <label htmlFor="novaSenha">
                Nova senha
              </label>

              <div className="gerenciar-usuario-input-senha">
                <input
                  id="novaSenha"
                  type={
                    mostrarNovaSenha
                      ? "text"
                      : "password"
                  }
                  value={novaSenha}
                  onChange={(event) =>
                    setNovaSenha(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  onClick={() =>
                    setMostrarNovaSenha(
                      (valor) => !valor
                    )
                  }
                >
                  {mostrarNovaSenha
                    ? "Ocultar"
                    : "Mostrar"}
                </button>
              </div>
            </div>


            <div>
              <label htmlFor="confirmarNovaSenha">
                Confirmar nova senha
              </label>

              <input
                id="confirmarNovaSenha"
                type="password"
                value={
                  confirmarNovaSenha
                }
                onChange={(event) =>
                  setConfirmarNovaSenha(
                    event.target.value
                  )
                }
                autoComplete="new-password"
              />
            </div>

          </div>


          <span className="gerenciar-usuario-ajuda">
            A senha deve possuir pelo menos
            8 caracteres.
          </span>


          <button
            type="button"
            className="primary-button"
            disabled={processando}
            onClick={
              prepararRedefinicaoSenha
            }
          >
            Redefinir senha
          </button>

        </section>

      </div>


      <ModalConfirmacaoSenha
        aberto={modalSenhaAberto}
        titulo="Confirmar operação"
        mensagem="Digite sua senha para confirmar esta alteração administrativa."
        processando={processando}
        onConfirmar={executarOperacao}
        onCancelar={() => {
          if (processando) {
            return;
          }

          setModalSenhaAberto(false);
          setOperacaoPendente(null);
        }}
      />

    </div>
  );
}


export default GerenciarUsuario;