/**
 * dusakawi.js — Consulta automática al sistema Dusakawi EPSI
 * Accede a Gestión de Cuentas Médicas → Consulta Recepción
 * para validar radicación de contratos por trimestre y régimen
 */

require('dotenv').config({ override: true });
const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const evaluaciones = require('./evaluaciones');

const DUSAKAWI_URL  = 'https://dusakawiepsi.com/';
const DUSAKAWI_USER = process.env.DUSAKAWI_USER || '1065640456';
const DUSAKAWI_PASS = process.env.DUSAKAWI_PASS || 'S@lomon1920';

// ──────────────────────────────────────────────
// TRIMESTRES
// ──────────────────────────────────────────────

const TRIMESTRES_2025 = [
  { nombre: 'I Trim',     inicio: new Date('2025-01-01'), fin: new Date('2025-03-31') },
  { nombre: 'II Trim',    inicio: new Date('2025-04-01'), fin: new Date('2025-06-30') },
  { nombre: 'III Trim',   inicio: new Date('2025-07-01'), fin: new Date('2025-09-30') },
  { nombre: 'IV Trim',    inicio: new Date('2025-10-01'), fin: new Date('2025-12-31') },
  { nombre: 'V Bimestre', inicio: new Date('2026-01-01'), fin: new Date('2026-02-28') },
];

const TRIMESTRES_2024 = [
  { nombre: 'I Trim',     inicio: new Date('2024-01-01'), fin: new Date('2024-03-31') },
  { nombre: 'II Trim',    inicio: new Date('2024-04-01'), fin: new Date('2024-06-30') },
  { nombre: 'III Trim',   inicio: new Date('2024-07-01'), fin: new Date('2024-09-30') },
  { nombre: 'IV Trim',    inicio: new Date('2024-10-01'), fin: new Date('2024-12-31') },
  { nombre: 'V Bimestre', inicio: new Date('2025-01-01'), fin: new Date('2025-02-28') },
];

const TRIMESTRES_2023 = [
  { nombre: 'I Trim',     inicio: new Date('2023-01-01'), fin: new Date('2023-03-31') },
  { nombre: 'II Trim',    inicio: new Date('2023-04-01'), fin: new Date('2023-06-30') },
  { nombre: 'III Trim',   inicio: new Date('2023-07-01'), fin: new Date('2023-09-30') },
  { nombre: 'IV Trim',    inicio: new Date('2023-10-01'), fin: new Date('2023-12-31') },
];

function getTrimestres(vigencia) {
  if (vigencia === 2024) return TRIMESTRES_2024;
  if (vigencia === 2023) return TRIMESTRES_2023;
  return TRIMESTRES_2025;
}

function fechaATrimestre(fechaStr, vigencia) {
  // Formatos posibles: "2025/03/18 12:54", "2025-03-18", "18/03/2025"
  let d;
  try {
    // Normalizar
    const s = fechaStr.replace(/\//g, '-').trim();
    // Detectar formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      d = new Date(s.substring(0, 10));
    } else if (/^\d{2}-\d{2}-\d{4}/.test(s)) {
      // DD-MM-YYYY
      const parts = s.substring(0, 10).split('-');
      d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    } else {
      d = new Date(s);
    }
  } catch(e) { return null; }

  if (isNaN(d)) return null;
  const trims = getTrimestres(vigencia);
  for (const t of trims) {
    if (d >= t.inicio && d <= t.fin) return t.nombre;
  }
  return null;
}

// ──────────────────────────────────────────────
// BROWSER
// ──────────────────────────────────────────────

async function abrirBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--window-size=1400,900',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    defaultViewport: { width: 1400, height: 900 },
    timeout: 60000,
  });
}

// ──────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────

