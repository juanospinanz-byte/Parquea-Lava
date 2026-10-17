-- US04: Migración para agregar campos de ubicación a parqueaderos
-- Ejecutar en MySQL si la tabla ya existe

ALTER TABLE parqueaderos 
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(150) DEFAULT 'Mi Parqueadero' AFTER usuario_id,
  ADD COLUMN IF NOT EXISTS latitud DECIMAL(10,8) DEFAULT NULL AFTER direccion,
  ADD COLUMN IF NOT EXISTS longitud DECIMAL(11,8) DEFAULT NULL AFTER latitud;

