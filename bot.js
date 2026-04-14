/**
 * bot.js — Chu, asistente personal de ventas
 *
 * Interface: Telegram Bot (sin QR, sin PC, 24/7)
 * IA: Groq (Llama 3.3 70B — gratis)
 * POS: VectorPOS (Puppeteer)
 * DB: Supabase
 * Email: Gmail (nodemailer)
 */

require('dotenv').config({ override: true });

// ── HTTP Server (health check + API para VANEGAS) ──────────────────────────
const http = require('http');
const PORT = parseInt(process.env.PORT) || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    bot: 'Bot Salud',
    uptime: Math.floor(process.uptime()),
    fecha: new Date().toISOString().slice(0, 10),
    timestamp: new Date().toISOString(),
  }));
}).listen(PORT, () => console.log(`HTTP activo en puerto ${PORT}`));

const TelegramBot = require('node-telegram-bot-api');
const agente = require('./agente');
const reportes = require('./reportes');
const db = require('./database');
const evaluaciones = require('./evaluaciones');
const dusakawi = require('./dusakawi');
const fs = require('fs');

// ──────────────────────────────────────────────
// VALIDACIONES
// ──────────────────────────────────────────────

const errores = [];
if (!process.env.ANTHROPIC_API_KEY)  errores.push('ANTHROPIC_API_KEY');
if (!process.env.SUPABASE_URL)       errores.push('SUPABASE_URL');
if (!process.env.SUPABASE_KEY)       errores.push('SUPABASE_KEY');
if (!process.env.TELEGRAM_TOKEN)     errores.push('TELEGRAM_TOKEN');
if (!process.env.TELEGRAM_ADMIN_ID)  errores.push('TELEGRAM_ADMIN_ID');

if (errores.length > 0) {
  console.error('❌ Faltan variables en .env:');
  errores.forEach(e => console.error(`   - ${e}`));
  process.exit(1);
}

const ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

// ──────────────────────────────────────────────
// CLIENTE TELEGRAM
// ──────────────────────────────────────────────

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Teclado persistente siempre visible
const TECLADO = {
  reply_markup: {
    keyboard: [
      [{ text: '📋 Menú' }],
    ],
    resize_keyboard: true,
    persistent: true,
  },
};

// ──────────────────────────────────────────────
// INICIO
// ──────────────────────────────────────────────

async function iniciar() {
  console.log('\n🤖 Iniciando Bot Salud...');
  console.log('───────────────────────────────────');
  console.log('📱 Interface: Telegram');
  console.log('🧠 IA: Claude (Anthropic)');
  console.log('🗄️  DB: Supabase');
  console.log('📋 Conocimiento: Resolución 3280 + 3374');
  console.log(`👤 Admin ID: ${ADMIN_ID}`);
  console.log('───────────────────────────────────\n');

  // Iniciar reportes automáticos
  reportes.iniciar(bot);

  // Mensaje de bienvenida con teclado persistente
  try {
    await bot.sendMessage(ADMIN_ID, agente.mensajeBienvenida(), {
      parse_mode: 'Markdown',
      ...TECLADO,
    });
  } catch(e) {
    console.log('ℹ️  No se pudo enviar mensaje de bienvenida (normal en primer inicio)');
  }

  console.log('✅ ¡Bot Salud ACTIVO en Telegram!');
}

