import { buildSeed } from '../seed';
import type {
  ApiResult,
  Category,
  Coupon,
  InvUpdatePayload,
  Place,
  PlaceDetail,
  PlaceEvent,
  PlaceUpdatePayload,
  PlanResult,
  PlanStop,
  Promo,
  Reservation,
  Slot,
  Zone,
} from '../types';
import { gateway, uid } from './gateway';

/**
 * booking, promo y agent simulados en el navegador (modo mock).
 *
 * No son maquetas: aplican los mismos mecanismos que los servicios reales, y hay otros
 * usuarios simulados escribiendo sobre los mismos recursos mientras tu solicitud "viaja".
 * Por eso un conflicto aquí es un conflicto de verdad, no un resultado al azar.
 */

type Who = { id: string; name: string };

interface Db {
  places: Omit<Place, 'freeSeats'>[];
  slots: Slot[];
  events: PlaceEvent[];
  promos: Promo[];
  coupons: Array<Coupon & { userId: string }>;
  reservations: Reservation[];
}

const CROWD = ['Camilo', 'Vale', 'Sara', 'Andrés', 'Luli', 'Nico', 'Fer', 'Juli', 'Dani', 'Mafe', 'Tomás', 'Isa'];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const between = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const code = (n = 6) => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
};

const conflict = (code: ApiResultCode, error: string) =>
  ({ ok: false, status: 409, code, error }) as const;
type ApiResultCode = Extract<ApiResult<never>, { ok: false }>['code'];

class MockBackend {
  private db: Db;
  private started = false;

  constructor() {
    const s = buildSeed();
    this.db = { ...s, promos: [], coupons: [], reservations: [] };
  }

  /* ------------------------------------------------------------------ */
  /* utilidades                                                          */
  /* ------------------------------------------------------------------ */

  private place(id: string) {
    return this.db.places.find((p) => p.id === id);
  }

  private freeSeats(placeId: string): number | null {
    const slots = this.db.slots.filter((s) => s.placeId === placeId);
    if (!slots.length) return null;
    return slots.reduce((acc, s) => acc + (s.capacity - s.taken), 0);
  }

  private toPlace(p: Omit<Place, 'freeSeats'>): Place {
    return { ...p, freeSeats: this.freeSeats(p.id) };
  }

  private activeFor(placeId: string) {
    const now = Date.now();
    return this.db.promos.filter((p) => p.placeId === placeId && p.expiresAt > now && p.stock > 0);
  }

  /** Emite el cambio de inventario a quien mira la ficha y el resumen a quien mira el mapa (RT-1). */
  private emitInventory(slot: Slot) {
    const p = this.place(slot.placeId);
    if (!p) return;
    gateway().publish<InvUpdatePayload>('INV.UPDATE', { placeId: p.id, slot: { ...slot } }, [`place:${p.id}`]);
    gateway().publish<PlaceUpdatePayload>(
      'PLACE.UPDATE',
      { placeId: p.id, freeSeats: this.freeSeats(p.id) },
      [`zone:${p.zone}`],
    );
  }

  /* ------------------------------------------------------------------ */
  /* booking                                                             */
  /* ------------------------------------------------------------------ */

  listPlaces(q: { zone?: Zone; category?: Category } = {}): Place[] {
    return this.db.places
      .filter((p) => (!q.zone || p.zone === q.zone) && (!q.category || p.category === q.category))
      .map((p) => this.toPlace(p));
  }

  getPlace(id: string): PlaceDetail | null {
    const p = this.place(id);
    if (!p) return null;
    return {
      ...this.toPlace(p),
      slots: this.db.slots.filter((s) => s.placeId === id).map((s) => ({ ...s })),
      events: this.db.events.filter((e) => e.placeId === id).map((e) => ({ ...e })),
      promos: this.activeFor(id).map((x) => ({ ...x })),
    };
  }

