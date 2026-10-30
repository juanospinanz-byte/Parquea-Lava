const pool = require('../config/db');
const {
  RESERVA_MINUTOS,
  TIPOS_VEHICULO,
  cerrarReserva,
  liberarReservasVencidas,
} = require('../utils/reservas');
const { ABIERTO_AHORA_SQL } = require('../utils/horario');
const { enviarPushAUsuario } = require('../utils/push');
const realtime = require('../realtime');

const VEHICULO_SINGULAR = { motos: 'Moto', carros: 'Carro', camiones: 'Camión' };

// "abc-123" -> "ABC123"
const normalizarPlaca = (placa) => String(placa || '').toUpperCase().replace(/[\s-]/g, '');

// "06:00:00" -> "06:00"
const horaCorta = (hora) => (hora ? String(hora).slice(0, 5) : '');

const SELECT_RESERVA = `
  SELECT r.id, r.parqueadero_id, r.tipo_vehiculo, r.placa, r.estado, r.fecha_creacion, r.expira_en,
         r.servicio_nombre, r.servicio_precio,
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
    `SELECT r.id, r.parqueadero_id, r.cliente_id, r.tipo_vehiculo, r.placa, r.estado,
            p.usuario_id AS dueno_id, p.nombre AS parqueadero_nombre
       FROM reservas r
       JOIN parqueaderos p ON p.id = r.parqueadero_id
      WHERE r.id = ?`,
    [reservaId]
  );
  return rows[0] || null;
};

// Explica por qué no se pudo descontar la celda
const motivoSinCelda = async (connection, parqueaderoId) => {
  const [rows] = await connection.query(
    `SELECT p.abierto, p.hora_apertura, ${ABIERTO_AHORA_SQL} AS abierto_ahora
       FROM parqueaderos p WHERE p.id = ?`,
    [parqueaderoId]
  );
  if (rows.length === 0) return { status: 404, mensaje: 'Parqueadero no encontrado' };
  if (!rows[0].abierto) return { status: 409, mensaje: 'El parqueadero está cerrado en este momento' };
  if (!rows[0].abierto_ahora) {
    return {
      status: 409,
      mensaje: `El parqueadero está fuera de su horario de atención (abre a las ${horaCorta(rows[0].hora_apertura)})`,
    };
  }
  return { status: 409, mensaje: 'Ya no quedan celdas libres para ese vehículo' };
};

// Cliente: aparta una celda del tipo de vehículo elegido, con lavado opcional
// (la ruta solo la permite a clientes)
const crearReserva = async (req, res) => {
  const clienteId = req.user.userId;
  const parqueaderoId = Number(req.body.parqueadero_id);
  const tipo = req.body.tipo_vehiculo;
  const placa = normalizarPlaca(req.body.placa);
  const servicioId = req.body.servicio_lavado_id == null ? null : Number(req.body.servicio_lavado_id);

  if (!Number.isInteger(parqueaderoId)) {
    return res.status(400).json({ mensaje: 'Parqueadero inválido' });
  }
  if (!TIPOS_VEHICULO.includes(tipo)) {
    return res.status(400).json({ mensaje: 'Tipo de vehículo inválido' });
  }
  if (!/^[A-Z0-9]{4,7}$/.test(placa)) {
    return res.status(400).json({ mensaje: 'Escribe una placa válida (ej: ABC123)' });
  }
  if (servicioId !== null && !Number.isInteger(servicioId)) {
    return res.status(400).json({ mensaje: 'Servicio de lavado inválido' });
  }

  let connection;
  let servicio = null;
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

    // El lavado debe ser de ese mismo parqueadero; se copian nombre y precio
    if (servicioId !== null) {
      const [servicios] = await connection.query(
        'SELECT id, nombre, precio FROM servicios_lavado WHERE id = ? AND parqueadero_id = ?',
        [servicioId, parqueaderoId]
      );
      if (servicios.length === 0) {
        await connection.rollback();
        return res.status(400).json({ mensaje: 'Ese servicio de lavado ya no está disponible' });
      }
      servicio = servicios[0];
    }

    // Solo se descuenta si está abierto, dentro del horario y queda al menos una celda libre
    const [descuento] = await connection.query(
      `UPDATE parqueaderos AS p SET p.${tipo}_disponibles = p.${tipo}_disponibles - 1
        WHERE p.id = ? AND ${ABIERTO_AHORA_SQL} AND p.${tipo}_disponibles > 0`,
      [parqueaderoId]
    );
    if (descuento.affectedRows === 0) {
      const motivo = await motivoSinCelda(connection, parqueaderoId);
      await connection.rollback();
      return res.status(motivo.status).json({ mensaje: motivo.mensaje });
    }

    await connection.query(
      `INSERT INTO reservas
         (parqueadero_id, cliente_id, tipo_vehiculo, placa, expira_en,
          servicio_lavado_id, servicio_nombre, servicio_precio)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?, ?)`,
      [
        parqueaderoId, clienteId, tipo, placa, RESERVA_MINUTOS,
        servicio?.id ?? null, servicio?.nombre ?? null, servicio?.precio ?? null,
      ]
    );

    await connection.commit();
    const reserva = await obtenerReservaActivaCliente(clienteId);
    res.status(201).json(reserva);

    // Avisos (después de responder, para que el cliente no espere)
    realtime.reservaActualizada({ parqueadero_id: parqueaderoId, cliente_id: clienteId });
    const [duenos] = await pool.query('SELECT usuario_id FROM parqueaderos WHERE id = ?', [parqueaderoId]);
    if (duenos[0]) {
      enviarPushAUsuario(
        duenos[0].usuario_id,
        'Nueva reserva',
        `${VEHICULO_SINGULAR[tipo]} · Placa ${placa}${servicio ? ` · ${servicio.nombre}` : ''}`,
        { tipo: 'reserva_nueva', reservaId: reserva?.id }
      );
    }
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Error al crear la reserva:', error);
    if (!res.headersSent) res.status(500).json({ mensaje: 'Error interno del servidor' });
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

    // Si la canceló el dueño ("no llegó"), se le avisa al cliente
    if (userId === reserva.dueno_id) {
      enviarPushAUsuario(
        reserva.cliente_id,
        'Reserva cancelada',
        `${reserva.parqueadero_nombre || 'El parqueadero'} liberó la celda que tenías reservada.`,
        { tipo: 'reserva_cancelada' }
      );
    }
  } catch (error) {
    console.error('Error al cancelar la reserva:', error);
    if (!res.headersSent) res.status(500).json({ mensaje: 'Error interno del servidor' });
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

    enviarPushAUsuario(
      reserva.cliente_id,
      `¡Bienvenido a ${reserva.parqueadero_nombre || 'tu parqueadero'}!`,
      'Tu llegada quedó registrada. Al salir, califica el parqueadero en "Mis reservas".',
      { tipo: 'reserva_completada' }
    );
  } catch (error) {
    console.error('Error al completar la reserva:', error);
    if (!res.headersSent) res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Días que se pueden consultar en el historial y el resumen (1 = solo hoy)
const DIAS_PERMITIDOS = [1, 7, 30];
const leerDias = (valor) => (DIAS_PERMITIDOS.includes(Number(valor)) ? Number(valor) : 7);

// Historial de reservas ya cerradas: el cliente ve las suyas y el dueño las de su parqueadero
const getHistorial = async (req, res) => {
  try {
    await liberarReservasVencidas();
    const esDueno = req.user.rol === 'dueno_parqueadero';
    const dias = leerDias(req.query.dias);

    const [rows] = await pool.query(
      `SELECT r.id, r.parqueadero_id, r.tipo_vehiculo, r.placa, r.estado, r.fecha_creacion, r.fecha_cierre,
              r.servicio_nombre, r.servicio_precio,
              p.nombre AS parqueadero_nombre,
              u.nombre AS cliente_nombre,
              c.estrellas AS calificacion
         FROM reservas r
         JOIN parqueaderos p ON p.id = r.parqueadero_id
         JOIN usuarios u ON u.id = r.cliente_id
         LEFT JOIN calificaciones c ON c.reserva_id = r.id
        WHERE r.estado <> 'activa'
          AND ${esDueno ? 'p.usuario_id = ?' : 'r.cliente_id = ?'}
          ${esDueno ? 'AND r.fecha_creacion >= DATE_SUB(CURDATE(), INTERVAL ? DAY)' : ''}
        ORDER BY r.fecha_creacion DESC, r.id DESC
        LIMIT 100`,
      esDueno ? [req.user.userId, dias - 1] : [req.user.userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener el historial:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Dueño: resumen de reservas e ingresos estimados del periodo
// Ingreso estimado = 1 hora de parqueo + el lavado, por cada reserva en la que el vehículo llegó
const getResumen = async (req, res) => {
  try {
    await liberarReservasVencidas();
    const dias = leerDias(req.query.dias);

    const [[totales]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(r.estado = 'completada'), 0) AS completadas,
              COALESCE(SUM(r.estado = 'cancelada'), 0) AS canceladas,
              COALESCE(SUM(r.estado = 'vencida'), 0) AS vencidas,
              COALESCE(SUM(r.estado = 'activa'), 0) AS activas,
              COALESCE(SUM(r.estado = 'completada' AND r.servicio_nombre IS NOT NULL), 0) AS lavados,
              COALESCE(SUM(CASE WHEN r.estado = 'completada' THEN COALESCE(r.servicio_precio, 0) END), 0)
                AS ingresos_lavado,
              COALESCE(SUM(CASE WHEN r.estado = 'completada' THEN
                CASE r.tipo_vehiculo WHEN 'motos' THEN p.motos_precio
                                     WHEN 'carros' THEN p.carros_precio
                                     ELSE p.camiones_precio END
              END), 0) AS ingresos_parqueo
         FROM reservas r
         JOIN parqueaderos p ON p.id = r.parqueadero_id
        WHERE p.usuario_id = ? AND r.fecha_creacion >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [req.user.userId, dias - 1]
    );

    const [[calificaciones]] = await pool.query(
      `SELECT ROUND(AVG(c.estrellas), 1) AS promedio, COUNT(*) AS total
         FROM calificaciones c
         JOIN parqueaderos p ON p.id = c.parqueadero_id
        WHERE p.usuario_id = ?`,
      [req.user.userId]
    );

    // MySQL devuelve las sumas como texto: se pasan a número
    const numero = (valor) => Number(valor) || 0;
    const resumen = Object.fromEntries(Object.entries(totales).map(([k, v]) => [k, numero(v)]));
    const cerradas = resumen.completadas + resumen.canceladas + resumen.vencidas;

    res.json({
      dias,
      ...resumen,
      ingresos_estimados: resumen.ingresos_parqueo + resumen.ingresos_lavado,
      tasa_llegada: cerradas > 0 ? Math.round((resumen.completadas / cerradas) * 100) : null,
      calificacion_promedio: calificaciones.promedio === null ? null : numero(calificaciones.promedio),
      calificaciones_total: numero(calificaciones.total),
    });
  } catch (error) {
    console.error('Error al obtener el resumen:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

module.exports = {
  crearReserva,
  getMiReserva,
  getReservasParqueadero,
  cancelarReserva,
  completarReserva,
  getHistorial,
  getResumen,
};
