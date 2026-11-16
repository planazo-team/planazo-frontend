import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { credencialDemo } from '../google';
import { gateway } from '../mock/gateway';
import { backend } from '../mock/services';
import { setSession } from '../session';
import type { ApiResult, RtEvent } from '../types';
import { mockApi } from './mock';

type G = typeof globalThis & { __planazoBackend?: unknown; __planazoGame?: unknown };

/** Corre una promesa que espera timers simulados. */
async function correr<T>(p: Promise<T>, ms = 5000): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms);
  return p;
}

const datosNegocio = { legalName: 'Café Planazo SAS', nit: '900.123.456-8', phone: '3001234567', acceptTerms: true };

function falla<T>(r: ApiResult<T>) {
  if (r.ok) throw new Error('se esperaba un error');
  return r;
}
function ok<T>(r: ApiResult<T>): T {
  if (!r.ok) throw new Error(`se esperaba ok: ${r.error}`);
  return r.data;
}

beforeEach(() => {
  vi.useFakeTimers();
  // Azar fijo y alto: la "multitud" simulada no se cuela en medio de las pruebas.
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  (globalThis as G).__planazoBackend = undefined;
  localStorage.clear();
  setSession(null);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('cuentas con Google en modo simulado', () => {
  it('entra como cliente; al modo negocio solo si registró el negocio', async () => {
    const cred = credencialDemo('Ana');
    expect(ok(await mockApi.loginGoogle(cred)).role).toBe('cliente');
    expect(falla(await mockApi.loginGoogle(cred, 'negocio')).code).toBe('NEGOCIO_NO_REGISTRADO');
    expect(falla(await mockApi.loginGoogle('basura')).code).toBe('CREDENCIAL_INVALIDA');

    const sesion = ok(await mockApi.registrarNegocio(cred, datosNegocio));
    expect(sesion).toMatchObject({ role: 'negocio', negocio: true });
    expect(ok(await mockApi.loginGoogle(cred, 'negocio')).role).toBe('negocio');
  });

  it('valida el registro del negocio paso a paso', async () => {
    const cred = credencialDemo('Beto');
    expect(falla(await mockApi.registrarNegocio('basura', datosNegocio)).code).toBe('CREDENCIAL_INVALIDA');
    expect(falla(await mockApi.registrarNegocio(cred, { ...datosNegocio, legalName: 'x' })).code).toBe('RAZON_SOCIAL_INVALIDA');
    expect(falla(await mockApi.registrarNegocio(cred, { ...datosNegocio, nit: '1' })).code).toBe('NIT_INVALIDO');
    expect(falla(await mockApi.registrarNegocio(cred, { ...datosNegocio, phone: '1' })).code).toBe('TELEFONO_INVALIDO');
    expect(falla(await mockApi.registrarNegocio(cred, { ...datosNegocio, acceptTerms: false })).code).toBe('TERMINOS_REQUERIDOS');
    ok(await mockApi.registrarNegocio(cred, datosNegocio));
    expect(falla(await mockApi.registrarNegocio(credencialDemo('Otra'), datosNegocio)).code).toBe('NIT_EN_USO');
  });

  it('cambia de modo solo con una sesión de Google y el negocio registrado', async () => {
    expect(falla(await mockApi.cambiarModo('negocio')).status).toBe(403);
    const cred = credencialDemo('Caro');
    setSession(ok(await mockApi.loginGoogle(cred)));
    expect(falla(await mockApi.cambiarModo('negocio')).code).toBe('NEGOCIO_NO_REGISTRADO');
    ok(await mockApi.registrarNegocio(cred, datosNegocio));
    expect(ok(await mockApi.cambiarModo('negocio')).role).toBe('negocio');
  });

  it('la verificación en dos pasos simulada acepta 123456', async () => {
    expect(ok(await mockApi.dosPasos.estado()).activo).toBe(false);
    expect(ok(await mockApi.dosPasos.iniciar()).otpauthUri).toMatch(/^otpauth:/);
    expect(ok(await mockApi.dosPasos.confirmar('123456')).activo).toBe(true);
    expect(falla(await mockApi.dosPasos.confirmar('000000')).code).toBe('2FA_INVALIDO');
  });

  it('si el almacenamiento falla, el registro igual devuelve la sesión', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('lleno');
    });
    expect(ok(await mockApi.registrarNegocio(credencialDemo('Dani'), datosNegocio)).role).toBe('negocio');
  });

  it('con datos dañados en el almacenamiento no hay negocios registrados', async () => {
    localStorage.setItem('planazo.mock.negocios', '{roto');
    expect(falla(await mockApi.loginGoogle(credencialDemo('Eva'), 'negocio')).code).toBe('NEGOCIO_NO_REGISTRADO');
  });
});

