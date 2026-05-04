/**
 * dusakawi.js — Consulta automática al sistema Dusakawi EPSI (ASD)
 * Portal: asdempleados.dusakawiepsi.com
 * Sección: Gestión de Cuentas Médicas → Consulta Recepción
 */

require('dotenv').config({ override: true });
const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const evaluaciones = require('./evaluaciones');

const LOGIN_URL   = 'http://asdempleados.dusakawiepsi.com:8080/sie_dusakawi/';
const CONSULTA_URL = 'http://asdempleados.dusakawiepsi.com:8080/sie_dusakawi/pages/audit/reception_consulta_support_rips/reception_consulta_support_rips.xhtml?SW_CREACION_EPS=1';

const DUSAKAWI_USER = process.env.DUSAKAWI_USER || '1065640456';
const DUSAKAWI_PASS = process.env.DUSAKAWI_PASS || 'S@lomon1920';
const ANNO_TRABAJO  = '2026';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ──────────────────────────────────────────────
// TRIMESTRES
// ──────────────────────────────────────────────

// Meses por trimestre para cada vigencia
const MESES_TRIMESTRE = {
  2025: [
    { trim: 'I Trim',      meses: [
      { nombre: 'Enero',    num: 1,  anio: 2025 },
      { nombre: 'Febrero',  num: 2,  anio: 2025 },
      { nombre: 'Marzo',    num: 3,  anio: 2025 },
    ]},
    { trim: 'II Trim',     meses: [
      { nombre: 'Abril',    num: 4,  anio: 2025 },
      { nombre: 'Mayo',     num: 5,  anio: 2025 },
      { nombre: 'Junio',    num: 6,  anio: 2025 },
    ]},
    { trim: 'III Trim',    meses: [
      { nombre: 'Julio',    num: 7,  anio: 2025 },
      { nombre: 'Agosto',   num: 8,  anio: 2025 },
      { nombre: 'Septiembre', num: 9, anio: 2025 },
    ]},
    { trim: 'IV Trim',     meses: [
      { nombre: 'Octubre',  num: 10, anio: 2025 },
      { nombre: 'Noviembre',num: 11, anio: 2025 },
      { nombre: 'Diciembre',num: 12, anio: 2025 },
    ]},
    { trim: 'V Bimestre',  meses: [
      { nombre: 'Enero 26', num: 1,  anio: 2026 },
      { nombre: 'Febrero 26', num: 2, anio: 2026 },
    ]},
  ],
  2024: [
    { trim: 'I Trim',      meses: [
      { nombre: 'Enero',    num: 1,  anio: 2024 },
      { nombre: 'Febrero',  num: 2,  anio: 2024 },
      { nombre: 'Marzo',    num: 3,  anio: 2024 },
    ]},
    { trim: 'II Trim',     meses: [
      { nombre: 'Abril',    num: 4,  anio: 2024 },
      { nombre: 'Mayo',     num: 5,  anio: 2024 },
      { nombre: 'Junio',    num: 6,  anio: 2024 },
    ]},
    { trim: 'III Trim',    meses: [
      { nombre: 'Julio',    num: 7,  anio: 2024 },
      { nombre: 'Agosto',   num: 8,  anio: 2024 },
      { nombre: 'Septiembre', num: 9, anio: 2024 },
    ]},
    { trim: 'IV Trim',     meses: [
      { nombre: 'Octubre',  num: 10, anio: 2024 },
      { nombre: 'Noviembre',num: 11, anio: 2024 },
      { nombre: 'Diciembre',num: 12, anio: 2024 },
    ]},
    { trim: 'V Bimestre',  meses: [
      { nombre: 'Enero 25', num: 1,  anio: 2025 },
      { nombre: 'Febrero 25', num: 2, anio: 2025 },
    ]},
  ],
  2023: [
    { trim: 'I Trim',      meses: [
      { nombre: 'Enero',    num: 1,  anio: 2023 },
      { nombre: 'Febrero',  num: 2,  anio: 2023 },
      { nombre: 'Marzo',    num: 3,  anio: 2023 },
    ]},
    { trim: 'II Trim',     meses: [
      { nombre: 'Abril',    num: 4,  anio: 2023 },
      { nombre: 'Mayo',     num: 5,  anio: 2023 },
      { nombre: 'Junio',    num: 6,  anio: 2023 },
    ]},
    { trim: 'III Trim',    meses: [
      { nombre: 'Julio',    num: 7,  anio: 2023 },
      { nombre: 'Agosto',   num: 8,  anio: 2023 },
      { nombre: 'Septiembre', num: 9, anio: 2023 },
    ]},
    { trim: 'IV Trim',     meses: [
      { nombre: 'Octubre',  num: 10, anio: 2023 },
      { nombre: 'Noviembre',num: 11, anio: 2023 },
      { nombre: 'Diciembre',num: 12, anio: 2023 },
    ]},
  ],
};

