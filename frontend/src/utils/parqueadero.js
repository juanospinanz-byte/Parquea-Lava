import { API_URL } from '../config';

export const formatPrice = (value) => `$${parseFloat(value || 0).toLocaleString()}`;

// URL de la foto de la entrada (o null si no tiene)
export const fotoUrl = (parqueadero) =>
  parqueadero?.foto ? `${API_URL}/uploads/parqueaderos/${parqueadero.foto}` : null;

// "06:00:00" -> "06:00"
export const horaCorta = (hora) => (hora ? String(hora).slice(0, 5) : '');

export const tieneHorario = (p) => !!(p?.hora_apertura && p?.hora_cierre);

export const formatHorario = (p) =>
  tieneHorario(p) ? `${horaCorta(p.hora_apertura)} – ${horaCorta(p.hora_cierre)}` : 'Abierto 24 horas';

// El servidor calcula si está abierto ahora (abierto por el dueño y dentro del horario)
export const estaAbiertoAhora = (p) =>
  p?.abierto_ahora === undefined || p?.abierto_ahora === null ? !!Number(p?.abierto ?? 1) : !!Number(p.abierto_ahora);

export const motivoCerrado = (p) =>
  !Number(p?.abierto ?? 1)
    ? 'Cerrado por el parqueadero en este momento'
    : `Fuera del horario de atención · abre a las ${horaCorta(p.hora_apertura)}`;

// "4.5 (12)" o null si nadie lo ha calificado
export const formatRating = (p) =>
  Number(p?.calificaciones_total) > 0
    ? `${Number(p.calificacion_promedio).toFixed(1)} (${p.calificaciones_total})`
    : null;

export const tieneLavado = (p) => Number(p?.servicios_lavado_total) > 0;
