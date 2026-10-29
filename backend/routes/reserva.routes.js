const express = require('express');
const router = express.Router();
const reservaController = require('../controllers/reserva.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Cliente
router.post('/', authMiddleware, reservaController.crearReserva);
router.get('/mia', authMiddleware, reservaController.getMiReserva);

// Dueño de parqueadero
router.get('/parqueadero', authMiddleware, reservaController.getReservasParqueadero);
router.put('/:id/completar', authMiddleware, reservaController.completarReserva);

// Cliente o dueño
router.put('/:id/cancelar', authMiddleware, reservaController.cancelarReserva);

module.exports = router;
