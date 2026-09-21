import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import api from "../services/api";

import "../styles/Usuarios.css";


function Usuarios() {
  const navigate = useNavigate();

  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");


  /*
   * A listagem vem sempre do backend.
   * Não usamos os dados armazenados no navegador como fonte
   * de autorização ou de informações administrativas.
   */
  const carregarUsuarios = useCallback(async () => {
    try {
      setCarregando(true);
      setErro("");

      const resposta = await api.get(
        "/usuarios"
      );

      /*
       * Aceita tanto uma resposta contendo diretamente o array
       * quanto { usuarios: [...] }, facilitando a compatibilidade
       * com o formato atual da API.
       */
      const dados = Array.isArray(resposta.data)
        ? resposta.data
        : resposta.data.usuarios || [];

      setUsuarios(dados);
    } catch (erro) {
      console.error(
        "Erro ao carregar usuários:",
        erro
      );

      setErro(
        erro.response?.data?.mensagem ||
          "Não foi possível carregar os usuários."
      );
    } finally {
      setCarregando(false);
    }
  }, []);


  useEffect(() => {
    carregarUsuarios();
  }, [carregarUsuarios]);


  function formatarPerfil(perfil) {
    const perfis = {
      administrador: "Administrador",
      gerente: "Gerente",
      funcionario: "Funcionário",
    };

    return perfis[perfil] || perfil;
  }


  return (
    <div className="usuarios-page">

      <div className="usuarios-topo">
        <div>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate("/administracao")
            }
          >
            ← Voltar
          </button>

          <h1>
            Usuários
          </h1>

          <p>
            Gerencie as contas e permissões
            de acesso ao sistema.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() =>
            navigate(
              "/administracao/usuarios/novo"
            )
          }
        >
          + Novo usuário
        </button>
      </div>


      {erro && (
        <div className="usuarios-mensagem usuarios-mensagem-erro">
          {erro}
        </div>
      )}


      {carregando ? (
        <div className="usuarios-card">
          <p>
            Carregando usuários...
          </p>
        </div>
      ) : (
        <div className="usuarios-card">

          <div className="usuarios-tabela-container">
            <table className="usuarios-tabela">

              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>

                {usuarios.length === 0 ? (
                  <tr>
                    <td
                      colSpan="5"
                      className="usuarios-vazio"
                    >
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  usuarios.map((usuario) => (
                    <tr key={usuario.id}>

                      <td>
                        {usuario.nome}
                      </td>

                      <td>
                        {usuario.email}
                      </td>

                      <td>
                        {formatarPerfil(
                          usuario.perfil
                        )}
                      </td>

                      <td>
                        <span
                          className={
                            usuario.ativo
                              ? "usuarios-status usuarios-status-ativo"
                              : "usuarios-status usuarios-status-inativo"
                          }
                        >
                          {usuario.ativo
                            ? "Ativo"
                            : "Inativo"}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="usuarios-acao"
                          onClick={() =>
                            navigate(
                              `/administracao/usuarios/${usuario.id}`
                            )
                          }
                        >
                          Gerenciar
                        </button>
                      </td>

                    </tr>
                  ))
                )}

              </tbody>

            </table>
          </div>

        </div>
      )}

    </div>
  );
}


export default Usuarios;