const TRIMESTRES = {
  2025: [
    { nombre: 'I Trim',     inicio: new Date('2025-01-01'), fin: new Date('2025-03-31') },
    { nombre: 'II Trim',    inicio: new Date('2025-04-01'), fin: new Date('2025-06-30') },
    { nombre: 'III Trim',   inicio: new Date('2025-07-01'), fin: new Date('2025-09-30') },
    { nombre: 'IV Trim',    inicio: new Date('2025-10-01'), fin: new Date('2025-12-31') },
    { nombre: 'V Bimestre', inicio: new Date('2026-01-01'), fin: new Date('2026-02-28') },
  ],
  2024: [
    { nombre: 'I Trim',     inicio: new Date('2024-01-01'), fin: new Date('2024-03-31') },
    { nombre: 'II Trim',    inicio: new Date('2024-04-01'), fin: new Date('2024-06-30') },
    { nombre: 'III Trim',   inicio: new Date('2024-07-01'), fin: new Date('2024-09-30') },
    { nombre: 'IV Trim',    inicio: new Date('2024-10-01'), fin: new Date('2024-12-31') },
    { nombre: 'V Bimestre', inicio: new Date('2025-01-01'), fin: new Date('2025-02-28') },
  ],
  2023: [
    { nombre: 'I Trim',     inicio: new Date('2023-01-01'), fin: new Date('2023-03-31') },
    { nombre: 'II Trim',    inicio: new Date('2023-04-01'), fin: new Date('2023-06-30') },
    { nombre: 'III Trim',   inicio: new Date('2023-07-01'), fin: new Date('2023-09-30') },
    { nombre: 'IV Trim',    inicio: new Date('2023-10-01'), fin: new Date('2023-12-31') },
  ],
};

// Parsea fecha y retorna { mes (1-12), anio }
function parsearFecha(fechaStr) {
  if (!fechaStr) return null;
  try {
    const s = fechaStr.trim();
    let d;
    if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(s)) {
      d = new Date(s.replace(/\//g, '-').substring(0, 10));
    } else if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(s)) {
      const p = s.substring(0, 10).replace(/\//g, '-').split('-');
      d = new Date(`${p[2]}-${p[1]}-${p[0]}`);
    } else {
      d = new Date(s);
    }
    if (isNaN(d)) return null;
    return { mes: d.getMonth() + 1, anio: d.getFullYear() };
  } catch(e) { return null; }
}

// Analiza qué meses tienen radicaciones y devuelve estructura por trimestre
function analizarMesesRadicados(filas, vigencia) {
  const mesesConRegistros = new Set(); // "2025-3" = año-mes
  for (const f of filas) {
    const fecha = f['Fecha Recepción'] || f['Fecha'] || f._raw?.[4] || '';
    const p = parsearFecha(fecha);
    if (p) mesesConRegistros.add(`${p.anio}-${p.mes}`);
  }

  const estructura = MESES_TRIMESTRE[vigencia] || MESES_TRIMESTRE[2025];
  return estructura.map(t => ({
    trim: t.trim,
    meses: t.meses.map(m => ({
      nombre: m.nombre,
      radicado: mesesConRegistros.has(`${m.anio}-${m.num}`),
    })),
  }));
}

// Formatea el resumen mes a mes
function formatearResumenMeses(analisis) {
  let txt = '';
  for (const t of analisis) {
    const iconos = t.meses.map(m => m.radicado ? '✅' : '❌').join(' ');
    txt += `*${t.trim}* ${iconos}\n`;
    for (const m of t.meses) {
      txt += `  ${m.radicado ? '✅' : '❌'} ${m.nombre}\n`;
    }
  }
  return txt;
}

function fechaATrimestre(fechaStr, vigencia) {
  if (!fechaStr) return null;
  try {
    const s = fechaStr.trim();
    let d;
    // Formato "2025/03/18 12:54" o "2025-03-18 12:54"
    if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(s)) {
      d = new Date(s.replace(/\//g, '-').substring(0, 10));
    } else if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(s)) {
      const p = s.substring(0, 10).replace(/\//g, '-').split('-');
      d = new Date(`${p[2]}-${p[1]}-${p[0]}`);
    } else {
      d = new Date(s);
    }
    if (isNaN(d)) return null;
    const trims = TRIMESTRES[vigencia] || TRIMESTRES[2025];
    for (const t of trims) {
      if (d >= t.inicio && d <= t.fin) return t.nombre;
    }
    return null;
  } catch(e) { return null; }
}


// ──────────────────────────────────────────────
// BROWSER
// ──────────────────────────────────────────────

async function abrirBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--window-size=1400,900'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    defaultViewport: { width: 1400, height: 900 },
    timeout: 60000,
  });
}