async function login(page) {
  await page.goto(DUSAKAWI_URL, { waitUntil: 'networkidle2', timeout: 50000 });
  await page.waitForTimeout(2000);

  // Detectar campo usuario
  const selUser = ['input[name="usuario"]','input[name="user"]','input[name="username"]',
    'input[name="login"]','input[name="cedula"]','input[id*="user"]','input[id*="usuario"]',
    'input[type="text"]'];
  const selPass = ['input[name="password"]','input[name="clave"]','input[id*="pass"]',
    'input[id*="clave"]','input[type="password"]'];

  let uField = null, pField = null;
  for (const s of selUser) { try { uField = await page.$(s); if (uField) break; } catch(e){} }
  for (const s of selPass) { try { pField = await page.$(s); if (pField) break; } catch(e){} }

  if (!uField || !pField) throw new Error('No se encontró el formulario de login en Dusakawi');

  await uField.click({ clickCount: 3 }); await uField.type(DUSAKAWI_USER, { delay: 40 });
  await pField.click({ clickCount: 3 }); await pField.type(DUSAKAWI_PASS, { delay: 40 });

  // Botón submit
  const selBtn = ['button[type="submit"]','input[type="submit"]','.btn-login','#btnLogin'];
  let btn = null;
  for (const s of selBtn) { try { btn = await page.$(s); if (btn) break; } catch(e){} }
  if (btn) await btn.click(); else await pField.press('Enter');

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const html = await page.content();
  if (html.toLowerCase().includes('contraseña incorrecta') || html.toLowerCase().includes('credenciales inv')) {
    throw new Error('Credenciales incorrectas en Dusakawi EPSI');
  }
  console.log('✅ Login Dusakawi exitoso');
}

// ──────────────────────────────────────────────
// NAVEGAR A CONSULTA RECEPCIÓN
// ──────────────────────────────────────────────

async function irAConsultaRecepcion(page) {
  // Buscar menú "Gestión de Cuentas Médicas" o "Cuentas Médicas"
  const menuKeywords = ['cuentas médicas','cuentas medicas','gestión de cuentas','gestion de cuentas'];
  for (const kw of menuKeywords) {
    try {
      const els = await page.$x(`//*[contains(translate(normalize-space(.),'ÁÉÍÓÚÑ','aeioun'),'${kw.normalize('NFD').replace(/[\u0300-\u036f]/g,'')}')]`);
      if (els.length > 0) {
        await els[0].click();
        await page.waitForTimeout(1500);
        break;
      }
    } catch(e){}
  }

  // Buscar "Consulta Recepción"
  const subKeywords = ['consulta recepción','consulta recepcion','recepción','recepcion'];
  for (const kw of subKeywords) {
    try {
      const els = await page.$x(`//*[contains(translate(normalize-space(.),'ÁÉÍÓÚÑ','aeioun'),'${kw.normalize('NFD').replace(/[\u0300-\u036f]/g,'')}')]`);
      if (els.length > 0) {
        await els[0].click();
        await page.waitForTimeout(2000);
        return true;
      }
    } catch(e){}
  }
  throw new Error('No se encontró el menú "Consulta Recepción" en Dusakawi');
}

// ──────────────────────────────────────────────
// BUSCAR UN CONTRATO
// ──────────────────────────────────────────────

