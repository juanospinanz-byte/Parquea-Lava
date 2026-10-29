const pool = require('../config/db');
const {
  RESERVA_MINUTOS,
  TIPOS_VEHICULO,
  cerrarReserva,
  liberarReservasVencidas,
} = require('../utils/reservas');

// "abc-123" -> "ABC123"
const normalizarPlaca = (placa) => String(placa || '').toUpperCase().replace(/[\s-]/g, '');

const SELECT_RESERVA = `
  SELECT r.id, r.parqueadero_id, r.tipo_vehiculo, r.placa, r.estado, r.fecha_creacion, r.expira_en,
         GREATEST(TIMESTAMPDIFF(SECOND, NOW(), r.expira_en), 0) AS segundos_restantes
`;

const obtenerReservaActivaCliente = async (clienteId) => {
  const [rows] = await pool.query(
    `${SELECT_RESERVA},
            p.nombre AS parqueadero_nombre, p.direccion, p.latitud, p.longitud
       FROM reservas r
       JOIN parqueaderos p ON p.id = r.parqueadero_id
      WHERE r.cliente_id = ? AND r.estado = 'activa'
      ORDER BY r.id DESC
      LIMIT 1`,
    [clienteId]
  );
  return rows[0] || null;
};

// Reserva con el dueño de su parqueadero, para revisar permisos
const obtenerReservaConDueno = async (reservaId) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.parqueadero_id, r.cliente_id, r.tipo_vehiculo, r.estado, p.usuario_id AS dueno_id
       FROM reservas r
       JOIN parqueaderos p ON p.id = r.parqueadero_id
      WHERE r.id = ?`,
    [reservaId]
  );
  return rows[0] || null;
};

// Cliente: aparta una celda del tipo de vehículo elegido
const crearReserva = async (req, res) => {
  if (req.user.rol !== 'cliente') {
    return res.status(403).json({ mensaje: 'Solo los clientes pueden reservar' });
  }

  const clienteId = req.user.userId;
  const parqueaderoId = Number(req.body.parqueadero_id);
  const tipo = req.body.tipo_vehiculo;
  const placa = normalizarPlaca(req.body.placa);

  if (!Number.isInteger(parqueaderoId)) {
    return res.status(400).json({ mensaje: 'Parqueadero inválido' });
  }
  if (!TIPOS_VEHICULO.includes(tipo)) {
    return res.status(400).json({ mensaje: 'Tipo de vehículo inválido' });
  }
  if (!/^[A-Z0-9]{4,7}$/.test(placa)) {
    return res.status(400).json({ mensaje: 'Escribe una placa válida (ej: ABC123)' });
  }

  let connection;
  try {
    await liberarReservasVencidas();

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Bloquea al cliente mientras reserva: evita dos reservas por toques dobles
    await connection.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [clienteId]);

    const [activas] = await connection.query(
      `SELECT id FROM reservas WHERE cliente_id = ? AND estado = 'activa'`,
      [clienteId]
    );
    if (activas.length > 0) {
      await connection.rollback();
      return res.status(409).json({ mensaje: 'Ya tienes una reserva activa. Cancélala para reservar otra.' });
    }

    // Solo se descuenta si todavía queda al menos una celda libre
    const [descuento] = await connection.query(
      `UPDATE parqueaderos SET ${tipo}_disponibles = ${tipo}_disponibles - 1
        WHERE id = ? AND ${tipo}_disponibles > 0`,
      [parqueaderoId]
    );
    if (descuento.affectedRows === 0) {
      await connection.rollback();
      const [existe] = await pool.query('SELECT id FROM parqueaderos WHERE id = ?', [parqueaderoId]);
      return existe.length === 0
        ? res.status(404).json({ mensaje: 'Parqueadero no encontrado' })
        : res.status(409).json({ mensaje: 'Ya no quedan celdas libres para ese vehículo' });
    }

    await connection.query(
      `INSERT INTO reservas (parqueadero_id, cliente_id, tipo_vehiculo, placa, expira_en)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [parqueaderoId, clienteId, tipo, placa, RESERVA_MINUTOS]
    );

    await connection.commit();
    res.status(201).json(await obtenerReservaActivaCliente(clienteId));
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Error al crear la reserva:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  } finally {
    if (connection) connection.release();
  }
};

// Cliente: su reserva activa (o null)
const getMiReserva = async (req, res) => {
  try {
    await liberarReservasVencidas();
    res.json(await obtenerReservaActivaCliente(req.user.userId));
  } catch (error) {
    console.error('Error al obtener la reserva:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Dueño: reservas activas de su parqueadero
const getReservasParqueadero = async (req, res) => {
  try {
    await liberarReservasVencidas();
    const [rows] = await pool.query(
      `${SELECT_RESERVA}, u.nombre AS cliente_nombre
         FROM reservas r
         JOIN parqueaderos p ON p.id = r.parqueadero_id
         JOIN usuarios u ON u.id = r.cliente_id
        WHERE p.usuario_id = ? AND r.estado = 'activa'
        ORDER BY r.expira_en ASC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al listar reservas:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Cliente (su reserva) o dueño (de su parqueadero): cancela y la celda vuelve a quedar libre
const cancelarReserva = async (req, res) => {
  try {
    const reserva = await obtenerReservaConDueno(req.params.id);
    const userId = req.user.userId;
    if (!reserva || (reserva.cliente_id !== userId && reserva.dueno_id !== userId)) {
      return res.status(404).json({ mensaje: 'Reserva no encontrada' });
    }
    if (!(await cerrarReserva(reserva, 'cancelada', true))) {
      return res.status(409).json({ mensaje: 'La reserva ya no está activa' });
    }
    res.json({ mensaje: 'Reserva cancelada' });
  } catch (error) {
    console.error('Error al cancelar la reserva:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Dueño: el vehículo llegó; la celda sigue ocupada, ahora por el vehículo
const completarReserva = async (req, res) => {
  try {
    const reserva = await obtenerReservaConDueno(req.params.id);
    if (!reserva || reserva.dueno_id !== req.user.userId) {
      return res.status(404).json({ mensaje: 'Reserva no encontrada' });
    }
    if (!(await cerrarReserva(reserva, 'completada', false))) {
      return res.status(409).json({ mensaje: 'La reserva ya no está activa' });
    }
    res.json({ mensaje: 'Llegada registrada' });
  } catch (error) {
    console.error('Error al completar la reserva:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

module.exports = {
  crearReserva,
  getMiReserva,
  getReservasParqueadero,
  cancelarReserva,
  completarReserva,
};
