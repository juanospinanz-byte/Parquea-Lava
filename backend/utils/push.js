const pool = require('../config/db');

// Notificaciones push con el servicio gratuito de Expo (no necesita llaves en el backend).
// Solo llegan si el celular registró su token (ver frontend/src/utils/notifications.js).
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const enviarPushAUsuario = async (usuarioId, titulo, mensaje, data = {}) => {
  try {
    const [rows] = await pool.query('SELECT push_token FROM usuarios WHERE id = ?', [usuarioId]);
    const token = rows[0]?.push_token;
    if (!token) return;

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title: titulo, body: mensaje, data, sound: 'default' }),
    });
  } catch (error) {
    // Una notificación que no llega no debe romper la reserva
    console.error('Error al enviar la notificación push:', error.message);
  }
};

module.exports = { enviarPushAUsuario };
