const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const parqueaderoRoutes = require('./routes/parqueadero.routes');
const reservaRoutes = require('./routes/reserva.routes');
const lavadoRoutes = require('./routes/lavado.routes');
const calificacionRoutes = require('./routes/calificacion.routes');

// La app de Express va separada del servidor (server.js) para poder probarla con los tests
const app = express();

// Middlewares
app.use(cors()); // Allow all origins
// La foto del parqueadero llega en base64: solo esa ruta acepta cuerpos grandes
app.use('/api/parqueadero/me/foto', express.json({ limit: '8mb' }));
app.use(express.json()); // Parse JSON bodies

// Fotos subidas por los dueños
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/parqueadero', parqueaderoRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/lavado', lavadoRoutes);
app.use('/api/calificaciones', calificacionRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido a la API de Parquea-Lava' });
});

module.exports = app;
