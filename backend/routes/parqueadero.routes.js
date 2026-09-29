const express = require('express');
const router = express.Router();
const parqueaderoController = require('../controllers/parqueadero.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/me', authMiddleware, parqueaderoController.getMiParqueadero);
router.put('/me', authMiddleware, parqueaderoController.updateMiParqueadero);

module.exports = router;
