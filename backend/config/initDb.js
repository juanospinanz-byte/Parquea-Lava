const pool = require('./db');

// Agrega una columna solo si todavía no existe (MySQL no tiene ADD COLUMN IF NOT EXISTS)
const agregarColumnaSiFalta = async (tabla, columna, definicion) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS existe FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabla, columna]
  );
  if (rows[0].existe === 0) {
    await pool.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
};

// Agrega una llave foránea solo si la columna todavía no tiene una
const agregarLlaveSiFalta = async (tabla, columna, referencia) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS existe FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [tabla, columna]
  );
  if (rows[0].existe === 0) {
    await pool.query(`ALTER TABLE ${tabla} ADD FOREIGN KEY (${columna}) REFERENCES ${referencia}`);
  }
};

// Crea las tablas y columnas nuevas si aún no existen (igual que database.sql y los migration_*.sql),
// así una base de datos creada con una versión anterior se actualiza sola
const initDb = async () => {
  try {
    // Abierto / cerrado (migration_abierto.sql)
    await agregarColumnaSiFalta('parqueaderos', 'abierto', 'TINYINT(1) NOT NULL DEFAULT 1');

    // Mejoras (migration_mejoras.sql)
    await agregarColumnaSiFalta('usuarios', 'reset_codigo', 'VARCHAR(255) DEFAULT NULL');
    await agregarColumnaSiFalta('usuarios', 'reset_expira', 'DATETIME DEFAULT NULL');
    await agregarColumnaSiFalta('usuarios', 'reset_intentos', 'INT NOT NULL DEFAULT 0');
    await agregarColumnaSiFalta('usuarios', 'push_token', 'VARCHAR(255) DEFAULT NULL');
    await agregarColumnaSiFalta('parqueaderos', 'hora_apertura', 'TIME DEFAULT NULL');
    await agregarColumnaSiFalta('parqueaderos', 'hora_cierre', 'TIME DEFAULT NULL');
    await agregarColumnaSiFalta('parqueaderos', 'foto', 'VARCHAR(255) DEFAULT NULL');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS servicios_lavado (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parqueadero_id INT NOT NULL,
        nombre VARCHAR(80) NOT NULL,
        precio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parqueadero_id) REFERENCES parqueaderos(id) ON DELETE CASCADE
      )
    `);

    // Reservas (migration_reservas.sql)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parqueadero_id INT NOT NULL,
        cliente_id INT NOT NULL,
        tipo_vehiculo ENUM('motos', 'carros', 'camiones') NOT NULL,
        placa VARCHAR(10) NOT NULL,
        estado ENUM('activa', 'completada', 'cancelada', 'vencida') NOT NULL DEFAULT 'activa',
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expira_en DATETIME NOT NULL,
        fecha_cierre DATETIME DEFAULT NULL,

        INDEX idx_reservas_cliente (cliente_id, estado),
        INDEX idx_reservas_parqueadero (parqueadero_id, estado),
        INDEX idx_reservas_vencimiento (estado, expira_en),
        FOREIGN KEY (parqueadero_id) REFERENCES parqueaderos(id) ON DELETE CASCADE,
        FOREIGN KEY (cliente_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `);
    await agregarColumnaSiFalta('reservas', 'servicio_lavado_id', 'INT DEFAULT NULL');
    await agregarColumnaSiFalta('reservas', 'servicio_nombre', 'VARCHAR(80) DEFAULT NULL');
    await agregarColumnaSiFalta('reservas', 'servicio_precio', 'DECIMAL(10,2) DEFAULT NULL');
    await agregarLlaveSiFalta('reservas', 'servicio_lavado_id', 'servicios_lavado(id) ON DELETE SET NULL');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS calificaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parqueadero_id INT NOT NULL,
        cliente_id INT NOT NULL,
        reserva_id INT NOT NULL UNIQUE,
        estrellas TINYINT NOT NULL,
        comentario VARCHAR(300) DEFAULT NULL,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_calificaciones_parqueadero (parqueadero_id),
        FOREIGN KEY (parqueadero_id) REFERENCES parqueaderos(id) ON DELETE CASCADE,
        FOREIGN KEY (cliente_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE
      )
    `);
  } catch (error) {
    console.error('Error al preparar la base de datos:', error);
  }
};

module.exports = initDb;
