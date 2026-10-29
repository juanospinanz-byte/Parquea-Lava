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
