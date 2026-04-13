/**
 * evaluaciones.js — Módulo de evaluaciones de contratos capitados
 * Lee las matrices de evaluación desde Google Sheets públicos
 * Genera reportes y archivos Excel
 */

require('dotenv').config({ override: true });
const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ──────────────────────────────────────────────
// SHEETS IDS
// ──────────────────────────────────────────────

const SHEETS = {
  2023: '1jhuLSb_Khy1WDHYBrbydFVuWzIWv2TYi746M9u5Q8cc',
  2024: '14_4t6KyKtB2EIMjt0hS8Dg9S8ySo4Y9hrXM_7v-VyVE',
  2025: '141ppT10L-3TFY-jUlYeK_X9X0xESrmBkCeffJUu8jAg',
};

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

function parseMonto(val) {
  if (!val || typeof val !== 'string') return 0;
  // Formato hoja: $ 48,921,502.40 (coma=miles, punto=decimal)
  const cleaned = val.replace(/[\$\s]/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function formatPesos(n) {
  if (!n || n === 0) return '$0';
  return '$' + Math.round(n).toLocaleString('es-CO');
}

async function fetchCSV(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  const resp = await axios.get(url, { responseType: 'text' });
  return resp.data;
}

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const rows = lines.map(line => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === ',' && !inQuotes) { cells.push(current.trim()); current = ''; }
      else { current += line[i]; }
    }
    cells.push(current.trim());
    return cells;
  });
  return rows;
}

// Detecta si un prestador está evaluado, parcialmente evaluado o pendiente
function estadoEvaluacion(obs) {
  if (!obs || obs.trim() === '') return 'PENDIENTE';
  const o = obs.toUpperCase().trim();
  if (o.includes('EVALUADO') && !o.includes('FALTA') && !o.includes('SIN FIRMA') && !o.includes('SIN RADICAR')) {
    return 'EVALUADO';
  }
  if (o.includes('EVALUADO')) return 'PARCIAL';
  return 'PENDIENTE';
}

// ──────────────────────────────────────────────
// PARSERS POR VIGENCIA
// ──────────────────────────────────────────────

function parse2023(rows) {
  // Header fila 0: No. Contrato, ID Prestador, Nombre Prestador, Fecha Inicio, Fecha Fin, Municipio, Departamento, Modalidad, I TRIM, II TRIM, I BIMESTRE, NOV DIC, OBSERVACION
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || !r[2]) continue;
    const descuentos = [r[8], r[9], r[10], r[11]].map(parseMonto).reduce((a, b) => a + b, 0);
    data.push({
      contrato: r[0]?.trim() || '',
      nit: r[1]?.trim() || '',
      prestador: r[2]?.trim() || '',
      municipio: r[5]?.trim() || '',
      departamento: r[6]?.trim() || '',
      modalidad: r[7]?.trim() || '',
      descuentos,
      observacion: r[12]?.trim() || '',
      estado: estadoEvaluacion(r[12]),
    });
  }
  return data;
}

function parse2024(rows) {
  const data = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r[3] || !r[2]) continue;
    const obsCol = r.length > 24 ? r[24] : r[r.length - 1];
    const trimestres = {
      'I Trim':    { sub: parseMonto(r[14]), con: parseMonto(r[15]) },
      'II Trim':   { sub: parseMonto(r[16]), con: parseMonto(r[17]) },
      'III Trim':  { sub: parseMonto(r[18]), con: parseMonto(r[19]) },
      'IV Trim':   { sub: parseMonto(r[20]), con: parseMonto(r[21]) },
      'V Bimestre':{ sub: parseMonto(r[22]), con: parseMonto(r[23]) },
    };
    const descSub = Object.values(trimestres).reduce((a, t) => a + t.sub, 0);
    const descCon = Object.values(trimestres).reduce((a, t) => a + t.con, 0);
    data.push({
      contrato: r[4]?.trim() || '',
      nit: r[2]?.trim() || '',
      prestador: r[3]?.trim() || '',
      municipio: r[1]?.trim() || '',
      departamento: r[0]?.trim() || '',
      valorContrato: parseMonto(r[11]),
      trimestres,
      descuentosSub: descSub,
      descuentosCon: descCon,
      descuentos: descSub + descCon,
      observacion: obsCol?.trim() || '',
      estado: estadoEvaluacion(obsCol),
    });
  }
  return data;
}