// ──────────────────────────────────────────────
// MANEJO DE MENSAJES
// ──────────────────────────────────────────────

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const esAdmin = chatId === ADMIN_ID;

  // Verificar acceso
  if (!esAdmin) {
    const autorizado = await db.esUsuarioAutorizado(chatId);
    if (!autorizado) {
      if (msg.text === '/start' || msg.text === '/id') {
        await bot.sendMessage(chatId,
          `👋 Hola! Soy *Chu*, el asistente de la perfumería.\n\nPara acceder, comparte este ID con el administrador:\n\`${chatId}\``,
          { parse_mode: 'Markdown' }
        );
      } else {
        await bot.sendMessage(chatId,
          `⛔ No tienes acceso a Chu.\nComparte tu ID con el administrador: \`${chatId}\``,
          { parse_mode: 'Markdown' }
        );
      }
      return;
    }
  }

  const texto = msg.text?.trim();
  if (!texto) return;

  const nombre = msg.from?.first_name || chatId;
  console.log(`📩 [${new Date().toLocaleTimeString('es-CO')}] ${nombre}: ${texto.substring(0, 80)}`);

  await bot.sendChatAction(chatId, 'typing');

  try {
    const respuesta = await agente.procesarMensaje(texto, esAdmin);

    // ── RANKING DESCUENTOS ──
    if (respuesta && typeof respuesta === 'object' && respuesta.tipo === 'ranking_descuentos') {
      await bot.sendChatAction(chatId, 'typing');
      const reporte = await evaluaciones.rankingDescuentos({
        vigencia: respuesta.vigencia,
        orden: respuesta.orden,
        trimestre: respuesta.trimestre,
      });
      await enviarMensaje(chatId, reporte);
      return;
    }

    // ── EVALUACIONES ──
    if (respuesta && typeof respuesta === 'object' && respuesta.tipo === 'evaluacion') {
      await bot.sendChatAction(chatId, 'typing');
      try {
        const reporte = await evaluaciones.generarReporte(respuesta.vigencia);
        await enviarMensaje(chatId, reporte);
      } catch(e) {
        console.error('❌ Error generarReporte:', e.message);
        await bot.sendMessage(chatId, `❌ Error al generar reporte: ${e.message}`);
        return;
      }
      // Excel por separado
      try {
        const excelPath = await evaluaciones.generarExcel(respuesta.vigencia);
        await bot.sendDocument(chatId, excelPath, {}, {
          filename: `Evaluaciones_${respuesta.vigencia}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        try { fs.unlinkSync(excelPath); } catch(e) {}
      } catch(e) {
        console.error('❌ Error Excel:', e.message);
        await bot.sendMessage(chatId, `⚠️ Reporte enviado, pero hubo un error al generar el Excel: ${e.message}`);
      }
      return;
    }

    // ── PENDIENTES UNA VIGENCIA ──
    if (respuesta && typeof respuesta === 'object' && respuesta.tipo === 'pendientes') {
      await bot.sendChatAction(chatId, 'typing');
      const reporte = await evaluaciones.reportePendientes(respuesta.vigencia);
      await enviarMensaje(chatId, reporte);
      return;
    }

    // ── PENDIENTES TODAS LAS VIGENCIAS ──
    if (respuesta && typeof respuesta === 'object' && respuesta.tipo === 'pendientes_todas') {
      await bot.sendChatAction(chatId, 'typing');
      const reporte = await evaluaciones.reportePendientesTodas();
      await enviarMensaje(chatId, reporte);
      return;
    }

    // ── CONSULTA PRESTADOR ──
    if (respuesta && typeof respuesta === 'object' && respuesta.tipo === 'consulta_prestador') {
      await bot.sendChatAction(chatId, 'typing');
      try {
        const resultado = await evaluaciones.consultarPrestador(
          respuesta.vigencia, respuesta.busqueda, respuesta.trimestre, respuesta.regimen
        );
        await enviarMensaje(chatId, resultado.texto);
        if (resultado.encontrados.length > 0) {
          const excelPath = await evaluaciones.generarExcelPrestador(respuesta.vigencia, respuesta.busqueda);
          if (excelPath) {
            await bot.sendDocument(chatId, excelPath, {}, {
              filename: `Consulta_${respuesta.busqueda}_${respuesta.vigencia}.xlsx`,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            try { fs.unlinkSync(excelPath); } catch(e) {}
          }
        }
      } catch(e) {
        console.error('❌ Error consulta prestador:', e.message);
        await bot.sendMessage(chatId, `❌ Error al consultar: ${e.message}`);
      }
      return;
    }

    // ── DUSAKAWI RADICACIÓN INDIVIDUAL ──
    if (respuesta && typeof respuesta === 'object' && respuesta.tipo === 'dusakawi') {
      await bot.sendChatAction(chatId, 'typing');
      await bot.sendMessage(chatId, `🌐 Consultando sistema Dusakawi EPSI...\n_Esto puede tardar unos 30 segundos._`, { parse_mode: 'Markdown' });
      try {
        const resultado = await dusakawi.consultarEstadoRadicacion({
          prestador: respuesta.busqueda,
          contrato: /^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/i.test(respuesta.busqueda) ? respuesta.busqueda : '',
          vigencia: respuesta.vigencia || 2025,
          regimen: respuesta.regimen,
        });
        await enviarMensaje(chatId, resultado.texto);
      } catch(e) {
        console.error('❌ Error Dusakawi:', e.message);
        await bot.sendMessage(chatId, `❌ Error al consultar Dusakawi: ${e.message}`);
      }
      return;
    }

    // ── DUSAKAWI RADICACIÓN MASIVA ──
    if (respuesta && typeof respuesta === 'object' && respuesta.tipo === 'dusakawi_masivo') {
      await bot.sendChatAction(chatId, 'typing');
      const trimStr = respuesta.trimestre ? ` — ${respuesta.trimestre}` : '';
      await bot.sendMessage(chatId,
        `🌐 Consultando radicación en Dusakawi EPSI${trimStr}...\n_Esto puede tardar 2-5 minutos (se consultan todos los contratos)._`,
        { parse_mode: 'Markdown' }
      );
      try {
        const reporte = await dusakawi.reporteMasivoRadicacion({
          vigencia: respuesta.vigencia || 2025,
          trimestre: respuesta.trimestre,
          regimen: respuesta.regimen,
        });
        await enviarMensaje(chatId, reporte);
      } catch(e) {
        console.error('❌ Error Dusakawi masivo:', e.message);
        await bot.sendMessage(chatId, `❌ Error al generar reporte de radicación: ${e.message}`);
      }
      return;
    }

    if (respuesta && typeof respuesta === 'object' && respuesta.tipo === 'evaluacion_comparativo') {
      await bot.sendChatAction(chatId, 'typing');
      const reporte = await evaluaciones.reporteComparativo([2023, 2024, 2025]);
      await enviarMensaje(chatId, reporte);
      return;
    }

    // ── OTROS TIPOS ──
    if (respuesta && typeof respuesta === 'object' && respuesta.tipo === 'archivo') {
      await bot.sendDocument(chatId, respuesta.path, {}, {
        filename: respuesta.nombre,
        contentType: 'text/csv',
      });
      await enviarMensaje(chatId, respuesta.caption || '📎 Archivo enviado.');
      try { fs.unlinkSync(respuesta.path); } catch(e) {}
    } else if (respuesta && typeof respuesta === 'object' && respuesta.tipo === 'mensajes') {
      for (const parte of respuesta.partes) {
        await enviarMensaje(chatId, parte);
      }
    } else {
      await enviarMensaje(chatId, respuesta);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    await bot.sendMessage(chatId, '😅 Tuve un problema. Intenta de nuevo en un momento.');
  }
});

// ──────────────────────────────────────────────
// BOTONES INLINE (checklist contenido)
// ──────────────────────────────────────────────

bot.on('callback_query', async (callbackQuery) => {
  try {
    const manejado = await reportes.manejarCallbackContenido(bot, callbackQuery);
    if (!manejado) await bot.answerCallbackQuery(callbackQuery.id);
  } catch(e) {
    console.error('❌ Error callback_query:', e.message);
    await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
  }
});

bot.on('polling_error', (err) => {
  console.error('❌ Error Telegram polling:', err.message);
});

// ──────────────────────────────────────────────
// ENVIAR MENSAJE (con fallback si falla Markdown)
// ──────────────────────────────────────────────

async function enviarMensaje(chatId, texto) {
  const MAX = 4000;
  const partes = [];
  while (texto.length > 0) {
    if (texto.length <= MAX) { partes.push(texto); break; }
    let corte = texto.lastIndexOf('\n', MAX);
    if (corte < MAX * 0.5) corte = MAX;
    partes.push(texto.substring(0, corte));
    texto = texto.substring(corte).trimStart();
  }
  for (let i = 0; i < partes.length; i++) {
    const opts = i === partes.length - 1
      ? { parse_mode: 'Markdown', ...TECLADO }
      : { parse_mode: 'Markdown' };
    try {
      await bot.sendMessage(chatId, partes[i], opts);
    } catch(e) {
      try {
        await bot.sendMessage(chatId, partes[i], i === partes.length - 1 ? TECLADO : {});
      } catch(e2) {
        console.error('Error enviando mensaje:', e2.message);
      }
    }
  }
}

// Exportar para que reportes.js pueda enviar mensajes
module.exports = { bot, enviarMensaje, ADMIN_ID };

// ──────────────────────────────────────────────
// ARRANCAR
// ──────────────────────────────────────────────

iniciar();

process.on('SIGINT', () => {
  console.log('\n👋 Cerrando Chu...');
  bot.stopPolling();
  process.exit(0);
});
