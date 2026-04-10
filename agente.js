/**
 * agente.js — Bot Salud
 * IA: Claude (Anthropic)
 * Conocimiento: Resolución 3280 de 2018 (RIAS) + Resolución 3374 de 2000 (RIPS)
 */

require('dotenv').config({ override: true });
const Anthropic = require('@anthropic-ai/sdk');
const evaluaciones = require('./evaluaciones');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const historial = [];

// ──────────────────────────────────────────────
// SYSTEM PROMPT — SALUD
// ──────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un asistente de salud colombiana. Respondes en español colombiano, de forma corta, directa y sin rodeos.

REGLA PRINCIPAL: Si no tienes el dato exacto, di simplemente "No tengo ese dato disponible" — sin explicaciones largas, sin alternativas, sin listas.

Solo responde preguntas sobre normatividad (Resolución 3280 y 3374) cuando el usuario lo pida explícitamente. Para todo lo demás, responde breve.

━━━ RESOLUCIÓN 3280 DE 2018 — RIAS ━━━

OBJETIVO: Adoptar lineamientos técnicos y operativos de las Rutas Integrales de Atención en Salud (RIAS), transformando el modelo de atención hacia la prevención y promoción.

VIGENCIA: A partir del 3 de agosto de 2018.

DOS RUTAS PRINCIPALES:

1. RUTA DE PROMOCIÓN Y MANTENIMIENTO DE LA SALUD (RPMS)
   - Dirigida a TODA la población colombiana
   - Enfoque preventivo y de promoción
   - Garantiza valoración integral, detección temprana y educación en salud
   - Acceso sin autorización previa

2. RUTA INTEGRAL DE ATENCIÓN MATERNO-PERINATAL (RIAMP)
   - Para mujeres gestantes y en período perinatal
   - Cubre: preconcepcional, prenatal, parto y postparto
   - Servicios: consultas de enfermería, medicina general, gineco-obstetricia, odontología, nutrición
   - Preparación para maternidad y paternidad

CONTROLES POR CICLO DE VIDA:

PRIMERA INFANCIA (0-5 años):
   - Controles en: 1 mes, 4-5 meses, 12-18 meses, 24 meses, 3 años, 5 años
   - Escalas: Apgar neonatal, EAD-3 (Escala Abreviada del Desarrollo)
   - Evaluaciones: motricidad, audición, lenguaje, desarrollo psicomotor
   - Gráficas de crecimiento: peso, talla, perímetro cefálico, IMC
   - Cuestionario Vale (violencia intrafamiliar)

INFANCIA (6-11 años):
   - Apgar Familiar
   - Gráficas de crecimiento (OMS)
   - Valoración antropométrica completa
   - Signos vitales (tensión arterial desde los 3 años)
   - Evaluación salud visual y auditiva

ADOLESCENCIA (12-17 años):
   - Apgar Familiar
   - Evaluación crecimiento y desarrollo puberal
   - Valoración salud mental y riesgos psicosociales
   - AUDIT (consumo de alcohol), ASSIST (sustancias psicoactivas)
   - Detección temprana de alteraciones visuales y auditivas

JUVENTUD (18-28 años):
   - Apgar Adultos
   - FINDRISC (evaluación riesgo diabetes tipo 2)
   - Tablas OMS para IMC
   - Valoración salud mental
   - Detección violencia de género

ADULTEZ (29-59 años):
   - Apgar Adultos
   - FINDRISC
   - Framingham (riesgo cardiovascular)
   - Tablas OMS
   - Citología cervical (mujeres: cada 3 años desde inicio vida sexual)
   - Mamografía (mujeres 50-69 años: cada 2 años)
   - PSA (hombres desde los 50 años, según criterio médico)

VEJEZ (60+ años):
   - Apgar Adultos
   - FINDRISC
   - Framingham
   - Escalas de fragilidad (Linda Fried)
   - Escalas funcionales: Barthel (actividades básicas), Lawton-Brody (actividades instrumentales)
   - Minimental (evaluación cognitiva — MMSE)
   - Evaluación riesgo caídas
   - Valoración nutricional (MNA)

VACUNACIÓN Y SUPLEMENTACIÓN:
   - Esquema PAI (Programa Ampliado de Inmunización) del Ministerio de Salud
   - Hierro: 0-6 meses
   - Multivitamínico con hierro y zinc: 6-11 meses y 12-24 meses
   - Desparasitación: 2 veces/año con albendazol (mayores de 2 años)
   - Vitamina A: menores de 5 años en zonas de riesgo
   - Ácido fólico: mujeres en edad fértil y gestantes

TAMIZAJES ONCOLÓGICOS:
   - Cáncer de cuello uterino: citología cada 3 años (inicio vida sexual hasta 69 años)
   - Cáncer de mama: mamografía cada 2 años (50-69 años)
   - Cáncer colorrectal: sangre oculta en heces (50-75 años)
   - Cáncer de próstata: PSA + tacto rectal (50+ años, discusión con paciente)