function parse2025(rows) {
  const data = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r[2] || !r[1]) continue;
    const obsCol = r[18] || r[r.length - 1];
    const trimestres = {
      'I Trim (Ene-Feb-Mar)':   { sub: parseMonto(r[8]),  con: parseMonto(r[9])  },
      'II Trim (Abr-May-Jun)':  { sub: parseMonto(r[10]), con: parseMonto(r[11]) },
      'III Trim (Jul-Ago-Sep)': { sub: parseMonto(r[12]), con: parseMonto(r[13]) },
      'IV Trim (Oct-Nov-Dic)':  { sub: parseMonto(r[14]), con: parseMonto(r[15]) },
      'V Bimestre (Ene-Feb 26)':{ sub: parseMonto(r[16]), con: parseMonto(r[17]) },
    };
    const descSub = Object.values(trimestres).reduce((a, t) => a + t.sub, 0);
    const descCon = Object.values(trimestres).reduce((a, t) => a + t.con, 0);
    data.push({
      contrato: r[3]?.trim() || '',
      nit: r[1]?.trim() || '',
      prestador: r[2]?.trim() || '',
      municipio: r[0]?.trim() || '',
      departamento: '',
      valorContrato: parseMonto(r[7]),
      trimestres,
      descuentosSub: descSub,
      descuentosCon: descCon,
      descuentos: descSub + descCon,
      observacion: obsCol?.trim() || '',
      estado: estadoEvaluacion(obsCol),
    });
  }
  return data;
}

// ──────────────────────────────────────────────
// FUNCIÓN PRINCIPAL — OBTENER DATOS DE UNA VIGENCIA
// ──────────────────────────────────────────────

async function obtenerDatos(vigencia) {
  const sheetId = SHEETS[vigencia];
  if (!sheetId) throw new Error(`Vigencia ${vigencia} no disponible`);
  const csv = await fetchCSV(sheetId);
  const rows = parseCSV(csv);
  if (vigencia === 2023) return parse2023(rows);
  if (vigencia === 2024) return parse2024(rows);
  if (vigencia === 2025) return parse2025(rows);
}

// ──────────────────────────────────────────────
// GENERAR REPORTE TEXTO
// ──────────────────────────────────────────────

