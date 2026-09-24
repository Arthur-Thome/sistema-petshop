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


/*
 * Tamanho da fotografia final enviada ao backend.
 *
 * Todas as fotos passam a ter o mesmo formato quadrado,
 * facilitando a exibição nas listas e fichas do sistema.
 */
const TAMANHO_FOTO_FINAL = 800;


function FormularioPet() {
  const navigate = useNavigate();

  const { id } = useParams();

  const [searchParams] =
    useSearchParams();

  const modoEdicao =
    Boolean(id);

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

  const [
    arquivoFoto,
    setArquivoFoto,
  ] = useState(null);

  const [
    previewFoto,
    setPreviewFoto,
  ] = useState("");

  const [
    fotoAtual,
    setFotoAtual,
  ] = useState("");

  const [
    tutorOrigem,
    setTutorOrigem,
  ] = useState(null);


  /*
   * =====================================================
   * EDITOR DE FOTO
   * =====================================================
   */

  const [
    editorAberto,
    setEditorAberto,
  ] = useState(false);

  const [
    imagemEditor,
    setImagemEditor,
  ] = useState("");

  const [
    nomeArquivoOriginal,
    setNomeArquivoOriginal,
  ] = useState("");

  const [zoom, setZoom] =
    useState(1);

  const [posicao, setPosicao] =
    useState({
      x: 0,
      y: 0,
    });

  const [
    arrastando,
    setArrastando,
  ] = useState(false);

  const inicioArrasteRef =
    useRef(null);

  const imagemEditorRef =
    useRef(null);

  const areaEditorRef =
    useRef(null);


  /*
   * =====================================================
   * PREVENÇÃO DE PET DUPLICADO
   * =====================================================
   */

  const [
    petsDoTutor,
    setPetsDoTutor,
  ] = useState([]);

  const [
    carregandoPetsTutor,
    setCarregandoPetsTutor,
  ] = useState(false);

  const [
    petDuplicado,
    setPetDuplicado,
  ] = useState(null);

  const [
    duplicidadeIgnorada,
    setDuplicidadeIgnorada,
  ] = useState("");


  function normalizarNome(valor) {
    return String(valor || "")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(/\s+/g, " ");
  }


  /*
   * =====================================================
   * TUTORES
   * =====================================================
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
          await api.get("/tutores");

        const lista =
          Array.isArray(resposta.data)
            ? resposta.data
            : [];

        const tutoresAtivos =
          lista.filter(
            (tutor) => tutor.ativo
          );

        setTutores(
          tutoresAtivos
        );


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
   * PETS DO TUTOR SELECIONADO
   * =====================================================
   */
  useEffect(() => {
    if (
      modoEdicao ||
      !form.tutor_id
    ) {
      setPetsDoTutor([]);
      setPetDuplicado(null);
      setDuplicidadeIgnorada("");

      return;
    }


    async function carregarPetsDoTutor() {
      try {
        setCarregandoPetsTutor(true);

        const resposta =
          await api.get(
            `/pets/tutor/${form.tutor_id}`
          );

        const lista =
          Array.isArray(
            resposta.data
          )
            ? resposta.data
            : Array.isArray(
                resposta.data?.pets
              )
              ? resposta.data.pets
              : [];

        setPetsDoTutor(lista);
      } catch (error) {
        console.error(
          "Não foi possível verificar os pets do tutor:",
          error
        );

        setPetsDoTutor([]);
      } finally {
        setCarregandoPetsTutor(false);
      }
    }


    carregarPetsDoTutor();
  }, [
    form.tutor_id,
    modoEdicao,
  ]);


  /*
   * =====================================================
   * DETECÇÃO DE PET DUPLICADO
   * =====================================================
   */
  useEffect(() => {
    if (
      modoEdicao ||
      !form.tutor_id
    ) {
      return;
    }


    const nomeDigitado =
      normalizarNome(
        form.nome
      );


    if (!nomeDigitado) {
      setPetDuplicado(null);
      setDuplicidadeIgnorada("");

      return;
    }


    const chaveAtual =
      `${form.tutor_id}:${nomeDigitado}`;


    if (
      duplicidadeIgnorada &&
      duplicidadeIgnorada !==
        chaveAtual
    ) {
      setDuplicidadeIgnorada("");
    }


    const encontrado =
      petsDoTutor.find(
        (pet) =>
          normalizarNome(
            pet.nome
          ) === nomeDigitado
      );


    if (!encontrado) {
      setPetDuplicado(null);

      return;
    }


    if (
      duplicidadeIgnorada ===
      chaveAtual
    ) {
      return;
    }


    setPetDuplicado(
      encontrado
    );
  }, [
    form.nome,
    form.tutor_id,
    modoEdicao,
    petsDoTutor,
    duplicidadeIgnorada,
  ]);


  function continuarMesmoPet() {
    const chaveAtual =
      `${form.tutor_id}:${normalizarNome(
        form.nome
      )}`;

    setDuplicidadeIgnorada(
      chaveAtual
    );

    setPetDuplicado(null);
  }


  function abrirPetExistente() {
    if (!petDuplicado) {
      return;
    }

    navigate(
      `/pets/${petDuplicado.id}`
    );
  }

    /*
   * =====================================================
   * CARREGAMENTO DO PET NA EDIÇÃO
   * =====================================================
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
   * URLs criadas pelo navegador precisam ser liberadas
   * quando deixam de ser utilizadas.
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


  useEffect(() => {
    return () => {
      if (imagemEditor) {
        URL.revokeObjectURL(
          imagemEditor
        );
      }
    };
  }, [imagemEditor]);


  function atualizarCampo(event) {
    const {
      name,
      value,
    } = event.target;

    setForm(
      (anterior) => ({
        ...anterior,

        [name]: value,
      })
    );
  }


  /*
   * =====================================================
   * ABRIR EDITOR DE FOTO
   * =====================================================
   *
   * A foto ainda não é enviada ao backend neste momento.
   * Primeiro o usuário define o enquadramento.
   */
  function selecionarFoto(event) {
    const arquivo =
      event.target.files?.[0];

    event.target.value = "";


    if (!arquivo) {
      return;
    }


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

      return;
    }


    if (
      arquivo.size >
      5 * 1024 * 1024
    ) {
      setErro(
        "A imagem deve ter no máximo 5 MB."
      );

      return;
    }


    setErro("");


    if (imagemEditor) {
      URL.revokeObjectURL(
        imagemEditor
      );
    }


    const url =
      URL.createObjectURL(
        arquivo
      );


    setImagemEditor(url);

    setNomeArquivoOriginal(
      arquivo.name
    );

    setZoom(1);

    setPosicao({
      x: 0,
      y: 0,
    });

    setEditorAberto(true);
  }


  /*
   * =====================================================
   * ARRASTAR A FOTO
   * =====================================================
   */

  function iniciarArraste(event) {
    event.preventDefault();


    const ponto =
      obterPonto(event);


    inicioArrasteRef.current = {
      x: ponto.x,
      y: ponto.y,

      posicaoX:
        posicao.x,

      posicaoY:
        posicao.y,
    };


    setArrastando(true);
  }


  function moverImagem(event) {
    if (
      !arrastando ||
      !inicioArrasteRef.current
    ) {
      return;
    }


    event.preventDefault();


    const ponto =
      obterPonto(event);


    const diferencaX =
      ponto.x -
      inicioArrasteRef.current.x;

    const diferencaY =
      ponto.y -
      inicioArrasteRef.current.y;


    setPosicao({
      x:
        inicioArrasteRef.current
          .posicaoX +
        diferencaX,

      y:
        inicioArrasteRef.current
          .posicaoY +
        diferencaY,
    });
  }


  function finalizarArraste() {
    setArrastando(false);

    inicioArrasteRef.current =
      null;
  }


  function obterPonto(event) {
    if (
      event.touches &&
      event.touches.length > 0
    ) {
      return {
        x:
          event.touches[0]
            .clientX,

        y:
          event.touches[0]
            .clientY,
      };
    }


    return {
      x: event.clientX,
      y: event.clientY,
    };
  }


  function alterarZoom(event) {
    setZoom(
      Number(
        event.target.value
      )
    );
  }


  function centralizarFoto() {
    setZoom(1);

    setPosicao({
      x: 0,
      y: 0,
    });
  }


  function cancelarEdicaoFoto() {
    setEditorAberto(false);

    setArrastando(false);

    setNomeArquivoOriginal("");


    if (imagemEditor) {
      URL.revokeObjectURL(
        imagemEditor
      );

      setImagemEditor("");
    }
  }


  /*
   * =====================================================
   * GERAR FOTO RECORTADA
   * =====================================================
   *
   * O Canvas reproduz exatamente o enquadramento mostrado
   * no editor e gera um JPEG quadrado.
   */
  async function confirmarEdicaoFoto() {
    const imagem =
      imagemEditorRef.current;

    const area =
      areaEditorRef.current;


    if (
      !imagem ||
      !area ||
      !imagem.naturalWidth ||
      !imagem.naturalHeight
    ) {
      setErro(
        "Não foi possível processar a imagem selecionada."
      );

      return;
    }


    try {
      const tamanhoVisual =
        area.clientWidth;


      /*
       * object-fit: cover faz a imagem preencher toda
       * a área quadrada antes de aplicar o zoom.
       */
      const escalaBase =
        Math.max(
          tamanhoVisual /
            imagem.naturalWidth,

          tamanhoVisual /
            imagem.naturalHeight
        );


      const escalaVisual =
        escalaBase * zoom;


      const larguraVisual =
        imagem.naturalWidth *
        escalaVisual;

      const alturaVisual =
        imagem.naturalHeight *
        escalaVisual;


      /*
       * Posição da imagem dentro da janela quadrada.
       */
      const esquerdaVisual =
        (
          tamanhoVisual -
          larguraVisual
        ) /
          2 +
        posicao.x;

      const topoVisual =
        (
          tamanhoVisual -
          alturaVisual
        ) /
          2 +
        posicao.y;


      /*
       * Converte a região visível novamente para
       * coordenadas da fotografia original.
       */
      const origemX =
        Math.max(
          0,
          -esquerdaVisual /
            escalaVisual
        );

      const origemY =
        Math.max(
          0,
          -topoVisual /
            escalaVisual
        );


      const larguraOrigem =
        Math.min(
          tamanhoVisual /
            escalaVisual,

          imagem.naturalWidth -
            origemX
        );

      const alturaOrigem =
        Math.min(
          tamanhoVisual /
            escalaVisual,

          imagem.naturalHeight -
            origemY
        );


      const canvas =
        document.createElement(
          "canvas"
        );


      canvas.width =
        TAMANHO_FOTO_FINAL;

      canvas.height =
        TAMANHO_FOTO_FINAL;


      const contexto =
        canvas.getContext("2d");


      /*
       * Fundo branco evita transparência inesperada
       * quando a imagem original for PNG.
       */
      contexto.fillStyle =
        "#ffffff";

      contexto.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );


      const destinoX =
        Math.max(
          0,
          esquerdaVisual /
            tamanhoVisual *
            TAMANHO_FOTO_FINAL
        );

      const destinoY =
        Math.max(
          0,
          topoVisual /
            tamanhoVisual *
            TAMANHO_FOTO_FINAL
        );


      const larguraDestino =
        larguraOrigem *
        escalaVisual /
        tamanhoVisual *
        TAMANHO_FOTO_FINAL;

      const alturaDestino =
        alturaOrigem *
        escalaVisual /
        tamanhoVisual *
        TAMANHO_FOTO_FINAL;


      contexto.drawImage(
        imagem,

        origemX,
        origemY,
        larguraOrigem,
        alturaOrigem,

        destinoX,
        destinoY,
        larguraDestino,
        alturaDestino
      );


      const blob =
        await new Promise(
          (resolve) => {
            canvas.toBlob(
              resolve,
              "image/jpeg",
              0.9
            );
          }
        );


      if (!blob) {
        throw new Error(
          "Não foi possível gerar a foto."
        );
      }


      const nomeBase =
        nomeArquivoOriginal
          .replace(
            /\.[^.]+$/,
            ""
          )
          .replace(
            /[^a-zA-Z0-9_-]/g,
            "_"
          ) ||
        "pet";


      const arquivoFinal =
        new File(
          [blob],
          `${nomeBase}-recortada.jpg`,
          {
            type:
              "image/jpeg",
          }
        );


      if (previewFoto) {
        URL.revokeObjectURL(
          previewFoto
        );
      }


      const novaPreview =
        URL.createObjectURL(
          arquivoFinal
        );


      setArquivoFoto(
        arquivoFinal
      );

      setPreviewFoto(
        novaPreview
      );

      setEditorAberto(false);


      if (imagemEditor) {
        URL.revokeObjectURL(
          imagemEditor
        );

        setImagemEditor("");
      }


      setNomeArquivoOriginal("");
      setErro("");
    } catch (error) {
      console.error(
        "Erro ao recortar foto:",
        error
      );

      setErro(
        "Não foi possível recortar a foto. Tente selecionar a imagem novamente."
      );
    }
  }


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
   */
  async function salvarPet(event) {
    event.preventDefault();

    setErro("");
    setSucesso("");


    if (
      !form.nome.trim() ||
      !form.especie
    ) {
      setErro(
        "Nome e espécie são obrigatórios."
      );

      return;
    }


    if (
      !modoEdicao &&
      !form.tutor_id
    ) {
      setErro(
        "Selecione o tutor responsável pelo pet."
      );

      return;
    }


    if (
      modoEdicao &&
      !form.tutor_id
    ) {
      setErro(
        "Não foi possível identificar o tutor principal atual do pet."
      );

      return;
    }


    if (petDuplicado) {
      return;
    }


    try {
      setSalvando(true);


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
        await api.put(
          `/pets/${id}`,
          {
            ...dados,

            tutor_id:
              Number(
                form.tutor_id
              ),
          }
        );

        petId = id;
      } else {
        const resposta =
          await api.post(
            "/pets",
            {
              ...dados,

              tutor_id:
                Number(
                  form.tutor_id
                ),
            }
          );

        petId =
          resposta.data.pet.id;
      }


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
                  onSelecionar={(tutor) => {
                    setPetDuplicado(null);
                    setDuplicidadeIgnorada("");

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


                {carregandoPetsTutor && (
                  <span className="field-help">
                    Verificando pets deste tutor...
                  </span>
                )}


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


        <section className="pet-form-section">
          <div className="section-heading">
            <h2>
              Foto do pet
            </h2>

            <p>
              Selecione uma foto e ajuste
              o enquadramento antes de salvar.
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
                  ? "Trocar e editar foto"
                  : "Selecionar e editar foto"}
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
                <>
                  <strong>
                    {arquivoFoto.name}
                  </strong>

                  <span className="pet-photo-ready">
                    Foto enquadrada e pronta para salvar.
                  </span>
                </>
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
            disabled={
              salvando ||
              carregandoTutores ||
              (
                tutores.length === 0 &&
                !modoEdicao
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

            {/*
       * ===================================================
       * EDITOR DE FOTO
       * ===================================================
       */}
      {editorAberto && (
        <div className="pet-photo-editor-overlay">

          <div className="pet-photo-editor-modal">

            <div className="pet-photo-editor-header">
              <div>
                <span>
                  Foto do pet
                </span>

                <h2>
                  Ajustar enquadramento
                </h2>

                <p>
                  Arraste a foto e use o zoom
                  até chegar ao enquadramento desejado.
                </p>
              </div>
            </div>


            <div
              ref={areaEditorRef}
              className={`pet-photo-editor-area ${
                arrastando
                  ? "dragging"
                  : ""
              }`}
              onMouseDown={
                iniciarArraste
              }
              onMouseMove={
                moverImagem
              }
              onMouseUp={
                finalizarArraste
              }
              onMouseLeave={
                finalizarArraste
              }
              onTouchStart={
                iniciarArraste
              }
              onTouchMove={
                moverImagem
              }
              onTouchEnd={
                finalizarArraste
              }
            >
              <img
                ref={imagemEditorRef}
                src={imagemEditor}
                alt="Imagem sendo ajustada"
                draggable="false"
                style={{
                  transform:
                    `translate(${posicao.x}px, ${posicao.y}px) scale(${zoom})`,
                }}
              />

              <div className="pet-photo-editor-guide" />
            </div>


            <div className="pet-photo-editor-controls">
              <div className="pet-photo-zoom">
                <div>
                  <label htmlFor="pet-photo-zoom">
                    Zoom
                  </label>

                  <strong>
                    {Math.round(
                      zoom * 100
                    )}%
                  </strong>
                </div>

                <input
                  id="pet-photo-zoom"
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={
                    alterarZoom
                  }
                />
              </div>


              <button
                type="button"
                className="pet-photo-center-button"
                onClick={
                  centralizarFoto
                }
              >
                Centralizar foto
              </button>
            </div>


            <div className="pet-photo-editor-help">
              A área quadrada corresponde à foto
              que será salva no cadastro do pet.
            </div>


            <div className="pet-photo-editor-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={
                  cancelarEdicaoFoto
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={
                  confirmarEdicaoFoto
                }
              >
                Usar esta foto
              </button>
            </div>

          </div>

        </div>
      )}


      {/*
       * ===================================================
       * POSSÍVEL PET DUPLICADO
       * ===================================================
       */}
      {petDuplicado && (
        <div
          className="pet-duplicate-overlay"
          role="presentation"
        >
          <div
            className="pet-duplicate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pet-duplicate-title"
          >
            <div className="pet-duplicate-marker">
              !
            </div>


            <div className="pet-duplicate-content">
              <span className="pet-duplicate-label">
                Pet semelhante encontrado
              </span>

              <h2 id="pet-duplicate-title">
                Este pet já pode estar cadastrado
              </h2>

              <p>
                Este Tutor já possui um Pet com
                o mesmo nome. Confira a ficha
                existente antes de criar outro cadastro.
              </p>


              <div className="pet-duplicate-found">
                <div>
                  <span>
                    Pet encontrado
                  </span>

                  <strong>
                    {petDuplicado.nome}
                  </strong>
                </div>

                <div>
                  <span>
                    Espécie
                  </span>

                  <strong>
                    {petDuplicado.especie ||
                      "Não informada"}
                  </strong>
                </div>

                {petDuplicado.raca && (
                  <div>
                    <span>
                      Raça
                    </span>

                    <strong>
                      {petDuplicado.raca}
                    </strong>
                  </div>
                )}
              </div>


              <div className="pet-duplicate-actions">
                <button
                  type="button"
                  className="pet-duplicate-continue"
                  onClick={
                    continuarMesmoPet
                  }
                >
                  Continuar Cadastro
                </button>

                <button
                  type="button"
                  className="pet-duplicate-open"
                  onClick={
                    abrirPetExistente
                  }
                >
                  Ver Pet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


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


function PreviewFoto({
  preview,
  fotoAtual,
  nome,
}) {
  let imagem =
    preview;


  if (
    !imagem &&
    fotoAtual
  ) {
    imagem =
      fotoAtual.startsWith("http")
        ? fotoAtual
        : `http://localhost:3001${fotoAtual}`;
  }


  if (imagem) {
    return (
      <img
        className="pet-photo-preview"
        src={imagem}
        alt={
          nome
            ? `Foto de ${nome}`
            : "Foto do pet"
        }
      />
    );
  }


  return (
    <div className="pet-photo-preview-placeholder">
      {nome
        ?.trim()
        ?.charAt(0)
        ?.toUpperCase() ||
        "P"}
    </div>
  );
}


export default FormularioPet;