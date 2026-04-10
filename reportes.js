/**
 * reportes.js — Bot Salud
 * Módulo de reportes (simplificado para bot de salud)
 */

let telegramBot = null;
let adminId = null;

function iniciar(bot) {
  telegramBot = bot;
  adminId = process.env.TELEGRAM_ADMIN_ID;
  console.log('✅ Módulo de reportes iniciado');
}

async function manejarCallbackContenido(bot, callbackQuery) {
  // No hay callbacks de contenido en bot-salud
  return false;
}

module.exports = { iniciar, manejarCallbackContenido };