  /**
   * CC-3. El cliente envía la `version` que leyó. Mientras la solicitud viaja, otro usuario
   * puede escribir la misma franja; si lo hace, la versión ya no coincide y la escritura se
   * rechaza. Es el mismo `UPDATE … WHERE version = $1` del servicio real.
   */
  async reserve(user: Who, input: { slotId: string; people: number; version: number }): Promise<ApiResult<Reservation>> {
    const slot = this.db.slots.find((s) => s.id === input.slotId);
    if (!slot) return { ok: false, status: 404, error: 'La franja no existe.' };

    if (Math.random() < 0.3) setTimeout(() => this.crowdReserves(slot.id), between(60, 250));
    await wait(between(400, 750));

    const s = this.db.slots.find((x) => x.id === input.slotId)!;
    if (s.version !== input.version) {
      return conflict(
        'VERSION_CONFLICT',
        'Alguien reservó en esta franja mientras decidías. Actualizamos la disponibilidad: revisa y vuelve a intentar.',
      );
    }
    if (s.capacity - s.taken < input.people) {
      return conflict('SIN_CUPO', 'No quedan cupos suficientes en esta franja.');
    }

    s.taken += input.people;
    s.version += 1;

    const p = this.place(s.placeId)!;
    const r: Reservation = {
      id: uid(),
      slotId: s.id,
      placeId: p.id,
      placeName: p.name,
      startsAt: s.startsAt,
      people: input.people,
      code: `${code(3)}-${code(3)}`,
      userId: user.id,
      userName: user.name,
      createdAt: Date.now(),
    };
    this.db.reservations.push(r);
    this.emitInventory(s);
    gateway().publish('RESERVE.OK', r, [`place:${p.id}`, `user:${user.id}`]);
    return { ok: true, data: r };
  }

