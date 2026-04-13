/**
 * dusakawi.js — Acceso automatizado al sistema Dusakawi EPSI
 * Usa Puppeteer para consultar Gestión de Cuentas Médicas → Consulta Recepción
 */

require('dotenv').config({ override: true });
const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DUSAKAWI_URL  = 'https://dusakawiepsi.com/';
const DUSAKAWI_USER = process.env.DUSAKAWI_USER || '1065640456';
const DUSAKAWI_PASS = process.env.DUSAKAWI_PASS || 'S@lomon1920';

// ──────────────────────────────────────────────
// BROWSER HELPER
// ──────────────────────────────────────────────

async function abrirBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,900',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    defaultViewport: { width: 1280, height: 900 },
  });
}

async function screenshot(page, nombre) {
  try {
    const p = path.join(os.tmpdir(), `dusakawi_${nombre}_${Date.now()}.png`);
    await page.screenshot({ path: p, fullPage: false });
    return p;
  } catch(e) { return null; }
}

// ──────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────

async function login(page) {
  await page.goto(DUSAKAWI_URL, { waitUntil: 'networkidle2', timeout: 40000 });
  await page.waitForTimeout(2000);

  // Intentar encontrar campos de usuario y contraseña
  const selUser = [
    'input[name="usuario"]', 'input[name="user"]', 'input[name="username"]',
    'input[name="login"]',   'input[name="cedula"]', 'input[name="documento"]',
    'input[id*="user"]',     'input[id*="login"]',   'input[id*="usuario"]',
    'input[type="text"]',
  ];
  const selPass = [
    'input[name="password"]', 'input[name="contrasena"]', 'input[name="clave"]',
    'input[id*="pass"]',      'input[id*="clave"]',        'input[type="password"]',
  ];
  const selBtn = [
    'button[type="submit"]', 'input[type="submit"]', 'button:contains("Ingresar")',
    'button:contains("Entrar")', 'button:contains("Login")', 'button:contains("Iniciar")',
    '.btn-login', '#btnLogin', 'button',
  ];

  let userField = null;
  for (const s of selUser) {
    try {
      userField = await page.$(s);
      if (userField) break;
    } catch(e) {}
  }

  let passField = null;
  for (const s of selPass) {
    try {
      passField = await page.$(s);
      if (passField) break;
    } catch(e) {}
  }

  if (!userField || !passField) {
    // Tomar screenshot para debug
    const sc = await screenshot(page, 'login_error');
    throw { message: 'No se encontró el formulario de login en el sitio Dusakawi.', screenshot: sc };
  }

  await userField.click({ clickCount: 3 });
  await userField.type(DUSAKAWI_USER, { delay: 50 });
  await passField.click({ clickCount: 3 });
  await passField.type(DUSAKAWI_PASS, { delay: 50 });

  // Hacer clic en botón de login
  let btnLogin = null;
  for (const s of selBtn) {
    try {
      btnLogin = await page.$(s);
      if (btnLogin) break;
    } catch(e) {}
  }

  if (btnLogin) {
    await btnLogin.click();
  } else {
    await passField.press('Enter');
  }

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Verificar login exitoso — buscar mensaje de error
  const contenido = await page.content();
  if (contenido.toLowerCase().includes('contraseña incorrecta') ||
      contenido.toLowerCase().includes('usuario no existe') ||
      contenido.toLowerCase().includes('credenciales')) {
    throw { message: 'Login fallido: credenciales incorrectas en Dusakawi.' };
  }
}

// ──────────────────────────────────────────────
// NAVEGAR A CONSULTA RECEPCIÓN
// ──────────────────────────────────────────────

async function irAConsultaRecepcion(page) {
  // Buscar menú "Gestión de Cuentas Médicas"
  const menuTexts = ['gestión de cuentas', 'cuentas médicas', 'gestion de cuentas', 'cuentas medicas'];
  let menuItem = null;

  for (const txt of menuTexts) {
    try {
      menuItem = await page.$x(`//*[contains(translate(text(),'ÁÉÍÓÚÀÈÌÒÙ','aeiouaeiou'),'${txt}')]`);
      if (menuItem && menuItem.length > 0) { menuItem = menuItem[0]; break; }
    } catch(e) {}
  }

  if (menuItem) {
    await menuItem.click();
    await page.waitForTimeout(1500);
  }

  // Buscar submenú "Consulta Recepción"
  const subTexts = ['consulta recepción', 'consulta recepcion', 'recepción', 'recepcion'];
  let subItem = null;
  for (const txt of subTexts) {
    try {
      const els = await page.$x(`//*[contains(translate(text(),'ÁÉÍÓÚÀÈÌÒÙ','aeiouaeiou'),'${txt}')]`);
      if (els && els.length > 0) { subItem = els[0]; break; }
    } catch(e) {}
  }

  if (subItem) {
    await subItem.click();
    await page.waitForTimeout(2000);
  } else {
    // Intentar URL directa si existe
    const urlActual = page.url();
    console.log('URL actual:', urlActual);
    const sc = await screenshot(page, 'menu');
    throw { message: 'No se encontró el menú "Consulta Recepción" en el sistema Dusakawi.', screenshot: sc };
  }
}