async function buscarContrato(page, contrato, regimen) {
  // regimen: 'RS' | 'RC' | null
  // Limpiar formulario
  try {
    const btnLimpiar = await page.$x('//*[contains(text(),"Limpiar")]');
    if (btnLimpiar.length > 0) { await btnLimpiar[0].click(); await page.waitForTimeout(800); }
  } catch(e) {}

  // Campo Número Contrato Prestador
  const selContrato = [
    'input[placeholder*="Contrato"]', 'input[name*="contrato"]', 'input[name*="numContrato"]',
    'input[name*="numeroContrato"]', 'input[id*="contrato"]',
  ];
  let campoContrato = null;
  for (const s of selContrato) {
    try { campoContrato = await page.$(s); if (campoContrato) break; } catch(e){}
  }

  // Si no encontramos por selector, buscar por posición en la fila del formulario
  if (!campoContrato) {
    // El formulario tiene varios inputs de texto — el de contrato es el 3ro según la pantalla
    const allInputs = await page.$$('input[type="text"], input:not([type])');
    // buscar el que tenga placeholder "Número Contrato Prestador" o similar
    for (const inp of allInputs) {
      const ph = await inp.evaluate(el => (el.placeholder || '').toLowerCase());
      if (ph.includes('contrato')) { campoContrato = inp; break; }
    }
    if (!campoContrato && allInputs.length >= 3) campoContrato = allInputs[2]; // 3er input = contrato
  }

  if (campoContrato) {
    await campoContrato.click({ clickCount: 3 });
    await campoContrato.type(contrato, { delay: 40 });
  }

  // Estado = Radicado (dropdown)
  try {
    const selEstado = ['select[name*="estado"]','select[id*="estado"]','select'];
    for (const s of selEstado) {
      const dropdowns = await page.$$(s);
      for (const dd of dropdowns) {
        const opts = await dd.$$eval('option', els => els.map(o => o.text.trim().toLowerCase()));
        if (opts.some(o => o.includes('radicado'))) {
          await dd.select(await dd.$eval('option', (_, els) => {
            for (const o of els) { if (o.text.trim().toLowerCase().includes('radicado')) return o.value; }
            return '';
          }));
          // Usar page.select que es más confiable
          const val = await dd.$$eval('option', opts => {
            const found = opts.find(o => o.text.trim().toLowerCase().includes('radicado'));
            return found ? found.value : null;
          });
          if (val) await page.select(`select`, val).catch(()=>{});
          break;
        }
      }
    }
  } catch(e) {}

  // Tipo Régimen
  if (regimen) {
    try {
      const selRegs = await page.$$('select');
      for (const sel of selRegs) {
        const opts = await sel.$$eval('option', els => els.map(o => ({ v: o.value, t: o.text.trim() })));
        const target = opts.find(o => o.t.toUpperCase() === regimen.toUpperCase() || o.v.toUpperCase() === regimen.toUpperCase());
        if (target) {
          await sel.select(target.v);
          await page.waitForTimeout(500);
          break;
        }
      }
    } catch(e){}
  }

  // Click Buscar / Consultar / Enter
  const btnKeywords = ['buscar','consultar','filtrar','search'];
  let clicked = false;
  for (const kw of btnKeywords) {
    try {
      const btns = await page.$x(`//button[contains(translate(normalize-space(.),'ÁÉÍÓÚ','aeiou'),'${kw}')] | //input[@type='submit' and contains(translate(@value,'ÁÉÍÓÚ','aeiou'),'${kw}')]`);
      if (btns.length > 0) { await btns[0].click(); clicked = true; break; }
    } catch(e){}
  }
  if (!clicked && campoContrato) await campoContrato.press('Enter');

  await page.waitForTimeout(3000);
}

// ──────────────────────────────────────────────
// EXTRAER FILAS DE LA TABLA
// ──────────────────────────────────────────────

async function extraerFilas(page) {
  return page.evaluate(() => {
    const filas = [];
    const tabla = document.querySelector('table');
    if (!tabla) return filas;

    const headers = Array.from(tabla.querySelectorAll('thead tr th, tr:first-child th'))
      .map(th => th.innerText.trim());

    const rows = tabla.querySelectorAll('tbody tr');
    rows.forEach(tr => {
      const celdas = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      if (celdas.length > 0 && celdas.some(c => c !== '')) {
        const obj = {};
        headers.forEach((h, i) => { if (h) obj[h] = celdas[i] || ''; });
        obj._raw = celdas;
        filas.push(obj);
      }
    });
    return filas;
  });
}

// ──────────────────────────────────────────────
// CONSULTAR UN CONTRATO ESPECÍFICO
// ──────────────────────────────────────────────

async function consultarUnoContrato(contrato, regimen = null) {
  const browser = await abrirBrowser();
  const page = await browser.newPage();
  try {
    await login(page);
    await irAConsultaRecepcion(page);
    await buscarContrato(page, contrato, regimen);
    const filas = await extraerFilas(page);
    return filas;
  } finally {
    await browser.close();
  }
}

// ──────────────────────────────────────────────
// REPORTE: QUIÉNES RADICARON POR TRIMESTRE
// ──────────────────────────────────────────────

