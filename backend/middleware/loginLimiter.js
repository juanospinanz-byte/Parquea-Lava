// Bloqueo temporal después de varios intentos fallidos de inicio de sesión.
// Se cuenta por dispositivo (IP) + correo. Se guarda en memoria: se reinicia al reiniciar el servidor.
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

const intentos = new Map(); // clave -> { fallos, bloqueadoHasta, ultimoIntento }

const claveDe = (req) => `${req.ip}|${String(req.body?.correo || '').trim().toLowerCase()}`;

const loginLimiter = (req, res, next) => {
  const clave = claveDe(req);
  const registro = intentos.get(clave);

  if (registro && registro.bloqueadoHasta > Date.now()) {
    const minutos = Math.ceil((registro.bloqueadoHasta - Date.now()) / 60000);
    return res.status(429).json({
      mensaje: `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto(s).`,
    });
  }

  // El resultado del login se conoce cuando termina la respuesta
  res.on('finish', () => {
    if (res.statusCode === 200) {
      intentos.delete(clave);
      return;
    }
    if (res.statusCode !== 401) return;

    const actual = intentos.get(clave);
    // Un bloqueo que ya terminó empieza a contar de cero
    const fallos = actual && actual.bloqueadoHasta <= Date.now() && actual.bloqueadoHasta > 0
      ? 1
      : (actual?.fallos || 0) + 1;

    intentos.set(clave, {
      fallos,
      bloqueadoHasta: fallos >= MAX_INTENTOS ? Date.now() + BLOQUEO_MS : 0,
      ultimoIntento: Date.now(),
    });
  });

  next();
};

// Limpia de vez en cuando los registros viejos para que no crezcan sin fin
setInterval(() => {
  const limite = Date.now() - BLOQUEO_MS;
  for (const [clave, registro] of intentos) {
    if (registro.ultimoIntento < limite && registro.bloqueadoHasta < Date.now()) {
      intentos.delete(clave);
    }
  }
}, BLOQUEO_MS).unref();

module.exports = loginLimiter;
