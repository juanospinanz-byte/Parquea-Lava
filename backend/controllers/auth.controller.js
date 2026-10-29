const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const register = async (req, res) => {
  try {
    const { nombre, correo, contrasena, rol } = req.body;
    const ciudad = req.body.ciudad?.trim() || null;

    // Validación de campos
    if (!nombre || !correo || !contrasena || !rol) {
      return res.status(400).json({ mensaje: 'Todos los campos son obligatorios' });
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
      { expiresIn: '24h' }
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
    const { correo, contrasena } = req.body;

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
      { expiresIn: '24h' }
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

module.exports = {
  register,
  login,
  updateCiudad
};