async function reporteRadicacion({ vigencia = 2025, trimestre = null, regimen = null } = {}) {
  console.log(`🌐 Iniciando consulta masiva Dusakawi — vigencia ${vigencia}...`);

  // Obtener contratos del reporte de evaluaciones
  let contratos = [];
  try {
    const datos = await evaluaciones.obtenerDatos(vigencia);
    contratos = datos.map(p => ({ contrato: p.contrato, prestador: p.prestador, nit: p.nit }))
      .filter(p => p.contrato && p.contrato.trim() !== '');
  } catch(e) {
    throw new Error(`No se pudieron obtener los contratos: ${e.message}`);
  }

  if (contratos.length === 0) throw new Error('No hay contratos en la base de datos para esta vigencia');
  console.log(`📋 ${contratos.length} contratos a consultar en Dusakawi`);

  const browser = await abrirBrowser();
  const page = await browser.newPage();
  const resultados = [];

  try {
    await login(page);
    await irAConsultaRecepcion(page);

    for (let i = 0; i < contratos.length; i++) {
      const { contrato, prestador } = contratos[i];
      console.log(`  [${i+1}/${contratos.length}] ${contrato} — ${prestador}`);

      try {
        const regToQuery = regimen === 'sub' ? 'RS' : regimen === 'con' ? 'RC' : null;
        await buscarContrato(page, contrato, regToQuery);
        const filas = await extraerFilas(page);

        // Determinar trimestres radicados según fechas
        const trimestreSet = new Set();
        for (const fila of filas) {
          const fecha = fila['Fecha Recepción'] || fila['Fecha'] || fila._raw?.[4] || '';
          if (fecha) {
            const trim = fechaATrimestre(fecha, vigencia);
            if (trim) trimestreSet.add(trim);
          }
        }

        resultados.push({
          contrato,
          prestador,
          radicaciones: filas.length,
          trimestresRadicados: [...trimestreSet].sort(),
          filas,
        });
      } catch(e) {
        console.error(`  ❌ Error ${contrato}:`, e.message);
        resultados.push({ contrato, prestador, radicaciones: 0, trimestresRadicados: [], error: e.message });
      }
    }
  } finally {
    await browser.close();
  }

  // ── Formatear reporte ──
  const trimestresVig = getTrimestres(vigencia).map(t => t.nombre);
  const filtroTrim = trimestre; // null = todos

  let msg = `🌐 *RADICACIÓN DUSAKAWI EPSI — ${vigencia}*\n`;
  if (regimen) msg += `Régimen: *${regimen === 'sub' ? 'Subsidiado (RS)' : 'Contributivo (RC)'}*\n`;
  if (filtroTrim) msg += `Trimestre: *${filtroTrim}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  const radicados = resultados.filter(r => {
    if (filtroTrim) return r.trimestresRadicados.includes(filtroTrim);
    return r.radicaciones > 0;
  });
  const pendientes = resultados.filter(r => {
    if (filtroTrim) return !r.trimestresRadicados.includes(filtroTrim);
    return r.radicaciones === 0;
  });

  msg += `✅ *RADICARON (${radicados.length}):*\n`;
  radicados.forEach((r, i) => {
    const trims = filtroTrim ? filtroTrim : r.trimestresRadicados.join(', ');
    msg += `${i+1}. ${r.prestador}\n   📄 ${r.contrato} | ${trims}\n`;
  });

  msg += `\n❌ *PENDIENTES POR RADICAR (${pendientes.length}):*\n`;
  pendientes.forEach((r, i) => {
    msg += `${i+1}. ${r.prestador}\n   📄 ${r.contrato}\n`;
    if (r.trimestresRadicados.length > 0) msg += `   _(Tiene: ${r.trimestresRadicados.join(', ')})_\n`;
  });

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 Total: ${resultados.length} | ✅ ${radicados.length} | ❌ ${pendientes.length}\n`;

  // Resumen por trimestre
  msg += `\n📅 *RESUMEN POR TRIMESTRE:*\n`;
  for (const t of trimestresVig) {
    const conTrim = resultados.filter(r => r.trimestresRadicados.includes(t)).length;
    const sinTrim = resultados.length - conTrim;
    msg += `  ${t}: ✅ ${conTrim} radicados | ❌ ${sinTrim} pendientes\n`;
  }

  return msg;
}

