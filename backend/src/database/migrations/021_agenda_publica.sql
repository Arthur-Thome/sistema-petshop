-- ============================================================
-- ETAPA 21
-- SITE PÚBLICO E PORTAL DO CLIENTE
-- AGENDA PÚBLICA
-- ============================================================
--
-- A agenda pública funciona por datas e horários explícitos.
--
-- Exemplos permitidos:
--
-- 1) Um único horário em um único dia
--    10/10/2026 -> 14:30
--
-- 2) Vários horários em um dia
--    11/10/2026 -> 08:00, 09:00, 14:30
--
-- 3) Uma semana inteira utilizando um padrão
--
-- 4) Um mês/período inteiro utilizando um padrão
--
-- IMPORTANTE:
-- A duração dos serviços NÃO é a regra principal utilizada
-- para determinar a disponibilidade pública.
--
-- Administradores e Gerentes podem alterar a agenda
-- diretamente.
--
-- Funcionários poderão solicitar alterações, mas o backend
-- exigirá autorização por senha de um Administrador ou
-- Gerente ativo antes de efetivar a operação.
--
-- A senha de autorização nunca será armazenada no banco.
-- ============================================================



-- ============================================================
-- 1. DIAS DA AGENDA PÚBLICA
-- ============================================================

CREATE TABLE IF NOT EXISTS agenda_publica_dias (

    id SERIAL PRIMARY KEY,

    -- Cada data possui no máximo uma configuração de agenda.
    data DATE NOT NULL UNIQUE,

    /*
     * Indica se a Amores Pet aceita agendamentos públicos
     * nesta data.
     *
     * Um dia pode existir no banco ainda fechado para permitir
     * preparação antecipada da configuração.
     */
    aberto BOOLEAN NOT NULL DEFAULT FALSE,

    /*
     * Somente dias publicados podem aparecer no site público.
     *
     * Isso permite configurar primeiro e publicar depois.
     */
    publicado BOOLEAN NOT NULL DEFAULT FALSE,

    observacao TEXT,

    /*
     * Usuário interno responsável pela criação inicial
     * da configuração.
     */
    criado_por INTEGER,

    /*
     * Último usuário interno que modificou a configuração.
     */
    atualizado_por INTEGER,

    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_agenda_publica_dias_criado_por
        FOREIGN KEY (criado_por)
        REFERENCES usuarios(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_agenda_publica_dias_atualizado_por
        FOREIGN KEY (atualizado_por)
        REFERENCES usuarios(id)
        ON DELETE SET NULL
);



-- ============================================================
-- 2. HORÁRIOS DA AGENDA
-- ============================================================

CREATE TABLE IF NOT EXISTS agenda_publica_horarios (

    id SERIAL PRIMARY KEY,

    agenda_dia_id INTEGER NOT NULL,

    /*
     * Horário explícito.
     *
     * Não existe obrigação de intervalos iguais.
     *
     * Exemplos válidos no mesmo dia:
     * 08:00
     * 09:15
     * 11:40
     * 16:30
     */
    horario TIME NOT NULL,

    /*
     * DISPONIVEL
     *     Pode ser oferecido no site.
     *
     * OCUPADO
     *     Foi utilizado/reservado.
     *
     * BLOQUEADO
     *     Existe na agenda, mas foi bloqueado internamente.
     */
    status VARCHAR(20)
        NOT NULL
        DEFAULT 'DISPONIVEL',

    observacao TEXT,

    criado_por INTEGER,

    atualizado_por INTEGER,

    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_agenda_publica_horarios_dia
        FOREIGN KEY (agenda_dia_id)
        REFERENCES agenda_publica_dias(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_agenda_publica_horarios_criado_por
        FOREIGN KEY (criado_por)
        REFERENCES usuarios(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_agenda_publica_horarios_atualizado_por
        FOREIGN KEY (atualizado_por)
        REFERENCES usuarios(id)
        ON DELETE SET NULL,


    /*
     * Impede cadastrar duas vezes exatamente o mesmo horário
     * para a mesma data.
     */
    CONSTRAINT uq_agenda_publica_horario
        UNIQUE (
            agenda_dia_id,
            horario
        ),


    CONSTRAINT chk_agenda_publica_horario_status
        CHECK (
            status IN (
                'DISPONIVEL',
                'OCUPADO',
                'BLOQUEADO'
            )
        )
);



-- ============================================================
-- 3. OPERAÇÕES EM MASSA
-- ============================================================
--
-- Esta tabela NÃO representa disponibilidade.
--
-- A disponibilidade real continua armazenada em:
--
-- agenda_publica_dias
-- agenda_publica_horarios
--
-- Aqui registramos a operação em massa que originou ou
-- modificou diversas datas. Isso melhora a rastreabilidade.
-- ============================================================

CREATE TABLE IF NOT EXISTS agenda_publica_operacoes (

    id SERIAL PRIMARY KEY,

    /*
     * Exemplos:
     *
     * ABERTURA_MASSA
     * FECHAMENTO_MASSA
     * PUBLICACAO_MASSA
     * ALTERACAO_MASSA
     */
    tipo VARCHAR(30) NOT NULL,

    data_inicio DATE NOT NULL,

    data_fim DATE NOT NULL,

    /*
     * Guarda um resumo estruturado da configuração utilizada.
     *
     * Exemplo:
     *
     * {
     *   "dias_semana": [1,2,3,4,5],
     *   "horarios": ["08:00","09:00","14:00"]
     * }
     *
     * O JSON não substitui as tabelas reais da agenda.
     * Ele serve para auditoria/rastreabilidade da operação.
     */
    configuracao JSONB,

    /*
     * Estratégia escolhida quando já existem datas
     * configuradas no período.
     *
     * MANTER
     * ADICIONAR
     * SUBSTITUIR
     */
    tratamento_existentes VARCHAR(20),

    executado_por INTEGER NOT NULL,

    /*
     * Normalmente NULL para Administrador/Gerente.
     *
     * Quando um Funcionário realiza a operação,
     * registra o Administrador/Gerente que autorizou.
     */
    autorizado_por INTEGER,

    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_agenda_publica_operacoes_executado_por
        FOREIGN KEY (executado_por)
        REFERENCES usuarios(id),


    CONSTRAINT fk_agenda_publica_operacoes_autorizado_por
        FOREIGN KEY (autorizado_por)
        REFERENCES usuarios(id)
        ON DELETE SET NULL,


    CONSTRAINT chk_agenda_publica_operacao_tipo
        CHECK (
            tipo IN (
                'ABERTURA_MASSA',
                'FECHAMENTO_MASSA',
                'PUBLICACAO_MASSA',
                'ALTERACAO_MASSA'
            )
        ),


    CONSTRAINT chk_agenda_publica_tratamento
        CHECK (
            tratamento_existentes IS NULL
            OR tratamento_existentes IN (
                'MANTER',
                'ADICIONAR',
                'SUBSTITUIR'
            )
        ),


    CONSTRAINT chk_agenda_publica_periodo
        CHECK (
            data_fim >= data_inicio
        )
);



-- ============================================================
-- 4. ÍNDICES
-- ============================================================


-- Pesquisa da agenda por data.
CREATE INDEX IF NOT EXISTS
    idx_agenda_publica_dias_data
ON agenda_publica_dias (
    data
);


-- Pesquisa dos dias que realmente podem aparecer no site.
CREATE INDEX IF NOT EXISTS
    idx_agenda_publica_dias_publicacao
ON agenda_publica_dias (
    data,
    aberto,
    publicado
);


-- Pesquisa dos horários pertencentes a determinado dia.
CREATE INDEX IF NOT EXISTS
    idx_agenda_publica_horarios_dia
ON agenda_publica_horarios (
    agenda_dia_id
);


-- Pesquisa rápida de disponibilidade.
CREATE INDEX IF NOT EXISTS
    idx_agenda_publica_horarios_status
ON agenda_publica_horarios (
    agenda_dia_id,
    status
);


-- Pesquisa das operações em massa por período.
CREATE INDEX IF NOT EXISTS
    idx_agenda_publica_operacoes_periodo
ON agenda_publica_operacoes (
    data_inicio,
    data_fim
);


-- Pesquisa das operações realizadas por determinado usuário.
CREATE INDEX IF NOT EXISTS
    idx_agenda_publica_operacoes_usuario
ON agenda_publica_operacoes (
    executado_por
);