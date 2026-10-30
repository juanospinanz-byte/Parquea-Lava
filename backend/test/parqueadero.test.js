const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  prepararBaseDeDatos,
  iniciarServidor,
  crearUsuario,
  crearDuenoConParqueadero,
  pool,
} = require('./helpers');

// PNG de 1x1 píxel
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Parqueaderos', () => {
  let api;
  let base;
  let cerrar;

  before(async () => {
    await prepararBaseDeDatos();
    ({ api, base, cerrar } = await iniciarServidor());
  });

  after(async () => {
    await cerrar();
  });

  describe('Roles', () => {
    it('un cliente no puede usar las rutas del dueño', async () => {
      const cliente = await crearUsuario(api, 'cliente');
      assert.equal((await api('GET', '/api/parqueadero/me', { token: cliente.token })).status, 403);
      assert.equal((await api('PUT', '/api/parqueadero/me', { token: cliente.token, body: {} })).status, 403);
      assert.equal((await api('GET', '/api/lavado', { token: cliente.token })).status, 403);
    });

    it('sin sesión no se puede consultar nada', async () => {
      assert.equal((await api('GET', '/api/parqueadero/todos')).status, 401);
    });
  });

  describe('Lista para clientes', () => {
    it('no muestra parqueaderos sin ubicación y sí los configurados', async () => {
      const cliente = await crearUsuario(api, 'cliente');
      const nuevo = await crearUsuario(api, 'dueno_parqueadero');
      const { data: sinConfigurar } = await api('GET', '/api/parqueadero/me', { token: nuevo.token });

      let { data: lista } = await api('GET', '/api/parqueadero/todos', { token: cliente.token });
      assert.equal(lista.some((p) => p.id === sinConfigurar.id), false);

      await api('PUT', '/api/parqueadero/me', { token: nuevo.token, body: { latitud: 4.6, longitud: -74.1 } });
      ({ data: lista } = await api('GET', '/api/parqueadero/todos', { token: cliente.token }));
      assert.equal(lista.some((p) => p.id === sinConfigurar.id), true);
    });
  });

  describe('Validaciones del dueño', () => {
    it('no permite más disponibles que la capacidad, ni negativos, ni nombre vacío', async () => {
      const dueno = await crearDuenoConParqueadero(api);
      const casos = [
        { carros_disponibles: 9 },
        { motos_max: -1 },
        { motos_max: 2.5 },
        { nombre: '   ' },
        { abierto: 'si' },
      ];
      for (const body of casos) {
        const { status } = await api('PUT', '/api/parqueadero/me', { token: dueno.token, body });
        assert.equal(status, 400, `debería rechazar ${JSON.stringify(body)}`);
      }
    });
  });

  describe('Abierto, cerrado y horario', () => {
    it('cerrado: el cliente lo ve cerrado y no puede reservar', async () => {
      const dueno = await crearDuenoConParqueadero(api);
      const cliente = await crearUsuario(api, 'cliente');
      await api('PUT', '/api/parqueadero/me', { token: dueno.token, body: { abierto: false } });

      const { data } = await api('GET', `/api/parqueadero/${dueno.parqueadero.id}`, { token: cliente.token });
      assert.equal(data.abierto_ahora, 0);

      const reserva = await api('POST', '/api/reservas', {
        token: cliente.token,
        body: { parqueadero_id: dueno.parqueadero.id, tipo_vehiculo: 'carros', placa: 'ABC123' },
      });
      assert.equal(reserva.status, 409);
      assert.match(reserva.data.mensaje, /cerrado/);
    });

    it('fuera del horario no se puede reservar; dentro del horario sí', async () => {
      const dueno = await crearDuenoConParqueadero(api);
      const cliente = await crearUsuario(api, 'cliente');
      const [[{ hora }]] = await pool().query('SELECT HOUR(CURTIME()) AS hora');
      const h = (n) => `${String((hora + n + 24) % 24).padStart(2, '0')}:00`;

      // Abre en 2 horas y cierra en 3: ahora está fuera del horario
      let r = await api('PUT', '/api/parqueadero/me', {
        token: dueno.token,
        body: { hora_apertura: h(2), hora_cierre: h(3) },
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.abierto_ahora, 0);

      const fuera = await api('POST', '/api/reservas', {
        token: cliente.token,
        body: { parqueadero_id: dueno.parqueadero.id, tipo_vehiculo: 'carros', placa: 'ABC123' },
      });
      assert.equal(fuera.status, 409);
      assert.match(fuera.data.mensaje, /fuera de su horario/);

      // Abrió hace una hora y cierra en dos: ahora está dentro del horario
      r = await api('PUT', '/api/parqueadero/me', {
        token: dueno.token,
        body: { hora_apertura: h(-1), hora_cierre: h(2) },
      });
      assert.equal(r.data.abierto_ahora, 1);

      const dentro = await api('POST', '/api/reservas', {
        token: cliente.token,
        body: { parqueadero_id: dueno.parqueadero.id, tipo_vehiculo: 'carros', placa: 'ABC123' },
      });
      assert.equal(dentro.status, 201);
    });

    it('acepta 24 horas (sin horario) y rechaza horarios inválidos', async () => {
      const dueno = await crearDuenoConParqueadero(api);
      const malos = [
        { hora_apertura: '25:00', hora_cierre: '10:00' },
        { hora_apertura: '08:00', hora_cierre: '' },
        { hora_apertura: '08:00', hora_cierre: '08:00' },
      ];
      for (const body of malos) {
        const { status } = await api('PUT', '/api/parqueadero/me', { token: dueno.token, body });
        assert.equal(status, 400, `debería rechazar ${JSON.stringify(body)}`);
      }
      const ok = await api('PUT', '/api/parqueadero/me', {
        token: dueno.token,
        body: { hora_apertura: '', hora_cierre: '' },
      });
      assert.equal(ok.status, 200);
      assert.equal(ok.data.hora_apertura, null);
      assert.equal(ok.data.abierto_ahora, 1);
    });
  });

  describe('Foto de la entrada', () => {
    it('sube una imagen, se puede descargar y se puede quitar', async () => {
      const dueno = await crearDuenoConParqueadero(api);
      const { status, data } = await api('PUT', '/api/parqueadero/me/foto', {
        token: dueno.token,
        body: { imagen: PNG_1PX },
      });
      assert.equal(status, 200);
      assert.match(data.foto, /\.png$/);

      const archivo = await fetch(`${base}/uploads/parqueaderos/${data.foto}`);
      assert.equal(archivo.status, 200);

      const quitada = await api('DELETE', '/api/parqueadero/me/foto', { token: dueno.token });
      assert.equal(quitada.data.foto, null);
    });

    it('rechaza archivos que no son imágenes', async () => {
      const dueno = await crearDuenoConParqueadero(api);
      const { status } = await api('PUT', '/api/parqueadero/me/foto', {
        token: dueno.token,
        body: { imagen: Buffer.from('esto no es una imagen').toString('base64') },
      });
      assert.equal(status, 400);
    });
  });

  describe('Servicios de lavado', () => {
    it('el dueño los crea, edita y borra; el cliente los ve en el detalle', async () => {
      const dueno = await crearDuenoConParqueadero(api);
      const cliente = await crearUsuario(api, 'cliente');

      const invalido = await api('POST', '/api/lavado', { token: dueno.token, body: { nombre: '', precio: 1000 } });
      assert.equal(invalido.status, 400);

      let r = await api('POST', '/api/lavado', { token: dueno.token, body: { nombre: 'Lavado general', precio: 15000 } });
      assert.equal(r.status, 201);
      const servicio = r.data[0];

      r = await api('PUT', `/api/lavado/${servicio.id}`, {
        token: dueno.token,
        body: { nombre: 'Lavado completo', precio: 20000 },
      });
      assert.equal(r.data[0].nombre, 'Lavado completo');

      const { data: detalle } = await api('GET', `/api/parqueadero/${dueno.parqueadero.id}`, { token: cliente.token });
      assert.equal(detalle.servicios_lavado.length, 1);
      assert.equal(detalle.servicios_lavado_total, 1);

      // Otro dueño no puede tocar servicios ajenos
      const otro = await crearDuenoConParqueadero(api);
      const ajeno = await api('DELETE', `/api/lavado/${servicio.id}`, { token: otro.token });
      assert.equal(ajeno.status, 404);

      r = await api('DELETE', `/api/lavado/${servicio.id}`, { token: dueno.token });
      assert.deepEqual(r.data, []);
    });
  });
});
