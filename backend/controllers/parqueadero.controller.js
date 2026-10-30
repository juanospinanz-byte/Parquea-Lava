const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { liberarReservasVencidas } = require('../utils/reservas');
const { ABIERTO_AHORA_SQL, normalizarHora } = require('../utils/horario');
const realtime = require('../realtime');

// Carpeta donde se guardan las fotos de la entrada de los parqueaderos
const FOTOS_DIR = path.join(__dirname, '..', 'uploads', 'parqueaderos');
const FOTO_MAX_BYTES = 5 * 1024 * 1024;

// Resumen de calificaciones y lavados de un parqueadero (alias "p")
const COLUMNAS_RESUMEN = `
  ${ABIERTO_AHORA_SQL} AS abierto_ahora,
  (SELECT ROUND(AVG(c.estrellas), 1) FROM calificaciones c WHERE c.parqueadero_id = p.id) AS calificacion_promedio,
  (SELECT COUNT(*) FROM calificaciones c WHERE c.parqueadero_id = p.id) AS calificaciones_total,
  (SELECT COUNT(*) FROM servicios_lavado s WHERE s.parqueadero_id = p.id) AS servicios_lavado_total`;

// Lo que ven los clientes de cada parqueadero
const COLUMNAS_PUBLICAS = `
  p.id, p.nombre, p.direccion, p.latitud, p.longitud, p.detalles_ubicacion,
  p.motos_disponibles, p.motos_max, p.motos_precio,
  p.carros_disponibles, p.carros_max, p.carros_precio,
  p.camiones_disponibles, p.camiones_max, p.camiones_precio,
  p.abierto, p.hora_apertura, p.hora_cierre, p.foto,
  u.nombre AS dueno_nombre,
  ${COLUMNAS_RESUMEN}`;

// Parqueadero del dueño con todos sus datos
const obtenerParqueaderoDeDueno = async (userId) => {
  const [rows] = await pool.query(
    `SELECT p.*, ${COLUMNAS_RESUMEN} FROM parqueaderos p WHERE p.usuario_id = ?`,
    [userId]
  );
  return rows[0] || null;
};

