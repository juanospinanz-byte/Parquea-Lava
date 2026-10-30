// Utilidades de las pruebas automáticas (npm test).
// Las pruebas usan una base de datos aparte, "<DB_NAME>_test", que se crea desde database.sql
// y se borra al terminar: nunca tocan los datos reales.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DB_REAL = process.env.DB_NAME;
const DB_TEST = `${DB_REAL}_test`;
// Se cambia antes de cargar config/db para que el pool use la base de pruebas
process.env.DB_NAME = DB_TEST;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'clave-de-pruebas';

const mysql = require('mysql2/promise');

const conexionSinBase = () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

// Crea la base de pruebas desde cero con database.sql
const prepararBaseDeDatos = async () => {
  const conexion = await conexionSinBase();
  try {
    const esquema = fs
      .readFileSync(path.join(__dirname, '..', '..', 'database.sql'), 'utf8')
      .replace(new RegExp(`\\b${DB_REAL}\\b`, 'g'), DB_TEST);
    await conexion.query(`DROP DATABASE IF EXISTS \`${DB_TEST}\``);
    await conexion.query(esquema);
  } finally {
    await conexion.end();
  }
  // initDb no debe cambiar nada en una base ya completa (se prueba que sea seguro correrlo)
  await require('../config/initDb')();
};

const borrarBaseDeDatos = async () => {
  const conexion = await conexionSinBase();
  try {
    await conexion.query(`DROP DATABASE IF EXISTS \`${DB_TEST}\``);
  } finally {
    await conexion.end();
  }
};

// Levanta la API en un puerto libre y devuelve funciones para llamarla
const iniciarServidor = async () => {
  const app = require('../app');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const api = async (method, url, { token, body } = {}) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  };

  const cerrar = async () => {
    await new Promise((resolve) => server.close(resolve));
    await require('../config/db').end();
    await borrarBaseDeDatos();
  };

  return { api, base, cerrar };
};

let contador = 0;
// Registra un usuario de prueba y devuelve { token, usuario, correo, contrasena }
const crearUsuario = async (api, rol, extra = {}) => {
  contador += 1;
  const correo = `prueba${contador}_${Date.now()}@test.local`;
  const contrasena = 'secreto123';
  const { status, data } = await api('POST', '/api/auth/register', {
    body: {
      nombre: rol === 'cliente' ? `Cliente ${contador}` : `Dueño ${contador}`,
      correo,
      contrasena,
      rol,
      ciudad: rol === 'cliente' ? 'Bogotá' : null,
      ...extra,
    },
  });
  if (status !== 201) throw new Error(`No se pudo crear el usuario de prueba: ${JSON.stringify(data)}`);
  return { token: data.token, usuario: data.usuario, correo, contrasena };
};

// Dueño con un parqueadero ya configurado (con ubicación, celdas y precios)
const crearDuenoConParqueadero = async (api, datos = {}) => {
  const dueno = await crearUsuario(api, 'dueno_parqueadero');
  await api('GET', '/api/parqueadero/me', { token: dueno.token });
  const { data } = await api('PUT', '/api/parqueadero/me', {
    token: dueno.token,
    body: {
      nombre: 'Parqueadero de prueba',
      latitud: 4.6,
      longitud: -74.1,
      carros_disponibles: 2,
      carros_max: 5,
      carros_precio: 4000,
      motos_disponibles: 0,
      motos_max: 5,
      motos_precio: 2000,
      ...datos,
    },
  });
  return { ...dueno, parqueadero: data };
};

const pool = () => require('../config/db');

module.exports = {
  prepararBaseDeDatos,
  iniciarServidor,
  crearUsuario,
  crearDuenoConParqueadero,
  pool,
};
