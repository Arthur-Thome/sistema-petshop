const crypto = require("crypto");
const pool = require("../database/connection");

const {
  criarSessaoCliente,
} = require(
  "../services/sessaoClientePublicoService"
);

const {
  validarCPF,
  formatarCPF,
} = require("../utils/cpf");


const DURACAO_CODIGO_MINUTOS = 10;
const MAXIMO_TENTATIVAS = 5;


/*
 * Mantemos somente dígitos para comparar telefones.
 */
function somenteDigitos(valor) {
  if (typeof valor !== "string") {
    return "";
  }

  return valor.replace(/\D/g, "");
}


/*
 * O código original nunca é armazenado.
 */
function gerarHash(valor) {
  return crypto
    .createHash("sha256")
    .update(valor)
    .digest("hex");
}


/*
 * Compara hashes sem expor diferenças de tempo
 * relevantes entre valores válidos e inválidos.
 */
function compararHash(
  valor,
  hashEsperado
) {
  const hashRecebido =
    gerarHash(valor);

  const recebido =
    Buffer.from(
      hashRecebido,
      "hex"
    );

  const esperado =
    Buffer.from(
      hashEsperado,
      "hex"
    );

  if (
    recebido.length !==
    esperado.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    recebido,
    esperado
  );
}


/*
 * Oculta parte do destino para não revelar dados
 * pessoais na resposta pública.
 */
function mascararDestino(
  canal,
  destino
) {
  if (canal === "EMAIL") {
    const partes =
      destino.split("@");

    if (partes.length !== 2) {
      return "e-mail cadastrado";
    }

    const nome = partes[0];
    const dominio = partes[1];

    const inicio =
      nome.slice(0, 2);

    return `${inicio}***@${dominio}`;
  }


  const digitos =
    somenteDigitos(destino);

  if (digitos.length < 4) {
    return "telefone cadastrado";
  }

  return `******${digitos.slice(-4)}`;
}


/*
 * =========================================================
 * SOLICITAR IDENTIFICAÇÃO
 * =========================================================
 *
 * Nesta primeira versão utilizamos CPF como localizador.
 *
 * CPF não autentica ninguém. Ele serve apenas para localizar
 * o cadastro e descobrir qual meio de contato cadastrado
 * deverá receber o código de verificação.
 */
async function solicitarIdentificacao(
  req,
  res
) {
  try {
    const cpf =
      typeof req.body.cpf === "string"
        ? req.body.cpf.trim()
        : "";


    if (
      !cpf ||
      !validarCPF(cpf)
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um CPF válido.",
      });
    }


    const cpfFormatado =
      formatarCPF(cpf);


    const resultado =
      await pool.query(
        `
          SELECT
            id,
            nome,
            email,
            telefone,
            ativo

          FROM tutores

          WHERE cpf = $1

          LIMIT 1
        `,
        [cpfFormatado]
      );


    /*
     * Evitamos diferenciar publicamente CPF inexistente
     * de outras situações sempre que possível.
     */
    if (
      resultado.rows.length === 0
    ) {
      return res.status(200).json({
        encontrado: false,

        mensagem:
          "Não foi possível iniciar a identificação com os dados informados.",
      });
    }


    const tutor =
      resultado.rows[0];


    if (!tutor.ativo) {
      return res.status(200).json({
        encontrado: false,

        mensagem:
          "Não foi possível iniciar a identificação com os dados informados.",
      });
    }


    /*
     * Nesta fase priorizamos e-mail.
     *
     * O envio por WhatsApp/SMS poderá usar a mesma estrutura
     * posteriormente sem alterar a sessão pública.
     */
    let canal = null;
    let destino = null;


    if (
      tutor.email &&
      tutor.email.trim()
    ) {
      canal = "EMAIL";

      destino =
        tutor.email
          .trim()
          .toLowerCase();
    } else if (
      tutor.telefone &&
      somenteDigitos(
        tutor.telefone
      )
    ) {
      canal = "TELEFONE";

      destino =
        somenteDigitos(
          tutor.telefone
        );
    }


    if (
      !canal ||
      !destino
    ) {
      return res.status(200).json({
        encontrado: false,

        mensagem:
          "Este cadastro não possui um meio de contato disponível para identificação.",
      });
    }


    /*
     * Código numérico de seis dígitos.
     */
    const codigo =
      crypto.randomInt(
        100000,
        1000000
      ).toString();


    const codigoHash =
      gerarHash(codigo);


    /*
     * Verificações anteriores ainda abertas deixam de ser
     * úteis quando uma nova é solicitada.
     */
    await pool.query(
      `
        UPDATE verificacoes_cliente_publico

        SET confirmado_em =
          CURRENT_TIMESTAMP

        WHERE
          tutor_id = $1
          AND confirmado_em IS NULL
      `,
      [tutor.id]
    );


    const verificacao =
      await pool.query(
        `
          INSERT INTO verificacoes_cliente_publico
          (
            tutor_id,
            canal,
            destino_normalizado,
            codigo_hash,
            expira_em
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            CURRENT_TIMESTAMP
              + ($5 * INTERVAL '1 minute')
          )

          RETURNING
            id,
            canal,
            expira_em
        `,
        [
          tutor.id,
          canal,
          destino,
          codigoHash,
          DURACAO_CODIGO_MINUTOS,
        ]
      );


    /*
     * IMPORTANTE:
     *
     * Ainda não temos aqui a integração real de envio
     * de e-mail/SMS do portal.
     *
     * Em desenvolvimento retornamos o código somente
     * quando NODE_ENV não é production.
     *
     * Em produção esta informação nunca deve aparecer
     * na resposta.
     */
    const resposta = {
      encontrado: true,

      verificacao_id:
        verificacao.rows[0].id,

      canal,

      destino:
        mascararDestino(
          canal,
          destino
        ),

      expira_em:
        verificacao.rows[0]
          .expira_em,

      mensagem:
        "Código de verificação gerado.",
    };


    if (
      process.env.NODE_ENV !==
      "production"
    ) {
      resposta.codigo_desenvolvimento =
        codigo;
    }


    return res.status(200).json(
      resposta
    );

  } catch (erro) {
    console.error(
      "Erro ao solicitar identificação pública:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Não foi possível iniciar a identificação.",
    });
  }
}