const getMiParqueadero = async (req, res) => {
  try {
    // Las reservas vencidas devuelven su celda antes de mostrar la disponibilidad
    await liberarReservasVencidas();
    const userId = req.user.userId;

    let parqueadero = await obtenerParqueaderoDeDueno(userId);
    if (!parqueadero) {
      // Si el dueño aún no tiene parqueadero, se le crea uno por defecto
      await pool.query('INSERT INTO parqueaderos (usuario_id) VALUES (?)', [userId]);
      parqueadero = await obtenerParqueaderoDeDueno(userId);
    }

    res.json(parqueadero);
  } catch (error) {
    console.error('Error al obtener el parqueadero:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

const TIPOS_VEHICULO = ['motos', 'carros', 'camiones'];

const cambiaHorario = (body) => 'hora_apertura' in body || 'hora_cierre' in body;

// Revisa los datos que manda el dueño; devuelve el mensaje de error o null si todo está bien
const validarCambios = (body, actual) => {
  if (body.nombre !== undefined && body.nombre !== null && !String(body.nombre).trim()) {
    return 'El nombre del parqueadero no puede estar vacío';
  }

  if (body.abierto !== undefined && body.abierto !== null && ![true, false, 0, 1].includes(body.abierto)) {
    return 'El valor de abierto no es válido';
  }

  // Horario: las dos horas vacías = 24 horas; si no, las dos deben ser horas válidas y distintas
  if (cambiaHorario(body)) {
    const sinApertura = !body.hora_apertura;
    const sinCierre = !body.hora_cierre;
    if (sinApertura !== sinCierre) {
      return 'Escribe la hora de apertura y la de cierre, o deja las dos vacías para 24 horas';
    }
    if (!sinApertura) {
      const apertura = normalizarHora(body.hora_apertura);
      const cierre = normalizarHora(body.hora_cierre);
      if (!apertura || !cierre) {
        return 'Escribe las horas en formato 24 horas, por ejemplo 06:00 y 22:00';
      }
      if (apertura === cierre) {
        return 'La hora de apertura y la de cierre no pueden ser iguales';
      }
    }
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
    // Abierto / cerrado: se guarda como 1 o 0 (null = no se cambia)
    const abierto = req.body.abierto === undefined || req.body.abierto === null ? null : (req.body.abierto ? 1 : 0);

    await pool.query(
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
        camiones_precio = COALESCE(?, camiones_precio),
        abierto = COALESCE(?, abierto)
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
        abierto,
        userId
      ]
    );

    // El horario va aparte porque "vacío" significa 24 horas (NULL), no "sin cambios"
    if (cambiaHorario(req.body)) {
      await pool.query('UPDATE parqueaderos SET hora_apertura = ?, hora_cierre = ? WHERE usuario_id = ?', [
        req.body.hora_apertura ? normalizarHora(req.body.hora_apertura) : null,
        req.body.hora_cierre ? normalizarHora(req.body.hora_cierre) : null,
        userId,
      ]);
    }

    realtime.parqueaderoActualizado(actualRows[0].id);
    res.json(await obtenerParqueaderoDeDueno(userId));
  } catch (error) {
    console.error('Error al actualizar el parqueadero:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Borra un archivo de foto viejo (sin salir de la carpeta de fotos)
const borrarArchivoFoto = (nombre) => {
  if (!nombre) return;
  fs.promises.unlink(path.join(FOTOS_DIR, path.basename(nombre))).catch(() => {});
};

// Dueño: sube la foto de la entrada (llega en base64 desde la app)
const subirFoto = async (req, res) => {
  try {
    const base64 = String(req.body.imagen || '').replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.length === 0) {
      return res.status(400).json({ mensaje: 'No llegó ninguna imagen' });
    }
    if (buffer.length > FOTO_MAX_BYTES) {
      return res.status(400).json({ mensaje: 'La foto es muy pesada (máximo 5 MB)' });
    }

    // Se revisa que de verdad sea una imagen JPG o PNG
    const esJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const esPng = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (!esJpg && !esPng) {
      return res.status(400).json({ mensaje: 'La foto debe ser una imagen JPG o PNG' });
    }

    const actual = await obtenerParqueaderoDeDueno(req.user.userId);
    if (!actual) {
      return res.status(404).json({ mensaje: 'Parqueadero no encontrado' });
    }

    await fs.promises.mkdir(FOTOS_DIR, { recursive: true });
    const nombreArchivo = `${actual.id}-${Date.now()}.${esJpg ? 'jpg' : 'png'}`;
    await fs.promises.writeFile(path.join(FOTOS_DIR, nombreArchivo), buffer);

    await pool.query('UPDATE parqueaderos SET foto = ? WHERE id = ?', [nombreArchivo, actual.id]);
    borrarArchivoFoto(actual.foto);

    realtime.parqueaderoActualizado(actual.id);
    res.json(await obtenerParqueaderoDeDueno(req.user.userId));
  } catch (error) {
    console.error('Error al subir la foto:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Dueño: quita la foto de la entrada
const eliminarFoto = async (req, res) => {
  try {
    const actual = await obtenerParqueaderoDeDueno(req.user.userId);
    if (!actual) {
      return res.status(404).json({ mensaje: 'Parqueadero no encontrado' });
    }

    await pool.query('UPDATE parqueaderos SET foto = NULL WHERE id = ?', [actual.id]);
    borrarArchivoFoto(actual.foto);

    realtime.parqueaderoActualizado(actual.id);
    res.json(await obtenerParqueaderoDeDueno(req.user.userId));
  } catch (error) {
    console.error('Error al eliminar la foto:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// US04: Listar los parqueaderos con ubicación (para clientes)
const getAllParqueaderos = async (req, res) => {
  try {
    // Las reservas vencidas devuelven su celda antes de mostrar la disponibilidad
    await liberarReservasVencidas();
    const [rows] = await pool.query(
      `SELECT ${COLUMNAS_PUBLICAS}
       FROM parqueaderos p
       JOIN usuarios u ON p.usuario_id = u.id
       -- Solo parqueaderos de dueños que ya marcaron su ubicación (los recién creados no se muestran)
       WHERE u.rol = 'dueno_parqueadero' AND p.latitud IS NOT NULL AND p.longitud IS NOT NULL`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al listar parqueaderos:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// US04: Obtener un parqueadero por ID (para vista del cliente), con sus servicios de lavado
const getParqueaderoById = async (req, res) => {
  try {
    // Las reservas vencidas devuelven su celda antes de mostrar la disponibilidad
    await liberarReservasVencidas();
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT ${COLUMNAS_PUBLICAS}
       FROM parqueaderos p
       JOIN usuarios u ON p.usuario_id = u.id
       WHERE p.id = ? AND u.rol = 'dueno_parqueadero'`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'Parqueadero no encontrado' });
    }

    const [servicios] = await pool.query(
      'SELECT id, nombre, precio FROM servicios_lavado WHERE parqueadero_id = ? ORDER BY precio ASC, id ASC',
      [id]
    );

    res.json({ ...rows[0], servicios_lavado: servicios });
  } catch (error) {
    console.error('Error al obtener parqueadero:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Últimas calificaciones de un parqueadero (solo el primer nombre de cada cliente)
const getCalificacionesParqueadero = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.estrellas, c.comentario, c.fecha_creacion,
              SUBSTRING_INDEX(u.nombre, ' ', 1) AS cliente_nombre
         FROM calificaciones c
         JOIN usuarios u ON u.id = c.cliente_id
        WHERE c.parqueadero_id = ?
        ORDER BY c.fecha_creacion DESC, c.id DESC
        LIMIT 20`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al listar calificaciones:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

module.exports = {
  getMiParqueadero,
  updateMiParqueadero,
  subirFoto,
  eliminarFoto,
  getAllParqueaderos,
  getParqueaderoById,
  getCalificacionesParqueadero
};
