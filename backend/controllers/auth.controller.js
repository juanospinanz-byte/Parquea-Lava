const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
// Se usa como objeto (correoUtils.enviar...) para que los tests puedan reemplazar el envío
const correoUtils = require('../utils/correo');

// Cuánto dura la sesión antes de pedir iniciar sesión de nuevo
const SESSION_DURATION = '30d';

// Límites de la contraseña (bcrypt solo usa los primeros 72 caracteres)
const CONTRASENA_MIN = 6;
const CONTRASENA_MAX = 72;
const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Devuelve el mensaje de error de la contraseña o null si es válida
const validarContrasena = (contrasena) => {
  if (typeof contrasena !== 'string' || contrasena.length < CONTRASENA_MIN) {
    return `La contraseña debe tener al menos ${CONTRASENA_MIN} caracteres`;
  }
  if (contrasena.length > CONTRASENA_MAX) {
    return `La contraseña no puede tener más de ${CONTRASENA_MAX} caracteres`;
  }
  return null;
};

const register = async (req, res) => {
  try {
    const { contrasena, rol } = req.body;
    const nombre = String(req.body.nombre || '').trim();
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const ciudad = req.body.ciudad?.trim() || null;

    // Validación de campos
    if (!nombre || !correo || !contrasena || !rol) {
      return res.status(400).json({ mensaje: 'Todos los campos son obligatorios' });
    }

    if (nombre.length > 100) {
      return res.status(400).json({ mensaje: 'El nombre no puede tener más de 100 caracteres' });
    }

    if (correo.length > 150 || !CORREO_REGEX.test(correo)) {
      return res.status(400).json({ mensaje: 'Escribe un correo válido (ej: nombre@correo.com)' });
    }

    const errorContrasena = validarContrasena(contrasena);
    if (errorContrasena) {
      return res.status(400).json({ mensaje: errorContrasena });
    }

    if (rol !== 'dueno_parqueadero' && rol !== 'cliente') {
      return res.status(400).json({ mensaje: 'Rol inválido' });
    }

    if (rol === 'cliente' && !ciudad) {
      return res.status(400).json({ mensaje: 'La ciudad es obligatoria' });
    }

    // Verificar si el usuario ya existe
    const [existingUsers] = await pool.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ mensaje: 'El correo ya está registrado' });
    }

    // Hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(contrasena, salt);

    // Insertar el usuario
    const [result] = await pool.query(
      'INSERT INTO usuarios (nombre, correo, contrasena, rol, ciudad) VALUES (?, ?, ?, ?, ?)',
      [nombre, correo, hashedPassword, rol, ciudad]
    );

    const userId = result.insertId;

    // Generar JWT
    const token = jwt.sign(
      { userId, rol },
      process.env.JWT_SECRET,
      { expiresIn: SESSION_DURATION }
    );

    res.status(201).json({
      mensaje: 'Usuario registrado exitosamente',
      token,
      usuario: {
        id: userId,
        nombre,
        correo,
        rol,
        ciudad
      }
    });

  } catch (error) {
    console.error('Error en el registro:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

const login = async (req, res) => {
  try {
    const { contrasena } = req.body;
    const correo = String(req.body.correo || '').trim();

    // Validación de campos
    if (!correo || !contrasena) {
      return res.status(400).json({ mensaje: 'Correo y contraseña son obligatorios' });
    }

    // Buscar al usuario
    const [users] = await pool.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
    if (users.length === 0) {
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    const user = users[0];

    // Comparar la contraseña
    const isMatch = await bcrypt.compare(contrasena, user.contrasena);
    if (!isMatch) {
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    // Generar JWT
    const token = jwt.sign(
      { userId: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: SESSION_DURATION }
    );

    res.json({
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        correo: user.correo,
        rol: user.rol,
        ciudad: user.ciudad || null
      }
    });

  } catch (error) {
    console.error('Error en el login:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Cambiar la ciudad del usuario autenticado
const updateCiudad = async (req, res) => {
  try {
    const ciudad = req.body.ciudad?.trim();
    if (!ciudad) {
      return res.status(400).json({ mensaje: 'La ciudad es obligatoria' });
    }

    await pool.query('UPDATE usuarios SET ciudad = ? WHERE id = ?', [ciudad, req.user.userId]);
    res.json({ mensaje: 'Ciudad actualizada', ciudad });

  } catch (error) {
    console.error('Error al actualizar la ciudad:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Cambiar la contraseña del usuario autenticado (pide la actual para confirmar que es él)
const updateContrasena = async (req, res) => {
  try {
    const { actual, nueva } = req.body;

    if (!actual || !nueva) {
      return res.status(400).json({ mensaje: 'Escribe tu contraseña actual y la nueva' });
    }

    const errorContrasena = validarContrasena(nueva);
    if (errorContrasena) {
      return res.status(400).json({ mensaje: errorContrasena });
    }

    const [users] = await pool.query('SELECT contrasena FROM usuarios WHERE id = ?', [req.user.userId]);
    if (users.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    // 400 y no 401: una contraseña actual equivocada no debe cerrar la sesión en la app
    const isMatch = await bcrypt.compare(actual, users[0].contrasena);
    if (!isMatch) {
      return res.status(400).json({ mensaje: 'La contraseña actual no es correcta' });
    }

    if (actual === nueva) {
      return res.status(400).json({ mensaje: 'La nueva contraseña debe ser diferente a la actual' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(nueva, salt);
    await pool.query('UPDATE usuarios SET contrasena = ? WHERE id = ?', [hashedPassword, req.user.userId]);

    res.json({ mensaje: 'Contraseña actualizada' });

  } catch (error) {
    console.error('Error al cambiar la contraseña:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Cambiar el nombre del usuario autenticado
const updatePerfil = async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    if (!nombre) {
      return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
    }
    if (nombre.length > 100) {
      return res.status(400).json({ mensaje: 'El nombre no puede tener más de 100 caracteres' });
    }

    await pool.query('UPDATE usuarios SET nombre = ? WHERE id = ?', [nombre, req.user.userId]);
    const [users] = await pool.query('SELECT id, nombre, correo, rol, ciudad FROM usuarios WHERE id = ?', [
      req.user.userId,
    ]);
    res.json({ mensaje: 'Perfil actualizado', usuario: { ...users[0], ciudad: users[0].ciudad || null } });

  } catch (error) {
    console.error('Error al actualizar el perfil:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// --- Recuperar contraseña con un código enviado por correo ---
const CODIGO_MINUTOS = 15;
const CODIGO_MAX_INTENTOS = 5;
const MENSAJE_CODIGO_ENVIADO =
  'Si el correo está registrado, te enviamos un código de 6 dígitos. Revisa también la carpeta de spam.';

// Paso 1: genera el código y lo envía. Responde lo mismo exista o no el correo,
// para que nadie pueda averiguar qué correos están registrados.
const solicitarRecuperacion = async (req, res) => {
  try {
    const correo = String(req.body.correo || '').trim();
    if (!correo) {
      return res.status(400).json({ mensaje: 'Escribe tu correo' });
    }

    const [users] = await pool.query(
      `SELECT id, nombre, correo,
              reset_expira > DATE_ADD(NOW(), INTERVAL ? MINUTE) AS pedido_reciente
         FROM usuarios WHERE correo = ?`,
      [CODIGO_MINUTOS - 1, correo]
    );
    if (users.length === 0) {
      return res.json({ mensaje: MENSAJE_CODIGO_ENVIADO });
    }

    const user = users[0];
    // Un código por minuto como máximo, para no llenar el correo de mensajes
    if (user.pedido_reciente) {
      return res.status(429).json({ mensaje: 'Ya te enviamos un código. Espera un minuto para pedir otro.' });
    }

    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const codigoHash = await bcrypt.hash(codigo, 10);
    await pool.query(
      `UPDATE usuarios
          SET reset_codigo = ?, reset_expira = DATE_ADD(NOW(), INTERVAL ? MINUTE), reset_intentos = 0
        WHERE id = ?`,
      [codigoHash, CODIGO_MINUTOS, user.id]
    );

    await correoUtils.enviarCodigoRecuperacion(user.correo, user.nombre, codigo, CODIGO_MINUTOS);
    res.json({ mensaje: MENSAJE_CODIGO_ENVIADO });

  } catch (error) {
    console.error('Error al solicitar la recuperación:', error);
    res.status(500).json({ mensaje: 'No se pudo enviar el código. Intenta más tarde.' });
  }
};

// Paso 2: con el código correcto se guarda la nueva contraseña
const restablecerContrasena = async (req, res) => {
  try {
    const correo = String(req.body.correo || '').trim();
    const codigo = String(req.body.codigo || '').trim();
    const { nueva } = req.body;

    if (!correo || !codigo || !nueva) {
      return res.status(400).json({ mensaje: 'Escribe el código y la nueva contraseña' });
    }

    const errorContrasena = validarContrasena(nueva);
    if (errorContrasena) {
      return res.status(400).json({ mensaje: errorContrasena });
    }

    const [users] = await pool.query(
      `SELECT id, reset_codigo, reset_intentos, reset_expira > NOW() AS vigente
         FROM usuarios WHERE correo = ?`,
      [correo]
    );
    const user = users[0];
    if (!user || !user.reset_codigo || !user.vigente) {
      return res.status(400).json({ mensaje: 'El código venció o no es válido. Pide uno nuevo.' });
    }
    if (user.reset_intentos >= CODIGO_MAX_INTENTOS) {
      return res.status(400).json({ mensaje: 'Demasiados intentos con este código. Pide uno nuevo.' });
    }

    const isMatch = await bcrypt.compare(codigo, user.reset_codigo);
    if (!isMatch) {
      await pool.query('UPDATE usuarios SET reset_intentos = reset_intentos + 1 WHERE id = ?', [user.id]);
      return res.status(400).json({ mensaje: 'El código no es correcto' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(nueva, salt);
    await pool.query(
      `UPDATE usuarios
          SET contrasena = ?, reset_codigo = NULL, reset_expira = NULL, reset_intentos = 0
        WHERE id = ?`,
      [hashedPassword, user.id]
    );
    res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });

  } catch (error) {
    console.error('Error al restablecer la contraseña:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Guarda (o borra, con token null) el token de notificaciones push del celular
const updatePushToken = async (req, res) => {
  try {
    const token = req.body.token ? String(req.body.token) : null;
    if (token && (token.length > 255 || !/^Expo(nent)?PushToken\[.+\]$/.test(token))) {
      return res.status(400).json({ mensaje: 'Token de notificaciones inválido' });
    }

    await pool.query('UPDATE usuarios SET push_token = ? WHERE id = ?', [token, req.user.userId]);
    res.json({ mensaje: 'Notificaciones actualizadas' });

  } catch (error) {
    console.error('Error al guardar el token de notificaciones:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

module.exports = {
  register,
  login,
  updateCiudad,
  updateContrasena,
  updatePerfil,
  solicitarRecuperacion,
  restablecerContrasena,
  updatePushToken
};
