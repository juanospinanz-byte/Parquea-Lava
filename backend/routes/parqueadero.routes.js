const express = require('express');
const router = express.Router();
const parqueaderoController = require('../controllers/parqueadero.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas protegidas (dueño de parqueadero)
router.get('/me', authMiddleware, parqueaderoController.getMiParqueadero);
router.put('/me', authMiddleware, parqueaderoController.updateMiParqueadero);

// US04: Rutas públicas para que los clientes vean parqueaderos y su ubicación
router.get('/todos', authMiddleware, parqueaderoController.getAllParqueaderos);
router.get('/:id', authMiddleware, parqueaderoController.getParqueaderoById);

module.exports = router;