  myReservations(userId: string): Reservation[] {
    return this.db.reservations.filter((r) => r.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  }

  placeReservations(placeId: string): Reservation[] {
    return this.db.reservations.filter((r) => r.placeId === placeId).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Panel del negocio: misma regla de versión, porque el staff edita desde varios dispositivos. */
  async updateSlotCapacity(input: { slotId: string; capacity: number; version: number }): Promise<ApiResult<Slot>> {
    await wait(between(200, 400));
    const s = this.db.slots.find((x) => x.id === input.slotId);
    if (!s) return { ok: false, status: 404, error: 'La franja no existe.' };
    if (s.version !== input.version) {
      return conflict(
        'VERSION_CONFLICT',
        'Otro dispositivo del equipo cambió esta franja antes que tú. Cargamos el valor actual.',
      );
    }
    if (input.capacity < s.taken) {
      return conflict('CAPACIDAD_MENOR', `Ya hay ${s.taken} cupos reservados: la capacidad no puede ser menor.`);
    }
    s.capacity = input.capacity;
    s.version += 1;
    this.emitInventory(s);
    return { ok: true, data: { ...s } };
  }

  /** Herramienta de demostración: una escritura desde "otro dispositivo" del staff. */
  bumpFromOtherDevice(slotId: string) {
    const s = this.db.slots.find((x) => x.id === slotId);
    if (!s) return;
    s.capacity = Math.max(s.taken, s.capacity + (Math.random() < 0.5 ? 1 : -1));
    s.version += 1;
    this.emitInventory(s);
  }

  async createEvent(placeId: string, input: { title: string; startsAt: string; capacity: number }): Promise<ApiResult<PlaceEvent>> {
    await wait(250);
    const e: PlaceEvent = { id: uid(), placeId, title: input.title, startsAt: input.startsAt, capacity: input.capacity, taken: 0 };
    this.db.events.push(e);
    const p = this.place(placeId);
    if (p) gateway().publish('PLACE.UPDATE', { placeId, freeSeats: this.freeSeats(placeId) }, [`zone:${p.zone}`, `place:${placeId}`]);
    return { ok: true, data: e };
  }

  /* ------------------------------------------------------------------ */
  /* promo                                                               */
  /* ------------------------------------------------------------------ */

  activePromos(zone?: Zone): Promo[] {
    const now = Date.now();
    return this.db.promos
      .filter((p) => p.expiresAt > now && p.stock > 0 && (!zone || p.zone === zone))
      .map((p) => ({ ...p }));
  }

  async launchPromo(
    placeId: string,
    input: { title: string; discount: string; stock: number; durationS: number },
  ): Promise<ApiResult<Promo>> {
    const p = this.place(placeId);
    if (!p) return { ok: false, status: 404, error: 'El establecimiento no existe.' };
    await wait(250);
    return { ok: true, data: this.pushPromo(p, input) };
  }

  private pushPromo(p: Omit<Place, 'freeSeats'>, input: { title: string; discount: string; stock: number; durationS: number }) {
    const promo: Promo = {
      id: uid(),
      placeId: p.id,
      placeName: p.name,
      zone: p.zone,
      title: input.title,
      discount: input.discount,
      stock: input.stock,
      initialStock: input.stock,
      expiresAt: Date.now() + input.durationS * 1000,
    };
    this.db.promos.push(promo);
    gateway().publish('PROMO.PUSH', { ...promo }, [`zone:${p.zone}`, `place:${p.id}`]);

    // Demanda de la zona: otros usuarios reclaman durante la vida de la promoción.
    const claims = Math.max(1, Math.round(input.stock * between(0.6, 1.4)));
    for (let i = 0; i < claims; i++) {
      setTimeout(() => this.crowdClaims(promo.id), between(4000, input.durationS * 1000 * 0.9));
    }
    setTimeout(() => {
      const cur = this.db.promos.find((x) => x.id === promo.id);
      if (cur && cur.stock > 0) {
        gateway().publish('PROMO.EXPIRED', { promoId: cur.id, placeId: p.id }, [`zone:${p.zone}`, `place:${p.id}`]);
      }
    }, input.durationS * 1000);
    return { ...promo };
  }

  /**
   * CC-1. Verificar y descontar ocurren en un solo paso, sin nada en medio.
   * JavaScript ejecuta `takeUnit` sin interrupciones, igual que Redis ejecuta el script Lua:
   * dos reclamos simultáneos nunca pueden leer el mismo stock.
   */
  async claim(user: Who, promoId: string): Promise<ApiResult<Coupon>> {
    const promo = this.db.promos.find((p) => p.id === promoId);
    if (!promo) return { ok: false, status: 404, error: 'La promoción no existe.' };

    const rivals = promo.stock <= 2 ? 1 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2);
    for (let i = 0; i < rivals; i++) setTimeout(() => this.crowdClaims(promoId), between(30, 350));
    await wait(between(300, 650));

    if (Date.now() > promo.expiresAt) return conflict('PROMO_VENCIDA', 'La promoción ya venció.');
    if (!this.takeUnit(promo, user.name)) {
      return conflict('PROMO_AGOTADA', 'Se agotó antes de que llegara tu solicitud. Te avisamos de la próxima.');
    }

    const coupon: Coupon & { userId: string } = {
      id: uid(),
      promoId: promo.id,
      code: `PLZ-${code(5)}`,
      title: promo.title,
      discount: promo.discount,
      placeName: promo.placeName,
      claimedAt: Date.now(),
      userId: user.id,
    };
    this.db.coupons.push(coupon);
    const { userId: _omit, ...pub } = coupon;
    return { ok: true, data: pub };
  }

  /** Decremento indivisible. Devuelve false si no quedaba stock. */
  private takeUnit(promo: Promo, winner: string): boolean {
    if (promo.stock <= 0) return false;
    promo.stock -= 1;
    gateway().publish(
      'PROMO.WON',
      { promoId: promo.id, placeId: promo.placeId, stock: promo.stock, winner },
      [`zone:${promo.zone}`, `place:${promo.placeId}`],
    );
    return true;
  }

  myCoupons(userId: string): Coupon[] {
    return this.db.coupons
      .filter((c) => c.userId === userId)
      .map(({ userId: _u, ...c }) => c)
      .sort((a, b) => b.claimedAt - a.claimedAt);
  }

  /* ------------------------------------------------------------------ */
  /* agent                                                               */
  /* ------------------------------------------------------------------ */

  /** Versión por plantillas del agente. En modo live lo resuelve el servicio con el modelo. */
  async plan(text: string): Promise<ApiResult<PlanResult>> {
    await wait(between(900, 1400));
    const t = text.toLowerCase();
    const has = (...ws: string[]) => ws.some((w) => t.includes(w));

    let order: Category[];
    let intro: string;
    if (has('rumba', 'bailar', 'fiesta', 'discoteca', 'farra')) {
      order = ['bar', 'discoteca'];
      intro = 'Arrancamos con un trago tranquilo y cerramos bailando en la Zona T.';
    } else if (has('amigos', 'parche', 'grupo', 'somos', 'cumple')) {
      order = ['restaurante', 'evento', 'bar'];
      intro = 'Para ir en grupo prioricé sitios con cupo real para varios y todo a pocas cuadras.';
    } else if (has('barato', 'plata', 'poca', 'económic', 'economic', 'gratis', 'presupuesto')) {
      order = ['aire-libre', 'restaurante'];
      intro = 'Un plan que casi no cuesta: algo gratis para empezar y comida barata para cerrar.';
    } else if (has('novia', 'novio', 'pareja', 'cita', 'aniversario', 'romant', 'tranquil')) {
      order = ['restaurante', 'bar'];
      intro = 'Algo tranquilo para dos: cena sin afán y un trago en terraza para cerrar.';
    } else if (has('comer', 'cenar', 'hambre', 'comida', 'almorzar')) {
      order = ['restaurante', 'restaurante'];
      intro = 'Enfocado en comer bien, en la Zona G.';
    } else {
      order = ['restaurante', 'bar'];
      intro = 'Te propongo un plan clásico: cena en la Zona G y un trago en la Zona T.';
    }

    const used = new Set<string>();
    const stops: PlanStop[] = [];
    for (const cat of order) {
      const options = this.db.places.filter(
        (p) => p.category === cat && !used.has(p.id) && (this.freeSeats(p.id) ?? 1) > 0,
      );
      if (!options.length) continue;
      const p = pick(options);
      used.add(p.id);
      const slot = this.db.slots
        .filter((s) => s.placeId === p.id && s.capacity - s.taken > 0)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      stops.push({
        placeId: p.id,
        placeName: p.name,
        category: p.category,
        hour: slot?.startsAt ?? 'Cuando quieras',
        why: p.description,
      });
    }
    stops.sort((a, b) => a.hour.localeCompare(b.hour));
    return { ok: true, data: { intro, stops } };
  }

  /* ------------------------------------------------------------------ */
  /* la ciudad sigue viva: otros usuarios                               */
  /* ------------------------------------------------------------------ */

  private crowdReserves(slotId?: string) {
    const open = this.db.slots.filter((s) => s.capacity - s.taken > 0);
    const s = slotId ? this.db.slots.find((x) => x.id === slotId) : pick(open);
    if (!s || s.capacity - s.taken <= 0) return;
    const people = Math.min(s.capacity - s.taken, Math.random() < 0.7 ? 1 : 2);
    s.taken += people;
    s.version += 1;
    const p = this.place(s.placeId)!;
    const r: Reservation = {
      id: uid(),
      slotId: s.id,
      placeId: p.id,
      placeName: p.name,
      startsAt: s.startsAt,
      people,
      code: `${code(3)}-${code(3)}`,
      userId: 'crowd',
      userName: pick(CROWD),
      createdAt: Date.now(),
    };
    this.db.reservations.push(r);
    this.emitInventory(s);
    gateway().publish('RESERVE.OK', r, [`place:${p.id}`]);
  }

  private crowdCancels() {
    const busy = this.db.slots.filter((s) => s.taken > 0);
    if (!busy.length) return;
    const s = pick(busy);
    s.taken -= 1;
    s.version += 1;
    this.emitInventory(s);
  }

  private crowdClaims(promoId: string) {
    const promo = this.db.promos.find((p) => p.id === promoId);
    if (!promo || promo.expiresAt < Date.now()) return;
    this.takeUnit(promo, pick(CROWD));
  }

  /** Arranca la actividad de fondo. Idempotente. */
  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    const loop = (fn: () => void, min: number, max: number) => {
      const tick = () => {
        fn();
        setTimeout(tick, between(min, max));
      };
      setTimeout(tick, between(min, max));
    };

    loop(() => this.crowdReserves(), 4000, 7500);
    loop(() => this.crowdCancels(), 15000, 25000);

    const offers: Array<[string, string, string]> = [
      ['p4', '2x1 en café de filtro', '2x1'],
      ['p7', 'Cóctel de la casa a mitad de precio', '-50%'],
      ['p9', 'Entrada gratis antes de las 11', 'GRATIS'],
      ['p1', 'Postre gratis con tu plato', 'GRATIS'],
      ['p8', 'Segunda ronda al 30%', '-30%'],
      ['p3', 'Combo de seis dumplings', '-40%'],
    ];
    let i = 0;
    const promoLoop = () => {
      const [pid, title, discount] = offers[i++ % offers.length];
      const p = this.place(pid);
      if (p) this.pushPromo(p, { title, discount, stock: 1 + Math.floor(Math.random() * 3), durationS: 40 });
      setTimeout(promoLoop, between(45000, 70000));
    };
    setTimeout(promoLoop, 7000);
  }
}

type G = typeof globalThis & { __planazoBackend?: MockBackend };

export function backend(): MockBackend {
  const g = globalThis as G;
  const b = (g.__planazoBackend ??= new MockBackend());
  b.start();
  return b;
}
