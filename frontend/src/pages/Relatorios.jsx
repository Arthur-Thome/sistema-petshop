import { useMemo, useState } from "react";
import api from "../services/api";
import "../styles/Relatorios.css";

const TIPOS = [
  { id: "atendimentos-servicos", nome: "Atendimentos e serviços" },
  { id: "creche", nome: "Creche" },
  { id: "hotel", nome: "Hotel" },
  { id: "estoque", nome: "Estoque" },
  { id: "financeiro", nome: "Financeiro", financeiro: true },
];
const LABELS = {
  confirmados: "Atendimentos confirmados", aguardando_confirmacao: "Aguardando confirmação",
  recusados: "Recusados", cancelados: "Cancelados", finalizados: "Finalizados",
  entradas: "Entradas", saidas: "Saídas", ainda_na_creche: "Na creche agora", reservas_no_periodo: "Reservas no período",
  agendadas: "Agendadas", hospedados: "Hospedados", canceladas: "Canceladas",
  noites_previstas: "Noites previstas", movimentacoes: "Movimentações",
  unidades_entrada: "Unidades de entrada", unidades_saida: "Unidades de saída",
  quantidade_pendente: "Pagamentos pendentes", bruto_recebido: "Bruto recebido",
  pagamentos_recebidos: "Recebimentos antes de estornos", quantidade_pago: "Pagamentos pagos",
  valor_pago_atual: "Receita ativa (somente PAGO)", valor_estornado: "Estornos no período",
  quantidade_estornada: "Pagamentos estornados", valor_pendente: "Valor pendente",
  quantidade_cancelada: "Pagamentos cancelados", valor_cancelado: "Valor cancelado",
  liquido_no_periodo: "Fluxo líquido de caixa no período",
};
const COLS = {
  "atendimentos-servicos": ["agendado_para", "pet_nome", "pet_especie", "tutor_nome", "status", "servicos", "valor_servicos_snapshot"],
  creche: ["entrada_em", "saida_em", "pet_nome", "pet_especie", "tutor_nome", "status", "observacoes_entrada"],
  hotel: ["entrada_prevista", "saida_prevista", "pet_nome", "pet_especie", "tutor_nome", "status"],
  estoque: ["criado_em", "produto_nome", "unidade", "tipo", "quantidade", "quantidade_anterior", "quantidade_posterior", "usuario_nome", "motivo"],
  estoque_baixo: ["produto_nome", "categoria", "unidade", "quantidade_atual", "quantidade_minima"],
  financeiro: ["criado_em", "atendimento_id", "pet_nome", "tutor_nome", "status", "metodo", "valor_total", "pago_em", "estornado_em", "atendimento_status"],
};

