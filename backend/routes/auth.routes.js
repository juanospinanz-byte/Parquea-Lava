const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const loginLimiter = require('../middleware/loginLimiter');

// Ruta para registrar usuario
router.post('/register', authController.register);

// Ruta para iniciar sesión (con bloqueo temporal tras varios intentos fallidos)
router.post('/login', loginLimiter, authController.login);

// Recuperar contraseña: 1) pedir el código por correo, 2) cambiarla con el código
router.post('/recuperar', authController.solicitarRecuperacion);
router.post('/restablecer', authController.restablecerContrasena);

// Ruta para cambiar la ciudad del usuario
router.put('/ciudad', authMiddleware, authController.updateCiudad);

// Ruta para cambiar la contraseña del usuario
router.put('/contrasena', authMiddleware, authController.updateContrasena);

// Ruta para cambiar el nombre del usuario
router.put('/perfil', authMiddleware, authController.updatePerfil);

// Token de notificaciones push del celular
router.put('/push-token', authMiddleware, authController.updatePushToken);

module.exports = router;