async function generarReporte(vigencia) {
  const datos = await obtenerDatos(vigencia);
  if (!datos.length) return `No hay datos para vigencia ${vigencia}.`;

  const evaluados   = datos.filter(d => d.estado === 'EVALUADO');
  const parciales   = datos.filter(d => d.estado === 'PARCIAL');
  const pendientes  = datos.filter(d => d.estado === 'PENDIENTE');

  // Top descuentos — agrupar por prestador
  const porPrestador = {};
  for (const d of datos) {
    if (!porPrestador[d.prestador]) porPrestador[d.prestador] = { descuentos: 0, contratos: 0 };
    porPrestador[d.prestador].descuentos += d.descuentos;
    porPrestador[d.prestador].contratos++;
  }
  const topDescuentos = Object.entries(porPrestador)
    .sort((a, b) => b[1].descuentos - a[1].descuentos)
    .slice(0, 5);

  const total = datos.length;
  const pEval = total > 0 ? ((evaluados.length / total) * 100).toFixed(1) : 0;
  const pParc = total > 0 ? ((parciales.length / total) * 100).toFixed(1) : 0;
  const pPend = total > 0 ? ((pendientes.length / total) * 100).toFixed(1) : 0;

  let msg = `╔══════════════════════════════╗\n`;
  msg += `║  📊 EVALUACIONES ${vigencia}       ║\n`;
  msg += `╚══════════════════════════════╝\n\n`;
  msg += `📋 Total contratos: *${total}*\n`;
  msg += `✅ Evaluados:       *${evaluados.length}* (${pEval}%)\n`;
  msg += `⚠️ Parciales:       *${parciales.length}* (${pParc}%)\n`;
  msg += `❌ Pendientes:      *${pendientes.length}* (${pPend}%)\n`;

  // ── Descuentos por trimestre → prestador → régimen ──
  const periodos = {};
  for (const d of datos) {
    if (!d.trimestres) continue;
    for (const [periodo, val] of Object.entries(d.trimestres)) {
      if (!periodos[periodo]) periodos[periodo] = {};
      if (!periodos[periodo][d.prestador]) periodos[periodo][d.prestador] = { sub: 0, con: 0 };
      periodos[periodo][d.prestador].sub += val.sub;
      periodos[periodo][d.prestador].con += val.con;
    }
  }

  if (Object.keys(periodos).length > 0) {
    msg += `\n📅 *DESCUENTOS POR TRIMESTRE Y RÉGIMEN*\n`;
    let num = 1;
    for (const [periodo, prestadores] of Object.entries(periodos)) {
      const listaSub = Object.entries(prestadores)
        .map(([n, v]) => ({ n, v: v.sub }))
        .filter(x => x.v > 0)
        .sort((a, b) => b.v - a.v);
      const listaCon = Object.entries(prestadores)
        .map(([n, v]) => ({ n, v: v.con }))
        .filter(x => x.v > 0)
        .sort((a, b) => b.v - a.v);
      const totalSub = listaSub.reduce((s, x) => s + x.v, 0);
      const totalCon = listaCon.reduce((s, x) => s + x.v, 0);
      if (totalSub + totalCon === 0) continue;

      msg += `\n┌─ *${num}. ${periodo}*\n`;

      if (listaSub.length > 0) {
        msg += `│ 🔵 *Subsidiado:*\n`;
        listaSub.slice(0, 10).forEach(({ n, v }, i) => {
          msg += `│  ${i + 1}. ${n}\n│     ${formatPesos(v)}\n`;
        });
        if (listaSub.length > 10) msg += `│  _...y ${listaSub.length - 10} más_\n`;
        msg += `│  ➤ *Total Sub: ${formatPesos(totalSub)}*\n`;
      }
      if (listaCon.length > 0) {
        msg += `│ 🟢 *Contributivo:*\n`;
        listaCon.slice(0, 10).forEach(({ n, v }, i) => {
          msg += `│  ${i + 1}. ${n}\n│     ${formatPesos(v)}\n`;
        });
        if (listaCon.length > 10) msg += `│  _...y ${listaCon.length - 10} más_\n`;
        msg += `│  ➤ *Total Con: ${formatPesos(totalCon)}*\n`;
      }
      msg += `└─ 💰 *TOTAL: ${formatPesos(totalSub + totalCon)}*\n`;
      num++;
    }
    msg += '\n';
  }

  if (topDescuentos.length > 0) {
    msg += `\n🏆 *TOP PRESTADORES — TOTAL DESCUENTOS*\n`;
    topDescuentos.forEach(([nombre, info], i) => {
      if (info.descuentos > 0) {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        msg += `${medal} *${nombre}*\n   ${formatPesos(info.descuentos)}\n`;
      }
    });
    msg += '\n';
  }

  if (pendientes.length > 0) {
    msg += `❌ *PENDIENTES DE EVALUAR (${pendientes.length})*\n`;
    pendientes.forEach((d, i) => {
      // Detectar trimestres sin datos
      const trimPendientes = d.trimestres
        ? Object.entries(d.trimestres)
            .filter(([, v]) => v.sub === 0 && v.con === 0)
            .map(([k]) => k.split(' ').slice(0, 2).join(' '))
        : [];
      msg += `  ${i + 1}. *${d.prestador}*\n`;
      msg += `     📍 ${d.municipio}${d.contrato ? ' — ' + d.contrato : ''}\n`;
      if (trimPendientes.length > 0) {
        msg += `     ⏳ Sin datos: ${trimPendientes.join(', ')}\n`;
      }
      if (d.observacion) msg += `     📝 ${d.observacion}\n`;
    });
    msg += '\n';
  }

  if (parciales.length > 0) {
    msg += `⚠️ *EVALUACIÓN INCOMPLETA (${parciales.length})*\n`;
    parciales.forEach((d, i) => {
      const trimPend = d.trimestres
        ? Object.entries(d.trimestres)
            .filter(([, v]) => v.sub === 0 && v.con === 0)
            .map(([k]) => k.split(' ').slice(0, 2).join(' '))
        : [];
      msg += `  ${i + 1}. *${d.prestador}*\n`;
      msg += `     📍 ${d.municipio}${d.contrato ? ' — ' + d.contrato : ''}\n`;
      if (trimPend.length > 0) msg += `     ⏳ Sin datos: ${trimPend.join(', ')}\n`;
      if (d.observacion) msg += `     📝 ${d.observacion}\n`;
    });
    msg += '\n';
  }

  // ── TOTALES VIGENCIA ──
  const totalSubVig = datos.reduce((s, d) => s + (d.descuentosSub || 0), 0);
  const totalConVig = datos.reduce((s, d) => s + (d.descuentosCon || 0), 0);
  const totalVig    = totalSubVig + totalConVig;

  msg += `╔══════════════════════════════╗\n`;
  msg += `║  💰 TOTAL DESCUENTOS ${vigencia}  ║\n`;
  msg += `╚══════════════════════════════╝\n`;
  msg += `🔵 Subsidiado:   *${formatPesos(totalSubVig)}*\n`;
  msg += `🟢 Contributivo: *${formatPesos(totalConVig)}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💎 *TOTAL GENERAL: ${formatPesos(totalVig)}*\n`;

  return msg;
}

