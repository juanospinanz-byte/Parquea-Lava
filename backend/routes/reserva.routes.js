const express = require('express');
const router = express.Router();
const reservaController = require('../controllers/reserva.controller');
const authMiddleware = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');

const soloCliente = [authMiddleware, requireRole('cliente')];
const soloDueno = [authMiddleware, requireRole('dueno_parqueadero')];

// Cliente
router.post('/', soloCliente, reservaController.crearReserva);
router.get('/mia', soloCliente, reservaController.getMiReserva);

// Dueño de parqueadero
router.get('/parqueadero', soloDueno, reservaController.getReservasParqueadero);
router.get('/resumen', soloDueno, reservaController.getResumen);
router.put('/:id/completar', soloDueno, reservaController.completarReserva);

// Cliente (su historial) o dueño (el de su parqueadero)
router.get('/historial', authMiddleware, reservaController.getHistorial);

// Cliente (su reserva) o dueño (de su parqueadero)
router.put('/:id/cancelar', authMiddleware, reservaController.cancelarReserva);

module.exports = router;
