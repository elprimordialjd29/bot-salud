/**
 * dusakawi.js — Consulta automática al sistema Dusakawi EPSI (ASD)
 * Portal: asdempleados.dusakawiepsi.com
 * Sección: Gestión de Cuentas Médicas → Consulta Recepción
 */

require('dotenv').config({ override: true });
const puppeteer = require('puppeteer');
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

async function buscarEnConsultaRecepcion(page, { contrato, regimen, estado = '5' } = {}) {
  await page.goto(CONSULTA_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  // Número de contrato
  if (contrato) {
    await page.$eval('#txtNumeroContratoC', (el, v) => { el.value = ''; }, '');
    await page.type('#txtNumeroContratoC', contrato, { delay: 40 });
  }

  // Estado = Radicado (valor 5) — o el que se pida
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

  // Cantidad = 50 (máximo por página)
  try {
    const cantInput = await page.$('#j_idt129');
    if (cantInput) { await cantInput.click({ clickCount: 3 }); await cantInput.type('50', { delay: 30 }); }
  } catch(e) {}

  // Botón buscar — buscar button dentro del formulario
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
    const btn = btns.find(b => /buscar|consultar|filtrar|search/i.test(b.innerText || b.value || ''));
    if (btn) { btn.click(); return true; }
    // Buscar el primer botón con ícono de búsqueda
    const anyBtn = btns.find(b => b.type === 'submit' || b.className.includes('search') || b.className.includes('buscar'));
    if (anyBtn) { anyBtn.click(); return true; }
    return false;
  });
  if (!clicked) {
    // Fallback: submit con Enter en campo contrato
    await page.focus('#txtNumeroContratoC');
    await page.keyboard.press('Enter');
  }

  await sleep(3000);
}

// ──────────────────────────────────────────────
// EXTRAER FILAS DE LA TABLA
// ──────────────────────────────────────────────

async function extraerFilas(page) {
  return page.evaluate(() => {
    const tabla = document.querySelector('table');
    if (!tabla) return [];
    const headerEls = tabla.querySelectorAll('thead th, tr:first-child th');
    const headers = Array.from(headerEls).map(th => th.innerText.trim());
    const rows = tabla.querySelectorAll('tbody tr');
    return Array.from(rows).map(tr => {
      const celdas = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      if (!celdas.some(c => c)) return null;
      const obj = { _raw: celdas };
      headers.forEach((h, i) => { if (h) obj[h] = celdas[i] || ''; });
      return obj;
    }).filter(Boolean);
  });
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
      return { texto: `⚠️ No se encontraron radicaciones para *${termino}* en Dusakawi.\n_(Estado: Radicado${regStr ? ` | Régimen: ${regStr}` : ''})_` };
    }

    // Analizar trimestres por fecha de recepción
    const trimestreSet = new Set();
    for (const f of filas) {
      const fecha = f['Fecha Recepción'] || f['Fecha'] || f._raw?.[4] || '';
      const t = fechaATrimestre(fecha, vigencia);
      if (t) trimestreSet.add(t);
    }
    const radicados = [...trimestreSet].sort();
    const todos = (TRIMESTRES[vigencia] || TRIMESTRES[2025]).map(t => t.nombre);
    const pendientes = todos.filter(t => !radicados.includes(t));

    let txt = `🌐 *RADICACIÓN — ${termino}*\n`;
    txt += `Vigencia ${vigencia} | Total registros: *${filas.length}*\n`;
    if (regStr) txt += `Régimen: *${regStr}*\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    txt += `✅ *Trimestres radicados:*\n${radicados.length > 0 ? radicados.map(t => `  • ${t}`).join('\n') : '  Ninguno'}\n\n`;
    txt += `❌ *Trimestres pendientes:*\n${pendientes.length > 0 ? pendientes.map(t => `  • ${t}`).join('\n') : '  ¡Al día!'}\n\n`;

    txt += `📋 *Últimas radicaciones:*\n`;
    filas.slice(0, 15).forEach((f, i) => {
      const fecha  = f['Fecha Recepción'] || f._raw?.[4] || '';
      const ips    = (f['IPS'] || f._raw?.[3] || '').split('\n')[0];
      const nRad   = f['Número Radicación'] || f._raw?.[10] || '';
      const valor  = f['Valor AF'] || f._raw?.[7] || '';
      const estado = f['Estado'] || f._raw?.[9] || '';
      const trim   = fechaATrimestre(fecha, vigencia);
      txt += `*${i+1}.* 📅 ${fecha}${trim ? ` _(${trim})_` : ''}\n`;
      if (ips)    txt += `   🏥 ${ips}\n`;
      if (nRad)   txt += `   🔖 Rad: ${nRad}\n`;
      if (valor)  txt += `   💰 ${valor}\n`;
      if (estado) txt += `   📌 ${estado}\n`;
    });
    if (filas.length > 15) txt += `\n_...y ${filas.length - 15} más._\n`;

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