/*
 * =========================================================
 * CONFIRMAR CÓDIGO
 * =========================================================
 *
 * Após o código correto, o cliente recebe uma sessão
 * temporária independente do login dos funcionários.
 */
async function confirmarIdentificacao(
  req,
  res
) {
  let client;
  let transacaoIniciada = false;

  try {
    const verificacaoId =
      Number(
        req.body.verificacao_id
      );

    const codigo =
      typeof req.body.codigo ===
      "string"
        ? req.body.codigo.trim()
        : "";


    if (
      !Number.isInteger(
        verificacaoId
      ) ||
      verificacaoId <= 0 ||
      !/^\d{6}$/.test(codigo)
    ) {
      return res.status(400).json({
        mensagem:
          "Código de verificação inválido.",
      });
    }


    client =
      await pool.connect();

    await client.query("BEGIN");

    transacaoIniciada = true;


    /*
     * Bloqueamos a verificação para impedir duas
     * confirmações simultâneas do mesmo código.
     */
    const resultado =
      await client.query(
        `
          SELECT
            v.*,
            t.nome AS tutor_nome,
            t.ativo AS tutor_ativo

          FROM verificacoes_cliente_publico v

          INNER JOIN tutores t
            ON t.id = v.tutor_id

          WHERE v.id = $1

          FOR UPDATE OF v
        `,
        [verificacaoId]
      );


    if (
      resultado.rows.length === 0
    ) {
      await client.query(
        "ROLLBACK"
      );

      transacaoIniciada = false;

      return res.status(400).json({
        mensagem:
          "Código de verificação inválido ou expirado.",
      });
    }


    const verificacao =
      resultado.rows[0];


    if (
      !verificacao.tutor_ativo ||
      verificacao.confirmado_em ||
      new Date(
        verificacao.expira_em
      ).getTime() <= Date.now() ||
      Number(
        verificacao.tentativas
      ) >= MAXIMO_TENTATIVAS
    ) {
      await client.query(
        "ROLLBACK"
      );

      transacaoIniciada = false;

      return res.status(400).json({
        mensagem:
          "Código de verificação inválido ou expirado.",
      });
    }


    if (
      !compararHash(
        codigo,
        verificacao.codigo_hash
      )
    ) {
      await client.query(
        `
          UPDATE verificacoes_cliente_publico

          SET tentativas =
            tentativas + 1

          WHERE id = $1
        `,
        [verificacaoId]
      );


      await client.query(
        "COMMIT"
      );

      transacaoIniciada = false;


      return res.status(400).json({
        mensagem:
          "Código de verificação inválido.",
      });
    }


    await client.query(
      `
        UPDATE verificacoes_cliente_publico

        SET confirmado_em =
          CURRENT_TIMESTAMP

        WHERE id = $1
      `,
      [verificacaoId]
    );


    const {
      token,
      sessao,
    } = await criarSessaoCliente(
      verificacao.tutor_id,
      client
    );


    await client.query("COMMIT");

    transacaoIniciada = false;


    return res.status(200).json({
      mensagem:
        "Identificação confirmada.",

      token,

      expira_em:
        sessao.expira_em,

      tutor: {
        id:
          verificacao.tutor_id,

        nome:
          verificacao.tutor_nome,
      },
    });

  } catch (erro) {

    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer confirmação pública:",
          erroRollback
        );
      }
    }


    console.error(
      "Erro ao confirmar identificação pública:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Não foi possível confirmar a identificação.",
    });

  } finally {

    if (client) {
      client.release();
    }
  }
}