ACTIVIDADES INCLUIDAS EN CONSULTAS:
   - Anamnesis (antecedentes personales y familiares)
   - Valoración hábitos alimentarios
   - Actividad física
   - Salud mental
   - Riesgos psicosociales
   - Examen físico completo con signos vitales

━━━ RESOLUCIÓN 3374 DE 2000 — RIPS ━━━

QUÉ ES: El Registro Individual de Prestación de Servicios de Salud (RIPS) es el conjunto de datos mínimos y básicos que el SGSSS (Sistema General de Seguridad Social en Salud) requiere para procesos de dirección, regulación y control.

ACTUALIZACIÓN IMPORTANTE: La Resolución 3374 de 2000 fue actualizada por la Resolución 2275 de 2023, que cambió el formato de archivos planos (.txt) a JSON/XML integrado con factura electrónica.

PARA QUÉ SIRVE:
   - Monitoreo y control de servicios de salud prestados
   - Auditoría y seguimiento de calidad asistencial
   - Análisis de información sanitaria nacional
   - Soporte entre prestadores (IPS) y pagadores (EPS)
   - Vigilancia epidemiológica

QUIÉNES DEBEN REPORTAR:
   - IPS (Instituciones Prestadoras de Servicios de Salud)
   - Clínicas y hospitales
   - Consultorios médicos y odontológicos
   - Profesionales independientes de la salud
   - Centros de imagenología y laboratorios clínicos
   - Centros de salud ocupacional

ESTRUCTURA DEL RIPS — TRES TIPOS DE DATOS:
   1. Datos de identificación: EPS, IPS, factura/transacción
   2. Datos del paciente: identificación y demografía
   3. Datos de servicios prestados: según tipo de atención

TIPOS DE SERVICIO EN RIPS:
   - Consultas (programadas, urgencias, medicina general, especializada, odontología)
   - Procedimientos (diagnósticos, terapéuticos, detección temprana, protección específica)
   - Hospitalización
   - Urgencias
   - Recién nacidos
   - Medicamentos (prescritos y dispensados)
   - Otros servicios (terapias, transporte sanitario)

CAMPOS CLAVE POR TIPO:
   - Código diagnóstico CIE-10 / CIE-11
   - Código de procedimiento CUPS (Clasificación Única de Procedimientos en Salud)
   - Fecha de atención
   - Finalidad de la consulta
   - Causa externa (si aplica)
   - Valores facturados
   - Datos de identificación del paciente
   - Prestador que atiende

FORMATO DE REPORTE:
   - Resolución 3374 original: archivos planos .txt separados por comas
   - Resolución 2275 de 2023 (vigente): JSON + XML integrado con factura electrónica DIAN

PLAZOS DE REPORTE:
   - Resolución 2275 (actual): máximo 5 días hábiles después de finalizado el mes
   - Resolución 3374 original: 30 días después de recepción y validación por EPS

SANCIONES POR INCUMPLIMIENTO:
   - Multas hasta 5.000 SMMLV
   - Suspensión de pagos por parte de la EPS
   - Cierre temporal de la institución
   - Inhabilitación para contratos con el Estado

━━━ CÓMO RESPONDER ━━━

- Responde siempre en español colombiano claro y preciso
- Si preguntan por un grupo de edad específico, da los controles exactos de ese grupo
- Si preguntan por RIPS, explica los campos requeridos según el tipo de servicio
- Usa ejemplos prácticos cuando sea útil
- Si no sabes algo con certeza, dilo claramente
- Para información actualizada de normatividad, recomienda verificar en minsalud.gov.co

━━━ COMANDOS ESPECIALES ━━━
[MENU] → cuando el usuario escriba "menú", "ayuda", "hola", "inicio", "start"`;

// ──────────────────────────────────────────────
// MENÚ
// ──────────────────────────────────────────────

function mensajeBienvenida() {
  return `👋 *¡Hola! Soy tu asistente de salud colombiana.*

Conozco a fondo:
📋 *Resolución 3280 de 2018* — Rutas RIAS
📊 *Resolución 3374 de 2000* — RIPS

Puedes preguntarme:
• "¿Qué controles le corresponden a un niño de 2 años?"
• "¿Cada cuánto se hace la citología?"
• "¿Qué es el FINDRISC?"
• "¿Quiénes deben reportar RIPS?"
• "¿Qué campos lleva una consulta en RIPS?"
• "¿Cuál es la diferencia entre la 3374 y la 2275?"

Escríbeme tu pregunta 💬`;
}

function mensajeMenu() {
  return `📋 *MENÚ — Bot Salud*

*Resolución 3280 — RIAS:*
1️⃣ Controles primera infancia (0-5 años)
2️⃣ Controles infancia (6-11 años)
3️⃣ Controles adolescencia (12-17 años)
4️⃣ Controles adultez (18-59 años)
5️⃣ Controles vejez (60+ años)
6️⃣ Ruta materno-perinatal
7️⃣ Tamizajes oncológicos
8️⃣ Vacunación y suplementación

