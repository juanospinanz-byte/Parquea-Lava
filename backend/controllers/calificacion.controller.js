const pool = require('../config/db');
const realtime = require('../realtime');

// Cliente: califica el parqueadero de una reserva suya en la que sí llegó (completada), una sola vez
const crearCalificacion = async (req, res) => {
  try {
    const reservaId = Number(req.body.reserva_id);
    const estrellas = Number(req.body.estrellas);
    const comentario = String(req.body.comentario || '').trim() || null;

    if (!Number.isInteger(reservaId)) {
      return res.status(400).json({ mensaje: 'Reserva inválida' });
    }
    if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
      return res.status(400).json({ mensaje: 'Elige de 1 a 5 estrellas' });
    }
    if (comentario && comentario.length > 300) {
      return res.status(400).json({ mensaje: 'El comentario no puede tener más de 300 caracteres' });
    }

    const [reservas] = await pool.query(
      'SELECT id, parqueadero_id, estado FROM reservas WHERE id = ? AND cliente_id = ?',
      [reservaId, req.user.userId]
    );
    const reserva = reservas[0];
    if (!reserva) {
      return res.status(404).json({ mensaje: 'Reserva no encontrada' });
    }
    if (reserva.estado !== 'completada') {
      return res.status(400).json({ mensaje: 'Solo puedes calificar cuando el parqueadero registró tu llegada' });
    }

    try {
      await pool.query(
        'INSERT INTO calificaciones (parqueadero_id, cliente_id, reserva_id, estrellas, comentario) VALUES (?, ?, ?, ?, ?)',
        [reserva.parqueadero_id, req.user.userId, reserva.id, estrellas, comentario]
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ mensaje: 'Ya calificaste esta reserva' });
      }
      throw error;
    }

    realtime.parqueaderoActualizado(reserva.parqueadero_id);
    res.status(201).json({ mensaje: '¡Gracias por tu calificación!' });
  } catch (error) {
    console.error('Error al guardar la calificación:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

module.exports = { crearCalificacion };