// ──────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 50000 });
  await sleep(2000);

  const ti = await page.$$('input[type="text"]');
  const pi = await page.$('input[type="password"]');
  if (!ti.length || !pi) throw new Error('Formulario de login no encontrado en ASD Dusakawi');

  // ti[0]=Usuario, ti[1]=Año Trabajo, pi=Clave
  await ti[0].click({ clickCount: 3 });
  await ti[0].type(DUSAKAWI_USER, { delay: 40 });
  await pi.click({ clickCount: 3 });
  await pi.type(DUSAKAWI_PASS, { delay: 40 });
  await ti[1].click({ clickCount: 3 });
  await ti[1].type(ANNO_TRABAJO, { delay: 40 });

  await (await page.$('button[type="submit"]')).click();
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await sleep(2000);

  if (page.url().includes('loginIps') || page.url().includes('login')) {
    throw new Error('Login fallido en Dusakawi EPSI — verifica credenciales');
  }
  console.log('✅ Login OK:', page.url());
}

// ──────────────────────────────────────────────
// BUSCAR EN CONSULTA RECEPCIÓN
// ──────────────────────────────────────────────

async function buscarEnConsultaRecepcion(page, { contrato, regimen, estado = '5', fechaDesde = null } = {}) {
  await page.goto(CONSULTA_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  // Filtro fecha desde — formato YYYY/MM/DD (PrimeFaces Calendar acepta este formato)
  if (fechaDesde) {
    try {
      await page.$eval('#j_idt102_input', el => { el.value = ''; });
      await page.focus('#j_idt102_input');
      await page.keyboard.type(fechaDesde, { delay: 40 });
      await page.keyboard.press('Tab');
      await sleep(600);
    } catch(e) {}
  }

  // Número de contrato
  if (contrato) {
    await page.$eval('#txtNumeroContratoC', el => { el.value = ''; });
    await page.type('#txtNumeroContratoC', contrato, { delay: 40 });
  }

  // Estado
  if (estado) {
    await page.select('#j_idt123_input', estado);
    await sleep(300);
  }

  // Régimen RS=99, RC=1
  if (regimen) {
    const valorReg = regimen === 'RS' ? '99' : regimen === 'RC' ? '1' : null;
    if (valorReg) {
      await page.select('#j_idt138_input', valorReg);
      await sleep(300);
    }
  }

  // Buscar
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => /buscar/i.test(b.innerText || ''));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!clicked) {
    await page.focus('#txtNumeroContratoC');
    await page.keyboard.press('Enter');
  }
  await sleep(4000);
}

// ──────────────────────────────────────────────
// EXTRAER FILAS DE LA TABLA
// ──────────────────────────────────────────────

function extraerFilasDePagina(page) {
  return page.evaluate(() => {
    // Hay 2 tablas (header y body a veces) — tomar la que tiene tbody con datos
    const tablas = Array.from(document.querySelectorAll('table'));
    const tabla = tablas.find(t => t.querySelectorAll('tbody tr').length > 0) || tablas[0];
    if (!tabla) return [];
    // Columnas (9 botones al inicio): 9=RecRips,10=IPS,11=Fecha,12=Usuario,13=Contrato,
    // 14=TipoContrato,15=CantidadAF,16=ValorAF,17=Tipo,18=Estado,19=NumRad,20=Regimen
    const COLS = { recRips:9, ips:10, fecha:11, contrato:13, valor:16, tipo:17, estado:18, numRad:19, regimen:20 };
    return Array.from(tabla.querySelectorAll('tbody tr')).map(tr => {
      const c = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      if (!c.some(x => x)) return null;
      return {
        ips:     (c[COLS.ips] || '').split('\n')[0],
        fecha:   c[COLS.fecha]   || '',
        valor:   c[COLS.valor]   || '',
        estado:  c[COLS.estado]  || '',
        numRad:  c[COLS.numRad]  || '',
        regimen: c[COLS.regimen] || '',
      };
    }).filter(Boolean);
  });
}