// ──────────────────────────────────────────────
// REPORTE SOLO PENDIENTES
// ──────────────────────────────────────────────

function formatPendientes(datos, vigencia) {
  const pendientes = datos.filter(d => d.estado === 'PENDIENTE');
  const parciales  = datos.filter(d => d.estado === 'PARCIAL');
  if (!pendientes.length && !parciales.length) return `✅ Sin pendientes en vigencia ${vigencia}.`;

  let msg = `\n📅 *VIGENCIA ${vigencia}* — ${pendientes.length} pendientes, ${parciales.length} parciales\n`;

  pendientes.forEach((d, i) => {
    const trimPend = d.trimestres
      ? Object.entries(d.trimestres)
          .filter(([, v]) => v.sub === 0 && v.con === 0)
          .map(([k]) => k.split(' ').slice(0, 2).join(' '))
      : [];
    msg += `  ${i + 1}. *${d.prestador}*\n`;
    msg += `     📍 ${d.municipio}${d.contrato ? ' — ' + d.contrato : ''}\n`;
    if (trimPend.length > 0) msg += `     ⏳ Sin datos: ${trimPend.join(', ')}\n`;
    if (d.observacion) msg += `     📝 ${d.observacion}\n`;
  });

  if (parciales.length > 0) {
    msg += `\n⚠️ *EVALUACIÓN INCOMPLETA (${parciales.length})*\n`;
    parciales.forEach((d, i) => {
      msg += `  ${i + 1}. *${d.prestador}*\n`;
      msg += `     📍 ${d.municipio}${d.contrato ? ' — ' + d.contrato : ''}\n`;
      if (d.observacion) msg += `     📝 ${d.observacion}\n`;
    });
  }
  return msg;
}

async function reportePendientes(vigencia) {
  const datos = await obtenerDatos(vigencia);
  let msg = `╔══════════════════════════════╗\n`;
  msg += `║  ❌ PENDIENTES ${vigencia}         ║\n`;
  msg += `╚══════════════════════════════╝\n`;
  msg += formatPendientes(datos, vigencia);
  return msg;
}

async function reportePendientesTodas() {
  let msg = `╔══════════════════════════════╗\n`;
  msg += `║  ❌ PENDIENTES TODAS VIGENCIAS║\n`;
  msg += `╚══════════════════════════════╝\n`;
  for (const v of [2023, 2024, 2025]) {
    if (!SHEETS[v]) continue;
    const datos = await obtenerDatos(v);
    msg += formatPendientes(datos, v);
    msg += `─────────────────────────────\n`;
  }
  return msg;
}

// ──────────────────────────────────────────────
// GENERAR EXCEL (con formato, colores y resumen)
// ──────────────────────────────────────────────

const ExcelJS = require('exceljs');

const COLOR = {
  EVALUADO:  { argb: 'FFD9EAD3' }, // verde claro
  PARCIAL:   { argb: 'FFFFF2CC' }, // amarillo claro
  PENDIENTE: { argb: 'FFFCE5CD' }, // naranja claro
  HEADER:    { argb: 'FF1F4E79' }, // azul oscuro
  HEADER_TXT:{ argb: 'FFFFFFFF' }, // blanco
  TOTAL_BG:  { argb: 'FFD0E4F5' }, // azul claro
};

function aplicarEstilo(cell, estado) {
  const bg = COLOR[estado] || { argb: 'FFFFFFFF' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: bg };
}

