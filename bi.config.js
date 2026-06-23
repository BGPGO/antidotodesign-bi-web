module.exports = {
  cliente: {
    nome: "Antidoto Design",
    subdomain: "antidotodesign-bi",
    coolify_app_uuid: "l2vjaruow1bk2ocl32fbyajc",
    cor_primaria: "#a78bfa",
  },
  fontes: {
    adapters: ["antidotodesign-xlsx"],
    antidotodesign_xlsx: {
      contas_pagar_file: "visao_contas_a_pagar.xls",
      contas_receber_file: "visao_contas_a_receber.xls",
    },
    drive: {
      base_path: "G:/Meu Drive/BGP/CLIENTES/BI/225. ANTIDOTO DESIGN/BASES",
    },
  },
  pages: {
    geral: {
      overview: "active", receita: "active", despesa: "active", custos: "active",
      fluxo: "active", tesouraria: "active", comparativo: "active",
      relatorio: "active", valuation: "hidden",
      orcamento: "hidden", dre: "hidden",
    },
    outros: {
      indicators: "hidden", faturamento_produto: "hidden", curva_abc: "hidden",
      marketing: "hidden", hierarquia: "hidden", detalhado: "hidden",
      profunda_cliente: "hidden", crm: "hidden",
    },
  },
  meta: { ano_corrente: 2026, metas_crm: { mes: 0, ano: 0 }, valuation_premissas: { wacc: 25, growth_year2: 20, growth_year3: 20, ipca: 4.5, perpetuity_growth: 10 } },
  template: { version_when_created: "1.0.0", version_last_synced: "1.0.0" },
};
