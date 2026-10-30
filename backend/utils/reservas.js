const pool = require('../config/db');
const realtime = require('../realtime');

// Minutos que se guarda una celda reservada antes de liberarse sola
const RESERVA_MINUTOS = 30;
const TIPOS_VEHICULO = ['motos', 'carros', 'camiones'];

// Devuelve una celda al parqueadero sin pasar de la capacidad máxima
const devolverCelda = async (parqueaderoId, tipo) => {
  if (!TIPOS_VEHICULO.includes(tipo)) return;
  await pool.query(
    `UPDATE parqueaderos
       SET ${tipo}_disponibles = LEAST(${tipo}_disponibles + 1, ${tipo}_max)
     WHERE id = ?`,
    [parqueaderoId]
  );
};

// Cierra una reserva activa con el estado dado. Devuelve true solo si este llamado fue el que la cerró,
// así la celda no se devuelve dos veces aunque dos peticiones lleguen al mismo tiempo.
// "reserva" necesita id, parqueadero_id, cliente_id y tipo_vehiculo.
const cerrarReserva = async (reserva, estado, liberarCelda) => {
  const [result] = await pool.query(
    `UPDATE reservas SET estado = ?, fecha_cierre = NOW() WHERE id = ? AND estado = 'activa'`,
    [estado, reserva.id]
  );
  if (result.affectedRows === 0) return false;
  if (liberarCelda) await devolverCelda(reserva.parqueadero_id, reserva.tipo_vehiculo);
  // Avisa en tiempo real al dueño, al cliente y a quienes miran ese parqueadero
  realtime.reservaActualizada(reserva);
  return true;
};

// Las reservas que pasaron su tiempo quedan vencidas y su celda vuelve a estar libre
const liberarReservasVencidas = async () => {
  const [vencidas] = await pool.query(
    `SELECT id, parqueadero_id, cliente_id, tipo_vehiculo
       FROM reservas WHERE estado = 'activa' AND expira_en <= NOW()`
  );
  for (const reserva of vencidas) {
    await cerrarReserva(reserva, 'vencida', true);
  }
};

module.exports = {
  RESERVA_MINUTOS,
  TIPOS_VEHICULO,
  cerrarReserva,
  liberarReservasVencidas,
};