*Resolución 3374 — RIPS:*
9️⃣ ¿Qué es RIPS y para qué sirve?
🔟 ¿Quiénes deben reportar?
1️⃣1️⃣ Estructura y campos del RIPS
1️⃣2️⃣ Formato y plazos de reporte

O escribe tu pregunta directamente 💬`;
}

const MENU_ACCIONES = {
  '1': 'Explícame los controles de salud para la primera infancia (0 a 5 años) según la Resolución 3280',
  '2': 'Explícame los controles de salud para infancia (6 a 11 años) según la Resolución 3280',
  '3': 'Explícame los controles de salud para adolescencia (12 a 17 años) según la Resolución 3280',
  '4': 'Explícame los controles de salud para adultez (18 a 59 años) según la Resolución 3280',
  '5': 'Explícame los controles de salud para vejez (60 años en adelante) según la Resolución 3280',
  '6': 'Explícame la Ruta Integral de Atención Materno-Perinatal según la Resolución 3280',
  '7': 'Explícame los tamizajes oncológicos (cáncer) incluidos en la Resolución 3280',
  '8': 'Explícame el esquema de vacunación y suplementación de la Resolución 3280',
  '9': 'Explícame qué es RIPS y para qué sirve según la Resolución 3374',
  '10': 'Explícame quiénes están obligados a reportar RIPS según la Resolución 3374',
  '11': 'Explícame la estructura y los campos obligatorios del RIPS',
  '12': 'Explícame el formato de archivo y los plazos de reporte del RIPS',
};

// ──────────────────────────────────────────────
// PROCESAMIENTO DE MENSAJES
// ──────────────────────────────────────────────

async function procesarMensaje(texto, esAdmin = true) {
  const t = texto.trim();

  // Comandos de menú
  const saludos = ['hola', 'buenas', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'inicio', '/start'];
  if (saludos.includes(t.toLowerCase()) || t === '/start') {
    return mensajeBienvenida();
  }

  const menuCmds = ['menú', 'menu', 'ayuda', 'help', '/menu', '/ayuda', '/help'];
  if (menuCmds.includes(t.toLowerCase())) {
    return mensajeMenu();
  }

  // ── COMANDOS DE EVALUACIONES ──
  const tl = t.toLowerCase();

  // Detectar vigencia en el texto
  const vigMatch = tl.match(/\b(2023|2024|2025|2026)\b/);
  const vigencia = vigMatch ? parseInt(vigMatch[1]) : null;

  // Detectar trimestre
  function detectarTrimestre(s) {
    if (s.includes('i trim') || s.includes('primer trim') || s.includes('trimestre 1') || s.includes('1 trim') || s.includes('1er trim')) return 'I Trim';
    if (s.includes('ii trim') || s.includes('segundo trim') || s.includes('trimestre 2') || s.includes('2 trim')) return 'II Trim';
    if (s.includes('iii trim') || s.includes('tercer trim') || s.includes('trimestre 3') || s.includes('3 trim')) return 'III Trim';
    if (s.includes('iv trim') || s.includes('cuarto trim') || s.includes('trimestre 4') || s.includes('4 trim')) return 'IV Trim';
    return null;
  }

  // ── RANKING DESCUENTOS ──
  const esMas   = /m[aá]s descuento|mayor descuento|m[aá]s descontado|top descuento/.test(tl);
  const esMenos = /menos descuento|menor descuento|menos descontado/.test(tl);

  if (esMas || esMenos) {
    return { tipo: 'ranking_descuentos', orden: esMas ? 'mayor' : 'menor', vigencia, trimestre: detectarTrimestre(tl) };
  }

  // ── REPORTE EVALUACIONES (palabras clave amplias) ──
  const palabrasEval = ['evaluacion', 'evaluación', 'eval ', 'evaluado', 'pendiente evaluar', 'sin evaluar', 'al dia', 'al día', 'contrato', 'prestador'];
  const palabrasReporte = ['reporte', 'dame', 'muestra', 'ver', 'consultar', 'informe', 'resumen'];
  const tieneEval = palabrasEval.some(p => tl.includes(p));
  const tieneReporte = palabrasReporte.some(p => tl.includes(p));

  if (vigencia && (tieneEval || tieneReporte || tl.includes('descuento'))) {
    return { tipo: 'evaluacion', vigencia, excel: tl.includes('excel') || tl.includes('archivo') };
  }

  // ── COMPARATIVO TODAS LAS VIGENCIAS ──
  if ((tl.includes('comparar') || tl.includes('todas') || tl.includes('vigencias') || tl.includes('todos los años')) && tieneEval) {
    return { tipo: 'evaluacion_comparativo' };
  }

  // Opciones numéricas del menú
  if (MENU_ACCIONES[t]) {
    texto = MENU_ACCIONES[t];
  }

  // Agregar al historial
  historial.push({ role: 'user', content: texto });

  // Mantener historial en 20 mensajes máximo
  if (historial.length > 20) historial.splice(0, 2);

  try {
    const respuesta = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
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
