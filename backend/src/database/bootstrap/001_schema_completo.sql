--
-- PostgreSQL database dump
--

\restrict mGE7WULjnmmS2YQ8TmzEHUR8SMiSzuxVwvNmsboefr9aVOssUnYAMTiTXAfZDe4

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agenda_publica_dias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agenda_publica_dias (
    id integer NOT NULL,
    data date NOT NULL,
    aberto boolean DEFAULT false NOT NULL,
    publicado boolean DEFAULT false NOT NULL,
    observacao text,
    criado_por integer,
    atualizado_por integer,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: agenda_publica_dias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agenda_publica_dias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agenda_publica_dias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agenda_publica_dias_id_seq OWNED BY public.agenda_publica_dias.id;


--
-- Name: agenda_publica_horarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agenda_publica_horarios (
    id integer NOT NULL,
    agenda_dia_id integer NOT NULL,
    horario time without time zone NOT NULL,
    status character varying(20) DEFAULT 'DISPONIVEL'::character varying NOT NULL,
    observacao text,
    criado_por integer,
    atualizado_por integer,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_agenda_publica_horario_status CHECK (((status)::text = ANY ((ARRAY['DISPONIVEL'::character varying, 'OCUPADO'::character varying, 'BLOQUEADO'::character varying])::text[])))
);


--
-- Name: agenda_publica_horarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agenda_publica_horarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agenda_publica_horarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agenda_publica_horarios_id_seq OWNED BY public.agenda_publica_horarios.id;


--
-- Name: agenda_publica_operacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agenda_publica_operacoes (
    id integer NOT NULL,
    tipo character varying(30) NOT NULL,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    configuracao jsonb,
    tratamento_existentes character varying(20),
    executado_por integer NOT NULL,
    autorizado_por integer,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_agenda_publica_operacao_tipo CHECK (((tipo)::text = ANY ((ARRAY['ABERTURA_MASSA'::character varying, 'FECHAMENTO_MASSA'::character varying, 'PUBLICACAO_MASSA'::character varying, 'ALTERACAO_MASSA'::character varying])::text[]))),
    CONSTRAINT chk_agenda_publica_periodo CHECK ((data_fim >= data_inicio)),
    CONSTRAINT chk_agenda_publica_tratamento CHECK (((tratamento_existentes IS NULL) OR ((tratamento_existentes)::text = ANY ((ARRAY['MANTER'::character varying, 'ADICIONAR'::character varying, 'SUBSTITUIR'::character varying])::text[]))))
);


--
-- Name: agenda_publica_operacoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agenda_publica_operacoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agenda_publica_operacoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agenda_publica_operacoes_id_seq OWNED BY public.agenda_publica_operacoes.id;


--
-- Name: banho_tosa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banho_tosa (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    status character varying(30) DEFAULT 'AGENDADO'::character varying NOT NULL,
    agendado_para timestamp without time zone NOT NULL,
    iniciado_em timestamp without time zone,
    finalizado_em timestamp without time zone,
    observacoes_agendamento text,
    observacoes_atendimento text,
    motivo_cancelamento text,
    cancelado_em timestamp without time zone,
    usuario_criacao_id integer,
    usuario_inicio_id integer,
    usuario_finalizacao_id integer,
    usuario_cancelamento_id integer,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    origem character varying(30) DEFAULT 'INTERNO'::character varying NOT NULL,
    agenda_publica_horario_id integer,
    CONSTRAINT chk_banho_tosa_origem CHECK (((origem)::text = ANY ((ARRAY['INTERNO'::character varying, 'PUBLICO'::character varying])::text[]))),
    CONSTRAINT chk_banho_tosa_status CHECK (((status)::text = ANY ((ARRAY['AGENDADO'::character varying, 'EM_ATENDIMENTO'::character varying, 'FINALIZADO'::character varying, 'CANCELADO'::character varying])::text[])))
);


--
-- Name: banho_tosa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.banho_tosa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: banho_tosa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.banho_tosa_id_seq OWNED BY public.banho_tosa.id;


--
-- Name: banho_tosa_servicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banho_tosa_servicos (
    id integer NOT NULL,
    banho_tosa_id integer NOT NULL,
    servico_id integer NOT NULL,
    valor_unitario numeric(10,2) NOT NULL,
    duracao_minutos integer NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_banho_tosa_servicos_duracao CHECK ((duracao_minutos > 0)),
    CONSTRAINT chk_banho_tosa_servicos_valor CHECK ((valor_unitario >= (0)::numeric))
);


--
-- Name: banho_tosa_servicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.banho_tosa_servicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: banho_tosa_servicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.banho_tosa_servicos_id_seq OWNED BY public.banho_tosa_servicos.id;


--
-- Name: creche; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creche (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    entrada_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    saida_em timestamp without time zone,
    observacoes_entrada text,
    observacoes_saida text,
    usuario_entrada_id integer NOT NULL,
    usuario_saida_id integer,
    status character varying(20) DEFAULT 'NA_CRECHE'::character varying NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_creche_saida CHECK (((saida_em IS NULL) OR (saida_em >= entrada_em))),
    CONSTRAINT chk_creche_status CHECK (((status)::text = ANY ((ARRAY['NA_CRECHE'::character varying, 'FINALIZADO'::character varying])::text[])))
);


--
-- Name: creche_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creche_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creche_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creche_id_seq OWNED BY public.creche.id;


--
-- Name: hotel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel (
    id integer NOT NULL,
    pet_id integer NOT NULL,
    entrada_prevista timestamp without time zone NOT NULL,
    saida_prevista timestamp without time zone NOT NULL,
    checkin_em timestamp without time zone,
    checkout_em timestamp without time zone,
    observacoes_reserva text,
    observacoes_checkin text,
    observacoes_checkout text,
    motivo_cancelamento text,
    usuario_criacao_id integer NOT NULL,
    usuario_checkin_id integer,
    usuario_checkout_id integer,
    usuario_cancelamento_id integer,
    status character varying(20) DEFAULT 'AGENDADO'::character varying NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_hotel_checkout CHECK (((checkout_em IS NULL) OR (checkin_em IS NULL) OR (checkout_em >= checkin_em))),
    CONSTRAINT chk_hotel_periodo CHECK ((saida_prevista > entrada_prevista)),
    CONSTRAINT chk_hotel_status CHECK (((status)::text = ANY ((ARRAY['AGENDADO'::character varying, 'HOSPEDADO'::character varying, 'FINALIZADO'::character varying, 'CANCELADO'::character varying])::text[])))
);


--
-- Name: hotel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hotel_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hotel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hotel_id_seq OWNED BY public.hotel.id;


--
-- Name: logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs (
    id bigint NOT NULL,
    usuario_id integer,
    acao character varying(100) NOT NULL,
    entidade character varying(100),
    registro_id integer,
    valor_anterior jsonb,
    valor_novo jsonb,
    ip character varying(45),
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.logs_id_seq OWNED BY public.logs.id;


--
-- Name: movimentacoes_estoque; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimentacoes_estoque (
    id integer NOT NULL,
    produto_id integer NOT NULL,
    tipo character varying(20) NOT NULL,
    quantidade integer NOT NULL,
    quantidade_anterior integer NOT NULL,
    quantidade_posterior integer NOT NULL,
    motivo character varying(255),
    usuario_id integer NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_movimentacao_anterior CHECK ((quantidade_anterior >= 0)),
    CONSTRAINT chk_movimentacao_posterior CHECK ((quantidade_posterior >= 0)),
    CONSTRAINT chk_movimentacao_quantidade CHECK ((quantidade > 0)),
    CONSTRAINT chk_movimentacao_tipo CHECK (((tipo)::text = ANY ((ARRAY['ENTRADA'::character varying, 'SAIDA'::character varying, 'AJUSTE_ENTRADA'::character varying, 'AJUSTE_SAIDA'::character varying])::text[])))
);


--
-- Name: movimentacoes_estoque_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimentacoes_estoque_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimentacoes_estoque_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimentacoes_estoque_id_seq OWNED BY public.movimentacoes_estoque.id;


--
-- Name: pagamentos_banho_tosa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagamentos_banho_tosa (
    id integer NOT NULL,
    banho_tosa_id integer NOT NULL,
    valor_total numeric(10,2) DEFAULT 0 NOT NULL,
    status character varying(30) DEFAULT 'PENDENTE'::character varying NOT NULL,
    metodo character varying(30),
    codigo_pagamento character varying(255),
    pago_em timestamp without time zone,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    motivo_estorno text,
    estornado_em timestamp without time zone,
    usuario_estorno_id integer,
    usuario_autorizacao_estorno_id integer,
    CONSTRAINT chk_pagamentos_banho_tosa_status CHECK (((status)::text = ANY ((ARRAY['PENDENTE'::character varying, 'PAGO'::character varying, 'CANCELADO'::character varying, 'ESTORNADO'::character varying])::text[]))),
    CONSTRAINT chk_pagamentos_banho_tosa_valor CHECK ((valor_total >= (0)::numeric))
);


--
-- Name: pagamentos_banho_tosa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagamentos_banho_tosa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagamentos_banho_tosa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagamentos_banho_tosa_id_seq OWNED BY public.pagamentos_banho_tosa.id;


--
-- Name: pet_tutores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pet_tutores (
    pet_id integer NOT NULL,
    tutor_id integer NOT NULL,
    principal boolean DEFAULT false NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pets (
    id integer NOT NULL,
    tutor_id integer NOT NULL,
    nome character varying(150) NOT NULL,
    especie character varying(50) NOT NULL,
    raca character varying(100),
    sexo character varying(20),
    data_nascimento date,
    peso numeric(6,2),
    cor character varying(100),
    foto character varying(500),
    observacoes text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    porte character varying(20),
    castrado boolean,
    alergias text,
    necessidades_especiais text,
    comportamento text,
    idade_aproximada_anos integer,
    CONSTRAINT chk_pets_idade_aproximada CHECK (((idade_aproximada_anos IS NULL) OR ((idade_aproximada_anos >= 0) AND (idade_aproximada_anos <= 100)))),
    CONSTRAINT chk_pets_nascimento_ou_idade CHECK (((data_nascimento IS NULL) OR (idade_aproximada_anos IS NULL))),
    CONSTRAINT chk_pets_peso CHECK (((peso IS NULL) OR (peso > (0)::numeric))),
    CONSTRAINT chk_pets_porte CHECK (((porte IS NULL) OR ((porte)::text = ANY ((ARRAY['pequeno'::character varying, 'medio'::character varying, 'grande'::character varying])::text[])))),
    CONSTRAINT chk_pets_sexo CHECK (((sexo IS NULL) OR ((sexo)::text = ANY ((ARRAY['macho'::character varying, 'femea'::character varying])::text[]))))
);


--
-- Name: pets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pets_id_seq OWNED BY public.pets.id;


--
-- Name: produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produtos (
    id integer NOT NULL,
    nome character varying(150) NOT NULL,
    categoria character varying(100),
    descricao text,
    unidade character varying(30) DEFAULT 'un'::character varying NOT NULL,
    valor_unitario numeric(10,2),
    quantidade_atual integer DEFAULT 0 NOT NULL,
    quantidade_minima integer DEFAULT 0 NOT NULL,
    observacoes text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_produto_quantidade CHECK (((quantidade_atual)::numeric >= (0)::numeric)),
    CONSTRAINT chk_produto_quantidade_minima CHECK (((quantidade_minima)::numeric >= (0)::numeric)),
    CONSTRAINT chk_produto_valor CHECK (((valor_unitario IS NULL) OR (valor_unitario >= (0)::numeric)))
);


--
-- Name: produtos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.produtos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: produtos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.produtos_id_seq OWNED BY public.produtos.id;


--
-- Name: servicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicos (
    id integer NOT NULL,
    nome character varying(150) NOT NULL,
    descricao text,
    valor numeric(10,2) NOT NULL,
    duracao_minutos integer NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_servicos_duracao CHECK ((duracao_minutos > 0)),
    CONSTRAINT chk_servicos_valor CHECK ((valor >= (0)::numeric))
);


--
-- Name: servicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.servicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: servicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.servicos_id_seq OWNED BY public.servicos.id;


--
-- Name: sessoes_cliente_publico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessoes_cliente_publico (
    id bigint NOT NULL,
    tutor_id integer NOT NULL,
    token_hash character varying(64) NOT NULL,
    expira_em timestamp without time zone NOT NULL,
    revogado_em timestamp without time zone,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sessoes_cliente_publico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sessoes_cliente_publico_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sessoes_cliente_publico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sessoes_cliente_publico_id_seq OWNED BY public.sessoes_cliente_publico.id;


--
-- Name: tutores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutores (
    id integer NOT NULL,
    nome character varying(150) NOT NULL,
    cpf character varying(14),
    telefone character varying(20) NOT NULL,
    email character varying(255),
    endereco character varying(255) NOT NULL,
    numero character varying(20),
    complemento character varying(100),
    bairro character varying(100),
    cidade character varying(100),
    estado character varying(2),
    cep character varying(9),
    observacoes text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tutores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tutores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tutores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tutores_id_seq OWNED BY public.tutores.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nome character varying(150) NOT NULL,
    email character varying(255) NOT NULL,
    senha_hash character varying(255) NOT NULL,
    perfil character varying(30) DEFAULT 'funcionario'::character varying NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    versao_sessao integer DEFAULT 1 NOT NULL
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: verificacoes_cliente_publico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verificacoes_cliente_publico (
    id bigint NOT NULL,
    tutor_id integer NOT NULL,
    canal character varying(20) NOT NULL,
    destino_normalizado character varying(255) NOT NULL,
    codigo_hash character varying(255) NOT NULL,
    tentativas integer DEFAULT 0 NOT NULL,
    expira_em timestamp without time zone NOT NULL,
    confirmado_em timestamp without time zone,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_verificacao_cliente_canal CHECK (((canal)::text = ANY ((ARRAY['EMAIL'::character varying, 'TELEFONE'::character varying])::text[]))),
    CONSTRAINT chk_verificacao_cliente_tentativas CHECK ((tentativas >= 0))
);


--
-- Name: verificacoes_cliente_publico_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verificacoes_cliente_publico_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verificacoes_cliente_publico_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verificacoes_cliente_publico_id_seq OWNED BY public.verificacoes_cliente_publico.id;


--
-- Name: agenda_publica_dias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_dias ALTER COLUMN id SET DEFAULT nextval('public.agenda_publica_dias_id_seq'::regclass);


--
-- Name: agenda_publica_horarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_horarios ALTER COLUMN id SET DEFAULT nextval('public.agenda_publica_horarios_id_seq'::regclass);


--
-- Name: agenda_publica_operacoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_operacoes ALTER COLUMN id SET DEFAULT nextval('public.agenda_publica_operacoes_id_seq'::regclass);


--
-- Name: banho_tosa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa ALTER COLUMN id SET DEFAULT nextval('public.banho_tosa_id_seq'::regclass);


--
-- Name: banho_tosa_servicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa_servicos ALTER COLUMN id SET DEFAULT nextval('public.banho_tosa_servicos_id_seq'::regclass);


--
-- Name: creche id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creche ALTER COLUMN id SET DEFAULT nextval('public.creche_id_seq'::regclass);


--
-- Name: hotel id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel ALTER COLUMN id SET DEFAULT nextval('public.hotel_id_seq'::regclass);


--
-- Name: logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs ALTER COLUMN id SET DEFAULT nextval('public.logs_id_seq'::regclass);


--
-- Name: movimentacoes_estoque id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_estoque ALTER COLUMN id SET DEFAULT nextval('public.movimentacoes_estoque_id_seq'::regclass);


--
-- Name: pagamentos_banho_tosa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_banho_tosa ALTER COLUMN id SET DEFAULT nextval('public.pagamentos_banho_tosa_id_seq'::regclass);


--
-- Name: pets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pets ALTER COLUMN id SET DEFAULT nextval('public.pets_id_seq'::regclass);


--
-- Name: produtos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos ALTER COLUMN id SET DEFAULT nextval('public.produtos_id_seq'::regclass);


--
-- Name: servicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos ALTER COLUMN id SET DEFAULT nextval('public.servicos_id_seq'::regclass);


--
-- Name: sessoes_cliente_publico id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessoes_cliente_publico ALTER COLUMN id SET DEFAULT nextval('public.sessoes_cliente_publico_id_seq'::regclass);


--
-- Name: tutores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutores ALTER COLUMN id SET DEFAULT nextval('public.tutores_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: verificacoes_cliente_publico id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verificacoes_cliente_publico ALTER COLUMN id SET DEFAULT nextval('public.verificacoes_cliente_publico_id_seq'::regclass);


--
-- Name: agenda_publica_dias agenda_publica_dias_data_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_dias
    ADD CONSTRAINT agenda_publica_dias_data_key UNIQUE (data);


--
-- Name: agenda_publica_dias agenda_publica_dias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_dias
    ADD CONSTRAINT agenda_publica_dias_pkey PRIMARY KEY (id);


--
-- Name: agenda_publica_horarios agenda_publica_horarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_horarios
    ADD CONSTRAINT agenda_publica_horarios_pkey PRIMARY KEY (id);


--
-- Name: agenda_publica_operacoes agenda_publica_operacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_operacoes
    ADD CONSTRAINT agenda_publica_operacoes_pkey PRIMARY KEY (id);


--
-- Name: banho_tosa banho_tosa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa
    ADD CONSTRAINT banho_tosa_pkey PRIMARY KEY (id);


--
-- Name: banho_tosa_servicos banho_tosa_servicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa_servicos
    ADD CONSTRAINT banho_tosa_servicos_pkey PRIMARY KEY (id);


--
-- Name: creche creche_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creche
    ADD CONSTRAINT creche_pkey PRIMARY KEY (id);


--
-- Name: hotel hotel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel
    ADD CONSTRAINT hotel_pkey PRIMARY KEY (id);


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_pkey PRIMARY KEY (id);


--
-- Name: movimentacoes_estoque movimentacoes_estoque_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_estoque
    ADD CONSTRAINT movimentacoes_estoque_pkey PRIMARY KEY (id);


--
-- Name: pagamentos_banho_tosa pagamentos_banho_tosa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_banho_tosa
    ADD CONSTRAINT pagamentos_banho_tosa_pkey PRIMARY KEY (id);


--
-- Name: pet_tutores pet_tutores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_tutores
    ADD CONSTRAINT pet_tutores_pkey PRIMARY KEY (pet_id, tutor_id);


--
-- Name: pets pets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pets
    ADD CONSTRAINT pets_pkey PRIMARY KEY (id);


--
-- Name: produtos produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);


--
-- Name: servicos servicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos
    ADD CONSTRAINT servicos_pkey PRIMARY KEY (id);


--
-- Name: sessoes_cliente_publico sessoes_cliente_publico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessoes_cliente_publico
    ADD CONSTRAINT sessoes_cliente_publico_pkey PRIMARY KEY (id);


--
-- Name: tutores tutores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutores
    ADD CONSTRAINT tutores_pkey PRIMARY KEY (id);


--
-- Name: agenda_publica_horarios uq_agenda_publica_horario; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_horarios
    ADD CONSTRAINT uq_agenda_publica_horario UNIQUE (agenda_dia_id, horario);


--
-- Name: banho_tosa_servicos uq_banho_tosa_servico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa_servicos
    ADD CONSTRAINT uq_banho_tosa_servico UNIQUE (banho_tosa_id, servico_id);


--
-- Name: pagamentos_banho_tosa uq_pagamentos_banho_tosa_atendimento; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_banho_tosa
    ADD CONSTRAINT uq_pagamentos_banho_tosa_atendimento UNIQUE (banho_tosa_id);


--
-- Name: sessoes_cliente_publico uq_sessao_cliente_token; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessoes_cliente_publico
    ADD CONSTRAINT uq_sessao_cliente_token UNIQUE (token_hash);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: verificacoes_cliente_publico verificacoes_cliente_publico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verificacoes_cliente_publico
    ADD CONSTRAINT verificacoes_cliente_publico_pkey PRIMARY KEY (id);


--
-- Name: idx_agenda_publica_dias_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agenda_publica_dias_data ON public.agenda_publica_dias USING btree (data);


--
-- Name: idx_agenda_publica_dias_publicacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agenda_publica_dias_publicacao ON public.agenda_publica_dias USING btree (data, aberto, publicado);


--
-- Name: idx_agenda_publica_horarios_dia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agenda_publica_horarios_dia ON public.agenda_publica_horarios USING btree (agenda_dia_id);


--
-- Name: idx_agenda_publica_horarios_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agenda_publica_horarios_status ON public.agenda_publica_horarios USING btree (agenda_dia_id, status);


--
-- Name: idx_agenda_publica_operacoes_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agenda_publica_operacoes_periodo ON public.agenda_publica_operacoes USING btree (data_inicio, data_fim);


--
-- Name: idx_agenda_publica_operacoes_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agenda_publica_operacoes_usuario ON public.agenda_publica_operacoes USING btree (executado_por);


--
-- Name: idx_banho_tosa_agenda_publica_horario; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_banho_tosa_agenda_publica_horario ON public.banho_tosa USING btree (agenda_publica_horario_id) WHERE (agenda_publica_horario_id IS NOT NULL);


--
-- Name: idx_banho_tosa_agendado_para; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banho_tosa_agendado_para ON public.banho_tosa USING btree (agendado_para);


--
-- Name: idx_banho_tosa_origem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banho_tosa_origem ON public.banho_tosa USING btree (origem);


--
-- Name: idx_banho_tosa_pet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banho_tosa_pet ON public.banho_tosa USING btree (pet_id);


--
-- Name: idx_banho_tosa_servicos_atendimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banho_tosa_servicos_atendimento ON public.banho_tosa_servicos USING btree (banho_tosa_id);


--
-- Name: idx_banho_tosa_servicos_servico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banho_tosa_servicos_servico ON public.banho_tosa_servicos USING btree (servico_id);


--
-- Name: idx_banho_tosa_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banho_tosa_status ON public.banho_tosa USING btree (status);


--
-- Name: idx_creche_entrada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creche_entrada ON public.creche USING btree (entrada_em);


--
-- Name: idx_creche_pet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creche_pet ON public.creche USING btree (pet_id);


--
-- Name: idx_creche_pet_aberto; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_creche_pet_aberto ON public.creche USING btree (pet_id) WHERE ((status)::text = 'NA_CRECHE'::text);


--
-- Name: idx_creche_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creche_status ON public.creche USING btree (status);


--
-- Name: idx_hotel_entrada_prevista; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_entrada_prevista ON public.hotel USING btree (entrada_prevista);


--
-- Name: idx_hotel_pet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_pet ON public.hotel USING btree (pet_id);


--
-- Name: idx_hotel_pet_hospedado; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_hotel_pet_hospedado ON public.hotel USING btree (pet_id) WHERE ((status)::text = 'HOSPEDADO'::text);


--
-- Name: idx_hotel_saida_prevista; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_saida_prevista ON public.hotel USING btree (saida_prevista);


--
-- Name: idx_hotel_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_status ON public.hotel USING btree (status);


--
-- Name: idx_movimentacoes_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimentacoes_data ON public.movimentacoes_estoque USING btree (criado_em);


--
-- Name: idx_movimentacoes_produto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimentacoes_produto ON public.movimentacoes_estoque USING btree (produto_id);


--
-- Name: idx_movimentacoes_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimentacoes_usuario ON public.movimentacoes_estoque USING btree (usuario_id);


--
-- Name: idx_pagamentos_banho_tosa_estornado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagamentos_banho_tosa_estornado_em ON public.pagamentos_banho_tosa USING btree (estornado_em);


--
-- Name: idx_pagamentos_banho_tosa_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagamentos_banho_tosa_status ON public.pagamentos_banho_tosa USING btree (status);


--
-- Name: idx_pet_tutores_principal; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pet_tutores_principal ON public.pet_tutores USING btree (pet_id) WHERE (principal = true);


--
-- Name: idx_pet_tutores_tutor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pet_tutores_tutor ON public.pet_tutores USING btree (tutor_id);


--
-- Name: idx_pets_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pets_nome ON public.pets USING btree (nome);


--
-- Name: idx_pets_tutor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pets_tutor ON public.pets USING btree (tutor_id);


--
-- Name: idx_produtos_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_categoria ON public.produtos USING btree (categoria);


--
-- Name: idx_produtos_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produtos_nome ON public.produtos USING btree (nome);


--
-- Name: idx_servicos_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicos_ativo ON public.servicos USING btree (ativo);


--
-- Name: idx_servicos_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicos_nome ON public.servicos USING btree (nome);


--
-- Name: idx_sessao_cliente_expiracao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessao_cliente_expiracao ON public.sessoes_cliente_publico USING btree (expira_em);


--
-- Name: idx_sessao_cliente_tutor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessao_cliente_tutor ON public.sessoes_cliente_publico USING btree (tutor_id);


--
-- Name: idx_tutores_cpf; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_tutores_cpf ON public.tutores USING btree (cpf) WHERE (cpf IS NOT NULL);


--
-- Name: idx_verificacao_cliente_expiracao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verificacao_cliente_expiracao ON public.verificacoes_cliente_publico USING btree (expira_em);


--
-- Name: idx_verificacao_cliente_tutor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verificacao_cliente_tutor ON public.verificacoes_cliente_publico USING btree (tutor_id);


--
-- Name: agenda_publica_dias fk_agenda_publica_dias_atualizado_por; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_dias
    ADD CONSTRAINT fk_agenda_publica_dias_atualizado_por FOREIGN KEY (atualizado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: agenda_publica_dias fk_agenda_publica_dias_criado_por; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_dias
    ADD CONSTRAINT fk_agenda_publica_dias_criado_por FOREIGN KEY (criado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: agenda_publica_horarios fk_agenda_publica_horarios_atualizado_por; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_horarios
    ADD CONSTRAINT fk_agenda_publica_horarios_atualizado_por FOREIGN KEY (atualizado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: agenda_publica_horarios fk_agenda_publica_horarios_criado_por; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_horarios
    ADD CONSTRAINT fk_agenda_publica_horarios_criado_por FOREIGN KEY (criado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: agenda_publica_horarios fk_agenda_publica_horarios_dia; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_horarios
    ADD CONSTRAINT fk_agenda_publica_horarios_dia FOREIGN KEY (agenda_dia_id) REFERENCES public.agenda_publica_dias(id) ON DELETE CASCADE;


--
-- Name: agenda_publica_operacoes fk_agenda_publica_operacoes_autorizado_por; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_operacoes
    ADD CONSTRAINT fk_agenda_publica_operacoes_autorizado_por FOREIGN KEY (autorizado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: agenda_publica_operacoes fk_agenda_publica_operacoes_executado_por; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agenda_publica_operacoes
    ADD CONSTRAINT fk_agenda_publica_operacoes_executado_por FOREIGN KEY (executado_por) REFERENCES public.usuarios(id);


--
-- Name: banho_tosa fk_banho_tosa_agenda_publica_horario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa
    ADD CONSTRAINT fk_banho_tosa_agenda_publica_horario FOREIGN KEY (agenda_publica_horario_id) REFERENCES public.agenda_publica_horarios(id) ON DELETE RESTRICT;


--
-- Name: banho_tosa fk_banho_tosa_pet; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa
    ADD CONSTRAINT fk_banho_tosa_pet FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE RESTRICT;


--
-- Name: banho_tosa_servicos fk_banho_tosa_servicos_atendimento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa_servicos
    ADD CONSTRAINT fk_banho_tosa_servicos_atendimento FOREIGN KEY (banho_tosa_id) REFERENCES public.banho_tosa(id) ON DELETE CASCADE;


--
-- Name: banho_tosa_servicos fk_banho_tosa_servicos_servico; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa_servicos
    ADD CONSTRAINT fk_banho_tosa_servicos_servico FOREIGN KEY (servico_id) REFERENCES public.servicos(id) ON DELETE RESTRICT;


--
-- Name: banho_tosa fk_banho_tosa_usuario_cancelamento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa
    ADD CONSTRAINT fk_banho_tosa_usuario_cancelamento FOREIGN KEY (usuario_cancelamento_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: banho_tosa fk_banho_tosa_usuario_criacao; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa
    ADD CONSTRAINT fk_banho_tosa_usuario_criacao FOREIGN KEY (usuario_criacao_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: banho_tosa fk_banho_tosa_usuario_finalizacao; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa
    ADD CONSTRAINT fk_banho_tosa_usuario_finalizacao FOREIGN KEY (usuario_finalizacao_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: banho_tosa fk_banho_tosa_usuario_inicio; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banho_tosa
    ADD CONSTRAINT fk_banho_tosa_usuario_inicio FOREIGN KEY (usuario_inicio_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: creche fk_creche_pet; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creche
    ADD CONSTRAINT fk_creche_pet FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE RESTRICT;


--
-- Name: creche fk_creche_usuario_entrada; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creche
    ADD CONSTRAINT fk_creche_usuario_entrada FOREIGN KEY (usuario_entrada_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: creche fk_creche_usuario_saida; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creche
    ADD CONSTRAINT fk_creche_usuario_saida FOREIGN KEY (usuario_saida_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: hotel fk_hotel_pet; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel
    ADD CONSTRAINT fk_hotel_pet FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE RESTRICT;


--
-- Name: hotel fk_hotel_usuario_cancelamento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel
    ADD CONSTRAINT fk_hotel_usuario_cancelamento FOREIGN KEY (usuario_cancelamento_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: hotel fk_hotel_usuario_checkin; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel
    ADD CONSTRAINT fk_hotel_usuario_checkin FOREIGN KEY (usuario_checkin_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: hotel fk_hotel_usuario_checkout; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel
    ADD CONSTRAINT fk_hotel_usuario_checkout FOREIGN KEY (usuario_checkout_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: hotel fk_hotel_usuario_criacao; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel
    ADD CONSTRAINT fk_hotel_usuario_criacao FOREIGN KEY (usuario_criacao_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: logs fk_logs_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT fk_logs_usuario FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: movimentacoes_estoque fk_movimentacao_produto; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_estoque
    ADD CONSTRAINT fk_movimentacao_produto FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;


--
-- Name: movimentacoes_estoque fk_movimentacao_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_estoque
    ADD CONSTRAINT fk_movimentacao_usuario FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: pagamentos_banho_tosa fk_pagamentos_banho_tosa_atendimento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_banho_tosa
    ADD CONSTRAINT fk_pagamentos_banho_tosa_atendimento FOREIGN KEY (banho_tosa_id) REFERENCES public.banho_tosa(id) ON DELETE CASCADE;


--
-- Name: pagamentos_banho_tosa fk_pagamentos_banho_tosa_usuario_autorizacao_estorno; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_banho_tosa
    ADD CONSTRAINT fk_pagamentos_banho_tosa_usuario_autorizacao_estorno FOREIGN KEY (usuario_autorizacao_estorno_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: pagamentos_banho_tosa fk_pagamentos_banho_tosa_usuario_estorno; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_banho_tosa
    ADD CONSTRAINT fk_pagamentos_banho_tosa_usuario_estorno FOREIGN KEY (usuario_estorno_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: pet_tutores fk_pet_tutores_pet; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_tutores
    ADD CONSTRAINT fk_pet_tutores_pet FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;


--
-- Name: pet_tutores fk_pet_tutores_tutor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_tutores
    ADD CONSTRAINT fk_pet_tutores_tutor FOREIGN KEY (tutor_id) REFERENCES public.tutores(id) ON DELETE CASCADE;


--
-- Name: pets fk_pets_tutor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pets
    ADD CONSTRAINT fk_pets_tutor FOREIGN KEY (tutor_id) REFERENCES public.tutores(id) ON DELETE RESTRICT;


--
-- Name: sessoes_cliente_publico fk_sessao_cliente_tutor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessoes_cliente_publico
    ADD CONSTRAINT fk_sessao_cliente_tutor FOREIGN KEY (tutor_id) REFERENCES public.tutores(id) ON DELETE CASCADE;


--
-- Name: verificacoes_cliente_publico fk_verificacao_cliente_tutor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verificacoes_cliente_publico
    ADD CONSTRAINT fk_verificacao_cliente_tutor FOREIGN KEY (tutor_id) REFERENCES public.tutores(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict mGE7WULjnmmS2YQ8TmzEHUR8SMiSzuxVwvNmsboefr9aVOssUnYAMTiTXAfZDe4

