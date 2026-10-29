const pool = require('./db');

// Crea las tablas nuevas si aún no existen (igual que migration_reservas.sql)
const initDb = async () => {
  try {
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
  } catch (error) {
    console.error('Error al crear la tabla de reservas:', error);
  }
};

module.exports = initDb;