async function generarExcel(vigencia) {
  const datos = await obtenerDatos(vigencia);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bot Salud';
  wb.created = new Date();

  // ── Hoja 1: Detalle completo ──
  const ws = wb.addWorksheet(`Vigencia ${vigencia}`, { views: [{ state: 'frozen', ySplit: 1 }] });

  const cols = [
    { header: 'No. Contrato',       key: 'contrato',      width: 20 },
    { header: 'NIT',                key: 'nit',           width: 16 },
    { header: 'Prestador',          key: 'prestador',     width: 48 },
    { header: 'Municipio',          key: 'municipio',     width: 20 },
    { header: 'Valor Contrato',     key: 'valorContrato', width: 22, style: { numFmt: '"$"#,##0.00' } },
    { header: 'I Trim - Sub',       key: 'iTrimSub',      width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'I Trim - Con',       key: 'iTrimCon',      width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'II Trim - Sub',      key: 'iiTrimSub',     width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'II Trim - Con',      key: 'iiTrimCon',     width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'III Trim - Sub',     key: 'iiiTrimSub',    width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'III Trim - Con',     key: 'iiiTrimCon',    width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'IV Trim - Sub',      key: 'ivTrimSub',     width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'IV Trim - Con',      key: 'ivTrimCon',     width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'V Bimestre - Sub',   key: 'vBimSub',       width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'V Bimestre - Con',   key: 'vBimCon',       width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'Total Sub',          key: 'totalSub',      width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'Total Con',          key: 'totalCon',      width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'Total Descuentos',   key: 'totalDesc',     width: 22, style: { numFmt: '"$"#,##0.00' } },
    { header: 'Estado',             key: 'estado',        width: 14 },
    { header: 'Observación',        key: 'observacion',   width: 55 },
  ];
  ws.columns = cols;

  // Estilo de encabezado
  ws.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: COLOR.HEADER };
    cell.font = { bold: true, color: { argb: COLOR.HEADER_TXT.argb }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
  });
  ws.getRow(1).height = 30;
  ws.autoFilter = { from: 'A1', to: `T1` };

  // Filas de datos
  for (const d of datos) {
    const t = d.trimestres || {};
    const keys = Object.keys(t);
    const row = ws.addRow({
      contrato:     d.contrato,
      nit:          d.nit,
      prestador:    d.prestador,
      municipio:    d.municipio,
      valorContrato: d.valorContrato || 0,
      iTrimSub:     t[keys[0]]?.sub || 0,
      iTrimCon:     t[keys[0]]?.con || 0,
      iiTrimSub:    t[keys[1]]?.sub || 0,
      iiTrimCon:    t[keys[1]]?.con || 0,
      iiiTrimSub:   t[keys[2]]?.sub || 0,
      iiiTrimCon:   t[keys[2]]?.con || 0,
      ivTrimSub:    t[keys[3]]?.sub || 0,
      ivTrimCon:    t[keys[3]]?.con || 0,
      vBimSub:      t[keys[4]]?.sub || 0,
      vBimCon:      t[keys[4]]?.con || 0,
      totalSub:     d.descuentosSub || 0,
      totalCon:     d.descuentosCon || 0,
      totalDesc:    d.descuentos || 0,
      estado:       d.estado,
      observacion:  d.observacion,
    });

    // Color por estado
    row.eachCell(cell => aplicarEstilo(cell, d.estado));
    // Negrita en nombre prestador
    row.getCell('prestador').font = { bold: true };
    // Negrita en totales
    row.getCell('totalDesc').font = { bold: true };
    row.alignment = { vertical: 'middle' };
  }

  // Fila de totales
  const lastRow = ws.lastRow.number + 1;
  const totRow = ws.addRow({
    contrato:  'TOTAL',
    valorContrato: datos.reduce((s, d) => s + (d.valorContrato || 0), 0),
    totalSub:  datos.reduce((s, d) => s + (d.descuentosSub || 0), 0),
    totalCon:  datos.reduce((s, d) => s + (d.descuentosCon || 0), 0),
    totalDesc: datos.reduce((s, d) => s + (d.descuentos || 0), 0),
  });
  totRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: COLOR.TOTAL_BG };
    cell.font = { bold: true };
  });

  // ── Hoja 2: Resumen ──
  const wsRes = wb.addWorksheet('Resumen');
  wsRes.columns = [
    { header: 'Indicador', key: 'ind', width: 35 },
    { header: 'Valor',     key: 'val', width: 20 },
  ];
  wsRes.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: COLOR.HEADER };
    cell.font = { bold: true, color: { argb: COLOR.HEADER_TXT.argb } };
  });

  const evaluados  = datos.filter(d => d.estado === 'EVALUADO');
  const parciales  = datos.filter(d => d.estado === 'PARCIAL');
  const pendientes = datos.filter(d => d.estado === 'PENDIENTE');
  const total = datos.length;

  const resumen = [
    ['Vigencia', vigencia],
    ['Total contratos', total],
    ['Evaluados', `${evaluados.length} (${((evaluados.length/total)*100).toFixed(1)}%)`],
    ['Parcialmente evaluados', `${parciales.length} (${((parciales.length/total)*100).toFixed(1)}%)`],
    ['Pendientes', `${pendientes.length} (${((pendientes.length/total)*100).toFixed(1)}%)`],
    ['Total descuentos Sub', datos.reduce((s, d) => s + (d.descuentosSub || 0), 0)],
    ['Total descuentos Con', datos.reduce((s, d) => s + (d.descuentosCon || 0), 0)],
    ['Total descuentos',     datos.reduce((s, d) => s + (d.descuentos || 0), 0)],
  ];
  for (const [ind, val] of resumen) {
    const r = wsRes.addRow({ ind, val });
    if (typeof val === 'number') r.getCell('val').numFmt = '"$"#,##0.00';
  }

  const tmpPath = path.join(os.tmpdir(), `evaluaciones_${vigencia}_${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(tmpPath);
  return tmpPath;
}

// ──────────────────────────────────────────────
// REPORTE COMPARATIVO MULTI-VIGENCIA
// ──────────────────────────────────────────────

async function reporteComparativo(vigencias) {
  const resultados = [];
  for (const v of vigencias) {
    if (!SHEETS[v]) continue;
    const datos = await obtenerDatos(v);
    const evaluados  = datos.filter(d => d.estado === 'EVALUADO').length;
    const parciales  = datos.filter(d => d.estado === 'PARCIAL').length;
    const pendientes = datos.filter(d => d.estado === 'PENDIENTE').length;
    const totalDesc  = datos.reduce((s, d) => s + (d.descuentos || 0), 0);
    resultados.push({ vigencia: v, total: datos.length, evaluados, parciales, pendientes, totalDesc });
  }

  let msg = `📊 *COMPARATIVO EVALUACIONES*\n─────────────────────────────\n`;
  for (const r of resultados) {
    const pE = r.total > 0 ? ((r.evaluados / r.total) * 100).toFixed(1) : 0;
    const pP = r.total > 0 ? ((r.parciales / r.total) * 100).toFixed(1) : 0;
    const pN = r.total > 0 ? ((r.pendientes / r.total) * 100).toFixed(1) : 0;
    msg += `\n📅 *Vigencia ${r.vigencia}*\n`;
    msg += `  • Total contratos: ${r.total}\n`;
    msg += `  • ✅ Evaluados: ${r.evaluados} (${pE}%)\n`;
    msg += `  • ⚠️ Parciales: ${r.parciales} (${pP}%)\n`;
    msg += `  • ❌ Pendientes: ${r.pendientes} (${pN}%)\n`;
    if (r.totalDesc > 0) msg += `  • 💰 Total descuentos: ${formatPesos(r.totalDesc)}\n`;
  }
  return msg;
}

// ──────────────────────────────────────────────
// RANKING DESCUENTOS — MÁS / MENOS
// ──────────────────────────────────────────────

async function rankingDescuentos({ vigencia, orden = 'mayor', top = 10, trimestre = null }) {
  // Si no hay vigencia, comparar todas
  const vigs = vigencia ? [vigencia] : [2023, 2024, 2025];

  const acumulado = {}; // prestador → { total, porVigencia, porTrimestre }

  for (const v of vigs) {
    if (!SHEETS[v]) continue;
    const csv = await fetchCSV(SHEETS[v]);
    const rows = parseCSV(csv);

    // Detectar columnas de trimestres según la vigencia
    let colsTrim = {};
    if (v === 2023) {
      colsTrim = { 'I Trim': [8, 9], 'II Trim': [10, 11], 'III Trim': [12, 13], 'IV Trim': [14, 15] };
    } else if (v === 2024) {
      colsTrim = { 'I Trim': [14, 15], 'II Trim': [16, 17], 'III Trim': [18, 19], 'IV Trim': [20, 21] };
    } else if (v === 2025) {
      colsTrim = { 'I Trim': [8, 9], 'II Trim': [10, 11], 'III Trim': [12, 13], 'IV Trim': [14, 15], 'V Bimestre': [16, 17] };
    }

    const startRow = v === 2023 ? 1 : 3;
    const nombreCol = v === 2023 ? 2 : (v === 2024 ? 3 : 2);

    for (let i = startRow; i < rows.length; i++) {
      const r = rows[i];
      const nombre = r[nombreCol]?.trim();
      if (!nombre) continue;

      if (!acumulado[nombre]) acumulado[nombre] = { total: 0, porVigencia: {}, porTrimestre: {} };

      // Por trimestre
      for (const [nomTrim, cols] of Object.entries(colsTrim)) {
        const val = (parseMonto(r[cols[0]]) || 0) + (parseMonto(r[cols[1]]) || 0);
        const key = `${v} - ${nomTrim}`;
        acumulado[nombre].porTrimestre[key] = (acumulado[nombre].porTrimestre[key] || 0) + val;
        acumulado[nombre].total += val;
        acumulado[nombre].porVigencia[v] = (acumulado[nombre].porVigencia[v] || 0) + val;
      }
    }
  }

  // Si se pide un trimestre específico
  let ranking;
  if (trimestre) {
    const tKey = trimestre.toString().toUpperCase();
    ranking = Object.entries(acumulado).map(([nombre, d]) => {
      const trimVal = Object.entries(d.porTrimestre)
        .filter(([k]) => k.toUpperCase().includes(tKey))
        .reduce((s, [, v]) => s + v, 0);
      return { nombre, valor: trimVal };
    }).filter(x => x.valor > 0);
  } else {
    ranking = Object.entries(acumulado)
      .map(([nombre, d]) => {
        const vigKey = vigencia ? vigencia : null;
        const valor = vigKey ? (d.porVigencia[vigKey] || 0) : d.total;
        return { nombre, valor, detalle: d.porVigencia };
      })
      .filter(x => x.valor > 0);
  }

  ranking.sort((a, b) => orden === 'mayor' ? b.valor - a.valor : a.valor - b.valor);
  const resultado = ranking.slice(0, top);

  const titulo = orden === 'mayor' ? 'MÁS DESCUENTOS' : 'MENOS DESCUENTOS';
  const emoji = orden === 'mayor' ? '📈' : '📉';
  const vigLabel = vigencia ? `VIGENCIA ${vigencia}` : 'TODAS LAS VIGENCIAS';
  const trimLabel = trimestre ? ` — ${trimestre}` : '';

  let msg = `${emoji} *PRESTADORES CON ${titulo}*\n`;
  msg += `📅 ${vigLabel}${trimLabel}\n`;
  msg += `─────────────────────────────\n`;

  resultado.forEach(({ nombre, valor, detalle }, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    msg += `${medal} *${nombre}*\n   💰 ${formatPesos(valor)}\n`;
    // Si hay detalle por vigencia y es multi-año, mostrarlo
    if (!vigencia && detalle) {
      for (const [v, val] of Object.entries(detalle)) {
        if (val > 0) msg += `   ${v}: ${formatPesos(val)}\n`;
      }
    }
  });

  return msg;
}

// ──────────────────────────────────────────────
// CONSULTA POR PRESTADOR O CONTRATO
// ──────────────────────────────────────────────

async function consultarPrestador(vigencia, busqueda, filtroTrimestre = null, filtroRegimen = null) {
  const datos = await obtenerDatos(vigencia);
  const b = busqueda.toLowerCase().trim();

  // Buscar por nombre de prestador o número de contrato
  const encontrados = datos.filter(d =>
    d.prestador.toLowerCase().includes(b) ||
    d.contrato.toLowerCase().includes(b) ||
    d.nit.toLowerCase().includes(b)
  );

  if (!encontrados.length) {
    return { texto: `❌ No encontré ningún prestador o contrato con "${busqueda}" en vigencia ${vigencia}.`, encontrados: [] };
  }

  let msg = `🔍 *CONSULTA VIGENCIA ${vigencia}*\n`;
  msg += `Búsqueda: _${busqueda}_\n`;
  msg += `Resultados: *${encontrados.length}*\n`;
  msg += `─────────────────────────────\n`;

  for (const d of encontrados) {
    msg += `\n🏥 *${d.prestador}*\n`;
    msg += `📄 Contrato: \`${d.contrato || 'N/A'}\`\n`;
    msg += `🆔 NIT: ${d.nit}\n`;
    msg += `📍 ${d.municipio}\n`;
    if (d.valorContrato > 0) msg += `💵 Valor contrato: ${formatPesos(d.valorContrato)}\n`;
    msg += `📊 Estado: *${d.estado}*\n`;
    if (d.observacion) msg += `📝 Obs: _${d.observacion}_\n`;

    if (d.trimestres) {
      msg += `\n*Descuentos por período:*\n`;
      for (const [periodo, val] of Object.entries(d.trimestres)) {
        // Filtrar por trimestre si se especificó
        if (filtroTrimestre && !periodo.toLowerCase().includes(filtroTrimestre.toLowerCase())) continue;

        const mostrarSub = !filtroRegimen || filtroRegimen === 'sub';
        const mostrarCon = !filtroRegimen || filtroRegimen === 'con';

        const tieneDatos = val.sub > 0 || val.con > 0 ||
          (d.observacion && d.observacion.toLowerCase().includes(periodo.split(' ')[0].toLowerCase()));

        if (mostrarSub && val.sub > 0) msg += `  ${periodo}\n   • Subsidiado: ${formatPesos(val.sub)}\n`;
        if (mostrarCon && val.con > 0) msg += `  ${periodo}\n   • Contributivo: ${formatPesos(val.con)}\n`;
        if (val.sub === 0 && val.con === 0 && !filtroTrimestre) msg += `  ${periodo}: sin descuentos\n`;
      }
      const totalSub = Object.values(d.trimestres).reduce((a, t) => a + t.sub, 0);
      const totalCon = Object.values(d.trimestres).reduce((a, t) => a + t.con, 0);
      if (!filtroRegimen || filtroRegimen === 'sub') msg += `  💰 *Total Sub: ${formatPesos(totalSub)}*\n`;
      if (!filtroRegimen || filtroRegimen === 'con') msg += `  💰 *Total Con: ${formatPesos(totalCon)}*\n`;
    }
    msg += `─────────────────────────────\n`;
  }

  return { texto: msg, encontrados };
}

