import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/FormularioPet.css";

import SeletorTutor
  from "../components/SeletorTutor";


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

  const [searchParams] =
    useSearchParams();


  /*
   * A presença do ID determina se estamos cadastrando
   * um novo Pet ou editando um Pet existente.
   */
  const modoEdicao =
    Boolean(id);


  /*
   * Quando o cadastro é iniciado pela ficha de um Tutor,
   * recebemos o ID através da URL:
   *
   * /pets/novo?tutor=123
   *
   * Esse parâmetro é utilizado somente no cadastro.
   */
  const tutorOrigemId =
    !modoEdicao
      ? searchParams.get("tutor")
      : null;


  const [form, setForm] =
    useState(formInicial);


  const [tutores, setTutores] =
    useState([]);


  const [
    carregandoTutores,
    setCarregandoTutores,
  ] = useState(!modoEdicao);


  const [salvando, setSalvando] =
    useState(false);


  const [erro, setErro] =
    useState("");


  const [sucesso, setSucesso] =
    useState("");


  const [
    carregandoPet,
    setCarregandoPet,
  ] = useState(modoEdicao);


  /*
   * Arquivo selecionado pelo usuário.
   *
   * Ele permanece somente no navegador até que
   * seja enviado ao backend.
   */
  const [
    arquivoFoto,
    setArquivoFoto,
  ] = useState(null);


  /*
   * URL temporária utilizada para mostrar a nova
   * imagem antes do upload.
   */
  const [
    previewFoto,
    setPreviewFoto,
  ] = useState("");


  /*
   * Caminho da foto que já está armazenada
   * no backend.
   */
  const [
    fotoAtual,
    setFotoAtual,
  ] = useState("");


  /*
   * Guarda o Tutor de origem quando o cadastro
   * do Pet foi iniciado diretamente pela ficha
   * desse Tutor.
   */
  const [
    tutorOrigem,
    setTutorOrigem,
  ] = useState(null);


  /*
   * =====================================================
   * CARREGAMENTO DOS TUTORES
   * =====================================================
   *
   * A lista de Tutores somente precisa ser carregada
   * quando estamos CADASTRANDO um novo Pet.
   *
   * Na edição, os relacionamentos com Tutores são
   * administrados exclusivamente na ficha do Pet.
   */
  useEffect(() => {
    if (modoEdicao) {
      setCarregandoTutores(false);

      return;
    }


    async function carregarTutores() {
      try {
        setCarregandoTutores(true);


        const resposta =
          await api.get(
            "/tutores"
          );


        const lista =
          Array.isArray(resposta.data)
            ? resposta.data
            : [];


        /*
         * Um novo Pet somente pode ser relacionado
         * inicialmente a um Tutor ativo.
         */
        const tutoresAtivos =
          lista.filter(
            (tutor) =>
              tutor.ativo
          );


        setTutores(
          tutoresAtivos
        );


        /*
         * Se o cadastro começou pela ficha de um Tutor,
         * tentamos selecioná-lo automaticamente.
         *
         * Não confiamos somente no parâmetro da URL.
         * O Tutor precisa existir e estar ativo.
         */
        if (tutorOrigemId) {
          const tutorEncontrado =
            tutoresAtivos.find(
              (tutor) =>
                String(tutor.id) ===
                String(tutorOrigemId)
            );


          if (tutorEncontrado) {
            setTutorOrigem(
              tutorEncontrado
            );


            setForm(
              (anterior) => ({
                ...anterior,

                tutor_id:
                  String(
                    tutorEncontrado.id
                  ),
              })
            );
          } else {
            setTutorOrigem(null);


            setErro(
              "O tutor informado na origem não foi encontrado ou está inativo. Selecione outro tutor."
            );
          }
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

  }, [
    modoEdicao,
    tutorOrigemId,
  ]);


  /*
   * =====================================================
   * CARREGAMENTO DO PET
   * =====================================================
   *
   * Na edição recuperamos os dados atuais do animal.
   *
   * tutor_id continua sendo mantido INTERNAMENTE durante
   * esta fase da migração porque o backend ainda utiliza
   * esse campo em parte da validação.
   *
   * Entretanto, o usuário não poderá alterar o Tutor
   * através desta tela.
   */
  useEffect(() => {
    if (!modoEdicao) {
      return;
    }


    async function carregarPet() {
      try {
        setCarregandoPet(true);

        setErro("");


        const resposta =
          await api.get(
            `/pets/${id}`
          );


        const pet =
          resposta.data.pet;


        setFotoAtual(
          pet.foto || ""
        );


        setForm({
          /*
           * Mantido somente por compatibilidade temporária
           * com o backend.
           *
           * Este campo NÃO será exibido na edição.
           */
          tutor_id:
            String(
              pet.tutor_id || ""
            ),

          nome:
            pet.nome || "",

          especie:
            pet.especie ||
            "cachorro",

          raca:
            pet.raca || "",

          sexo:
            pet.sexo || "",

          /*
           * O PostgreSQL pode retornar a data acompanhada
           * de horário.
           *
           * O input date precisa somente de YYYY-MM-DD.
           */
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

  }, [
    id,
    modoEdicao,
  ]);


  /*
   * Libera a URL temporária criada para a
   * pré-visualização quando ela não for mais necessária.
   */
  useEffect(() => {
    return () => {
      if (previewFoto) {
        URL.revokeObjectURL(
          previewFoto
        );
      }
    };
  }, [previewFoto]);


  /*
   * Atualização genérica dos campos do formulário.
   */
  function atualizarCampo(event) {
    const {
      name,
      value,
    } = event.target;


    setForm(
      (anterior) => ({
        ...anterior,

        [name]:
          value,
      })
    );
  }


  /*
   * =====================================================
   * FOTO
   * =====================================================
   */
  function selecionarFoto(event) {
    const arquivo =
      event.target.files?.[0];


    if (!arquivo) {
      return;
    }


    /*
     * Mantemos no frontend as mesmas restrições
     * principais existentes no backend para dar
     * retorno imediato ao usuário.
     */
    const tiposPermitidos = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];


    if (
      !tiposPermitidos.includes(
        arquivo.type
      )
    ) {
      setErro(
        "Selecione uma imagem JPG, PNG ou WEBP."
      );


      event.target.value = "";

      return;
    }


    if (
      arquivo.size >
      5 * 1024 * 1024
    ) {
      setErro(
        "A imagem deve ter no máximo 5 MB."
      );


      event.target.value = "";

      return;
    }


    setErro("");

    setArquivoFoto(
      arquivo
    );


    /*
     * Remove a URL temporária anterior antes de
     * criar uma nova.
     */
    if (previewFoto) {
      URL.revokeObjectURL(
        previewFoto
      );
    }


    const preview =
      URL.createObjectURL(
        arquivo
      );


    setPreviewFoto(
      preview
    );
  }


  /*
   * Envia a fotografia separadamente dos dados
   * cadastrais.
   *
   * O Pet precisa existir primeiro porque o ID
   * faz parte da rota.
   */
  async function enviarFoto(
    petId
  ) {
    if (!arquivoFoto) {
      return;
    }


    const formData =
      new FormData();


    formData.append(
      "foto",
      arquivoFoto
    );


    await api.post(
      `/pets/${petId}/foto`,
      formData
    );
  }


  /*
   * =====================================================
   * SALVAR PET
   * =====================================================
   *
   * CADASTRO:
   *
   * tutor_id representa o primeiro Tutor do Pet.
   * O backend cria também o relacionamento em
   * pet_tutores e define esse Tutor como principal.
   *
   *
   * EDIÇÃO:
   *
   * A tela não permite escolher outro Tutor.
   *
   * O tutor_id atual é enviado temporariamente somente
   * porque o backend ainda utiliza o campo durante
   * a validação da atualização.
   *
   * O backend NÃO deve utilizar esse campo para trocar
   * o relacionamento.
   */
  async function salvarPet(event) {
    event.preventDefault();


    setErro("");

    setSucesso("");


    /*
     * Nome e espécie são obrigatórios em qualquer modo.
     */
    if (
      !form.nome.trim() ||
      !form.especie
    ) {
      setErro(
        "Nome e espécie são obrigatórios."
      );

      return;
    }


    /*
     * Tutor somente precisa ser escolhido pelo usuário
     * durante o cadastro.
     */
    if (
      !modoEdicao &&
      !form.tutor_id
    ) {
      setErro(
        "Selecione o tutor responsável pelo pet."
      );

      return;
    }


    /*
     * Durante a migração, uma edição também precisa ter
     * o tutor_id interno carregado corretamente.
     */
    if (
      modoEdicao &&
      !form.tutor_id
    ) {
      setErro(
        "Não foi possível identificar o tutor principal atual do pet."
      );

      return;
    }


    try {
      setSalvando(true);


      /*
       * Dados cadastrais comuns aos dois modos.
       */
      const dados = {
        nome:
          form.nome.trim(),

        especie:
          form.especie,

        raca:
          form.raca.trim() ||
          null,

        sexo:
          form.sexo ||
          null,

        data_nascimento:
          form.data_nascimento ||
          null,

        peso:
          form.peso !== ""
            ? Number(
                form.peso
              )
            : null,

        cor:
          form.cor.trim() ||
          null,

        observacoes:
          form.observacoes.trim() ||
          null,
      };


      let petId;


      if (modoEdicao) {
        /*
         * IMPORTANTE:
         *
         * tutor_id é enviado apenas para satisfazer a
         * compatibilidade temporária da API.
         *
         * O usuário não consegue alterá-lo por esta tela.
         *
         * A troca de Tutor principal deve acontecer na
         * ficha do Pet.
         */
        const dadosEdicao = {
          ...dados,

          tutor_id:
            Number(
              form.tutor_id
            ),
        };


        await api.put(
          `/pets/${id}`,
          dadosEdicao
        );


        petId = id;

      } else {
        /*
         * No cadastro, tutor_id possui função real:
         * representa o primeiro Tutor responsável.
         */
        const dadosCadastro = {
          ...dados,

          tutor_id:
            Number(
              form.tutor_id
            ),
        };


        const resposta =
          await api.post(
            "/pets",
            dadosCadastro
          );


        petId =
          resposta.data.pet.id;
      }


      /*
       * A fotografia é enviada depois que os dados
       * cadastrais foram salvos.
       *
       * Uma falha exclusivamente no upload não deve
       * desfazer o cadastro já concluído.
       */
      if (arquivoFoto) {
        try {
          await enviarFoto(
            petId
          );
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
            navigate(
              `/pets/${petId}`
            );
          }, 1500);


          return;
        }
      }


      setSucesso(
        modoEdicao
          ? "Pet atualizado com sucesso."
          : tutorOrigem
            ? `Pet cadastrado com sucesso para ${tutorOrigem.nome}.`
            : "Pet cadastrado com sucesso."
      );


      setTimeout(() => {
        navigate(
          `/pets/${petId}`
        );
      }, 700);

    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          (
            modoEdicao
              ? "Não foi possível atualizar o Pet."
              : "Não foi possível cadastrar o Pet."
          )
      );
    } finally {
      setSalvando(false);
    }
  }


  /*
   * =====================================================
   * VOLTAR
   * =====================================================
   *
   * Quando o cadastro foi aberto pela ficha do Tutor,
   * Voltar/Cancelar retorna para essa mesma ficha.
   */
  function voltar() {
    if (
      !modoEdicao &&
      tutorOrigemId
    ) {
      navigate(
        `/tutores/${tutorOrigemId}`
      );

      return;
    }


    navigate(
      modoEdicao
        ? `/pets/${id}`
        : "/pets"
    );
  }


  /*
   * Durante a edição precisamos aguardar os dados
   * atuais do Pet antes de montar o formulário.
   */
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
              : tutorOrigem
                ? `Cadastre o animal para ${tutorOrigem.nome}.`
                : "Cadastre os dados do animal e relacione-o ao tutor responsável."}
          </p>
        </div>


        <button
          type="button"
          className="secondary-button"
          onClick={voltar}
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


        {/*
         * Quando o cadastro começou pela ficha de um Tutor,
         * mostramos uma indicação visual da origem.
         *
         * Essa informação nunca aparece na edição.
         */}
        {!modoEdicao &&
          tutorOrigem && (
            <div className="pet-form-origin">
              <div>
                <span>
                  Tutor selecionado
                </span>


                <strong>
                  {tutorOrigem.nome}
                </strong>
              </div>


              <p>
                Este tutor será definido como
                responsável principal inicial
                do novo pet.
              </p>
            </div>
          )}


        {/*
         * =================================================
         * TUTOR RESPONSÁVEL
         * =================================================
         *
         * Esta seção existe SOMENTE no cadastro.
         *
         * Durante a edição, adicionar, remover ou trocar
         * o Tutor principal deve ser feito na ficha do Pet.
         */}
        {!modoEdicao && (
          <section className="pet-form-section">

            <div className="section-heading">
              <h2>
                Tutor responsável
              </h2>


              <p>
                Selecione o responsável
                principal inicial pelo animal.
              </p>
            </div>


            <div className="pet-form-grid">

              <div className="pet-form-field full">

                <label htmlFor="tutor_id">
                  Tutor *
                </label>


                <SeletorTutor
                  tutores={tutores}

                  tutorSelecionadoId={
                    form.tutor_id
                  }

                  desabilitado={
                    carregandoTutores
                  }

                  onSelecionar={(
                    tutor
                  ) => {
                    setForm(
                      (anterior) => ({
                        ...anterior,

                        tutor_id:
                          tutor
                            ? String(
                                tutor.id
                              )
                            : "",
                      })
                    );


                    /*
                     * O parâmetro da URL funciona como
                     * seleção inicial.
                     *
                     * O operador ainda pode escolher outro
                     * Tutor antes de concluir o cadastro.
                     */
                    if (
                      tutorOrigem &&
                      tutor &&
                      Number(tutor.id) !==
                        Number(
                          tutorOrigem.id
                        )
                    ) {
                      setTutorOrigem(
                        null
                      );
                    }
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
        )}


        {/*
         * =================================================
         * FOTO
         * =================================================
         */}
        <section className="pet-form-section">

          <div className="section-heading">
            <h2>
              Foto do pet
            </h2>


            <p>
              Adicione uma foto para facilitar
              a identificação do animal.
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
                {fotoAtual ||
                previewFoto
                  ? "Trocar foto"
                  : "Selecionar foto"}
              </label>


              <input
                id="foto"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={
                  selecionarFoto
                }
              />


              <span>
                JPG, PNG ou WEBP.
                Máximo de 5 MB.
              </span>


              {arquivoFoto && (
                <strong>
                  {arquivoFoto.name}
                </strong>
              )}

            </div>

          </div>

        </section>


        {/*
         * =================================================
         * DADOS DO PET
         * =================================================
         */}
        <section className="pet-form-section">

          <div className="section-heading">
            <h2>
              Dados do pet
            </h2>


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
              onChange={
                atualizarCampo
              }
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
                onChange={
                  atualizarCampo
                }
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
              onChange={
                atualizarCampo
              }
            />


            <div className="pet-form-field">

              <label htmlFor="sexo">
                Sexo
              </label>


              <select
                id="sexo"
                name="sexo"
                value={form.sexo}
                onChange={
                  atualizarCampo
                }
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
              value={
                form.data_nascimento
              }
              onChange={
                atualizarCampo
              }
            />


            <Campo
              label="Peso (kg)"
              name="peso"
              type="number"
              value={form.peso}
              onChange={
                atualizarCampo
              }
              min="0.01"
              step="0.01"
            />


            <Campo
              label="Cor"
              name="cor"
              value={form.cor}
              onChange={
                atualizarCampo
              }
            />

          </div>

        </section>


        {/*
         * =================================================
         * OBSERVAÇÕES
         * =================================================
         */}
        <section className="pet-form-section">

          <div className="section-heading">
            <h2>
              Observações
            </h2>


            <p>
              Informações adicionais sobre
              o animal.
            </p>
          </div>


          <div className="pet-form-field full">

            <textarea
              name="observacoes"
              value={
                form.observacoes
              }
              onChange={
                atualizarCampo
              }
              rows="5"
              placeholder="Comportamento, cuidados ou outras informações importantes..."
            />

          </div>

        </section>


        {/*
         * =================================================
         * AÇÕES
         * =================================================
         */}
        <div className="pet-form-actions">

          <button
            type="button"
            className="secondary-button"
            onClick={voltar}
            disabled={salvando}
          >
            Cancelar
          </button>


          <button
            type="submit"
            className="primary-button"

            /*
             * Na edição não dependemos da lista de Tutores.
             *
             * No cadastro, o botão permanece bloqueado
             * enquanto os Tutores são carregados ou quando
             * não existe nenhum Tutor ativo.
             */
            disabled={
              salvando ||
              (
                !modoEdicao &&
                (
                  carregandoTutores ||
                  tutores.length === 0
                )
              )
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


/*
 * Campo reutilizável para manter os inputs do
 * formulário com a mesma estrutura.
 */
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

        {required
          ? " *"
          : ""}
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


/*
 * Responsável pela fotografia ou pelo placeholder
 * mostrado enquanto o Pet não possui imagem.
 */
function PreviewFoto({
  preview,
  fotoAtual,
  nome,
}) {
  let imagem =
    preview;


  /*
   * Se nenhuma nova fotografia foi selecionada,
   * mostramos a imagem que já está armazenada
   * no backend.
   */
  if (
    !imagem &&
    fotoAtual
  ) {
    const apiUrl =
      import.meta.env.VITE_API_URL ||
      "http://localhost:3001/api";


    const servidorUrl =
      apiUrl.replace(
        /\/api\/?$/,
        ""
      );


    imagem =
      `${servidorUrl}${fotoAtual}`;
  }


  if (imagem) {
    return (
      <img
        className="pet-photo-preview"
        src={imagem}
        alt={`Foto de ${
          nome || "pet"
        }`}
      />
    );
  }


  /*
   * Enquanto não existir fotografia,
   * utilizamos a inicial do nome do Pet.
   */
  return (
    <div className="pet-photo-preview-placeholder">
      {nome
        ?.charAt(0)
        ?.toUpperCase() ||
        "P"}
    </div>
  );
}


export default FormularioPet;