function dataHoje() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}
function formatar(chave, valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (/^(bruto_recebido|valor_pago_atual|valor_estornado|valor_pendente|valor_cancelado|liquido_no_periodo|valor_servicos_snapshot|valor_total)$/.test(chave)) {
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (Array.isArray(valor)) return valor.map((item) => item.nome).join(", ") || "—";
  return String(valor);
}
function protegerCSV(valor) {
  const texto = String(valor ?? "");
  const seguro = /^\s*[=+@-]/.test(texto) ? "'" + texto : texto;
  return '"' + seguro.replaceAll('"', '""') + '"';
}

function Relatorios() {
  const perfil = JSON.parse(localStorage.getItem("usuario") || "{}").perfil;
  const tiposDisponiveis = useMemo(() => TIPOS.filter((tipo) => !tipo.financeiro || ["administrador", "super_administrador", "gerente"].includes(perfil)), [perfil]);
  const [tipo, setTipo] = useState("atendimentos-servicos");
  const [inicio, setInicio] = useState(dataHoje().slice(0, 8) + "01");
  const [fim, setFim] = useState(dataHoje());
  const [status, setStatus] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [opcoesServicos, setOpcoesServicos] = useState([]);
  const [relatorio, setRelatorio] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar(evento) {
    evento?.preventDefault();
    setCarregando(true);
    setErro("");
    try {
      const params = { inicio, fim };
      if (tipo === "atendimentos-servicos") {
        if (status) params.status = status;
        if (servicoId) params.servico_id = servicoId;
      }
      const resposta = await api.get("/relatorios/" + tipo, { params });
      setRelatorio(resposta.data);
      if (tipo === "atendimentos-servicos" && !servicoId && Array.isArray(resposta.data.servicos)) {
        setOpcoesServicos(resposta.data.servicos);
      }
    } catch (falha) {
      setRelatorio(null);
      setErro(falha.response?.data?.mensagem || "Não foi possível carregar o relatório.");
    } finally {
      setCarregando(false);
    }
  }

  function exportarCSV() {
    if (!relatorio) return;
    const colunas = COLS[tipo] || [];
    const linhas = [
      ["Relatório", tiposDisponiveis.find((item) => item.id === tipo)?.nome || tipo],
      ["Período", inicio + " a " + fim, relatorio.periodo?.fuso],
      [],
      ["Indicador", "Valor"],
      ...Object.entries(relatorio.resumo || {}).map(([chave, valor]) => [LABELS[chave] || chave, valor]),
      ...(relatorio.estoque_baixo ? [[], ["Produtos abaixo do estoque mínimo"], COLS.estoque_baixo.map((chave) => LABELS[chave] || chave), ...relatorio.estoque_baixo.map((linha) => COLS.estoque_baixo.map((chave) => linha[chave]))] : []),
      [],
      colunas.map((chave) => LABELS[chave] || chave),
      ...(relatorio.dados || []).map((linha) => colunas.map((chave) => Array.isArray(linha[chave]) ? linha[chave].map((item) => item.nome).join("; ") : linha[chave])),
    ];
    const csv = "\uFEFF" + linhas.map((linha) => linha.map(protegerCSV).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-" + tipo + "-" + inicio + "-" + fim + ".csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const colunas = COLS[tipo] || [];
  const grupos = relatorio?.servicos || relatorio?.por_tipo || [];
  const maximo = Math.max(1, ...grupos.map((item) => Number(item.atendimentos_confirmados ?? item.unidades ?? item.movimentacoes ?? 0)));

  return <main className="relatorios-page">
    <header className="relatorios-header"><div><span>OPERAÇÃO</span><h1>Relatórios</h1><p>Indicadores por período, no fuso America/Sao_Paulo.</p></div>
      {relatorio && <div className="relatorios-acoes"><button type="button" onClick={exportarCSV}>Exportar CSV</button><button type="button" onClick={() => window.print()}>Imprimir / salvar PDF</button></div>}
    </header>
    <form className="relatorios-filtros" onSubmit={carregar}>
      <label>Relatório<select value={tipo} onChange={(e) => { setTipo(e.target.value); setRelatorio(null); }}>
        {tiposDisponiveis.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
      </select></label>
      <label>De<input type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
      <label>Até<input type="date" required value={fim} onChange={(e) => setFim(e.target.value)} /></label>
      {tipo === "atendimentos-servicos" && <>
        <label>Situação<select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas</option>
          {["AGENDADO", "EM_ATENDIMENTO", "FINALIZADO", "CANCELADO", "AGUARDANDO_CONFIRMACAO", "RECUSADO"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </select></label>
        <label>Serviço<select value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
          <option value="">Todos</option>
          {opcoesServicos.map((item) => <option key={item.servico_id} value={item.servico_id}>{item.servico_nome}</option>)}
        </select></label>
      </>}
      <button type="submit" disabled={carregando}>{carregando ? "Carregando…" : "Gerar relatório"}</button>
    </form>
    {erro && <div className="relatorios-erro" role="alert">{erro}</div>}
    {!relatorio && !erro && <div className="relatorios-vazio">Selecione o tipo e o período para gerar um relatório.</div>}
    {relatorio && <>
      <p className="relatorios-periodo">Período inclusivo: {relatorio.periodo.inicio} a {relatorio.periodo.fim} · {relatorio.periodo.fuso}</p>
      <section className="relatorios-kpis" aria-label="Indicadores do período">
        {Object.entries(relatorio.resumo || {}).map(([chave, valor]) => <article key={chave}><span>{LABELS[chave] || chave.replaceAll("_", " ")}</span><strong>{formatar(chave, valor)}</strong></article>)}
      </section>
      {grupos.length > 0 && <section className="relatorios-grafico"><h2>{tipo === "estoque" ? "Movimentações por tipo" : "Atendimentos por serviço"}</h2>
        {grupos.map((item) => {
          const total = Number(item.atendimentos_confirmados ?? item.unidades ?? item.movimentacoes ?? 0);
          return <div className="relatorios-barra" key={item.servico_id || item.tipo}><span>{item.servico_nome || item.tipo}</span><div><i style={{ width: (total ? Math.max(3, total / maximo * 100) : 0) + "%" }} /></div><b>{total}</b></div>;
        })}
      </section>}
      {[relatorio.criterio, relatorio.observacao_cancelamento, relatorio.nota_valores].filter(Boolean).map((nota) => <p className="relatorios-nota" key={nota}>{nota}</p>)}
      <section className="relatorios-tabela"><h2>Registros ({relatorio.dados?.length || 0})</h2>
        {relatorio.dados?.length ? <div><table><thead><tr>{colunas.map((chave) => <th key={chave}>{LABELS[chave] || chave.replaceAll("_", " ")}</th>)}</tr></thead>
          <tbody>{relatorio.dados.map((linha, i) => <tr key={linha.id || linha.pagamento_id || i}>{colunas.map((chave) => <td key={chave}>{formatar(chave, linha[chave])}</td>)}</tr>)}</tbody></table></div>
          : <p className="relatorios-vazio">Nenhum registro para o período selecionado.</p>}
      </section>
      {tipo === "estoque" && <section className="relatorios-tabela"><h2>Produtos abaixo do estoque mínimo ({relatorio.estoque_baixo?.length || 0})</h2>
        {relatorio.estoque_baixo?.length ? <div><table><thead><tr>{COLS.estoque_baixo.map((chave) => <th key={chave}>{LABELS[chave] || chave.replaceAll("_", " ")}</th>)}</tr></thead>
          <tbody>{relatorio.estoque_baixo.map((linha) => <tr key={linha.produto_id}>{COLS.estoque_baixo.map((chave) => <td key={chave}>{formatar(chave, linha[chave])}</td>)}</tr>)}</tbody></table></div>
          : <p className="relatorios-vazio">Nenhum produto ativo abaixo do estoque mínimo.</p>}
      </section>}
    </>}
  </main>;
}

export default Relatorios;