/*
 * =========================================================
 * PETS DO CLIENTE IDENTIFICADO
 * =========================================================
 *
 * tutor_id NÃO vem da URL nem do body.
 *
 * Ele vem exclusivamente da sessão validada pelo
 * middleware clientePublicoMiddleware.
 */
async function listarPetsCliente(
  req,
  res
) {
  try {
    const tutorId =
      req.clientePublico.tutorId;


    const resultado =
      await pool.query(
        `
          SELECT
            p.id,
            p.nome,
            p.especie,
            p.raca,
            p.sexo,
            p.data_nascimento,
            p.peso,
            p.cor,
            p.foto

          FROM pets p

          INNER JOIN pet_tutores pt
            ON pt.pet_id = p.id

          WHERE
            pt.tutor_id = $1
            AND p.ativo = TRUE

          ORDER BY
            p.nome ASC,
            p.id ASC
        `,
        [tutorId]
      );


    return res.status(200).json({
      pets: resultado.rows,
    });

  } catch (erro) {
    console.error(
      "Erro ao listar Pets do cliente público:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Não foi possível carregar os Pets.",
    });
  }
}

/*
 * =========================================================
 * CADASTRO RÁPIDO - NOVO CLIENTE
 * =========================================================
 *
 * Cria Tutor + Pet + vínculo principal + sessão pública
 * dentro da mesma transação.
 *
 * Se já existir Tutor com o CPF informado, o portal não
 * cria uma duplicidade. O cliente deverá utilizar o fluxo
 * "Já sou cliente".
 */
