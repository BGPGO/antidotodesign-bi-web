/* BIT/BGP Finance — Pages 1: Overview, Indicators, Receita, Despesa */
const { useState, useEffect } = React;

// Hook responsivo: detecta viewport mobile (<= 600px). Usado para ajustar SVGs com
// preserveAspectRatio="none" cujas coords sao plotadas em px absolutos.
const useIsMobile = (breakpoint = 600) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
};

const RangePills = ({ value, onChange }) => {
  const opts = ["7D", "30D", "90D", "YTD", "12M"];
  return (
    <div className="range-pills">
      {opts.map(o => (
        <button key={o} className={value === o ? "active" : ""} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
};

// Section heading — kept as a thin alias so all card titles share the standardized style
const SectionHeading = ({ strong, soft }) => (
  <h2 className="card-title">{[strong, soft].filter(Boolean).join(" ")}</h2>
);

// DRE helper — calcula indicadores Antidoto Design a partir de lista filtrada de TX
function computeDre(txs) {
  var receitaOp = 0, totalDespesas = 0, custos = 0;
  var impostos = 0, impostosSobreLucro = 0, despesasRestantes = 0;
  var despesasFinanceiras = 0, receitasFinanceiras = 0, reembolsoFinanceiro = 0;
  var capex = 0;
  var receitaOpMonth = Array(12).fill(0);
  var custosMonth = Array(12).fill(0);
  var capexMonth = Array(12).fill(0);
  var despesaMonth = Array(12).fill(0);
  var impostosMonth = Array(12).fill(0);
  var impLucroMonth = Array(12).fill(0);

  for (var i = 0; i < txs.length; i++) {
    var kind = txs[i][0], mes = txs[i][1], cat = txs[i][3] || "", val = txs[i][5], cc = txs[i][8] || "";
    var mIdx = mes ? parseInt(mes.slice(5, 7), 10) - 1 : -1;
    if (kind === "r") {
      if (cc === "Receitas") { receitaOp += val; if (mIdx >= 0 && mIdx < 12) receitaOpMonth[mIdx] += val; }
      if (cat.indexOf("03.2.0 Rendimentos de Aplic") >= 0) receitasFinanceiras += val;
      if (cat.indexOf("03.2.2 Reembolso_Despesas Financeiras") >= 0) reembolsoFinanceiro += val;
    }
    if (kind === "d") {
      totalDespesas += val;
      if (mIdx >= 0 && mIdx < 12) despesaMonth[mIdx] += val;
      if (cat.indexOf("03.0") >= 0) { custos += val; if (mIdx >= 0 && mIdx < 12) custosMonth[mIdx] += val; }
      if (cat.indexOf("02.0 PIS sobre Faturamento") >= 0 || cat.indexOf("02.0 COFINS sobre Faturamento") >= 0 || cat.indexOf("02.0 ISS sobre Faturamento") >= 0) {
        impostos += val; if (mIdx >= 0 && mIdx < 12) impostosMonth[mIdx] += val;
      }
      if (cat === "02.3 IRPJ sobre Lucro - TRIMESTRAL" || cat === "02.3 CSLL sobre Lucro - TRIMESTRAL") {
        impostosSobreLucro += val; if (mIdx >= 0 && mIdx < 12) impLucroMonth[mIdx] += val;
      }
      if (cat.indexOf("04.0") >= 0 || cat.indexOf("04.1") >= 0 || cat.indexOf("04.2") >= 0 ||
          cat.indexOf("04.3") >= 0 || cat.indexOf("04.4") >= 0 || cat.indexOf("06.0") >= 0 || cat.indexOf("07.0") >= 0) despesasRestantes += val;
      if (cat.indexOf("05.0") >= 0) despesasFinanceiras += val;
      if (cat.indexOf("08.0") >= 0 || /equip|veicul|maquin|imobili|investimento|ativo.*fixo|bens/i.test(cat)) { capex += val; if (mIdx >= 0 && mIdx < 12) capexMonth[mIdx] += val; }
    }
  }
  var despesasSemImpostos = totalDespesas - impostos - impostosSobreLucro;
  var despSemImpMonth = despesaMonth.map(function(v, i) { return v - impostosMonth[i] - impLucroMonth[i]; });
  var receitaOpLiquida = receitaOp - impostos;
  var ebit = receitaOpLiquida - custos - despesasRestantes;
  var lucroLiquido = ebit + receitasFinanceiras + reembolsoFinanceiro - despesasFinanceiras - impostosSobreLucro + 21.39;
  return {
    receitaOp, despesasSemImpostos, custos, impostos, impostosSobreLucro,
    despesasRestantes, despesasFinanceiras, receitasFinanceiras, reembolsoFinanceiro,
    receitaOpLiquida, ebit, lucroLiquido, capex, totalDespesas,
    receitaOpMonth, despSemImpMonth, custosMonth, capexMonth
  };
}

// Hook: filtra ALL_TX e computa DRE
function useDre(statusFilter, drilldown, year, refYear, filters) {
  return useMemo(function() {
    var rg = (filters && filters.regime === "competencia") ? "k" : "c";
    var sf = statusFilter || "realizado";
    var txs = window.filterTx ? window.filterTx(window.ALL_TX || [], sf, drilldown, rg === "k" ? "competencia" : "caixa", filters) : [];
    if (!drilldown) txs = txs.filter(function(r) { return r[1] && r[1].startsWith(String(year || refYear)); });
    return computeDre(txs);
  }, [statusFilter, drilldown, year, refYear, filters]);
}

// Side-by-side monthly bars (Receita green / Despesa red) with floating value chips
const OverviewBars = ({ data, height = 220, year = "2026", onBarClick, activeIdx, activeKind }) => {
  const B = window.BIT;
  const max = Math.max(...data.map(d => Math.max(d.receita, d.despesa, d.custos || 0)), 1);
  // Escala dinâmica: calcula step pra ter no máximo 5 ticks
  const magnitude = Math.pow(10, Math.floor(Math.log10(max || 1)));
  const rawStep = max / 4;
  const niceStep = rawStep <= magnitude ? magnitude : rawStep <= magnitude * 2 ? magnitude * 2 : magnitude * 5;
  const niceMax = Math.max(Math.ceil(max / niceStep) * niceStep, niceStep);
  const ticks = [];
  for (let v = 0; v <= niceMax; v += niceStep) ticks.push(v);
  if (ticks.length > 6) { ticks.length = 0; for (let v = 0; v <= niceMax; v += niceStep * 2) ticks.push(v); }
  const fmtAxis = (v) => v >= 1e6 ? `R$${(v / 1e6).toFixed(1).replace(".", ",")}M` : `R$${Math.round(v / 1000)}K`;
  const fmtChip = (v) => v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(".", ",")}M` : `${Math.round(v / 1000)}K`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1, 3);
  const hasActive = activeIdx != null && activeIdx >= 0;

  return (
    <div className="ov-bars">
      <div className="ov-bars-plot" style={{ height }}>
        <div className="ov-bars-axis">
          {ticks.map((t, i) => (
            <div key={i} className="ov-bars-tick" style={{ bottom: `${(t / niceMax) * 100}%` }}>
              <span>{fmtAxis(t)}</span>
            </div>
          ))}
        </div>
        <div className="ov-bars-cols">
          {data.map((d, i) => {
            const rH = (d.receita / niceMax) * 100;
            const dH = (d.despesa / niceMax) * 100;
            const cls = "ov-bar-col" + (onBarClick ? " clickable" : "") +
              (hasActive && i === activeIdx ? " active" : "") +
              (hasActive && i !== activeIdx ? " dimmed" : "");
            return (
              <div key={i} className={cls}>
                <div className="ov-bar-stack">
                  <div className="ov-bar green" style={{ height: `${rH}%`, cursor: onBarClick ? "pointer" : undefined, opacity: (hasActive && activeKind && activeKind !== "r") ? 0.25 : undefined, transition: "opacity 150ms, filter 150ms" }} title={`Receita: ${B.fmt(d.receita)}`}
                    onClick={onBarClick ? (e) => { e.stopPropagation(); onBarClick(d, i, "r"); } : undefined}>
                    <span className="ov-bar-chip">{fmtChip(d.receita)}</span>
                  </div>
                  <div className="ov-bar red" style={{ height: `${dH}%`, cursor: onBarClick ? "pointer" : undefined, opacity: (hasActive && activeKind && activeKind !== "d") ? 0.25 : undefined, transition: "opacity 150ms, filter 150ms" }} title={`Despesa: ${B.fmt(d.despesa)}`}
                    onClick={onBarClick ? (e) => { e.stopPropagation(); onBarClick(d, i, "d"); } : undefined}>
                    <span className="ov-bar-chip">{fmtChip(d.despesa)}</span>
                  </div>
                  {(d.custos > 0) && <div className="ov-bar amber" style={{ height: `${(d.custos / niceMax) * 100}%`, cursor: onBarClick ? "pointer" : undefined, opacity: (hasActive && activeKind && activeKind !== "c") ? 0.25 : undefined, transition: "opacity 150ms, filter 150ms" }} title={`Custos: ${B.fmt(d.custos)}`}
                    onClick={onBarClick ? (e) => { e.stopPropagation(); onBarClick(d, i, "c"); } : undefined}>
                    <span className="ov-bar-chip">{fmtChip(d.custos)}</span>
                  </div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ov-bars-x">
        {data.map((d, i) => <span key={i}>{cap(d.m)}</span>)}
      </div>
      <div className="ov-bars-year"><span>{year}</span></div>
    </div>
  );
};

// Diverging line chart — line + zero baseline + value labels above/below points
const IndicatorLine = ({ values, labels, height = 240, color = "var(--cyan)", format }) => {
  // No mobile reduzimos o viewBox horizontal (1100 -> 600) e a altura (240 -> 180).
  // Como preserveAspectRatio="none" estica o conteudo pra preencher a largura do container,
  // um viewBox mais estreito faz os pontos plotados em px absolutos ficarem espacados
  // de forma proporcional ao espaco disponivel no mobile (~326px), evitando o achatamento.
  const isMobile = useIsMobile();
  const w = isMobile ? 600 : 1100;
  const h = isMobile ? 180 : height;
  const padX = isMobile ? 28 : 50;
  const padTop = isMobile ? 28 : 36;
  const padBottom = isMobile ? 28 : 36;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const stepX = (w - padX * 2) / (values.length - 1);
  const xOf = (i) => padX + i * stepX;
  const yOf = (v) => padTop + (1 - (v - min) / range) * (h - padTop - padBottom);

  const pts = values.map((v, i) => [xOf(i), yOf(v)]);
  const curve = (p) => {
    let d = `M ${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1];
      const [x1, y1] = p[i];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
  };
  const path = curve(pts);
  const zeroY = yOf(0);
  const fmt = format || ((v) => window.BIT.fmt(v));

  // Em mobile, mostramos label de valor Y apenas nos pontos extremos
  // (primeiro, ultimo, max, min) pra evitar amassamento sobre a curva.
  const labelIdxSet = (() => {
    if (!isMobile || values.length <= 4) return null;
    let maxI = 0, minI = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[maxI]) maxI = i;
      if (values[i] < values[minI]) minI = i;
    }
    return new Set([0, values.length - 1, maxI, minI]);
  })();

  return (
    <svg className="ind-line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h }}>
      <defs>
        <linearGradient id="ind-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <line x1={padX} y1={zeroY} x2={w - padX} y2={zeroY} stroke="rgba(255,255,255,0.18)" strokeDasharray="6 5" strokeWidth="1"/>
      <path d={`${path} L ${pts[pts.length - 1][0]} ${zeroY} L ${pts[0][0]} ${zeroY} Z`} fill="url(#ind-grad)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map((p, i) => {
        const v = values[i];
        const above = v >= 0;
        const showLabel = labelIdxSet ? labelIdxSet.has(i) : true;
        return (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r={isMobile ? 3.5 : 4.5} fill={color} stroke="#0a141a" strokeWidth="2.5"/>
            {showLabel && (
              <text x={p[0]} y={above ? p[1] - 12 : p[1] + 22} textAnchor="middle" fill={v >= 0 ? "#e8f6f9" : "#fca5a5"} fontFamily="var(--font-mono)" fontSize={isMobile ? "10" : "11.5"} fontWeight="600">
                {fmt(v)}
              </text>
            )}
          </g>
        );
      })}
      {labels.map((l, i) => (
        i % 2 === 0 ? (
          <text key={i} x={xOf(i)} y={h - 10} textAnchor="middle" fill="var(--mute)" fontSize="11" fontFamily="var(--font-ui)">{l}</text>
        ) : null
      ))}
    </svg>
  );
};

