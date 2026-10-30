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

  -- Recuperar contraseña: código enviado por correo (se guarda cifrado)
  reset_codigo VARCHAR(255) DEFAULT NULL,
  reset_expira DATETIME DEFAULT NULL,
  reset_intentos INT NOT NULL DEFAULT 0,

  -- Token de notificaciones push del celular (Expo)
  push_token VARCHAR(255) DEFAULT NULL,

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

  -- Abierto (1) o cerrado (0): cerrado no recibe reservas
  abierto TINYINT(1) NOT NULL DEFAULT 1,

  -- Horario de atención (NULL en ambas = abierto las 24 horas)
  hora_apertura TIME DEFAULT NULL,
  hora_cierre TIME DEFAULT NULL,

  -- Nombre del archivo de la foto de la entrada (en backend/uploads/parqueaderos)
  foto VARCHAR(255) DEFAULT NULL,

  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Servicios de lavado que ofrece cada parqueadero
CREATE TABLE IF NOT EXISTS servicios_lavado (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parqueadero_id INT NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  precio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (parqueadero_id) REFERENCES parqueaderos(id) ON DELETE CASCADE
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

  -- Lavado elegido al reservar (se copia nombre y precio por si el dueño lo cambia después)
  servicio_lavado_id INT DEFAULT NULL,
  servicio_nombre VARCHAR(80) DEFAULT NULL,
  servicio_precio DECIMAL(10,2) DEFAULT NULL,

  INDEX idx_reservas_cliente (cliente_id, estado),
  INDEX idx_reservas_parqueadero (parqueadero_id, estado),
  INDEX idx_reservas_vencimiento (estado, expira_en),
  FOREIGN KEY (parqueadero_id) REFERENCES parqueaderos(id) ON DELETE CASCADE,
  FOREIGN KEY (cliente_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (servicio_lavado_id) REFERENCES servicios_lavado(id) ON DELETE SET NULL
);

-- Calificaciones: el cliente califica el parqueadero después de una reserva completada
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
);
