-- Ciudad del usuario cliente: centra el mapa y filtra los parqueaderos de esa ciudad
-- Ejecutar en MySQL si la tabla ya existe

ALTER TABLE usuarios
  ADD COLUMN ciudad VARCHAR(100) DEFAULT NULL AFTER rol;
