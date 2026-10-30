const express = require('express');
const router = express.Router();
const lavadoController = require('../controllers/lavado.controller');
const authMiddleware = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');

const soloDueno = [authMiddleware, requireRole('dueno_parqueadero')];

// Servicios de lavado del parqueadero del dueño (los clientes los ven en GET /api/parqueadero/:id)
router.get('/', soloDueno, lavadoController.getMisServicios);
router.post('/', soloDueno, lavadoController.crearServicio);
router.put('/:id', soloDueno, lavadoController.actualizarServicio);
router.delete('/:id', soloDueno, lavadoController.eliminarServicio);

module.exports = router;