async function extraerFilas(page) {
  // Extraer primera página
  const todas = await extraerFilasDePagina(page);

  // Revisar si hay más páginas (paginador con páginas activas > 1)
  const totalPaginas = await page.evaluate(() => {
    // El segundo paginador (el de resultados) tiene los números de página
    const paginadores = document.querySelectorAll('.ui-paginator-pages');
    let max = 1;
    paginadores.forEach(p => {
      const paginas = p.querySelectorAll('.ui-paginator-page');
      if (paginas.length > max) max = paginas.length;
    });
    return max;
  });

  // Iterar páginas 2..N (máximo 20 páginas para no tardar demasiado)
  const maxPags = Math.min(totalPaginas, 20);
  for (let pag = 2; pag <= maxPags; pag++) {
    // Click en número de página
    const clickOk = await page.evaluate((numPag) => {
      const paginadores = document.querySelectorAll('.ui-paginator-pages');
      // Buscar en el paginador con más páginas
      let target = null;
      paginadores.forEach(p => {
        const paginas = p.querySelectorAll('.ui-paginator-page');
        paginas.forEach(pg => {
          if (pg.innerText.trim() === String(numPag)) target = pg;
        });
      });
      if (target) { target.click(); return true; }
      return false;
    }, pag);

    if (!clickOk) break;
    await sleep(3000);
    const filasPag = await extraerFilasDePagina(page);
    todas.push(...filasPag);
  }

  return todas;
}

// ──────────────────────────────────────────────
// CONSULTA INDIVIDUAL (un contrato)
// ──────────────────────────────────────────────

