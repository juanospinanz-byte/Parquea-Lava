const express = require('express');
const router = express.Router();
const parqueaderoController = require('../controllers/parqueadero.controller');
const authMiddleware = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');

const soloDueno = [authMiddleware, requireRole('dueno_parqueadero')];

// Rutas protegidas (solo dueño de parqueadero)
router.get('/me', soloDueno, parqueaderoController.getMiParqueadero);
router.put('/me', soloDueno, parqueaderoController.updateMiParqueadero);
router.put('/me/foto', soloDueno, parqueaderoController.subirFoto);
router.delete('/me/foto', soloDueno, parqueaderoController.eliminarFoto);

// US04: Rutas para que los clientes vean parqueaderos y su ubicación
router.get('/todos', authMiddleware, parqueaderoController.getAllParqueaderos);
router.get('/:id/calificaciones', authMiddleware, parqueaderoController.getCalificacionesParqueadero);
router.get('/:id', authMiddleware, parqueaderoController.getParqueaderoById);

module.exports = router;
