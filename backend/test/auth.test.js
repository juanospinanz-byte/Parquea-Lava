const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBaseDeDatos, iniciarServidor, crearUsuario } = require('./helpers');

describe('Cuentas: registro, login, perfil y contraseñas', () => {
  let api;
  let cerrar;

  before(async () => {
    await prepararBaseDeDatos();
    ({ api, cerrar } = await iniciarServidor());
  });

  after(async () => {
    await cerrar();
  });

  describe('Registro', () => {
    const base = { nombre: 'Ana', contrasena: 'secreto123', rol: 'cliente', ciudad: 'Bogotá' };

    it('rechaza un correo con formato inválido', async () => {
      const { status } = await api('POST', '/api/auth/register', { body: { ...base, correo: 'no-es-correo' } });
      assert.equal(status, 400);
    });

    it('rechaza contraseñas de menos de 6 caracteres', async () => {
      const { status, data } = await api('POST', '/api/auth/register', {
        body: { ...base, correo: 'corta@test.local', contrasena: '123' },
      });
      assert.equal(status, 400);
      assert.match(data.mensaje, /al menos 6/);
    });

    it('exige la ciudad a los clientes', async () => {
      const { status } = await api('POST', '/api/auth/register', {
        body: { ...base, correo: 'sinciudad@test.local', ciudad: null },
      });
      assert.equal(status, 400);
    });

    it('guarda el correo en minúsculas y sin espacios, y no permite repetirlo', async () => {
      const { status, data } = await api('POST', '/api/auth/register', {
        body: { ...base, correo: '  Ana.Perez@Test.Local ' },
      });
      assert.equal(status, 201);
      assert.equal(data.usuario.correo, 'ana.perez@test.local');

      const repetido = await api('POST', '/api/auth/register', { body: { ...base, correo: 'ana.perez@test.local' } });
      assert.equal(repetido.status, 400);
    });
  });

  describe('Login', () => {
    it('entra con la contraseña correcta y rechaza la incorrecta', async () => {
      const usuario = await crearUsuario(api, 'cliente');
      const ok = await api('POST', '/api/auth/login', { body: { correo: usuario.correo, contrasena: usuario.contrasena } });
      assert.equal(ok.status, 200);
      assert.ok(ok.data.token);

      const mala = await api('POST', '/api/auth/login', { body: { correo: usuario.correo, contrasena: 'mala' } });
      assert.equal(mala.status, 401);
    });

    it('bloquea el correo 15 minutos después de 5 intentos fallidos', async () => {
      const usuario = await crearUsuario(api, 'cliente');
      for (let i = 0; i < 5; i++) {
        const r = await api('POST', '/api/auth/login', { body: { correo: usuario.correo, contrasena: 'mala' } });
        assert.equal(r.status, 401);
      }
      const bloqueado = await api('POST', '/api/auth/login', {
        body: { correo: usuario.correo, contrasena: usuario.contrasena },
      });
      assert.equal(bloqueado.status, 429);

      // Otro correo no se ve afectado
      const otro = await crearUsuario(api, 'cliente');
      const ok = await api('POST', '/api/auth/login', { body: { correo: otro.correo, contrasena: otro.contrasena } });
      assert.equal(ok.status, 200);
    });

    it('rechaza tokens firmados con otra clave', async () => {
      const jwt = require('jsonwebtoken');
      const falso = jwt.sign({ userId: 1, rol: 'cliente' }, 'otra-clave');
      const { status } = await api('GET', '/api/parqueadero/todos', { token: falso });
      assert.equal(status, 401);
    });
  });

  describe('Perfil y contraseña', () => {
    it('cambia el nombre', async () => {
      const usuario = await crearUsuario(api, 'cliente');
      const vacio = await api('PUT', '/api/auth/perfil', { token: usuario.token, body: { nombre: '  ' } });
      assert.equal(vacio.status, 400);

      const { status, data } = await api('PUT', '/api/auth/perfil', {
        token: usuario.token,
        body: { nombre: 'Nombre Nuevo' },
      });
      assert.equal(status, 200);
      assert.equal(data.usuario.nombre, 'Nombre Nuevo');
    });

    it('cambia la contraseña solo con la actual correcta', async () => {
      const usuario = await crearUsuario(api, 'dueno_parqueadero');
      const mala = await api('PUT', '/api/auth/contrasena', {
        token: usuario.token,
        body: { actual: 'mala', nueva: 'otraClave1' },
      });
      assert.equal(mala.status, 400);

      const ok = await api('PUT', '/api/auth/contrasena', {
        token: usuario.token,
        body: { actual: usuario.contrasena, nueva: 'otraClave1' },
      });
      assert.equal(ok.status, 200);

      const login = await api('POST', '/api/auth/login', { body: { correo: usuario.correo, contrasena: 'otraClave1' } });
      assert.equal(login.status, 200);
    });

    it('valida el token de notificaciones push', async () => {
      const usuario = await crearUsuario(api, 'cliente');
      const malo = await api('PUT', '/api/auth/push-token', { token: usuario.token, body: { token: 'cualquier-cosa' } });
      assert.equal(malo.status, 400);
      const ok = await api('PUT', '/api/auth/push-token', {
        token: usuario.token,
        body: { token: 'ExponentPushToken[abc123]' },
      });
      assert.equal(ok.status, 200);
    });
  });

  describe('¿Olvidó contraseña?', () => {
    // Se reemplaza el envío del correo para leer el código desde la prueba
    const correoUtils = require('../utils/correo');
    let ultimoCodigo = null;
    before(() => {
      correoUtils.enviarCodigoRecuperacion = async (correo, nombre, codigo) => {
        ultimoCodigo = codigo;
      };
    });

    it('responde igual aunque el correo no exista (no revela qué correos hay)', async () => {
      const { status, data } = await api('POST', '/api/auth/recuperar', { body: { correo: 'noexiste@test.local' } });
      assert.equal(status, 200);
      assert.match(data.mensaje, /Si el correo está registrado/);
    });

    it('cambia la contraseña con el código correcto', async () => {
      const usuario = await crearUsuario(api, 'cliente');
      ultimoCodigo = null;
      const pedido = await api('POST', '/api/auth/recuperar', { body: { correo: usuario.correo } });
      assert.equal(pedido.status, 200);
      assert.match(ultimoCodigo, /^\d{6}$/);

      // No deja pedir otro código enseguida
      const otraVez = await api('POST', '/api/auth/recuperar', { body: { correo: usuario.correo } });
      assert.equal(otraVez.status, 429);

      const codigoMalo = ultimoCodigo === '000000' ? '111111' : '000000';
      const malo = await api('POST', '/api/auth/restablecer', {
        body: { correo: usuario.correo, codigo: codigoMalo, nueva: 'recuperada1' },
      });
      assert.equal(malo.status, 400);

      const ok = await api('POST', '/api/auth/restablecer', {
        body: { correo: usuario.correo, codigo: ultimoCodigo, nueva: 'recuperada1' },
      });
      assert.equal(ok.status, 200);

      const login = await api('POST', '/api/auth/login', { body: { correo: usuario.correo, contrasena: 'recuperada1' } });
      assert.equal(login.status, 200);

      // El código ya usado no sirve otra vez
      const reusado = await api('POST', '/api/auth/restablecer', {
        body: { correo: usuario.correo, codigo: ultimoCodigo, nueva: 'otraMas123' },
      });
      assert.equal(reusado.status, 400);
    });

    it('invalida el código después de 5 intentos equivocados', async () => {
      const usuario = await crearUsuario(api, 'cliente');
      await api('POST', '/api/auth/recuperar', { body: { correo: usuario.correo } });
      const codigoMalo = ultimoCodigo === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await api('POST', '/api/auth/restablecer', {
          body: { correo: usuario.correo, codigo: codigoMalo, nueva: 'recuperada1' },
        });
      }
      const correcto = await api('POST', '/api/auth/restablecer', {
        body: { correo: usuario.correo, codigo: ultimoCodigo, nueva: 'recuperada1' },
      });
      assert.equal(correcto.status, 400);
      assert.match(correcto.data.mensaje, /Demasiados intentos/);
    });
  });
});
