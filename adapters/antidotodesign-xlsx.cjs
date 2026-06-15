/**
 * Adapter: Antidoto Design XLSX (Conta Azul — Visão Contas a Pagar / Receber)
 *
 * Lê dois arquivos exportados do Conta Azul:
 *   - visao_contas_a_receber.xls  (natureza R — receita)
 *   - visao_contas_a_pagar.xls    (natureza P — despesa)
 *
 * Colunas (Receber):
 *   "Nome do cliente"                      — cliente
 *   "Categoria 1"                          — categoria
 *   "Descrição"                            — descrição
 *   "Data de competência"                  — competência (DD/MM/YYYY)
 *   "Data de vencimento"                   — vencimento
 *   "Data do último pagamento"             — data pagamento
 *   "Situação"                             — "Quitado", "Em aberto", etc.
 *   "Valor original da parcela (R$)"       — valor total
 *   "Valor total recebido da parcela (R$)" — valor pago
 *   "Valor da parcela em aberto (R$)"      — valor aberto
 *   "Conta bancária"                       — conta
 *   "Centro de Custo 1"                    — centro de custo
 *
 * Colunas (Pagar):
 *   "Nome do fornecedor"                   — fornecedor
 *   "Categoria 1"                          — categoria
 *   "Descrição"                            — descrição
 *   "Data de competência"                  — competência (DD/MM/YYYY)
 *   "Data de vencimento"                   — vencimento
 *   "Data do último pagamento"             — data pagamento
 *   "Situação"                             — "Quitado", "Em aberto", etc.
 *   "Valor original da parcela (R$)"       — valor total
 *   "Valor total pago da parcela (R$)"     — valor pago
 *   "Valor da parcela em aberto (R$)"      — valor aberto
 *   "Conta bancária"                       — conta
 *   "Centro de Custo 1"                    — centro de custo
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

function readSheet(filePath, natureza) {
  console.log(`  Lendo: ${filePath}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`  ${rows.length} linhas raw (${natureza === 'R' ? 'receber' : 'pagar'})`);

  const REALIZADO_SET = new Set(['quitado', 'conciliado', 'confirmado', 'realizado', 'pago']);
  const movimentos = [];

  for (const r of rows) {
    const valorTotal = Math.abs(num(r['Valor original da parcela (R$)']));
    if (valorTotal === 0) continue;

    const situacao = String(r['Situação'] || '').trim().toLowerCase();
    const realizado = REALIZADO_SET.has(situacao);

    const categoria = String(r['Categoria 1'] || '').trim();
    // Excluir transferências entre contas
    if (/transfer[eê]ncia/i.test(categoria)) continue;

    const dataComp = isoDate(r['Data de competência']);
    const dataVenc = isoDate(r['Data de vencimento']);
    const dataPag = isoDate(r['Data do último pagamento']);

    // Valor pago: coluna difere entre pagar e receber
    const valorPagoRaw = natureza === 'R'
      ? num(r['Valor total recebido da parcela (R$)'])
      : num(r['Valor total pago da parcela (R$)']);
    const valorPago = Math.abs(valorPagoRaw);
    const valorAberto = Math.abs(num(r['Valor da parcela em aberto (R$)']));

    // Cliente/fornecedor: coluna difere entre pagar e receber
    const cliente = String(
      natureza === 'R'
        ? (r['Nome do cliente'] || '')
        : (r['Nome do fornecedor'] || '')
    ).trim();

    const contaBancaria = String(r['Conta bancária'] || '').trim();
    const centroCusto = String(r['Centro de Custo 1'] || '').trim();
    const descricao = String(r['Descrição'] || '').trim();
    const codRef = String(r['Código de referência'] || '').trim();
    const observacoes = String(r['Observações'] || '').trim();

    movimentos.push({
      fonte: 'antidotodesign-xlsx',
      natureza,
      status: realizado ? 'PAGO' : 'A_PAGAR',
      realizado,
      data_emissao: dataComp,
      data_vencimento: dataVenc || dataComp,
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
      observacao: descricao || observacoes,
      num_documento: codRef,
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
