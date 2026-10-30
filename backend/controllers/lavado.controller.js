const pool = require('../config/db');
const realtime = require('../realtime');

const MAX_SERVICIOS = 20;

// Revisa nombre y precio; devuelve { error } o { nombre, precio }
const validarServicio = (body) => {
  const nombre = String(body.nombre || '').trim();
  const precio = Number(body.precio);
  if (!nombre) return { error: 'Escribe el nombre del servicio (ej: Lavado general)' };
  if (nombre.length > 80) return { error: 'El nombre no puede tener más de 80 caracteres' };
  if (body.precio === undefined || body.precio === null || body.precio === '' || Number.isNaN(precio) || precio < 0) {
    return { error: 'Escribe un precio válido, solo con números' };
  }
  return { nombre, precio };
};

const obtenerParqueaderoId = async (userId) => {
  const [rows] = await pool.query('SELECT id FROM parqueaderos WHERE usuario_id = ?', [userId]);
  return rows[0]?.id || null;
};

const listarServicios = async (parqueaderoId) => {
  const [rows] = await pool.query(
    'SELECT id, nombre, precio FROM servicios_lavado WHERE parqueadero_id = ? ORDER BY precio ASC, id ASC',
    [parqueaderoId]
  );
  return rows;
};

// Dueño: servicios de lavado de su parqueadero
const getMisServicios = async (req, res) => {
  try {
    const parqueaderoId = await obtenerParqueaderoId(req.user.userId);
    if (!parqueaderoId) return res.json([]);
    res.json(await listarServicios(parqueaderoId));
  } catch (error) {
    console.error('Error al listar servicios de lavado:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

const crearServicio = async (req, res) => {
  try {
    const datos = validarServicio(req.body);
    if (datos.error) return res.status(400).json({ mensaje: datos.error });

    const parqueaderoId = await obtenerParqueaderoId(req.user.userId);
    if (!parqueaderoId) return res.status(404).json({ mensaje: 'Parqueadero no encontrado' });

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM servicios_lavado WHERE parqueadero_id = ?',
      [parqueaderoId]
    );
    if (total >= MAX_SERVICIOS) {
      return res.status(400).json({ mensaje: `Puedes tener máximo ${MAX_SERVICIOS} servicios de lavado` });
    }

    await pool.query('INSERT INTO servicios_lavado (parqueadero_id, nombre, precio) VALUES (?, ?, ?)', [
      parqueaderoId,
      datos.nombre,
      datos.precio,
    ]);

    realtime.parqueaderoActualizado(parqueaderoId);
    res.status(201).json(await listarServicios(parqueaderoId));
  } catch (error) {
    console.error('Error al crear servicio de lavado:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

const actualizarServicio = async (req, res) => {
  try {
    const datos = validarServicio(req.body);
    if (datos.error) return res.status(400).json({ mensaje: datos.error });

    const parqueaderoId = await obtenerParqueaderoId(req.user.userId);
    // Solo puede cambiar los servicios de su propio parqueadero
    const [result] = await pool.query(
      'UPDATE servicios_lavado SET nombre = ?, precio = ? WHERE id = ? AND parqueadero_id = ?',
      [datos.nombre, datos.precio, req.params.id, parqueaderoId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Servicio no encontrado' });
    }

    realtime.parqueaderoActualizado(parqueaderoId);
    res.json(await listarServicios(parqueaderoId));
  } catch (error) {
    console.error('Error al actualizar servicio de lavado:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Las reservas que ya lo tenían conservan el nombre y el precio que se cobró
const eliminarServicio = async (req, res) => {
  try {
    const parqueaderoId = await obtenerParqueaderoId(req.user.userId);
    const [result] = await pool.query('DELETE FROM servicios_lavado WHERE id = ? AND parqueadero_id = ?', [
      req.params.id,
      parqueaderoId,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Servicio no encontrado' });
    }

    realtime.parqueaderoActualizado(parqueaderoId);
    res.json(await listarServicios(parqueaderoId));
  } catch (error) {
    console.error('Error al eliminar servicio de lavado:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

module.exports = { getMisServicios, crearServicio, actualizarServicio, eliminarServicio };