async function consultarEstadoRadicacion({ prestador = '', contrato = '', vigencia = 2025, regimen = null } = {}) {
  const termino = contrato || prestador;
  console.log(`🌐 Consultando Dusakawi: "${termino}" | vigencia ${vigencia}`);

  if (!termino) return { texto: '⚠️ Indica un número de contrato o nombre para consultar.' };

  const browser = await abrirBrowser();
  const page = await browser.newPage();

  try {
    await login(page);
    const regStr = regimen === 'sub' ? 'RS' : regimen === 'con' ? 'RC' : null;
    await buscarEnConsultaRecepcion(page, { contrato: termino, regimen: regStr });
    const filas = await extraerFilas(page);

    if (filas.length === 0) {
      return { texto: `⚠️ No se encontraron registros para *${termino}* en Dusakawi.` };
    }

    // Extraer meses de la columna Fecha (formato "01-01-2026-31-01-2026" o "2026/01/01")
    // La fecha de recepción indica el período del RIPS radicado
    const mesesRadicados = new Set();
    for (const f of filas) {
      const p = parsearFecha(f.fecha);
      if (p) mesesRadicados.add(`${p.anio}-${p.mes}`);
    }

    // Analizar meses de vigencia
    const estructura = MESES_TRIMESTRE[vigencia] || MESES_TRIMESTRE[2025];
    const analisis = estructura.map(t => ({
      trim: t.trim,
      meses: t.meses.map(m => ({
        nombre: m.nombre,
        radicado: mesesRadicados.has(`${m.anio}-${m.num}`),
      })),
    }));

    const totalRadicados = analisis.reduce((a, t) => a + t.meses.filter(m => m.radicado).length, 0);
    const totalMeses = analisis.reduce((a, t) => a + t.meses.length, 0);

    let txt = `🌐 *RADICACIÓN — ${termino.toUpperCase()}*\n`;
    txt += `Vigencia *${vigencia}*`;
    if (regStr) txt += ` | Régimen: *${regStr}*`;
    txt += ` | Registros: *${filas.length}*\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    txt += `📅 *ESTADO POR MES:*\n`;
    txt += formatearResumenMeses(analisis);

    const mesesPend = analisis.flatMap(t => t.meses.filter(m => !m.radicado).map(m => m.nombre));
    txt += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `✅ Meses radicados: *${totalRadicados}/${totalMeses}*\n`;
    txt += mesesPend.length > 0
      ? `❌ Pendientes: ${mesesPend.join(', ')}\n`
      : `🎉 ¡Al día con todos los meses!\n`;

    return { texto: txt };
  } catch(e) {
    console.error('❌ Error Dusakawi:', e.message);
    return { texto: `❌ Error consultando Dusakawi EPSI:\n${e.message}` };
  } finally {
    await browser.close();
  }
}

// ──────────────────────────────────────────────
// REPORTE MASIVO (todos los contratos)
// ──────────────────────────────────────────────

async function reporteMasivoRadicacion({ vigencia = 2025, trimestre = null, regimen = null } = {}) {
  console.log(`🌐 Reporte masivo radicación Dusakawi — vigencia ${vigencia}${trimestre ? ' | '+trimestre : ''}`);

  let contratos = [];
  try {
    const datos = await evaluaciones.obtenerDatos(vigencia);
    contratos = datos
      .filter(p => p.contrato && p.contrato.trim() !== '')
      .map(p => ({ contrato: p.contrato.trim(), prestador: p.prestador }));
  } catch(e) {
    throw new Error(`No se pudieron obtener contratos de evaluaciones: ${e.message}`);
  }
  if (!contratos.length) throw new Error('No hay contratos para esta vigencia');
  console.log(`📋 ${contratos.length} contratos a consultar`);

  const browser = await abrirBrowser();
  const page = await browser.newPage();
  const resultados = [];

  try {
    await login(page);
    const regStr = regimen === 'sub' ? 'RS' : regimen === 'con' ? 'RC' : null;

    for (let i = 0; i < contratos.length; i++) {
      const { contrato, prestador } = contratos[i];
      console.log(`  [${i+1}/${contratos.length}] ${contrato}`);
      try {
        await buscarEnConsultaRecepcion(page, { contrato, regimen: regStr });
        const filas = await extraerFilas(page);

        const trimestreSet = new Set();
        for (const f of filas) {
          const fecha = f['Fecha Recepción'] || f['Fecha'] || f._raw?.[4] || '';
          const t = fechaATrimestre(fecha, vigencia);
          if (t) trimestreSet.add(t);
        }
        resultados.push({ contrato, prestador, total: filas.length, trimestresRadicados: [...trimestreSet].sort() });
      } catch(e) {
        console.error(`  ❌ ${contrato}:`, e.message);
        resultados.push({ contrato, prestador, total: 0, trimestresRadicados: [], error: e.message });
      }
    }
  } finally {
    await browser.close();
  }

  // ── Formatear reporte ──
  const todos = (TRIMESTRES[vigencia] || TRIMESTRES[2025]).map(t => t.nombre);

  const radicados = resultados.filter(r =>
    trimestre ? r.trimestresRadicados.includes(trimestre) : r.total > 0
  );
  const pendientes = resultados.filter(r =>
    trimestre ? !r.trimestresRadicados.includes(trimestre) : r.total === 0
  );

  let msg = `🌐 *RADICACIÓN DUSAKAWI EPSI — ${vigencia}*\n`;
  if (regimen) msg += `Régimen: *${regStr === 'RS' ? 'Subsidiado (RS)' : 'Contributivo (RC)'}*\n`;
  if (trimestre) msg += `Trimestre: *${trimestre}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `✅ *RADICARON (${radicados.length}):*\n`;
  radicados.forEach((r, i) => {
    const trims = trimestre || r.trimestresRadicados.join(', ') || '?';
    msg += `${i+1}. ${r.prestador}\n   📄 ${r.contrato} | ${trims}\n`;
  });

  msg += `\n❌ *PENDIENTES POR RADICAR (${pendientes.length}):*\n`;
  pendientes.forEach((r, i) => {
    msg += `${i+1}. ${r.prestador} — ${r.contrato}\n`;
    if (!trimestre && r.trimestresRadicados.length > 0)
      msg += `   _(Tiene: ${r.trimestresRadicados.join(', ')})_\n`;
  });

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 Total: ${resultados.length} | ✅ ${radicados.length} | ❌ ${pendientes.length}\n`;

  msg += `\n📅 *RESUMEN POR TRIMESTRE:*\n`;
  for (const t of todos) {
    const con    = resultados.filter(r => r.trimestresRadicados.includes(t)).length;
    const sin    = resultados.length - con;
    msg += `  ${t}: ✅ ${con} radicados | ❌ ${sin} pendientes\n`;
  }

  return msg;
}

module.exports = { consultarEstadoRadicacion, reporteMasivoRadicacion };
