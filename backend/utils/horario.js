// Abierto ahora = el dueño lo tiene abierto Y la hora actual está dentro del horario.
// Sin horario (NULL) = abierto las 24 horas. Si cierra después de medianoche (ej: 18:00 a 02:00)
// también funciona. Usa el alias "p" para la tabla parqueaderos.
const ABIERTO_AHORA_SQL = `(
  p.abierto = 1 AND (
    p.hora_apertura IS NULL OR p.hora_cierre IS NULL
    OR (p.hora_apertura < p.hora_cierre AND CURTIME() >= p.hora_apertura AND CURTIME() < p.hora_cierre)
    OR (p.hora_apertura > p.hora_cierre AND (CURTIME() >= p.hora_apertura OR CURTIME() < p.hora_cierre))
  )
)`;

// "6:30" o "06:30" -> "06:30:00"; null si no es una hora válida
const normalizarHora = (valor) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(valor || '').trim());
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas > 23 || minutos > 59) return null;
  return `${String(horas).padStart(2, '0')}:${match[2]}:00`;
};

module.exports = { ABIERTO_AHORA_SQL, normalizarHora };
