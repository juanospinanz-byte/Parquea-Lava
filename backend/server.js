const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const parqueaderoRoutes = require('./routes/parqueadero.routes');

const app = express();

// Middlewares
app.use(cors()); // Allow all origins
app.use(express.json()); // Parse JSON bodies

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/parqueadero', parqueaderoRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido a la API de Parquea-Lava' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
