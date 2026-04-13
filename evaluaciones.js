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
  const n = parseFloat(val.replace(/[\$,\s]/g, '').replace(/\./g, '').replace(',', '.'));
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

  let msg = `📊 *REPORTE EVALUACIONES — VIGENCIA ${vigencia}*\n`;
  msg += `─────────────────────────────\n`;
  msg += `📋 Total contratos: *${total}*\n`;
  msg += `✅ Evaluados: *${evaluados.length}* (${pEval}%)\n`;
  msg += `⚠️ Parcialmente evaluados: *${parciales.length}* (${pParc}%)\n`;
  msg += `❌ Pendientes: *${pendientes.length}* (${pPend}%)\n\n`;

  if (topDescuentos.length > 0) {
    msg += `💰 *TOP DESCUENTOS POR PRESTADOR:*\n`;
    topDescuentos.forEach(([nombre, info], i) => {
      if (info.descuentos > 0) {
        msg += `${i + 1}. ${nombre}: ${formatPesos(info.descuentos)}\n`;
      }
    });
    msg += '\n';
  }

  if (pendientes.length > 0) {
    msg += `❌ *PENDIENTES POR EVALUAR (${pendientes.length}):*\n`;
    pendientes.slice(0, 10).forEach(d => {
      msg += `• ${d.prestador} — ${d.municipio}\n`;
    });
    if (pendientes.length > 10) msg += `  ...y ${pendientes.length - 10} más\n`;
    msg += '\n';
  }

  if (parciales.length > 0) {
    msg += `⚠️ *EVALUACIÓN INCOMPLETA (${parciales.length}):*\n`;
    parciales.slice(0, 10).forEach(d => {
      msg += `• ${d.prestador} — ${d.observacion}\n`;
    });
    if (parciales.length > 10) msg += `  ...y ${parciales.length - 10} más\n`;
  }

  return msg;
}

// ──────────────────────────────────────────────
// GENERAR EXCEL
// ──────────────────────────────────────────────

async function generarExcel(vigencia) {
  const datos = await obtenerDatos(vigencia);

  const filas = datos.map(d => ({
    'No. Contrato': d.contrato,
    'NIT': d.nit,
    'Prestador': d.prestador,
    'Municipio': d.municipio,
    'Departamento': d.departamento,
    'Valor Contrato': d.valorContrato || 0,
    'Total Descuentos Sub': d.descuentosSub || d.descuentos || 0,
    'Total Descuentos Con': d.descuentosCon || 0,
    'Total Descuentos': d.descuentos,
    'Estado': d.estado,
    'Observación': d.observacion,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas);

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 18 }, { wch: 14 }, { wch: 45 }, { wch: 18 },
    { wch: 15 }, { wch: 20 }, { wch: 22 }, { wch: 22 },
    { wch: 20 }, { wch: 15 }, { wch: 50 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, `Vigencia ${vigencia}`);

  const tmpPath = path.join(os.tmpdir(), `evaluaciones_${vigencia}_${Date.now()}.xlsx`);
  XLSX.writeFile(wb, tmpPath);
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

  const filas = [];
  for (const d of encontrados) {
    const base = {
      'Prestador': d.prestador,
      'NIT': d.nit,
      'No. Contrato': d.contrato,
      'Municipio': d.municipio,
      'Valor Contrato': d.valorContrato || 0,
      'Estado': d.estado,
      'Observación': d.observacion,
    };
    if (d.trimestres) {
      for (const [periodo, val] of Object.entries(d.trimestres)) {
        base[`${periodo} - SUB`] = val.sub;
        base[`${periodo} - CON`] = val.con;
        base[`${periodo} - TOTAL`] = val.sub + val.con;
      }
    }
    base['Total Subsidiado'] = d.descuentosSub || 0;
    base['Total Contributivo'] = d.descuentosCon || 0;
    base['Total Descuentos'] = d.descuentos || 0;
    filas.push(base);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas);
  XLSX.utils.book_append_sheet(wb, ws, `Consulta ${vigencia}`);
  const tmpPath = path.join(os.tmpdir(), `prestador_${vigencia}_${Date.now()}.xlsx`);
  XLSX.writeFile(wb, tmpPath);
  return tmpPath;
}

module.exports = { generarReporte, generarExcel, obtenerDatos, reporteComparativo, rankingDescuentos, consultarPrestador, generarExcelPrestador, SHEETS };