const PageOverview = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters && filters.regime, filters), [statusFilter, drilldown, year, month, filters]);
  const BFull = useMemo(() => window.getBit(statusFilter, null, year, month, filters && filters.regime, filters), [statusFilter, year, month, filters]);
  const [indicator, setIndicator] = useState("Valor líquido");
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  // descobre o indice ativo se o drilldown for de mes (pra destacar a barra)
  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? B.MONTHS_FULL.findIndex(mn => {
        // drilldown.value formato "YYYY-MM" e MONTHS_FULL e ["janeiro","fevereiro",...]
        const mm = String(parseInt(drilldown.value.slice(5, 7), 10)).padStart(2, "0");
        const idx = parseInt(mm, 10) - 1;
        return B.MONTHS_FULL.indexOf(mn) === idx;
      })
    : -1;
  const handleBarMes = (d, i, kind) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    // Toggle: clicar de novo na mesma barra+tipo limpa o drilldown
    if (drilldown && drilldown.type === "mes" && drilldown.value === ym && drilldown.kind === kind) {
      setDrilldown(null);
      return;
    }
    const mesNome = d.m.charAt(0).toUpperCase() + d.m.slice(1, 3);
    const tipoNome = kind === "r" ? "Receitas" : kind === "c" ? "Custos" : "Despesas";
    const lbl = `${tipoNome} ${mesNome}/${refYear}`;
    setDrilldown({ type: "mes", value: ym, kind: kind, label: lbl });
  };

  // Indicator series for the toggle chart (derived da MONTH_DATA full — sem drilldown)
  const margemSeries = BFull.MONTH_DATA.map(m => m.receita > 0 ? ((m.receita - m.despesa) / m.receita) * 100 : 0);
  const indicatorSeries = {
    "Valor líquido":          { values: BFull.MONTH_DATA.map(m => m.receita - m.despesa), color: "var(--cyan)", fmt: (v) => B.fmt(v) },
    "Receita":                { values: BFull.MONTH_DATA.map(m => m.receita), color: "var(--green)", fmt: (v) => B.fmt(v) },
    "Despesa":                { values: BFull.MONTH_DATA.map(m => -m.despesa), color: "var(--red)", fmt: (v) => B.fmt(v) },
    "Margem Líquida":         { values: margemSeries, color: "var(--cyan)", fmt: (v) => `${v.toFixed(2).replace(".", ",")}%` },
  };
  const current = indicatorSeries[indicator];
  const monthLabels = B.MONTHS_FULL.map(m => `${m.charAt(0).toUpperCase() + m.slice(1, 3)} ${refYear}`);

  const dre = useDre(statusFilter, drilldown, year, refYear, filters);

  const indicadores = [
    { value: dre.receitaOp,           label: "Receita operacional",  kind: "receita" },
    { value: dre.despesasSemImpostos, label: "Despesas s/ impostos", kind: "despesa" },
    { value: dre.custos,              label: "Custos",               kind: "despesa" },
    { value: dre.impostos,            label: "Impostos",             kind: "despesa" },
    { value: dre.ebit,                label: "EBIT",                 kind: dre.ebit >= 0 ? "receita" : "despesa" },
    { value: dre.capex,               label: "CAPEX",                kind: "despesa" },
    { value: dre.lucroLiquido,        label: "Lucro líquido",        kind: dre.lucroLiquido >= 0 ? "receita" : "despesa" },
  ];

  // Dados do gráfico SEMPRE usam dreFull (sem drilldown) — barras não somem ao clicar
  const dreFull2 = useDre(statusFilter, null, year, refYear, filters);
  const chartData = BFull.MONTH_DATA.map((m, i) => ({
    ...m,
    receita: dreFull2.receitaOpMonth[i] || 0,
    despesa: dreFull2.despSemImpMonth[i] || 0,
    custos: dreFull2.custosMonth[i] || 0,
  }));

  // Extrato detalhado do mês clicado (para tabela de drill-down)
  const extratoMesFiltrado = useMemo(() => {
    if (!drilldown || drilldown.type !== "mes") return [];
    const rg = (filters && filters.regime === "competencia") ? "k" : "c";
    const sf = statusFilter || "realizado";
    let txs = window.filterTx ? window.filterTx(window.ALL_TX || [], sf, drilldown, rg === "k" ? "competencia" : "caixa", filters) : [];
    txs = txs.filter(r => r[1] && r[1].startsWith(String(year || refYear)));
    // Filtra por tipo (receita/despesa/custo) quando clicou numa barra específica
    if (drilldown.kind === "r") {
      txs = txs.filter(r => r[0] === "r");
    } else if (drilldown.kind === "d") {
      txs = txs.filter(r => r[0] === "d" && !(r[3] && r[3].indexOf("03.0") >= 0));
    } else if (drilldown.kind === "c") {
      txs = txs.filter(r => r[0] === "d" && r[3] && r[3].indexOf("03.0") >= 0);
    }
    return txs
      .map(r => ({
        data: `${String(r[2]).padStart(2, "0")}/${r[1].slice(5, 7)}/${r[1].slice(0, 4)}`,
        tipo: r[0] === "r" ? "Receita" : r[3] && r[3].indexOf("03.0") >= 0 ? "Custo" : "Despesa",
        categoria: r[3] || "",
        pessoa: r[0] === "r" ? (r[4] || "") : (r[7] || ""),
        pta: r[10] || "",
        descricao: r[11] || "",
        valor: r[0] === "r" ? r[5] : -r[5],
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [drilldown, statusFilter, year, refYear, filters]);

  const sfLabel = Array.isArray(statusFilter) ? statusFilter.join("+") : statusFilter;
  const statusLabel = sfLabel === "realizado" ? "realizado (PAGO)" :
                      sfLabel === "a_pagar_receber" ? "pendente (A vencer/receber)" :
                      sfLabel === "tudo" ? "tudo (pago + pendente)" : sfLabel;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Visão Geral</h1>
          <div className="status-line">Cliente · ano {refYear} · status <b>{statusLabel}</b></div>
        </div>
        <div className="actions">
          <PageExportButton pageId="overview" />
          <RegimeToggle filters={filters} setFilters={setFilters} />
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />
      <InlineFilterBar drilldown={drilldown} setDrilldown={setDrilldown} filters={filters} setFilters={setFilters} />

      <div className="row" style={{ gridTemplateColumns: "minmax(280px, 3fr) minmax(0, 9fr)" }}>
        {/* LEFT: Indicadores Principais + Resultado Geral */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="card">
            <SectionHeading strong="INDICADORES" soft="PRINCIPAIS" />
            <div className="kpi-stack">
              {indicadores.map((it, i) => (
                <div key={i} className={`kpi-stack-item ${it.kind}`}>
                  <div className="kpi-stack-value">{B.fmt(it.value)}</div>
                  <div className="kpi-stack-label">{it.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={`card ${dre.lucroLiquido >= 0 ? "resultado-card" : "resultado-card resultado-card-neg"}`}>
            <SectionHeading strong="RESULTADO" soft="GERAL" />
            <div className="kpi-stack-value resultado-val">{B.fmt(dre.lucroLiquido)}</div>
            <div className="kpi-stack-label">Lucro líquido</div>
            <div className="kpi-stack-pct" style={{ color: dre.receitaOp > 0 ? (dre.lucroLiquido >= 0 ? "var(--green)" : "var(--red)") : "var(--mute)" }}>
              {dre.receitaOp > 0 ? `${((dre.lucroLiquido / dre.receitaOp) * 100).toFixed(2).replace(".", ",")}%` : "—"}
            </div>
            <div className="kpi-stack-label">Margem líquida</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[1, 2, 3, 4].map(tri => {
              const mIni = (tri - 1) * 3;
              const recTri = (dre.receitaOpMonth || []).slice(mIni, mIni + 3).reduce((s, v) => s + v, 0);
              const despTri = (dre.despSemImpMonth || []).slice(mIni, mIni + 3).reduce((s, v) => s + v, 0);
              const liqTri = recTri - despTri;
              const margemTri = recTri > 0 ? ((liqTri / recTri) * 100) : 0;
              return (
                <div key={tri} className={`card ${liqTri >= 0 ? "resultado-card" : "resultado-card resultado-card-neg"}`} style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--fg-3)", marginBottom: 4 }}>{tri}º TRI</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: liqTri >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(liqTri)}</div>
                  <div style={{ fontSize: 11, color: recTri > 0 ? (liqTri >= 0 ? "var(--green)" : "var(--red)") : "var(--mute)" }}>
                    {recTri > 0 ? `${margemTri.toFixed(2).replace(".", ",")}%` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Receitas e Despesas + Visualização Indicadores */}
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <div className="card">
            <div className="card-title-row" style={{ marginBottom: 10 }}>
              <h2 className="card-title">Receitas, despesas e custos</h2>
            </div>
            <div className="legend-pills" style={{ flexWrap: "wrap" }}>
              <span className="legend-pill green">
                <span className="dot" />
                <span className="lbl">Receita</span>
                <span className="val">{B.fmtK(B.TOTAL_RECEITA)}</span>
              </span>
              <span className="legend-pill red">
                <span className="dot" />
                <span className="lbl">Despesa</span>
                <span className="val">{B.fmtK(B.TOTAL_DESPESA)}</span>
              </span>
              <span className="legend-pill amber">
                <span className="dot" />
                <span className="lbl">Custos</span>
                <span className="val">{B.fmtK(dre.custos)}</span>
              </span>
            </div>
            <OverviewBars data={chartData} height={260} year={String(refYear)} onBarClick={handleBarMes} activeIdx={activeMonthIdx} activeKind={drilldown && drilldown.kind} />
          </div>

          {/* Tabela detalhada do mês clicado */}
          {drilldown && drilldown.type === "mes" && extratoMesFiltrado.length > 0 && (
            <div className="card">
              <div className="card-title-row">
                <h2 className="card-title">Detalhamento · {drilldown.label}</h2>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{extratoMesFiltrado.length} lançamentos</span>
              </div>
              <div className="t-scroll" style={{ maxHeight: 400 }}>
                <table className="t">
                  <thead>
                    <tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Cliente / Fornecedor</th><th>PTA</th><th>Descrição</th><th className="num">Valor</th></tr>
                  </thead>
                  <tbody>
                    {extratoMesFiltrado.slice(0, 50).map((e, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{e.data}</td>
                        <td><span className={`chip ${e.tipo === "Receita" ? "green" : e.tipo === "Custo" ? "amber" : "red"}`} style={{ fontSize: 10 }}>{e.tipo}</span></td>
                        <td style={{ fontSize: 11 }}>{e.categoria}</td>
                        <td style={{ fontSize: 11 }}>{e.pessoa}</td>
                        <td style={{ fontSize: 11 }}>{e.pta}</td>
                        <td style={{ fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.descricao}</td>
                        <td className={`num ${e.valor >= 0 ? "green" : "red"}`}>{B.fmt(Math.abs(e.valor))}</td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td colSpan="6">Total</td>
                      <td className="num">{B.fmt(extratoMesFiltrado.reduce((s, e) => s + e.valor, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-title-row" style={{ marginBottom: 12 }}>
              <h2 className="card-title">Visualização indicadores</h2>
              <div className="ind-pills">
                {Object.keys(indicatorSeries).map(k => (
                  <button key={k} className={`ind-pill ${indicator === k ? "active" : ""}`} onClick={() => setIndicator(k)}>{k}</button>
                ))}
              </div>
            </div>
            <div className="legend-pills">
              <span className="legend-pill cyan">
                <span className="dot" />
                <span className="lbl">{indicator}</span>
                <span className="val">{indicator === "Margem Líquida"
                  ? `${(current.values.reduce((s, v) => s + v, 0) / current.values.length).toFixed(2).replace(".", ",")}%`
                  : B.fmtK(current.values.reduce((s, v) => s + v, 0))}</span>
              </span>
            </div>
            <IndicatorLine values={current.values} labels={monthLabels} height={260} color={current.color} format={current.fmt} />
          </div>
        </div>
      </div>
    </div>
  );
};

const PageIndicators = ({ filters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters && filters.regime, filters), [statusFilter, drilldown, year, month, filters]);
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  const dre = useDre(statusFilter, drilldown, year, refYear, filters);
  const totalReceita = dre.receitaOp;
  const totalDespesa = dre.despesasSemImpostos;
  const valorLiq = dre.lucroLiquido;
  const margemLiq = totalReceita > 0 ? (valorLiq / totalReceita) * 100 : 0;
  const dreFull = useDre(statusFilter, null, year, refYear, filters);
  const margemSeries = dreFull.receitaOpMonth.map((r, i) => r > 0 ? ((r - dreFull.despSemImpMonth[i]) / r) * 100 : 0);

  const handleBarMes = (d, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    if (drilldown && drilldown.type === "mes" && drilldown.value === ym) { setDrilldown(null); return; }
    const lbl = `${(d.m || "").charAt(0).toUpperCase() + (d.m || "").slice(1, 3)}/${refYear}`;
    setDrilldown({ type: "mes", value: ym, label: lbl });
  };
  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Indicadores</h1>
          <div className="status-line">Receita, despesa, valor líquido e margem · {statusFilter === "realizado" ? "realizado" : statusFilter === "tudo" ? "tudo" : "pendente"}</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />
      <InlineFilterBar drilldown={drilldown} setDrilldown={setDrilldown} filters={filters} setFilters={setFilters} />

      <div className="metric-strip">
        <div className="metric">
          <div className="m-label">Receita total</div>
          <div className="m-value">{B.fmt(totalReceita)}</div>
          <div className="m-pct">100%</div>
          <div className="m-bar"><div style={{ width: `100%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Despesa total</div>
          <div className="m-value">{B.fmt(totalDespesa)}</div>
          <div className="m-pct">{totalReceita > 0 ? `${((totalDespesa / totalReceita) * 100).toFixed(2).replace(".",",")}%` : "—"}</div>
          <div className="m-bar red"><div style={{ width: `${totalReceita > 0 ? Math.min(100, (totalDespesa / totalReceita) * 100) : 0}%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Valor líquido</div>
          <div className="m-value" style={{ color: valorLiq >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(valorLiq)}</div>
          <div className="m-pct">{margemLiq.toFixed(2).replace(".",",")}%</div>
          <div className="m-bar cyan"><div style={{ width: `${Math.min(100, Math.max(0, margemLiq))}%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Margem líquida</div>
          <div className="m-value">{margemLiq.toFixed(2).replace(".",",")}%</div>
          <div className="m-pct">média do período</div>
          <div className="m-bar"><div style={{ width: `${Math.min(100, Math.max(0, margemLiq))}%` }} /></div>
        </div>
      </div>

      <div className="row row-1-1">
        <div className="card">
          <h2 className="card-title">Margem líquida por mês</h2>
          <TrendChart
            values={margemSeries}
            labels={B.MONTHS}
            color="var(--cyan)"
            height={220}
            gradientId="ml-cyan"
          />
        </div>
        <div className="card">
          <h2 className="card-title">Receita vs Despesa por mês</h2>
          <MonthlyBars data={B.MONTHS_FULL.map((m, i) => ({ m, receita: dreFull.receitaOpMonth[i] || 0, despesa: dreFull.despSemImpMonth[i] || 0 }))} height={240} onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
        </div>
      </div>
    </div>
  );
};

const PageReceita = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters && filters.regime, filters), [statusFilter, drilldown, year, month, filters]);
  const BFull = useMemo(() => window.getBit(statusFilter, null, year, month, filters && filters.regime, filters), [statusFilter, year, month, filters]);
  const [range, setRange] = useState("12M");
  const [listView, setListView] = useState("categorias");
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  const dre = useDre(statusFilter, drilldown, year, refYear, filters);
  const dreFull = useDre(statusFilter, null, year, refYear, filters);
  const totalReceita = dre.receitaOp;
  const mesesComDados = dreFull.receitaOpMonth.filter(v => v > 0).length || 1;
  const mediaMes = totalReceita / mesesComDados;
  const numClientes = useMemo(() => {
    var rg = (filters && filters.regime === "competencia") ? "k" : "c";
    var seen = new Set();
    var txs = window.filterTx ? window.filterTx(window.ALL_TX || [], statusFilter || "realizado", drilldown, rg, filters) : [];
    txs = txs.filter(r => r[1] && r[1].startsWith(String(year || refYear)));
    for (var i = 0; i < txs.length; i++) { if (txs[i][0] === "r" && txs[i][8] === "Receitas" && txs[i][4]) seen.add(txs[i][4]); }
    return seen.size;
  }, [filters, statusFilter, drilldown, year, refYear]);
  const ticket = numClientes > 0 ? totalReceita / numClientes : 0;

  // Drilldown handlers (toggle: clicar de novo limpa)
  const handleBarMes = (v, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    if (drilldown && drilldown.type === "mes" && drilldown.value === ym) { setDrilldown(null); return; }
    const mn = B.MONTHS_FULL[i] || "";
    setDrilldown({ type: "mes", value: ym, label: `${mn.charAt(0).toUpperCase() + mn.slice(1, 3)}/${refYear}` });
  };
  const handleCategoria = (it) => { if (drilldown && drilldown.type === "categoria" && drilldown.value === it.name) { setDrilldown(null); return; } setDrilldown({ type: "categoria", value: it.name, label: it.name }); };
  const handleCliente = (it) => { if (drilldown && drilldown.type === "cliente" && drilldown.value === it.name) { setDrilldown(null); return; } setDrilldown({ type: "cliente", value: it.name, label: it.name }); };

  // Indices ativos para destaque
  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;
  const activeCategoria = (drilldown && drilldown.type === "categoria") ? drilldown.value : null;
  const activeCliente = (drilldown && drilldown.type === "cliente") ? drilldown.value : null;

  // Extrato filtrado de receitas (usa EXTRATO_RECEITAS pre-separado pelo build,
  // fallback pro filtro inline pra compat com BIT base)
  const extratoReceitas = B.EXTRATO_RECEITAS || B.EXTRATO.filter(e => e[4] > 0);
  const extratoFiltrado = window.applyDrilldown(extratoReceitas, drilldown);
  const totalFiltrado = drilldown
    ? extratoFiltrado.reduce((s, e) => s + e[4], 0)
    : totalReceita;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Receita</h1>
          <div className="status-line">Composição por categoria, cliente e mês</div>
        </div>
        <div className="actions">
          <PageExportButton pageId="receita" />
          <RegimeToggle filters={filters} setFilters={setFilters} />
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />
      <InlineFilterBar drilldown={drilldown} setDrilldown={setDrilldown} filters={filters} setFilters={setFilters} />

      <div className="row row-4">
        <KpiTile label="Receita operacional" value={B.fmtK(totalReceita)} sparkValues={dreFull.receitaOpMonth} sparkColor="var(--green)" tone="green" nonMonetary />
        <KpiTile label="Média por mês" value={B.fmtK(mediaMes)} sparkValues={dreFull.receitaOpMonth} sparkColor="var(--cyan)" tone="cyan" nonMonetary />
        <KpiTile label="Clientes" value={String(numClientes)} sparkValues={dreFull.receitaOpMonth.map(v => v > 0 ? 1 : 0)} sparkColor="var(--cyan)" tone="cyan" nonMonetary />
        <KpiTile label="Ticket médio" value={B.fmtK(ticket)} sparkValues={dreFull.receitaOpMonth.map(v => v / 30)} sparkColor="var(--green)" tone="green" nonMonetary />
      </div>

      <div className="card">
        <h2 className="card-title">Receita operacional por mês</h2>
        <SingleBars values={dreFull.receitaOpMonth} labels={BFull.MONTHS_FULL} color="green" height={240}
          onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
      </div>

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 4fr) minmax(0, 8fr)" }}>
        <div className="card">
          <div className="card-title-row" style={{ marginBottom: 10 }}>
            <div className="seg">
              <button className={listView === "categorias" ? "active" : ""} onClick={() => setListView("categorias")}>Categorias</button>
              <button className={listView === "clientes" ? "active" : ""} onClick={() => setListView("clientes")}>Clientes</button>
            </div>
          </div>
          {listView === "categorias"
            ? <BarList items={BFull.RECEITA_CATEGORIAS} color="green" onItemClick={handleCategoria} activeName={activeCategoria} />
            : <BarList items={BFull.RECEITA_CLIENTES} color="green" onItemClick={handleCliente} activeName={activeCliente} />
          }
        </div>

        <div style={{ position: "relative", minHeight: 0 }}>
          <div className="card" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="card-title-row">
              <h2 className="card-title">Extrato de receitas {drilldown ? `· ${drilldown.label}` : ""}</h2>
            </div>
            <div className="t-scroll" style={{ maxHeight: "none", flex: 1, minHeight: 0, overflow: "auto" }}>
            <table className="t">
              <thead>
                <tr><th>Data</th><th>Categoria</th><th>Cliente</th><th>PTA</th><th>Descrição</th><th className="num">Receita</th></tr>
              </thead>
              <tbody>
                {extratoFiltrado.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{e[0]}</td>
                    <td>{e[2]}</td>
                    <td>{e[3]}</td>
                    <td style={{ fontSize: 11 }}>{e[6] || ""}</td>
                    <td style={{ fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e[7] || ""}</td>
                    <td className="num green">{B.fmt(Math.abs(e[4]))}</td>
                  </tr>
                ))}
                {extratoFiltrado.length === 0 && (
                  <tr><td colSpan="6" style={{ color: "var(--mute)", textAlign: "center", padding: 18 }}>Sem receitas no filtro selecionado</td></tr>
                )}
                <tr className="total">
                  <td colSpan="5">Total{drilldown ? " (filtrado)" : ""}</td>
                  <td className="num green">{B.fmt(totalFiltrado)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PageDespesa = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters && filters.regime, filters), [statusFilter, drilldown, year, month, filters]);
  const BFull = useMemo(() => window.getBit(statusFilter, null, year, month, filters && filters.regime, filters), [statusFilter, year, month, filters]);
  const [range, setRange] = useState("12M");
  const [listView, setListView] = useState("categorias");
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  const dre = useDre(statusFilter, drilldown, year, refYear, filters);
  const dreFull = useDre(statusFilter, null, year, refYear, filters);
  const totalDespesa = dre.despesasSemImpostos;
  const mesesComDados = dreFull.despSemImpMonth.filter(v => v > 0).length || 1;
  const mediaMes = totalDespesa / mesesComDados;
  const numFornec = useMemo(() => {
    var rg = (filters && filters.regime === "competencia") ? "k" : "c";
    var seen = new Set();
    var txs = window.filterTx ? window.filterTx(window.ALL_TX || [], statusFilter || "realizado", drilldown, rg, filters) : [];
    txs = txs.filter(r => r[1] && r[1].startsWith(String(year || refYear)));
    for (var i = 0; i < txs.length; i++) { if (txs[i][0] === "d" && txs[i][7]) seen.add(txs[i][7]); }
    return seen.size;
  }, [filters, statusFilter, drilldown, year, refYear]);
  const mediaDesp = numFornec > 0 ? totalDespesa / numFornec : 0;

  const handleBarMes = (v, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    if (drilldown && drilldown.type === "mes" && drilldown.value === ym) { setDrilldown(null); return; }
    const mn = B.MONTHS_FULL[i] || "";
    setDrilldown({ type: "mes", value: ym, label: `${mn.charAt(0).toUpperCase() + mn.slice(1, 3)}/${refYear}` });
  };
  const handleCategoria = (it) => { if (drilldown && drilldown.type === "categoria" && drilldown.value === it.name) { setDrilldown(null); return; } setDrilldown({ type: "categoria", value: it.name, label: it.name }); };
  const handleFornecedor = (it) => { if (drilldown && drilldown.type === "fornecedor" && drilldown.value === it.name) { setDrilldown(null); return; } setDrilldown({ type: "fornecedor", value: it.name, label: it.name }); };

  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;
  const activeCategoria = (drilldown && drilldown.type === "categoria") ? drilldown.value : null;
  const activeFornecedor = (drilldown && drilldown.type === "fornecedor") ? drilldown.value : null;

  // Extrato filtrado de despesas (usa EXTRATO_DESPESAS pre-separado, fallback inline)
  const extratoDespesas = B.EXTRATO_DESPESAS || B.EXTRATO.filter(e => e[4] < 0);
  const extratoFiltrado = window.applyDrilldown(extratoDespesas, drilldown);
  const totalFiltrado = drilldown
    ? Math.abs(extratoFiltrado.reduce((s, e) => s + e[4], 0))
    : totalDespesa;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Despesa</h1>
          <div className="status-line">Composição por categoria, fornecedor e mês</div>
        </div>
        <div className="actions">
          <PageExportButton pageId="despesa" />
          <RegimeToggle filters={filters} setFilters={setFilters} />
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />
      <InlineFilterBar drilldown={drilldown} setDrilldown={setDrilldown} filters={filters} setFilters={setFilters} />

      <div className="row row-4">
        <KpiTile label="Despesas s/ impostos" value={B.fmtK(totalDespesa)} sparkValues={dreFull.despSemImpMonth} sparkColor="var(--red)" tone="red" nonMonetary />
        <KpiTile label="Média por mês" value={B.fmtK(mediaMes)} sparkValues={dreFull.despSemImpMonth} sparkColor="var(--red)" tone="red" nonMonetary />
        <KpiTile label="Fornecedores" value={String(numFornec)} sparkValues={dreFull.despSemImpMonth.map(v => v > 0 ? 1 : 0)} sparkColor="var(--cyan)" tone="cyan" nonMonetary />
        <KpiTile label="Média de despesa" value={B.fmtK(mediaDesp)} sparkValues={dreFull.despSemImpMonth.map(v => v / 30)} sparkColor="var(--red)" tone="red" nonMonetary />
      </div>

      <div className="card">
        <h2 className="card-title">Despesas s/ impostos por mês</h2>
        <SingleBars values={dreFull.despSemImpMonth} labels={BFull.MONTHS_FULL} color="red" height={240}
          onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
      </div>

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 4fr) minmax(0, 8fr)" }}>
        <div className="card">
          <div className="card-title-row" style={{ marginBottom: 10 }}>
            <div className="seg">
              <button className={listView === "categorias" ? "active" : ""} onClick={() => setListView("categorias")}>Categorias</button>
              <button className={listView === "fornecedores" ? "active" : ""} onClick={() => setListView("fornecedores")}>Fornecedores</button>
            </div>
          </div>
          {listView === "categorias"
            ? <BarList items={BFull.DESPESA_CATEGORIAS} color="red" onItemClick={handleCategoria} activeName={activeCategoria} />
            : <BarList items={BFull.DESPESA_FORNECEDORES} color="red" onItemClick={handleFornecedor} activeName={activeFornecedor} />
          }
        </div>

        <div style={{ position: "relative", minHeight: 0 }}>
          <div className="card" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="card-title-row">
              <h2 className="card-title">Extrato de despesas {drilldown ? `· ${drilldown.label}` : ""}</h2>
            </div>
            <div className="t-scroll" style={{ maxHeight: "none", flex: 1, minHeight: 0, overflow: "auto" }}>
              <table className="t">
                <thead>
                  <tr><th>Data</th><th>Categoria</th><th>Fornecedor</th><th>PTA</th><th>Descrição</th><th className="num">Despesa</th></tr>
              </thead>
              <tbody>
                {extratoFiltrado.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{e[0]}</td>
                    <td>{e[2]}</td>
                    <td>{e[3]}</td>
                    <td style={{ fontSize: 11 }}>{e[6] || ""}</td>
                    <td style={{ fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e[7] || ""}</td>
                    <td className="num red">{B.fmt(Math.abs(e[4]))}</td>
                  </tr>
                ))}
                {extratoFiltrado.length === 0 && (
                  <tr><td colSpan="6" style={{ color: "var(--mute)", textAlign: "center", padding: 18 }}>Sem despesas no filtro selecionado</td></tr>
                )}
                <tr className="total">
                  <td colSpan="5">Total{drilldown ? " (filtrado)" : ""}</td>
                  <td className="num red">{B.fmt(totalFiltrado)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===== PageCustos =====
const PageCustos = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters && filters.regime, filters), [statusFilter, drilldown, year, month, filters]);
  const BFull = useMemo(() => window.getBit(statusFilter, null, year, month, filters && filters.regime, filters), [statusFilter, year, month, filters]);
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  const dre = useDre(statusFilter, drilldown, year, refYear, filters);
  const dreFull = useDre(statusFilter, null, year, refYear, filters);
  const totalCustos = dre.custos;
  const mesesComDados = dreFull.custosMonth.filter(v => v > 0).length || 1;
  const mediaMes = totalCustos / mesesComDados;

  // Custos por categoria e fornecedor (filtrando só categorias 03.0)
  const { custosCategorias, custosFornecedores, extratoCustos } = useMemo(() => {
    var rg = (filters && filters.regime === "competencia") ? "k" : "c";
    var sf = statusFilter || "realizado";
    var txs = window.filterTx ? window.filterTx(window.ALL_TX || [], sf, drilldown, rg === "k" ? "competencia" : "caixa", filters) : [];
    txs = txs.filter(r => r[1] && r[1].startsWith(String(year || refYear)));
    // Só custos (categoria começa com 03.0)
    var custosTxs = txs.filter(r => r[0] === "d" && r[3] && r[3].indexOf("03.0") >= 0);
    var catMap = {};
    var fornMap = {};
    var extrato = [];
    for (var i = 0; i < custosTxs.length; i++) {
      var r = custosTxs[i];
      var cat = r[3] || "Sem categoria";
      var forn = r[7] || "Sem fornecedor";
      catMap[cat] = (catMap[cat] || 0) + r[5];
      fornMap[forn] = (fornMap[forn] || 0) + r[5];
      var dataStr = String(r[2]).padStart(2, "0") + "/" + r[1].slice(5, 7) + "/" + r[1].slice(0, 4);
      extrato.push([dataStr, r[8] || "", cat, forn, -r[5], ""]);
    }
    var cats = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    var forns = Object.entries(fornMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    extrato.sort((a, b) => Math.abs(b[4]) - Math.abs(a[4]));
    return { custosCategorias: cats, custosFornecedores: forns, extratoCustos: extrato };
  }, [filters, statusFilter, drilldown, year, refYear]);

  const numFornec = custosFornecedores.length;
  const mediaForn = numFornec > 0 ? totalCustos / numFornec : 0;

  const handleBarMes = (v, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    if (drilldown && drilldown.type === "mes" && drilldown.value === ym) { setDrilldown(null); return; }
    const mn = B.MONTHS_FULL[i] || "";
    setDrilldown({ type: "mes", value: ym, label: `${mn.charAt(0).toUpperCase() + mn.slice(1, 3)}/${refYear}` });
  };
  const handleCategoria = (it) => { if (drilldown && drilldown.type === "categoria" && drilldown.value === it.name) { setDrilldown(null); return; } setDrilldown({ type: "categoria", value: it.name, label: it.name }); };
  const handleFornecedor = (it) => { if (drilldown && drilldown.type === "fornecedor" && drilldown.value === it.name) { setDrilldown(null); return; } setDrilldown({ type: "fornecedor", value: it.name, label: it.name }); };

  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;
  const activeCategoria = (drilldown && drilldown.type === "categoria") ? drilldown.value : null;
  const activeFornecedor = (drilldown && drilldown.type === "fornecedor") ? drilldown.value : null;

  const extratoFiltrado = window.applyDrilldown(extratoCustos, drilldown);
  const totalFiltrado = drilldown
    ? Math.abs(extratoFiltrado.reduce((s, e) => s + e[4], 0))
    : totalCustos;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Custos</h1>
          <div className="status-line">Composição por categoria, fornecedor e mês</div>
        </div>
        <div className="actions">
          <PageExportButton pageId="custos" />
          <RegimeToggle filters={filters} setFilters={setFilters} />
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />
      <InlineFilterBar drilldown={drilldown} setDrilldown={setDrilldown} filters={filters} setFilters={setFilters} />

      <div className="row row-4">
        <KpiTile label="Custos totais" value={B.fmtK(totalCustos)} sparkValues={dreFull.custosMonth} sparkColor="var(--amber)" tone="amber" nonMonetary />
        <KpiTile label="Média por mês" value={B.fmtK(mediaMes)} sparkValues={dreFull.custosMonth} sparkColor="var(--amber)" tone="amber" nonMonetary />
        <KpiTile label="Fornecedores" value={String(numFornec)} sparkValues={dreFull.custosMonth.map(v => v > 0 ? 1 : 0)} sparkColor="var(--cyan)" tone="cyan" nonMonetary />
        <KpiTile label="Média por fornecedor" value={B.fmtK(mediaForn)} sparkValues={dreFull.custosMonth.map(v => v / 30)} sparkColor="var(--amber)" tone="amber" nonMonetary />
      </div>

      <div className="card">
        <h2 className="card-title">Custos por mês</h2>
        <SingleBars values={dreFull.custosMonth} labels={BFull.MONTHS_FULL} color="amber" height={240}
          onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
      </div>

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 4fr) minmax(0, 5fr) minmax(0, 4fr)" }}>
        <div className="card">
          <h2 className="card-title">Custos por categoria</h2>
          <BarList items={custosCategorias} color="amber" onItemClick={handleCategoria} activeName={activeCategoria} />
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Extrato de custos {drilldown ? `· ${drilldown.label}` : ""}</h2>
          </div>
          <div className="t-scroll">
            <table className="t">
              <thead>
                <tr><th>Data</th><th>Categoria</th><th>Fornecedor</th><th className="num">Custo</th></tr>
              </thead>
              <tbody>
                {extratoFiltrado.slice(0, 30).map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{e[0]}</td>
                    <td>{e[2]}</td>
                    <td>{e[3]}</td>
                    <td className="num" style={{ color: "var(--amber)" }}>{B.fmt(Math.abs(e[4]))}</td>
                  </tr>
                ))}
                {extratoFiltrado.length === 0 && (
                  <tr><td colSpan="4" style={{ color: "var(--mute)", textAlign: "center", padding: 18 }}>Sem custos no filtro selecionado</td></tr>
                )}
                <tr className="total">
                  <td colSpan="3">Total{drilldown ? " (filtrado)" : ""}</td>
                  <td className="num" style={{ color: "var(--amber)" }}>{B.fmt(totalFiltrado)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Custos por fornecedor</h2>
          <BarList items={custosFornecedores} color="amber" onItemClick={handleFornecedor} activeName={activeFornecedor} />
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageOverview, PageIndicators, PageReceita, PageDespesa, PageCustos, RangePills, computeDre, useDre });
