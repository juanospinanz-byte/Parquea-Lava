-- =====================================================================
--  Parquea-Lava · Base de datos de ejemplo
-- =====================================================================
--  Este archivo crea todas las tablas que necesita la app en TU propia
--  base de datos MySQL. No contiene datos ni contraseñas.
--
--  CÓMO USARLO DESPUÉS DE CLONAR EL REPOSITORIO
--
--  1. (Opcional) Haz una copia local para personalizarla. Esa copia
--     NO se sube a GitHub (está en .gitignore):
--
--        cp database.example.sql database.sql
--
--  2. Cambia "parquea_lava" (abajo, en CREATE DATABASE y USE) por el
--     nombre que quieras darle a tu base de datos, o déjalo así.
--
--  3. Ejecuta el script en tu servidor MySQL (te pedirá tu contraseña):
--
--        mysql -u TU_USUARIO -p < database.sql
--
--     También puedes abrirlo y ejecutarlo desde MySQL Workbench,
--     phpMyAdmin o la herramienta que uses.
--
--  4. Configura la conexión del backend creando el archivo backend/.env
--     con los datos de TU base de datos:
--
--        DB_HOST=localhost
--        DB_PORT=3306
--        DB_USER=TU_USUARIO
--        DB_PASSWORD=TU_CONTRASEÑA
--        DB_NAME=parquea_lava        (el mismo nombre del paso 2)
--        JWT_SECRET=una_clave_larga_y_secreta
--        PORT=3001
--
--  5. Inicia el backend (cd backend && npm install && npm run dev).
--     Si ves "Conexión a la base de datos establecida exitosamente",
--     ya quedó vinculado.
--
--  Nota: si ya tenías una base de datos de una versión anterior, no
--  ejecutes este archivo completo; usa los archivos migration_*.sql.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS parquea_lava;
USE parquea_lava;

-- Usuarios: dueños de parqueadero y clientes
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(150) NOT NULL UNIQUE,
  contrasena VARCHAR(255) NOT NULL,
  rol ENUM('dueno_parqueadero', 'cliente') NOT NULL,
  ciudad VARCHAR(100) DEFAULT NULL,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Parqueaderos: uno por cada dueño
CREATE TABLE IF NOT EXISTS parqueaderos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL UNIQUE,
  nombre VARCHAR(150) DEFAULT 'Mi Parqueadero',
  direccion VARCHAR(255) DEFAULT 'Sin dirección registrada',
  latitud DECIMAL(10,8) DEFAULT NULL,
  longitud DECIMAL(11,8) DEFAULT NULL,
  detalles_ubicacion VARCHAR(255) DEFAULT NULL,

  -- Celdas de Motos
  motos_disponibles INT DEFAULT 0,
  motos_max INT DEFAULT 30,
  motos_precio DECIMAL(10,2) DEFAULT 0.00,

  -- Celdas de Carros
  carros_disponibles INT DEFAULT 0,
  carros_max INT DEFAULT 50,
  carros_precio DECIMAL(10,2) DEFAULT 0.00,

  -- Celdas de Camiones
  camiones_disponibles INT DEFAULT 0,
  camiones_max INT DEFAULT 12,
  camiones_precio DECIMAL(10,2) DEFAULT 0.00,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Reservas de celdas hechas por los clientes
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
);