async function generarExcelPrestador(vigencia, busqueda) {
  const datos = await obtenerDatos(vigencia);
  const b = busqueda.toLowerCase().trim();
  const encontrados = datos.filter(d =>
    d.prestador.toLowerCase().includes(b) ||
    d.contrato.toLowerCase().includes(b) ||
    d.nit.toLowerCase().includes(b)
  );

  if (!encontrados.length) return null;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bot Salud';
  const ws = wb.addWorksheet(`${busqueda} ${vigencia}`, { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'No. Contrato',     key: 'contrato',    width: 22 },
    { header: 'NIT',              key: 'nit',         width: 16 },
    { header: 'Prestador',        key: 'prestador',   width: 48 },
    { header: 'Municipio',        key: 'municipio',   width: 20 },
    { header: 'Valor Contrato',   key: 'valorContrato', width: 22, style: { numFmt: '"$"#,##0.00' } },
    { header: 'I Trim - Sub',     key: 'it_s',  width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'I Trim - Con',     key: 'it_c',  width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'II Trim - Sub',    key: 'iit_s', width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'II Trim - Con',    key: 'iit_c', width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'III Trim - Sub',   key: 'iiit_s',width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'III Trim - Con',   key: 'iiit_c',width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'IV Trim - Sub',    key: 'ivt_s', width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'IV Trim - Con',    key: 'ivt_c', width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'V Bim - Sub',      key: 'vb_s',  width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'V Bim - Con',      key: 'vb_c',  width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: 'Total Sub',        key: 'totalSub',  width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'Total Con',        key: 'totalCon',  width: 20, style: { numFmt: '"$"#,##0.00' } },
    { header: 'Total Descuentos', key: 'totalDesc', width: 22, style: { numFmt: '"$"#,##0.00' } },
    { header: 'Estado',           key: 'estado',    width: 14 },
    { header: 'Observación',      key: 'observacion', width: 55 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: COLOR.HEADER };
    cell.font = { bold: true, color: { argb: COLOR.HEADER_TXT.argb }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.getRow(1).height = 28;
  ws.autoFilter = { from: 'A1', to: 'T1' };

  for (const d of encontrados) {
    const t = d.trimestres || {};
    const keys = Object.keys(t);
    const row = ws.addRow({
      contrato: d.contrato, nit: d.nit, prestador: d.prestador, municipio: d.municipio,
      valorContrato: d.valorContrato || 0,
      it_s: t[keys[0]]?.sub||0, it_c: t[keys[0]]?.con||0,
      iit_s: t[keys[1]]?.sub||0, iit_c: t[keys[1]]?.con||0,
      iiit_s: t[keys[2]]?.sub||0, iiit_c: t[keys[2]]?.con||0,
      ivt_s: t[keys[3]]?.sub||0, ivt_c: t[keys[3]]?.con||0,
      vb_s: t[keys[4]]?.sub||0, vb_c: t[keys[4]]?.con||0,
      totalSub: d.descuentosSub||0, totalCon: d.descuentosCon||0, totalDesc: d.descuentos||0,
      estado: d.estado, observacion: d.observacion,
    });
    row.eachCell(cell => aplicarEstilo(cell, d.estado));
    row.getCell('prestador').font = { bold: true };
    row.getCell('totalDesc').font = { bold: true };
  }

  const tmpPath = path.join(os.tmpdir(), `prestador_${vigencia}_${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(tmpPath);
  return tmpPath;
}

module.exports = { generarReporte, generarExcel, obtenerDatos, reporteComparativo, rankingDescuentos, consultarPrestador, generarExcelPrestador, reportePendientes, reportePendientesTodas, SHEETS };
