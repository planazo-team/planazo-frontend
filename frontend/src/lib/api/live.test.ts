import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession, setSession } from '../session';
import { liveApi } from './live';

const auth = { token: 'jwt', user: { id: 'c-1', name: 'Ana', role: 'cliente', placeId: null, negocio: true } };

function respuesta(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('sin cuerpo');
      return body;
    },
  };
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  setSession(null);
});
afterEach(() => vi.unstubAllGlobals());

const ultima = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined };
};

describe('API real (gateway)', () => {
  it('entra con Google y arma la sesión con el token', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, auth));
    const r = await liveApi.loginGoogle('cred', 'negocio', '123456');
    expect(r).toEqual({ ok: true, data: { id: 'c-1', name: 'Ana', role: 'cliente', negocio: true, token: 'jwt' } });
    expect(ultima().body).toEqual({ credential: 'cred', modo: 'negocio', codigo: '123456' });

    // Sin servidor no hay sesión: nunca se entra con datos simulados.
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const sinRed = await liveApi.loginGoogle('cred', 'cliente');
    expect(sinRed).toMatchObject({ ok: false, code: 'SIN_CONEXION' });
  });

  it('registro de negocio, cambio de modo y creación del lugar', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(201, { ...auth, user: { ...auth.user, role: 'negocio', placeId: 'p1' } }));
    expect((await liveApi.registrarNegocio('cred', { legalName: 'X SAS', nit: '1', phone: '3', acceptTerms: true })).ok).toBe(true);
    fetchMock.mockResolvedValueOnce(respuesta(200, auth));
    expect((await liveApi.cambiarModo('cliente')).ok).toBe(true);
    expect(ultima().body).toEqual({ modo: 'cliente' });
    fetchMock.mockResolvedValueOnce(respuesta(200, { ...auth, place: { id: 'p9' } }));
    const r = await liveApi.createBusiness({ name: 'Bar', category: 'bar', lat: 1, lng: 2, priceLevel: 1 });
    expect(r.ok && r.data.place.id).toBe('p9');
  });

  it('los errores llegan como { ok: false, code } y un 401 cierra la sesión', async () => {
    setSession({ id: 'c-1', name: 'Ana', role: 'cliente', token: 'viejo' });
    fetchMock.mockResolvedValueOnce(respuesta(409, { code: 'SIN_CUPO', message: 'Sin cupo' }));
    expect(await liveApi.reserve({ slotId: 's', people: 1, version: 1 })).toEqual({ ok: false, status: 409, error: 'Sin cupo', code: 'SIN_CUPO' });
    expect(ultima().init.headers.Authorization).toBe('Bearer viejo');

    fetchMock.mockResolvedValueOnce(respuesta(401, { code: '2FA_INVALIDO', error: 'Código' }));
    await liveApi.dosPasos.confirmar('000000');
    expect(getSession()).not.toBeNull(); // un código equivocado no cierra la sesión

    fetchMock.mockResolvedValueOnce(respuesta(401));
    const r = await liveApi.claimPromo('pr1');
    expect(r).toMatchObject({ ok: false, status: 401, error: 'No pudimos completar la operación.' });
    expect(getSession()).toBeNull();
  });

  it('sin red responde SIN_CONEXION y las lecturas devuelven vacío', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await liveApi.plan('algo')).toMatchObject({ ok: false, code: 'SIN_CONEXION' });
    expect(await liveApi.listPlaces()).toEqual([]);
    expect(await liveApi.getPlace('p1')).toBeNull();
  });

  it('arma las rutas de lectura con sus filtros', async () => {
    fetchMock.mockResolvedValue(respuesta(200, []));
    await liveApi.listPlaces({ zone: 'zona-g', category: 'bar' });
    expect(ultima().url).toMatch(/\/api\/places\?zone=zona-g&category=bar$/);
    await liveApi.activePromos();
    expect(ultima().url).toMatch(/\/api\/promos$/);
    await liveApi.myReservations();
    await liveApi.myCoupons();
    await liveApi.placeReservations('p 1');
    expect(ultima().url).toMatch(/\/api\/places\/p%201\/reservations$/);
  });

  it('la ficha se completa con las promos activas de ese lugar', async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta(200, { id: 'p1', zone: 'zona-g', slots: [], events: [], promos: [] }))
      .mockResolvedValueOnce(respuesta(200, [{ id: 'a', placeId: 'p1' }, { id: 'b', placeId: 'p2' }]));
    const ficha = await liveApi.getPlace('p1');
    expect(ficha!.promos.map((p) => p.id)).toEqual(['a']);
  });

  it('operaciones del negocio y de dos pasos usan sus rutas', async () => {
    fetchMock.mockResolvedValue(respuesta(204));
    await liveApi.cancelReservation('r1');
    expect(ultima().init.method).toBe('DELETE');
    await liveApi.updateSlotCapacity({ placeId: 'p1', slotId: 's1', capacity: 9, version: 2 });
    expect(ultima()).toMatchObject({ url: expect.stringMatching(/\/api\/places\/p1\/slots\/s1$/), body: { capacity: 9, version: 2 } });
    await liveApi.createEvent({ placeId: 'p1', title: 'Jazz', startsAt: '21:00', capacity: 10 });
    await liveApi.launchPromo({ placeId: 'p1', title: 'x', discount: '-10%', stock: 1, durationS: 30 });
    await liveApi.dosPasos.estado();
    await liveApi.dosPasos.iniciar();
    expect(ultima().url).toMatch(/\/api\/auth\/2fa\/iniciar$/);
  });
});