async function cadastrarNovoCliente(
  req,
  res
) {
  let client;
  let transacaoIniciada = false;

  try {
    const {
      tutor,
      pet,
    } = req.body;


    if (
      !tutor ||
      typeof tutor !== "object" ||
      Array.isArray(tutor) ||
      !pet ||
      typeof pet !== "object" ||
      Array.isArray(pet)
    ) {
      return res.status(400).json({
        mensagem:
          "Informe os dados do Tutor e do Pet.",
      });
    }


    /*
     * -----------------------------------------------------
     * TUTOR
     * -----------------------------------------------------
     */
    const nome =
      typeof tutor.nome === "string"
        ? tutor.nome.trim()
        : "";

    const cpf =
      typeof tutor.cpf === "string"
        ? tutor.cpf.trim()
        : "";

    const telefone =
      typeof tutor.telefone === "string"
        ? tutor.telefone.trim()
        : "";

    const email =
      typeof tutor.email === "string"
        ? tutor.email
            .trim()
            .toLowerCase()
        : "";

    const cep =
      typeof tutor.cep === "string"
        ? tutor.cep.trim()
        : "";

    const endereco =
      typeof tutor.endereco === "string"
        ? tutor.endereco.trim()
        : "";

    const numero =
      typeof tutor.numero === "string"
        ? tutor.numero.trim()
        : "";

    const complemento =
      typeof tutor.complemento === "string"
        ? tutor.complemento.trim()
        : "";

    const bairro =
      typeof tutor.bairro === "string"
        ? tutor.bairro.trim()
        : "";

    const cidade =
      typeof tutor.cidade === "string"
        ? tutor.cidade.trim()
        : "";

    const estado =
      typeof tutor.estado === "string"
        ? tutor.estado
            .trim()
            .toUpperCase()
        : "";


    if (
      !nome ||
      !cpf ||
      !telefone ||
      !email ||
      !cep ||
      !endereco ||
      !numero ||
      !bairro ||
      !cidade ||
      !estado
    ) {
      return res.status(400).json({
        mensagem:
          "Preencha todos os campos obrigatórios do Tutor.",
      });
    }


    if (!validarCPF(cpf)) {
      return res.status(400).json({
        mensagem:
          "CPF inválido.",
      });
    }


    if (nome.length > 150) {
      return res.status(400).json({
        mensagem:
          "O nome deve possuir no máximo 150 caracteres.",
      });
    }


    if (telefone.length > 20) {
      return res.status(400).json({
        mensagem:
          "O telefone deve possuir no máximo 20 caracteres.",
      });
    }


    if (email.length > 255) {
      return res.status(400).json({
        mensagem:
          "O e-mail deve possuir no máximo 255 caracteres.",
      });
    }


    if (endereco.length > 255) {
      return res.status(400).json({
        mensagem:
          "O endereço deve possuir no máximo 255 caracteres.",
      });
    }


    if (numero.length > 20) {
      return res.status(400).json({
        mensagem:
          "O número deve possuir no máximo 20 caracteres.",
      });
    }


    if (complemento.length > 100) {
      return res.status(400).json({
        mensagem:
          "O complemento deve possuir no máximo 100 caracteres.",
      });
    }


    if (bairro.length > 100) {
      return res.status(400).json({
        mensagem:
          "O bairro deve possuir no máximo 100 caracteres.",
      });
    }


    if (cidade.length > 100) {
      return res.status(400).json({
        mensagem:
          "A cidade deve possuir no máximo 100 caracteres.",
      });
    }


    if (
      estado.length !== 2 ||
      !/^[A-Z]{2}$/.test(estado)
    ) {
      return res.status(400).json({
        mensagem:
          "Informe uma UF válida.",
      });
    }


    if (cep.length > 9) {
      return res.status(400).json({
        mensagem:
          "CEP inválido.",
      });
    }


    const cpfFormatado =
      formatarCPF(cpf);


    /*
     * -----------------------------------------------------
     * PET
     * -----------------------------------------------------
     */
    const petNome =
      typeof pet.nome === "string"
        ? pet.nome.trim()
        : "";

    const especie =
      typeof pet.especie === "string"
        ? pet.especie.trim()
        : "";

    const raca =
      typeof pet.raca === "string"
        ? pet.raca.trim()
        : "";

    const sexo =
      typeof pet.sexo === "string"
        ? pet.sexo
            .trim()
            .toLowerCase()
        : "";

    const dataNascimento =
      typeof pet.data_nascimento === "string"
        ? pet.data_nascimento.trim()
        : "";

    const cor =
      typeof pet.cor === "string"
        ? pet.cor.trim()
        : "";

    const observacoesPet =
      typeof pet.observacoes === "string"
        ? pet.observacoes.trim()
        : "";
    
    /*
    * Campos complementares utilizados pelo cadastro
    * público do Pet.
    */
    const porte =
      typeof pet.porte === "string"
        ? pet.porte
            .trim()
            .toLowerCase()
        : "";

    const castrado =
      typeof pet.castrado === "boolean"
        ? pet.castrado
        : null;

    const alergias =
      typeof pet.alergias === "string"
        ? pet.alergias.trim()
        : "";

    const necessidadesEspeciais =
      typeof pet.necessidades_especiais === "string"
        ? pet.necessidades_especiais.trim()
        : "";

    const comportamento =
      typeof pet.comportamento === "string"
        ? pet.comportamento.trim()
        : "";

    let idadeAproximada = null;

    if (
      pet.idade_aproximada_anos !== undefined &&
      pet.idade_aproximada_anos !== null &&
      pet.idade_aproximada_anos !== ""
    ) {
      idadeAproximada =
        Number(
          pet.idade_aproximada_anos
        );
    }


    if (
      !petNome ||
      !especie
    ) {
      return res.status(400).json({
        mensagem:
          "Nome e espécie do Pet são obrigatórios.",
      });
    }


    if (petNome.length > 150) {
      return res.status(400).json({
        mensagem:
          "O nome do Pet deve possuir no máximo 150 caracteres.",
      });
    }


    if (especie.length > 50) {
      return res.status(400).json({
        mensagem:
          "A espécie deve possuir no máximo 50 caracteres.",
      });
    }


    if (raca.length > 100) {
      return res.status(400).json({
        mensagem:
          "A raça deve possuir no máximo 100 caracteres.",
      });
    }


    if (cor.length > 100) {
      return res.status(400).json({
        mensagem:
          "A cor deve possuir no máximo 100 caracteres.",
      });
    }


    if (
      sexo &&
      ![
        "macho",
        "femea",
      ].includes(sexo)
    ) {
      return res.status(400).json({
        mensagem:
          "Sexo do Pet inválido.",
      });
    }


    if (
      dataNascimento &&
      !/^\d{4}-\d{2}-\d{2}$/.test(
        dataNascimento
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Data de nascimento do Pet inválida.",
      });
    }


    if (
      observacoesPet.length > 2000
    ) {
      return res.status(400).json({
        mensagem:
          "As observações do Pet devem possuir no máximo 2000 caracteres.",
      });
    }


    /*
     * Peso continua opcional.
     */
    let peso = null;

    if (
      pet.peso !== undefined &&
      pet.peso !== null &&
      pet.peso !== ""
    ) {
      peso = Number(pet.peso);

      if (
        !Number.isFinite(peso) ||
        peso <= 0 ||
        peso > 1000
      ) {
        return res.status(400).json({
          mensagem:
            "Peso do Pet inválido.",
        });
      }
    }

    if (
  !porte ||
  ![
    "pequeno",
    "medio",
    "grande",
  ].includes(porte)
) {
  return res.status(400).json({
    mensagem:
      "Informe um porte válido para o Pet.",
  });
}


if (
  pet.castrado !== undefined &&
  pet.castrado !== null &&
  typeof pet.castrado !== "boolean"
) {
  return res.status(400).json({
    mensagem:
      "A informação de castração é inválida.",
  });
}


if (
  idadeAproximada !== null &&
  (
    !Number.isInteger(
      idadeAproximada
    ) ||
    idadeAproximada < 0 ||
    idadeAproximada > 100
  )
) {
  return res.status(400).json({
    mensagem:
      "A idade aproximada do Pet é inválida.",
  });
}


/*
 * O cliente pode informar a data exata OU a idade
 * aproximada, mas não as duas ao mesmo tempo.
 */
if (
  dataNascimento &&
  idadeAproximada !== null
) {
  return res.status(400).json({
    mensagem:
      "Informe a data de nascimento ou a idade aproximada, não as duas.",
  });
}


const camposLongos = [
  [
    alergias,
    "Alergias",
  ],
  [
    necessidadesEspeciais,
    "Necessidades especiais",
  ],
  [
    comportamento,
    "Comportamento",
  ],
];


for (
  const [
    valor,
    nomeCampo,
  ] of camposLongos
) {
  if (valor.length > 2000) {
    return res.status(400).json({
      mensagem:
        `${nomeCampo} deve possuir no máximo 2000 caracteres.`,
    });
  }
}

    client =
      await pool.connect();

    await client.query("BEGIN");

    transacaoIniciada = true;


    /*
     * CPF é a proteção principal contra duplicidade.
     *
     * A UNIQUE existente no banco continua sendo a segunda
     * camada contra duas requisições simultâneas.
     */
    const tutorExistente =
      await client.query(
        `
          SELECT id

          FROM tutores

          WHERE cpf = $1

          LIMIT 1
        `,
        [cpfFormatado]
      );


    if (
      tutorExistente.rows.length > 0
    ) {
      await client.query("ROLLBACK");

      transacaoIniciada = false;

      return res.status(409).json({
        codigo:
          "TUTOR_EXISTENTE",

        mensagem:
          "Já existe um cadastro com este CPF. Utilize a opção Já sou cliente.",
      });
    }


    /*
     * Também verificamos e-mail e telefone para reduzir
     * cadastros duplicados causados por dados já existentes.
     *
     * Diferentemente do CPF, esses campos não possuem
     * atualmente uma constraint UNIQUE no banco.
     */
    const contatoExistente =
      await client.query(
        `
          SELECT id

          FROM tutores

          WHERE
            LOWER(email) =
              LOWER($1)

            OR REGEXP_REPLACE(
                 telefone,
                 '[^0-9]',
                 '',
                 'g'
               ) =
               REGEXP_REPLACE(
                 $2,
                 '[^0-9]',
                 '',
                 'g'
               )

          LIMIT 1
        `,
        [
          email,
          telefone,
        ]
      );


    if (
      contatoExistente.rows.length > 0
    ) {
      await client.query("ROLLBACK");

      transacaoIniciada = false;

      return res.status(409).json({
        codigo:
          "POSSIVEL_TUTOR_EXISTENTE",

        mensagem:
          "Já existe um cadastro utilizando este e-mail ou telefone. Utilize a opção Já sou cliente.",
      });
    }


    /*
     * -----------------------------------------------------
     * CRIA TUTOR
     * -----------------------------------------------------
     */
    const resultadoTutor =
      await client.query(
        `
          INSERT INTO tutores
          (
            nome,
            cpf,
            telefone,
            email,
            endereco,
            numero,
            complemento,
            bairro,
            cidade,
            estado,
            cep
          )

          VALUES
          (
            $1,$2,$3,$4,$5,$6,
            $7,$8,$9,$10,$11
          )

          RETURNING *
        `,
        [
          nome,
          cpfFormatado,
          telefone,
          email,
          endereco,
          numero,
          complemento || null,
          bairro,
          cidade,
          estado,
          cep,
        ]
      );


    const tutorCriado =
      resultadoTutor.rows[0];


    /*
     * -----------------------------------------------------
     * CRIA PET
     * -----------------------------------------------------
     */
const resultadoPet =
  await client.query(
    `
      INSERT INTO pets
      (
        tutor_id,
        nome,
        especie,
        raca,
        sexo,
        data_nascimento,
        peso,
        cor,
        observacoes,
        porte,
        castrado,
        alergias,
        necessidades_especiais,
        comportamento,
        idade_aproximada_anos
      )

      VALUES
      (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15
      )

      RETURNING *
    `,
    [
      tutorCriado.id,
      petNome,
      especie,
      raca || null,
      sexo || null,
      dataNascimento || null,
      peso,
      cor || null,
      observacoesPet || null,
      porte,
      castrado,
      alergias || null,
      necessidadesEspeciais || null,
      comportamento || null,
      idadeAproximada,
    ]
  );


    const petCriado =
      resultadoPet.rows[0];


    /*
     * O primeiro Tutor é também o principal.
     */
    await client.query(
      `
        INSERT INTO pet_tutores
        (
          pet_id,
          tutor_id,
          principal
        )

        VALUES
        (
          $1,
          $2,
          TRUE
        )
      `,
      [
        petCriado.id,
        tutorCriado.id,
      ]
    );


    /*
     * O cadastro acabou de ser realizado pelo próprio
     * cliente. Criamos imediatamente a sessão temporária
     * utilizada pelo restante do agendamento.
     */
    const {
      token,
      sessao,
    } = await criarSessaoCliente(
      tutorCriado.id,
      client
    );


    await client.query("COMMIT");

    transacaoIniciada = false;


    return res.status(201).json({
      mensagem:
        "Cadastro realizado com sucesso.",

      token,

      expira_em:
        sessao.expira_em,

      tutor: {
        id: tutorCriado.id,
        nome: tutorCriado.nome,
      },

      pet: {
        id: petCriado.id,
        nome: petCriado.nome,
        especie:
          petCriado.especie,
        raca:
          petCriado.raca,
      },
    });

  } catch (erro) {

    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer cadastro público:",
          erroRollback
        );
      }
    }


    /*
     * Mantemos proteção também para concorrência no CPF.
     */
    if (erro.code === "23505") {
      return res.status(409).json({
        codigo:
          "TUTOR_EXISTENTE",

        mensagem:
          "Já existe um cadastro com os dados informados.",
      });
    }


    console.error(
      "Erro ao cadastrar novo cliente público:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Não foi possível concluir o cadastro.",
    });

  } finally {

    if (client) {
      client.release();
    }
  }
}

module.exports = {
  solicitarIdentificacao,
  confirmarIdentificacao,
  listarPetsCliente,
  cadastrarNovoCliente,
};