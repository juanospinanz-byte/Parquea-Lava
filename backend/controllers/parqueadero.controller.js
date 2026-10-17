const pool = require('../config/db');

const getMiParqueadero = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    let [rows] = await pool.query('SELECT * FROM parqueaderos WHERE usuario_id = ?', [userId]);
    
    if (rows.length === 0) {
      // If no parking lot exists for this owner, create a default one
      const [insertResult] = await pool.query(
        'INSERT INTO parqueaderos (usuario_id) VALUES (?)',
        [userId]
      );
      [rows] = await pool.query('SELECT * FROM parqueaderos WHERE id = ?', [insertResult.insertId]);
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener el parqueadero:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

const updateMiParqueadero = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      nombre,
      direccion, 
      latitud,
      longitud,
      detalles_ubicacion,
      motos_disponibles, motos_max, motos_precio,
      carros_disponibles, carros_max, carros_precio,
      camiones_disponibles, camiones_max, camiones_precio 
    } = req.body;

    const [updateResult] = await pool.query(
      `UPDATE parqueaderos SET 
        nombre = COALESCE(?, nombre),
        direccion = COALESCE(?, direccion),
        latitud = COALESCE(?, latitud),
        longitud = COALESCE(?, longitud),
        detalles_ubicacion = COALESCE(?, detalles_ubicacion),
        motos_disponibles = COALESCE(?, motos_disponibles),
        motos_max = COALESCE(?, motos_max),
        motos_precio = COALESCE(?, motos_precio),
        carros_disponibles = COALESCE(?, carros_disponibles),
        carros_max = COALESCE(?, carros_max),
        carros_precio = COALESCE(?, carros_precio),
        camiones_disponibles = COALESCE(?, camiones_disponibles),
        camiones_max = COALESCE(?, camiones_max),
        camiones_precio = COALESCE(?, camiones_precio)
       WHERE usuario_id = ?`,
      [
        nombre,
        direccion, 
        latitud,
        longitud,
        detalles_ubicacion,
        motos_disponibles, motos_max, motos_precio,
        carros_disponibles, carros_max, carros_precio,
        camiones_disponibles, camiones_max, camiones_precio,
        userId
      ]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Parqueadero no encontrado' });
    }

    const [rows] = await pool.query('SELECT * FROM parqueaderos WHERE usuario_id = ?', [userId]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al actualizar el parqueadero:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// US04: Listar todos los parqueaderos con ubicación (para clientes)
const getAllParqueaderos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.nombre, p.direccion, p.latitud, p.longitud, p.detalles_ubicacion,
              p.motos_disponibles, p.motos_max, p.motos_precio,
              p.carros_disponibles, p.carros_max, p.carros_precio,
              p.camiones_disponibles, p.camiones_max, p.camiones_precio,
              u.nombre AS dueno_nombre
       FROM parqueaderos p
       JOIN usuarios u ON p.usuario_id = u.id`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al listar parqueaderos:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// US04: Obtener un parqueadero por ID (para vista del cliente)
const getParqueaderoById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT p.id, p.nombre, p.direccion, p.latitud, p.longitud, p.detalles_ubicacion,
              p.motos_disponibles, p.motos_max, p.motos_precio,
              p.carros_disponibles, p.carros_max, p.carros_precio,
              p.camiones_disponibles, p.camiones_max, p.camiones_precio,
              u.nombre AS dueno_nombre
       FROM parqueaderos p
       JOIN usuarios u ON p.usuario_id = u.id
       WHERE p.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'Parqueadero no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener parqueadero:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

module.exports = {
  getMiParqueadero,
  updateMiParqueadero,
  getAllParqueaderos,
  getParqueaderoById
};
