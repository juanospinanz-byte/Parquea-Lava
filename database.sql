CREATE DATABASE IF NOT EXISTS parquea_lava;
USE parquea_lava;

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(150) NOT NULL UNIQUE,
  contrasena VARCHAR(255) NOT NULL,
  rol ENUM('dueno_parqueadero', 'cliente') NOT NULL,
  ciudad VARCHAR(100) DEFAULT NULL,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Parqueaderos (Relacionada con dueños de parqueadero)
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

-- Reservas de celdas (clientes)
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