// ──────────────────────────────────────────────
// EXTRAER TABLA DE RESULTADOS
// ──────────────────────────────────────────────

async function extraerTabla(page) {
  await page.waitForTimeout(2000);

  const datos = await page.evaluate(() => {
    const tablas = document.querySelectorAll('table');
    const resultado = [];

    tablas.forEach(tabla => {
      const filas = tabla.querySelectorAll('tr');
      filas.forEach(fila => {
        const celdas = fila.querySelectorAll('td, th');
        if (celdas.length > 0) {
          resultado.push(Array.from(celdas).map(c => c.innerText.trim()));
        }
      });
    });

    return resultado;
  });

  return datos;
}

// ──────────────────────────────────────────────
// BUSCAR RADICACIÓN
// ──────────────────────────────────────────────

async function buscarRadicacion({ prestador = '', contrato = '', fechaInicio = '', fechaFin = '' } = {}) {
  const browser = await abrirBrowser();
  const page = await browser.newPage();

  try {
    // Login
    await login(page);
    const scLogin = await screenshot(page, 'post_login');

    // Navegar a Consulta Recepción
    await irAConsultaRecepcion(page);
    const scMenu = await screenshot(page, 'consulta_recepcion');

    // Intentar llenar formulario de búsqueda
    const terminoBusqueda = prestador || contrato;
    if (terminoBusqueda) {
      const camposBusqueda = [
        'input[name*="prestador"]', 'input[name*="razon"]', 'input[name*="nombre"]',
        'input[name*="contrato"]',  'input[name*="nit"]',   'input[name*="search"]',
        'input[placeholder*="prestador"]', 'input[placeholder*="buscar"]',
        'input[type="text"]',
      ];
      for (const sel of camposBusqueda) {
        try {
          const campo = await page.$(sel);
          if (campo) {
            await campo.click({ clickCount: 3 });
            await campo.type(terminoBusqueda, { delay: 50 });
            break;
          }
        } catch(e) {}
      }

      // Rango de fechas si se proporcionan
      if (fechaInicio) {
        const campFecha = await page.$('input[name*="fecha_ini"], input[name*="fechaInicio"], input[type="date"]');
        if (campFecha) { await campFecha.click({ clickCount: 3 }); await campFecha.type(fechaInicio); }
      }
      if (fechaFin) {
        const campFechaFin = await page.$('input[name*="fecha_fin"], input[name*="fechaFin"]');
        if (campFechaFin) { await campFechaFin.click({ clickCount: 3 }); await campFechaFin.type(fechaFin); }
      }

      // Buscar botón de consulta
      const btnConsulta = await page.$('button[type="submit"], input[type="submit"], button:has(svg), .btn-primary, .btn-buscar, button');
      if (btnConsulta) {
        await btnConsulta.click();
        await page.waitForTimeout(3000);
      }
    }

    // Extraer tabla de resultados
    const tabla = await extraerTabla(page);
    const scResultados = await screenshot(page, 'resultados');

    // Formatear texto resultado
    let texto = '';
    if (tabla.length === 0) {
      texto = '⚠️ No se encontraron resultados en la tabla de Consulta Recepción.';
    } else {
      texto = `📋 *Consulta Recepción — Dusakawi EPSI*\n`;
      if (terminoBusqueda) texto += `🔍 Búsqueda: \`${terminoBusqueda}\`\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      // Encabezado
      const headers = tabla[0];
      const filas = tabla.slice(1).filter(f => f.some(c => c.trim() !== ''));

      if (filas.length === 0) {
        texto += '⚠️ No hay registros en la consulta.';
      } else {
        texto += `Total registros: *${filas.length}*\n\n`;
        filas.slice(0, 20).forEach((fila, idx) => {
          texto += `*${idx + 1}.* `;
          fila.forEach((celda, i) => {
            if (celda.trim()) {
              const col = headers[i] ? `${headers[i]}: ` : '';
              texto += `${col}${celda}  `;
            }
          });
          texto += '\n';
        });
        if (filas.length > 20) texto += `\n_... y ${filas.length - 20} registros más._`;
      }
    }

    return { texto, screenshots: [scLogin, scMenu, scResultados].filter(Boolean) };

  } catch(e) {
    const sc = await screenshot(page, 'error').catch(() => null);
    return {
      texto: `❌ Error al acceder a Dusakawi EPSI:\n${e.message || JSON.stringify(e)}`,
      screenshots: [e.screenshot, sc].filter(Boolean),
    };
  } finally {
    await browser.close();
  }
}

// ──────────────────────────────────────────────
// CONSULTA ESTADO RADICACIÓN (función principal)
// ──────────────────────────────────────────────

async function consultarEstadoRadicacion({ prestador = '', contrato = '', fechaInicio = '', fechaFin = '' } = {}) {
  console.log(`🌐 Consultando Dusakawi EPSI: ${prestador || contrato}`);
  return buscarRadicacion({ prestador, contrato, fechaInicio, fechaFin });
}

module.exports = { consultarEstadoRadicacion };