// ──────────────────────────────────────────────
// CONSULTA SIMPLE POR CONTRATO (para el bot)
// ──────────────────────────────────────────────

async function consultarEstadoRadicacion({ prestador = '', contrato = '', vigencia = 2025, regimen = null } = {}) {
  console.log(`🌐 Consultando Dusakawi: ${contrato || prestador}`);

  if (!contrato && !prestador) {
    return { texto: '⚠️ Debes indicar un número de contrato o nombre de prestador para consultar.' };
  }

  const browser = await abrirBrowser();
  const page = await browser.newPage();

  try {
    await login(page);
    await irAConsultaRecepcion(page);

    const regToQuery = regimen === 'sub' ? 'RS' : regimen === 'con' ? 'RC' : null;
    const termino = contrato || prestador;
    await buscarContrato(page, termino, regToQuery);
    const filas = await extraerFilas(page);

    if (filas.length === 0) {
      return { texto: `⚠️ No se encontraron radicaciones para *${termino}* en Dusakawi EPSI.\n_(Estado: Radicado${regToQuery ? ` | Régimen: ${regToQuery}` : ''})_` };
    }

    // Analizar trimestres
    const trimestreSet = new Set();
    for (const fila of filas) {
      const fecha = fila['Fecha Recepción'] || fila['Fecha'] || fila._raw?.[4] || '';
      if (fecha) {
        const trim = fechaATrimestre(fecha, vigencia);
        if (trim) trimestreSet.add(trim);
      }
    }

    const trimestresRadicados = [...trimestreSet].sort();
    const todosTrims = getTrimestres(vigencia).map(t => t.nombre);
    const trimsPendientes = todosTrims.filter(t => !trimestresRadicados.includes(t));

    let txt = `🌐 *RADICACIÓN DUSAKAWI — ${termino}*\n`;
    txt += `Vigencia: *${vigencia}*\n`;
    if (regToQuery) txt += `Régimen: *${regToQuery}*\n`;
    txt += `Total radicaciones: *${filas.length}*\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    txt += `✅ *Trimestres radicados:* ${trimestresRadicados.length > 0 ? trimestresRadicados.join(', ') : 'Ninguno'}\n`;
    txt += `❌ *Trimestres pendientes:* ${trimsPendientes.length > 0 ? trimsPendientes.join(', ') : 'Ninguno — ¡Al día!'}\n\n`;

    txt += `📋 *Detalle radicaciones:*\n`;
    filas.slice(0, 15).forEach((f, i) => {
      const fecha = f['Fecha Recepción'] || f._raw?.[4] || '';
      const ips   = f['IPS'] || f._raw?.[3] || '';
      const nRad  = f['Número Radicación'] || f._raw?.[10] || '';
      const valor = f['Valor AF'] || f._raw?.[7] || '';
      const estado= f['Estado'] || f._raw?.[9] || '';
      txt += `${i+1}. 📅 ${fecha} | ${ips.split('\n')[0]}\n`;
      if (nRad)  txt += `   🔖 Radicado: ${nRad}\n`;
      if (valor) txt += `   💰 Valor: ${valor}\n`;
      if (estado) txt += `   📌 Estado: ${estado}\n`;
    });
    if (filas.length > 15) txt += `\n_...y ${filas.length - 15} radicaciones más._\n`;

    return { texto: txt };

  } catch(e) {
    console.error('❌ Error Dusakawi:', e.message);
    return { texto: `❌ Error al consultar Dusakawi EPSI:\n${e.message}` };
  } finally {
    await browser.close();
  }
}

// ──────────────────────────────────────────────
// REPORTE MASIVO (quiénes radicaron / pendientes)
// ──────────────────────────────────────────────

async function reporteMasivoRadicacion({ vigencia = 2025, trimestre = null, regimen = null } = {}) {
  return reporteRadicacion({ vigencia, trimestre, regimen });
}

module.exports = { consultarEstadoRadicacion, reporteMasivoRadicacion };