describe('negocio: crear lugar, franjas, eventos y promos', () => {
  async function entrarComoNegocio(nombre = 'Fede') {
    const cred = credencialDemo(nombre);
    const s = ok(await mockApi.registrarNegocio(cred, datosNegocio));
    setSession(s);
    return s;
  }

  it('solo un negocio crea su lugar, una vez, con nombre válido', async () => {
    expect(falla(await mockApi.createBusiness({ name: 'Nuevo', category: 'bar', lat: 4.66, lng: -74.05, priceLevel: 2 })).status).toBe(403);
    await entrarComoNegocio();
    expect(falla(await correr(mockApi.createBusiness({ name: ' a ', category: 'bar', lat: 4.66, lng: -74.05, priceLevel: 2 }))).status).toBe(400);

    const creado = ok(await correr(mockApi.createBusiness({ name: 'Bar Nuevo', category: 'bar', lat: 4.6672, lng: -74.0536, priceLevel: 2, description: ' rico ' })));
    expect(creado.place).toMatchObject({ zone: 'zona-t', description: 'rico', freeSeats: 56 });
    expect(creado.user.placeId).toBe(creado.place.id);
    expect(falla(await correr(mockApi.createBusiness({ name: 'Otro', category: 'hotel', lat: 4.65, lng: -74.05, priceLevel: 1 }))).code).toBe('YA_TIENE_LUGAR');

    const detalle = await mockApi.getPlace(creado.place.id);
    expect(detalle?.slots).toHaveLength(3);
  });

  it('cambia la capacidad con control de versión y no por debajo de lo reservado', async () => {
    const lugar = backend().listPlaces({ zone: 'zona-g', category: 'restaurante' })[0];
    const slot = (await mockApi.getPlace(lugar.id))!.slots[0];
    const placeId = lugar.id;
    expect(falla(await correr(mockApi.updateSlotCapacity({ placeId, slotId: 'nada', capacity: 5, version: 1 }))).status).toBe(404);
    expect(falla(await correr(mockApi.updateSlotCapacity({ placeId, slotId: slot.id, capacity: 5, version: slot.version + 9 }))).code).toBe('VERSION_CONFLICT');
    if (slot.taken > 0) {
      expect(falla(await correr(mockApi.updateSlotCapacity({ placeId, slotId: slot.id, capacity: slot.taken - 1, version: slot.version }))).code).toBe('CAPACIDAD_MENOR');
    }
    const nuevo = ok(await correr(mockApi.updateSlotCapacity({ placeId, slotId: slot.id, capacity: slot.capacity + 4, version: slot.version })));
    expect(nuevo.version).toBe(slot.version + 1);

    mockApi.demo!.bumpFromOtherDevice(slot.id);
    mockApi.demo!.bumpFromOtherDevice('nada');
    expect((await mockApi.getPlace(lugar.id))!.slots[0].version).toBe(slot.version + 2);
  });

  it('crea eventos y lanza promos que llegan por el bus y vencen solas', async () => {
    const lugar = backend().listPlaces()[0];
    const ev = ok(await correr(mockApi.createEvent({ placeId: lugar.id, title: 'Jazz', startsAt: '21:00', capacity: 30 })));
    expect(ev.title).toBe('Jazz');
    ok(await correr(mockApi.createEvent({ placeId: 'inexistente', title: 'X', startsAt: '21:00', capacity: 1 })));

    expect(falla(await correr(mockApi.launchPromo({ placeId: 'nada', title: 'x', discount: '-10%', stock: 1, durationS: 30 }))).status).toBe(404);
    const promo = ok(await correr(mockApi.launchPromo({ placeId: lugar.id, title: '2x1', discount: '2x1', stock: 2, durationS: 30 }), 300));
    expect((await mockApi.activePromos(lugar.zone)).some((p) => p.id === promo.id)).toBe(true);
    expect((await mockApi.getPlace(lugar.id))!.promos.map((p) => p.id)).toContain(promo.id);
    await vi.advanceTimersByTimeAsync(31_000); // la multitud reclama y la promo vence
    expect((await mockApi.activePromos()).some((p) => p.id === promo.id)).toBe(false);
  });
});

