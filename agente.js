/**
 * agente.js — Bot Salud
 * Enfocado en: Evaluaciones de prestadores y contratos
 */

require('dotenv').config({ override: true });
const Anthropic = require('@anthropic-ai/sdk');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const historial = [];

// ──────────────────────────────────────────────
// SYSTEM PROMPT
// ──────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un asistente de gestión de contratos y evaluaciones de prestadores de salud. Respondes en español colombiano, de forma corta y directa.

Si el usuario pregunta algo que no está en tus datos, di simplemente "No tengo ese dato disponible".

No respondas preguntas de normatividad ni resoluciones de salud. Solo te ocupas de evaluaciones y contratos.`;

// ──────────────────────────────────────────────
// BIENVENIDA Y MENÚ
// ──────────────────────────────────────────────

function mensajeBienvenida() {
  return `👋 *¡Hola! Soy tu asistente en salud. ¿En qué te puedo ayudar?*

Escríbeme tu pregunta 💬`;
}

function mensajeMenu() {
  return `📋 *MENÚ — Bot Evaluaciones*

1️⃣ Reporte evaluaciones 2023
2️⃣ Reporte evaluaciones 2024
3️⃣ Reporte evaluaciones 2025
4️⃣ Comparativo todas las vigencias
5️⃣ Prestador con más descuento
6️⃣ Prestador con menos descuento

O escribe tu pregunta directamente 💬`;
}

const MENU_ACCIONES = {
  '1': 'reporte evaluaciones 2023',
  '2': 'reporte evaluaciones 2024',
  '3': 'reporte evaluaciones 2025',
  '4': 'comparar evaluaciones todas las vigencias',
  '5': 'prestador con más descuento 2025',
  '6': 'prestador con menos descuento 2025',
};

// ──────────────────────────────────────────────
// PROCESAMIENTO DE MENSAJES
// ──────────────────────────────────────────────

async function procesarMensaje(texto, esAdmin = true) {
  const t = texto.trim();
  const tl = t.toLowerCase();

  // Saludos
  const saludos = ['hola', 'buenas', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'inicio', '/start'];
  if (saludos.includes(tl) || t === '/start') {
    return mensajeBienvenida();
  }

  // Menú
  const menuCmds = ['menú', 'menu', 'ayuda', 'help', '/menu', '/ayuda', '/help'];
  if (menuCmds.includes(tl)) {
    return mensajeMenu();
  }

  // Opciones numéricas del menú — convertir ANTES de detectar
  let textoFinal = MENU_ACCIONES[t] ? MENU_ACCIONES[t] : texto;
  const tlFinal = textoFinal.toLowerCase();

  // ── Detectar vigencia ──
  const vigMatch = tlFinal.match(/\b(2023|2024|2025|2026)\b/);
  const vigencia = vigMatch ? parseInt(vigMatch[1]) : null;

  // ── Detectar trimestre ──
  function detectarTrimestre(s) {
    if (/i trim|primer trim|trimestre 1|1 trim|1er trim/.test(s)) return 'I Trim';
    if (/ii trim|segundo trim|trimestre 2|2 trim/.test(s)) return 'II Trim';
    if (/iii trim|tercer trim|trimestre 3|3 trim/.test(s)) return 'III Trim';
    if (/iv trim|cuarto trim|trimestre 4|4 trim/.test(s)) return 'IV Trim';
    return null;
  }

  // ── RANKING DESCUENTOS ──
  const esMas   = /m[aá]s descuento|mayor descuento|m[aá]s descontado|top descuento/.test(tlFinal);
  const esMenos = /menos descuento|menor descuento|menos descontado/.test(tlFinal);

  if (esMas || esMenos) {
    return { tipo: 'ranking_descuentos', orden: esMas ? 'mayor' : 'menor', vigencia, trimestre: detectarTrimestre(tlFinal) };
  }

  // ── REPORTE EVALUACIONES ──
  const palabrasEval = ['evaluacion', 'evaluación', 'eval', 'evaluado', 'pendiente', 'sin evaluar', 'al dia', 'al día', 'contrato', 'prestador', 'descuento'];
  const palabrasReporte = ['reporte', 'dame', 'muestra', 'ver', 'consultar', 'informe', 'resumen', 'lista', 'quienes', 'quiénes'];
  const tieneEval = palabrasEval.some(p => tlFinal.includes(p));
  const tieneReporte = palabrasReporte.some(p => tlFinal.includes(p));

  if (vigencia && (tieneEval || tieneReporte)) {
    return { tipo: 'evaluacion', vigencia, excel: tlFinal.includes('excel') || tlFinal.includes('archivo') };
  }

  // Sin año pero con palabras de evaluación → usar 2025 por defecto
  if (tieneEval && tieneReporte) {
    return { tipo: 'evaluacion', vigencia: 2025, excel: tlFinal.includes('excel') || tlFinal.includes('archivo') };
  }

  // ── COMPARATIVO TODAS LAS VIGENCIAS ──
  if (tlFinal.includes('comparar') || tlFinal.includes('todas') || tlFinal.includes('vigencias') || tlFinal.includes('todos los años')) {
    if (tieneEval || tieneReporte) {
      return { tipo: 'evaluacion_comparativo' };
    }
  }

  // ── CONSULTA ESPECÍFICA DE PRESTADOR O CONTRATO ──
  // Detecta número de contrato (ej: EB-44035-2026-03, 20001-064-PMT)
  const matchContrato = tlFinal.match(/[a-z0-9]+-[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*/i);
  if (matchContrato) {
    return {
      tipo: 'consulta_prestador',
      busqueda: matchContrato[0],
      vigencia: vigencia || 2025,
      excel: tlFinal.includes('excel') || tlFinal.includes('archivo'),
      trimestre: detectarTrimestre(tlFinal),
      regimen: tlFinal.includes('subsidiado') ? 'sub' : tlFinal.includes('contributivo') ? 'con' : null,
    };
  }

  // Detecta "ver/buscar/consultar [nombre] [año]" o "[nombre] trimestre"
  const palabrasConsulta = ['ver prestador', 'buscar prestador', 'consultar prestador', 'datos de', 'info de', 'información de'];
  const tieneConsulta = palabrasConsulta.some(p => tlFinal.includes(p));
  if (tieneConsulta && vigencia) {
    // Extraer el nombre después de la palabra clave
    let busqueda = tlFinal;
    for (const p of palabrasConsulta) busqueda = busqueda.replace(p, '');
    busqueda = busqueda.replace(/\b(2023|2024|2025|2026)\b/, '').replace(/excel|archivo|subsidiado|contributivo/, '').trim();
    if (busqueda.length > 2) {
      return {
        tipo: 'consulta_prestador',
        busqueda,
        vigencia,
        excel: tlFinal.includes('excel') || tlFinal.includes('archivo'),
        trimestre: detectarTrimestre(tlFinal),
        regimen: tlFinal.includes('subsidiado') ? 'sub' : tlFinal.includes('contributivo') ? 'con' : null,
      };
    }
  }

  // ── CLAUDE (para preguntas generales) ──
  historial.push({ role: 'user', content: textoFinal });
  if (historial.length > 20) historial.splice(0, 2);

  try {
    const respuesta = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: historial,
    });

    const textoRespuesta = respuesta.content[0].text;
    historial.push({ role: 'assistant', content: textoRespuesta });
    return textoRespuesta;

  } catch (error) {
    console.error('❌ Error Claude:', error.message);
    throw error;
  }
}

module.exports = { procesarMensaje, mensajeBienvenida, mensajeMenu };
