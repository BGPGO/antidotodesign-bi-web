/**
 * Adapter: Antidoto Design XLSX (Conta Azul — Visão Contas a Pagar / Receber)
 *
 * Lê dois arquivos exportados do Conta Azul:
 *   - visao_contas_a_receber.xls  (natureza R — receita)
 *   - visao_contas_a_pagar.xls    (natureza P — despesa)
 *
 * Colunas esperadas (Visão Contas a Pagar / Receber do Conta Azul):
 *   "Contato"                     — cliente/fornecedor
 *   "Nº do documento"             — número doc
 *   "Categoria"                   — categoria
 *   "Descrição"                   — descrição/observação
 *   "Data de emissão"             — data emissão
 *   "Data de vencimento"          — data vencimento
 *   "Data de pagamento"           — data pagamento (se quitado)
 *   "Data de competência"         — data competência
 *   "Valor"                       — valor total
 *   "Valor pago"                  — valor efetivamente pago
 *   "Valor em aberto"             — valor ainda em aberto
 *   "Situação"                    — "Quitado", "A vencer", "Vencido", etc.
 *   "Conta bancária"              — conta
 *   "Centro de custo"             — centro de custo
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function isoDate(v) {
  if (!v) return null;
  if (typeof v === 'number' && v > 1000) {
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function findCol(row, ...candidates) {
  for (const c of candidates) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === c.toLowerCase()) return row[key];
    }
  }
  return '';
}

function readSheet(filePath, natureza) {
  console.log(`  Lendo: ${filePath}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`  ${rows.length} linhas raw (${natureza === 'R' ? 'receber' : 'pagar'})`);

  const REALIZADO_SET = new Set(['quitado', 'conciliado', 'confirmado', 'realizado', 'pago']);
  const movimentos = [];

  for (const r of rows) {
    const valorTotal = Math.abs(num(findCol(r, 'Valor', 'Valor total', 'Valor (R$)')));
    if (valorTotal === 0) continue;

    const situacao = String(findCol(r, 'Situação', 'Situacao', 'Status')).trim().toLowerCase();
    const realizado = REALIZADO_SET.has(situacao);

    const categoria = String(findCol(r, 'Categoria', 'Categoria 1')).trim();
    // Excluir transferências entre contas
    if (/transfer[eê]ncia/i.test(categoria)) continue;

    const dataEmissao = isoDate(findCol(r, 'Data de emissão', 'Data de emissao', 'Data emissão', 'Data emissao'));
    const dataVenc = isoDate(findCol(r, 'Data de vencimento', 'Data vencimento'));
    const dataPag = isoDate(findCol(r, 'Data de pagamento', 'Data pagamento'));
    const dataComp = isoDate(findCol(r, 'Data de competência', 'Data de competencia', 'Data competência')) || dataEmissao;

    const valorPago = Math.abs(num(findCol(r, 'Valor pago')));
    const valorAberto = Math.abs(num(findCol(r, 'Valor em aberto', 'Valor aberto')));

    const cliente = String(findCol(r, 'Contato', 'Nome do fornecedor/cliente', 'Cliente', 'Fornecedor')).trim();
    const contaBancaria = String(findCol(r, 'Conta bancária', 'Conta bancaria', 'Conta')).trim();
    const centroCusto = String(findCol(r, 'Centro de custo', 'Centro de Custo', 'Centro de Custo 1...27')).trim();
    const descricao = String(findCol(r, 'Descrição', 'Descricao')).trim();
    const numDoc = String(findCol(r, 'Nº do documento', 'Numero do documento', 'N° do documento')).trim();

    movimentos.push({
      fonte: 'antidotodesign-xlsx',
      natureza,
      status: realizado ? 'PAGO' : 'A_PAGAR',
      realizado,
      data_emissao: dataEmissao,
      data_vencimento: dataVenc || dataEmissao,
      data_pagamento: realizado ? (dataPag || dataVenc) : null,
      data_competencia: dataComp,
      valor_total: valorTotal,
      valor_pago: realizado ? (valorPago || valorTotal) : valorPago,
      valor_aberto: realizado ? 0 : (valorAberto || valorTotal),
      categoria,
      centro_custo: centroCusto,
      cliente,
      conta_corrente: contaBancaria,
      codigo_banco: '',
      observacao: descricao,
      num_documento: numDoc,
      tags: [],
    });
  }

  return movimentos;
}

module.exports = {
  id: 'antidotodesign-xlsx',
  label: 'Antidoto Design XLSX (Conta Azul — Pagar/Receber)',
  required_env: [],

  validate(config) {
    const errors = [];
    const drive = config.fontes && config.fontes.drive && config.fontes.drive.base_path;
    if (!drive) errors.push('config.fontes.drive.base_path nao definido');
    else if (!fs.existsSync(drive)) errors.push(`drive base_path nao existe: ${drive}`);
    const ax = config.fontes && config.fontes['antidotodesign_xlsx'];
    if (!ax) errors.push('config.fontes.antidotodesign_xlsx nao definido');
    else {
      const pagarFile = ax.contas_pagar_file || 'visao_contas_a_pagar.xls';
      const receberFile = ax.contas_receber_file || 'visao_contas_a_receber.xls';
      if (drive) {
        const p1 = path.join(drive, pagarFile);
        const p2 = path.join(drive, receberFile);
        if (!fs.existsSync(p1)) errors.push(`contas a pagar file nao existe: ${p1}`);
        if (!fs.existsSync(p2)) errors.push(`contas a receber file nao existe: ${p2}`);
      }
    }
    return { ok: errors.length === 0, errors };
  },

  async pull(config, dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    const drive = config.fontes.drive.base_path;
    const ax = config.fontes['antidotodesign_xlsx'];
    const pagarFile = path.join(drive, ax.contas_pagar_file || 'visao_contas_a_pagar.xls');
    const receberFile = path.join(drive, ax.contas_receber_file || 'visao_contas_a_receber.xls');

    console.log('=== Antidoto Design XLSX pull ===');

    const movReceber = readSheet(receberFile, 'R');
    const movPagar = readSheet(pagarFile, 'P');

    const movimentos = [];
    let idCounter = 0;

    for (const m of [...movReceber, ...movPagar]) {
      idCounter++;
      m.id = String(idCounter);
      movimentos.push(m);
    }

    console.log(`  Total: ${movReceber.length} receitas + ${movPagar.length} despesas = ${movimentos.length} movimentos`);

    fs.writeFileSync(path.join(dataDir, 'movimentos.json'), JSON.stringify(movimentos, null, 2));

    // Empresa
    fs.writeFileSync(path.join(dataDir, 'empresa.json'), JSON.stringify({
      nome_fantasia: config.cliente?.nome || 'Antidoto Design',
      fonte: 'antidotodesign-xlsx',
    }));

    // Categorias
    const categorias = [...new Set(movimentos.map(m => m.categoria).filter(Boolean))]
      .map(name => ({ codigo: name, descricao: name, tipo: 'mista' }));
    fs.writeFileSync(path.join(dataDir, 'categorias.json'), JSON.stringify(categorias, null, 2));

    // Clientes
    const clientes = [...new Set(movimentos.map(m => m.cliente).filter(Boolean))]
      .map(name => ({ codigo: name, nome_fantasia: name, razao_social: name }));
    fs.writeFileSync(path.join(dataDir, 'clientes.json'), JSON.stringify(clientes, null, 2));

    // Contas correntes
    const contas = [...new Set(movimentos.map(m => m.conta_corrente).filter(Boolean))]
      .map(name => ({ codigo: name, descricao: name }));
    fs.writeFileSync(path.join(dataDir, 'contas_correntes.json'), JSON.stringify(contas, null, 2));

    fs.writeFileSync(path.join(dataDir, 'departamentos.json'), JSON.stringify([]));

    fs.writeFileSync(path.join(dataDir, '_summary.json'), JSON.stringify({
      adapter: 'antidotodesign-xlsx',
      timestamp: new Date().toISOString(),
      files: { pagar: pagarFile, receber: receberFile },
      records: movimentos.length,
      breakdown: { receitas: movReceber.length, despesas: movPagar.length },
    }, null, 2));

    console.log(`=== Antidoto Design XLSX OK: ${movimentos.length} movimentos canonical ===`);
    return { fetched: movimentos.length, summary: { adapter: 'antidotodesign-xlsx', records: movimentos.length } };
  },
};
