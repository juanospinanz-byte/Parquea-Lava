const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  prepararBaseDeDatos,
  iniciarServidor,
  crearUsuario,
  crearDuenoConParqueadero,
  pool,
} = require('./helpers');

describe('Reservas, historial y calificaciones', () => {
  let api;
  let cerrar;

  before(async () => {
    await prepararBaseDeDatos();
    ({ api, cerrar } = await iniciarServidor());
  });

  after(async () => {
    await cerrar();
  });

  const libres = async (dueno) => {
    const { data } = await api('GET', '/api/parqueadero/me', { token: dueno.token });
    return data.carros_disponibles;
  };

  const reservar = (cliente, dueno, extra = {}) =>
    api('POST', '/api/reservas', {
      token: cliente.token,
      body: { parqueadero_id: dueno.parqueadero.id, tipo_vehiculo: 'carros', placa: 'abc-123', ...extra },
    });

  it('reservar descuenta una celda y cancelar la devuelve', async () => {
    const dueno = await crearDuenoConParqueadero(api);
    const cliente = await crearUsuario(api, 'cliente');

    const { status, data } = await reservar(cliente, dueno);
    assert.equal(status, 201);
    assert.equal(data.placa, 'ABC123');
    assert.equal(data.segundos_restantes > 1700, true);
    assert.equal(await libres(dueno), 1);

    const cancelada = await api('PUT', `/api/reservas/${data.id}/cancelar`, { token: cliente.token });
    assert.equal(cancelada.status, 200);
    assert.equal(await libres(dueno), 2);

    const otraVez = await api('PUT', `/api/reservas/${data.id}/cancelar`, { token: cliente.token });
    assert.equal(otraVez.status, 409);
  });

  it('un cliente solo puede tener una reserva activa', async () => {
    const dueno = await crearDuenoConParqueadero(api);
    const cliente = await crearUsuario(api, 'cliente');
    assert.equal((await reservar(cliente, dueno)).status, 201);
    const segunda = await reservar(cliente, dueno, { placa: 'XYZ999' });
    assert.equal(segunda.status, 409);
  });

  it('no deja reservar sin celdas libres, con placa inválida ni siendo dueño', async () => {
    const dueno = await crearDuenoConParqueadero(api);
    const cliente = await crearUsuario(api, 'cliente');
    assert.equal((await reservar(cliente, dueno, { tipo_vehiculo: 'motos' })).status, 409);
    assert.equal((await reservar(cliente, dueno, { placa: 'A1' })).status, 400);
    assert.equal((await reservar(dueno, dueno)).status, 403);
  });

  it('cuando el dueño marca "llegó" la celda sigue ocupada', async () => {
    const dueno = await crearDuenoConParqueadero(api);
    const cliente = await crearUsuario(api, 'cliente');
    const { data } = await reservar(cliente, dueno);

    const { data: activas } = await api('GET', '/api/reservas/parqueadero', { token: dueno.token });
    assert.equal(activas.length, 1);

    assert.equal((await api('PUT', `/api/reservas/${data.id}/completar`, { token: cliente.token })).status, 403);
    assert.equal((await api('PUT', `/api/reservas/${data.id}/completar`, { token: dueno.token })).status, 200);
    assert.equal(await libres(dueno), 1);
  });

  it('una reserva vencida devuelve su celda sola', async () => {
    const dueno = await crearDuenoConParqueadero(api);
    const cliente = await crearUsuario(api, 'cliente');
    const { data } = await reservar(cliente, dueno);
    assert.equal(await libres(dueno), 1);

    await pool().query('UPDATE reservas SET expira_en = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?', [data.id]);
    assert.equal(await libres(dueno), 2);
    const { data: mia } = await api('GET', '/api/reservas/mia', { token: cliente.token });
    assert.equal(mia, null);
  });

  it('el lavado elegido se guarda con su nombre y precio aunque el dueño lo cambie después', async () => {
    const dueno = await crearDuenoConParqueadero(api);
    const otroDueno = await crearDuenoConParqueadero(api);
    const cliente = await crearUsuario(api, 'cliente');
    const { data: servicios } = await api('POST', '/api/lavado', {
      token: dueno.token,
      body: { nombre: 'Lavado general', precio: 15000 },
    });
    const { data: ajenos } = await api('POST', '/api/lavado', {
      token: otroDueno.token,
      body: { nombre: 'Ajeno', precio: 1 },
    });

    // No se puede usar el lavado de otro parqueadero
    const ajeno = await reservar(cliente, dueno, { servicio_lavado_id: ajenos[0].id });
    assert.equal(ajeno.status, 400);

    const { status, data } = await reservar(cliente, dueno, { servicio_lavado_id: servicios[0].id });
    assert.equal(status, 201);
    assert.equal(data.servicio_nombre, 'Lavado general');

    await api('PUT', `/api/lavado/${servicios[0].id}`, { token: dueno.token, body: { nombre: 'Otro', precio: 99 } });
    const { data: mia } = await api('GET', '/api/reservas/mia', { token: cliente.token });
    assert.equal(mia.servicio_nombre, 'Lavado general');
    assert.equal(Number(mia.servicio_precio), 15000);
  });

  it('historial, calificación y resumen del dueño', async () => {
    const dueno = await crearDuenoConParqueadero(api);
    const cliente = await crearUsuario(api, 'cliente');
    const { data: servicios } = await api('POST', '/api/lavado', {
      token: dueno.token,
      body: { nombre: 'Motor', precio: 10000 },
    });

    // Una reserva completada con lavado y una cancelada
    const { data: r1 } = await reservar(cliente, dueno, { servicio_lavado_id: servicios[0].id });
    await api('PUT', `/api/reservas/${r1.id}/completar`, { token: dueno.token });
    const { data: r2 } = await reservar(cliente, dueno);
    await api('PUT', `/api/reservas/${r2.id}/cancelar`, { token: cliente.token });

    // No se puede calificar una reserva cancelada
    const malCalificada = await api('POST', '/api/calificaciones', {
      token: cliente.token,
      body: { reserva_id: r2.id, estrellas: 5 },
    });
    assert.equal(malCalificada.status, 400);

    assert.equal(
      (await api('POST', '/api/calificaciones', { token: cliente.token, body: { reserva_id: r1.id, estrellas: 9 } }))
        .status,
      400
    );
    const calificada = await api('POST', '/api/calificaciones', {
      token: cliente.token,
      body: { reserva_id: r1.id, estrellas: 4, comentario: 'Muy bien atendido' },
    });
    assert.equal(calificada.status, 201);
    const repetida = await api('POST', '/api/calificaciones', {
      token: cliente.token,
      body: { reserva_id: r1.id, estrellas: 5 },
    });
    assert.equal(repetida.status, 409);

    const { data: historial } = await api('GET', '/api/reservas/historial', { token: cliente.token });
    assert.equal(historial.length, 2);
    assert.equal(historial.find((r) => r.id === r1.id).calificacion, 4);

    const { data: detalle } = await api('GET', `/api/parqueadero/${dueno.parqueadero.id}`, { token: cliente.token });
    assert.equal(Number(detalle.calificacion_promedio), 4);
    assert.equal(detalle.calificaciones_total, 1);

    const { data: comentarios } = await api('GET', `/api/parqueadero/${dueno.parqueadero.id}/calificaciones`, {
      token: cliente.token,
    });
    assert.equal(comentarios[0].comentario, 'Muy bien atendido');

    const { status, data: resumen } = await api('GET', '/api/reservas/resumen?dias=1', { token: dueno.token });
    assert.equal(status, 200);
    assert.equal(resumen.completadas, 1);
    assert.equal(resumen.canceladas, 1);
    assert.equal(resumen.lavados, 1);
    // 1 hora de carro (4000) + lavado de motor (10000)
    assert.equal(resumen.ingresos_estimados, 14000);
    assert.equal(resumen.tasa_llegada, 50);
    assert.equal(resumen.calificacion_promedio, 4);

    assert.equal((await api('GET', '/api/reservas/resumen', { token: cliente.token })).status, 403);
  });
});
