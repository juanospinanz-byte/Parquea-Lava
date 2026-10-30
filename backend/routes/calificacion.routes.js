const express = require('express');
const router = express.Router();
const calificacionController = require('../controllers/calificacion.controller');
const authMiddleware = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');

// Cliente: calificar un parqueadero (las calificaciones se ven en GET /api/parqueadero/:id/calificaciones)
router.post('/', authMiddleware, requireRole('cliente'), calificacionController.crearCalificacion);

module.exports = router;
