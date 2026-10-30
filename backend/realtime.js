const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./config/db');

// Tiempo real: el servidor avisa a la app cuando algo cambia, en vez de que la app pregunte a cada rato.
// Eventos que recibe la app:
//   'parqueadero:actualizado' { id }  -> a todos: cambió la disponibilidad o los datos de un parqueadero
//   'reservas:actualizadas'           -> al dueño y al cliente de una reserva que cambió
let io = null;

const init = (server) => {
  io = new Server(server, { cors: { origin: '*' } });

  // Solo se conectan usuarios con sesión válida
  io.use((socket, next) => {
    try {
      const { userId } = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      socket.data.userId = userId;
      next();
    } catch (error) {
      next(new Error('Token no es válido'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`usuario:${socket.data.userId}`);
  });
};

const parqueaderoActualizado = (parqueaderoId) => {
  if (io) io.emit('parqueadero:actualizado', { id: Number(parqueaderoId) });
};

// Avisa al dueño del parqueadero y al cliente que su reserva cambió
const reservaActualizada = async ({ parqueadero_id, cliente_id }) => {
  parqueaderoActualizado(parqueadero_id);
  if (!io) return;
  try {
    const [rows] = await pool.query('SELECT usuario_id FROM parqueaderos WHERE id = ?', [parqueadero_id]);
    if (rows[0]) io.to(`usuario:${rows[0].usuario_id}`).emit('reservas:actualizadas');
    if (cliente_id) io.to(`usuario:${cliente_id}`).emit('reservas:actualizadas');
  } catch (error) {
    console.error('Error al avisar el cambio de reserva:', error);
  }
};

module.exports = { init, parqueaderoActualizado, reservaActualizada };
