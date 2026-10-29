const pool = require('../config/db');
const { liberarReservasVencidas } = require('../utils/reservas');

const getMiParqueadero = async (req, res) => {
  try {
    // Las reservas vencidas devuelven su celda antes de mostrar la disponibilidad
    await liberarReservasVencidas();
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

const TIPOS_VEHICULO = ['motos', 'carros', 'camiones'];

// Revisa los datos que manda el dueño; devuelve el mensaje de error o null si todo está bien
const validarCambios = (body, actual) => {
  if (body.nombre !== undefined && body.nombre !== null && !String(body.nombre).trim()) {
    return 'El nombre del parqueadero no puede estar vacío';
  }

  for (const tipo of TIPOS_VEHICULO) {
    for (const campo of [`${tipo}_disponibles`, `${tipo}_max`, `${tipo}_precio`]) {
      const valor = body[campo];
      if (valor === undefined || valor === null) continue;
      const numero = Number(valor);
      if (Number.isNaN(numero) || numero < 0) {
        return `El valor de ${campo} no es válido`;
      }
      if (!campo.endsWith('_precio') && !Number.isInteger(numero)) {
        return `El valor de ${campo} debe ser un número entero`;
      }
    }

    // Solo se revisan los tipos que se están cambiando (datos viejos inválidos no bloquean otros cambios)
    const cambiaCeldas = body[`${tipo}_disponibles`] != null || body[`${tipo}_max`] != null;
    if (!cambiaCeldas) continue;

    // Se compara con lo que ya está guardado si solo llega uno de los dos valores
    const disponibles = Number(body[`${tipo}_disponibles`] ?? actual[`${tipo}_disponibles`] ?? 0);
    const max = Number(body[`${tipo}_max`] ?? actual[`${tipo}_max`] ?? 0);
    if (disponibles > max) {
      return `Las celdas disponibles de ${tipo} no pueden superar la capacidad máxima (${max})`;
    }
  }

  return null;
};

const updateMiParqueadero = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [actualRows] = await pool.query('SELECT * FROM parqueaderos WHERE usuario_id = ?', [userId]);
    if (actualRows.length === 0) {
      return res.status(404).json({ mensaje: 'Parqueadero no encontrado' });
    }

    const errorValidacion = validarCambios(req.body, actualRows[0]);
    if (errorValidacion) {
      return res.status(400).json({ mensaje: errorValidacion });
    }

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
    // Las reservas vencidas devuelven su celda antes de mostrar la disponibilidad
    await liberarReservasVencidas();
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
    // Las reservas vencidas devuelven su celda antes de mostrar la disponibilidad
    await liberarReservasVencidas();
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
