const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Ruta para registrar usuario
router.post('/register', authController.register);

// Ruta para iniciar sesión
router.post('/login', authController.login);

// Ruta para cambiar la ciudad del usuario
router.put('/ciudad', authMiddleware, authController.updateCiudad);

module.exports = router;
