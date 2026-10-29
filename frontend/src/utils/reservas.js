// Minutos que el servidor guarda una celda reservada (debe coincidir con RESERVA_MINUTOS del backend)
export const RESERVA_MINUTOS = 30;

export const VEHICLE_SINGULAR = {
  motos: 'Moto',
  carros: 'Carro',
  camiones: 'Camión',
};

// El servidor manda los segundos que faltan; se convierte a una hora del reloj del celular
// para que la cuenta regresiva no dependa de la zona horaria del servidor
export const withLocalExpiry = (reserva) =>
  reserva ? { ...reserva, expiraLocal: Date.now() + (reserva.segundos_restantes || 0) * 1000 } : null;

// 1234000 ms -> "20:34"
export const formatCountdown = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

// Hora local en formato HH:MM
export const formatClock = (ms) => {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const getErrorMessage = (error, fallback) => error.response?.data?.mensaje || fallback;