describe('cliente: reservas (CC-3) y promos (CC-1)', () => {
  beforeEach(() => setSession({ id: 'c-gana', name: 'Ana', role: 'cliente' }));

  it('reserva con la versión leída; otra versión o sin cupo es 409', async () => {
    const lugar = backend().listPlaces({ category: 'restaurante' })[0];
    const slot = (await mockApi.getPlace(lugar.id))!.slots.find((s) => s.capacity - s.taken >= 2)!;

    expect(falla(await correr(mockApi.reserve({ slotId: 'nada', people: 1, version: 1 }))).status).toBe(404);
    expect(falla(await correr(mockApi.reserve({ slotId: slot.id, people: 1, version: slot.version + 5 }))).code).toBe('VERSION_CONFLICT');
    expect(falla(await correr(mockApi.reserve({ slotId: slot.id, people: 999, version: slot.version }))).code).toBe('SIN_CUPO');

    const r = ok(await correr(mockApi.reserve({ slotId: slot.id, people: 2, version: slot.version })));
    expect(r.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    expect((await mockApi.myReservations()).map((x) => x.id)).toContain(r.id);
    expect((await mockApi.placeReservations(lugar.id)).map((x) => x.id)).toContain(r.id);

    // Solo quien reservó (o el negocio dueño) cancela; cancelar devuelve los cupos.
    setSession({ id: 'c-otro', name: 'Otro', role: 'cliente' });
    expect(falla(await correr(mockApi.cancelReservation(r.id))).status).toBe(403);
    setSession({ id: 'c-gana', name: 'Ana', role: 'cliente' });
    ok(await correr(mockApi.cancelReservation(r.id)));
    expect(falla(await correr(mockApi.cancelReservation(r.id))).status).toBe(404);
    expect((await mockApi.getPlace(lugar.id))!.slots.find((s) => s.id === slot.id)!.taken).toBe(slot.taken);
  });

  it('a veces otro usuario reserva primero y la versión ya no coincide', async () => {
    vi.mocked(Math.random).mockReturnValue(0.1); // < 0.3: la multitud se mete
    const lugar = backend().listPlaces({ category: 'bar' })[0];
    const slot = (await mockApi.getPlace(lugar.id))!.slots.find((s) => s.capacity - s.taken > 0)!;
    expect(falla(await correr(mockApi.reserve({ slotId: slot.id, people: 1, version: slot.version }))).code).toBe('VERSION_CONFLICT');
  });

  it('reclama un cupón una vez; agotada, vencida o inexistente es error', async () => {
    const lugar = backend().listPlaces()[1];
    // Stock 3: en cada reclamo un rival de la zona se lleva una unidad antes que tú.
    const promo = ok(await correr(mockApi.launchPromo({ placeId: lugar.id, title: 'Último', discount: '-50%', stock: 3, durationS: 120 }), 300));

    expect(falla(await correr(mockApi.claimPromo('nada'))).status).toBe(404);
    const cupon = ok(await correr(mockApi.claimPromo(promo.id), 1000));
    expect(cupon.code).toMatch(/^PLZ-/);
    expect(falla(await correr(mockApi.claimPromo(promo.id))).code).toBe('YA_RECLAMADA');
    expect((await mockApi.myCoupons()).map((c) => c.id)).toEqual([cupon.id]);

    setSession({ id: 'c-tarde', name: 'Tarde', role: 'cliente' });
    expect(falla(await correr(mockApi.claimPromo(promo.id))).code).toBe('PROMO_AGOTADA');

    const corta = ok(await correr(mockApi.launchPromo({ placeId: lugar.id, title: 'Flash', discount: '-10%', stock: 5, durationS: 0.5 }), 300));
    const tarde = mockApi.claimPromo(corta.id);
    await vi.advanceTimersByTimeAsync(2000);
    expect(falla(await tarde).code).toBe('PROMO_VENCIDA');
  });

  it('los bonos de ganadores solo los reclama quien quedó en el podio después del lanzamiento', async () => {
    const lugar = backend().listPlaces()[2];
    const bono = ok(await correr(mockApi.launchPromo({ placeId: lugar.id, title: 'Cover', discount: 'Gratis', stock: 3, durationS: 600, soloGanadores: true, puestos: 2 }), 300));
    expect(falla(await correr(mockApi.claimPromo(bono.id))).code).toBe('SOLO_GANADORES');

    const avisos: RtEvent[] = [];
    const t = gateway().transport();
    t.connect({ onOpen: () => t.send({ type: 'SUBSCRIBE', topic: 'user:c-gana' }), onClose() {}, onEvent: (e) => avisos.push(e), onReplay() {} });
    await vi.advanceTimersByTimeAsync(250);

    // Termina una partida del simulador con Ana en el podio.
    const { mockGame } = await import('../mock/game');
    const juego = mockGame();
    const sala = ok(juego.create({ id: 'c-gana', name: 'Ana' }));
    juego.join(sala.code, { id: 'c-rival', name: 'Rival' });
    juego.start(sala.code);
    juego.salirSala(sala.code, 'c-rival'); // queda una sola viva: termina
    await vi.advanceTimersByTimeAsync(10);

    expect(avisos.some((e) => e.type === 'PROMO.UNLOCKED')).toBe(true);
    expect(ok(await correr(mockApi.claimPromo(bono.id))).title).toBe('Cover');
    t.close();
  });
});

describe('agente por plantillas', () => {
  it.each([
    ['vamos de rumba', 'bar'],
    ['salida con amigos', 'restaurante'],
    ['algo barato', 'aire-libre'],
    ['cita con mi novia', 'restaurante'],
    ['tengo hambre', 'restaurante'],
    ['lo que sea', 'restaurante'],
  ])('«%s» incluye %s y ordena la noche', async (texto, categoria) => {
    const plan = ok(await correr(mockApi.plan(texto), 2000));
    expect(plan.intro).toBeTruthy();
    expect(plan.stops.map((s) => s.category)).toContain(categoria);
  });

  it('la madrugada queda al final del plan', async () => {
    const plan = ok(await correr(mockApi.plan('rumba y bailar'), 2000));
    const horas = plan.stops.map((s) => s.hour);
    const idx = horas.findIndex((h) => h < '06');
    if (idx >= 0) expect(idx).toBe(horas.length - 1);
  });
});

describe('la ciudad sigue viva', () => {
  it('la actividad de fondo reserva, cancela y lanza promos sola', async () => {
    vi.mocked(Math.random).mockReturnValue(0.2);
    const antes = backend().listPlaces().reduce((a, p) => a + (p.freeSeats ?? 0), 0);
    await vi.advanceTimersByTimeAsync(120_000);
    const despues = backend().listPlaces().reduce((a, p) => a + (p.freeSeats ?? 0), 0);
    expect(despues).not.toBe(antes);
    expect(backend().activePromos().length).toBeGreaterThan(0);
  });
});
