/**
 * Tipos del contrato entre el frontend y los servicios.
 * Reflejan docs/arquitectura.md: si cambias algo aquí, cámbialo allá.
 */

export type Zone = 'zona-g' | 'zona-t';

export type Category = 'restaurante' | 'bar' | 'discoteca' | 'hotel' | 'evento' | 'aire-libre';

/** Resumen para el mapa (booking · GET /places). */
export interface Place {
  id: string;
  name: string;
  category: Category;
  zone: Zone;
  lat: number;
  lng: number;
  description: string;
  priceLevel: 0 | 1 | 2 | 3;
  /** Cupos libres sumando todas las franjas. `null` si el lugar no maneja cupos. */
  freeSeats: number | null;
  /** Portada elegida por un negocio nuevo (clave de la galería, ver lib/brand.ts). */
  cover?: string | null;
}

/** Franja horaria reservable. `version` es la clave del lock optimista (CC-3). */
export interface Slot {
  id: string;
  placeId: string;
  startsAt: string;
  capacity: number;
  taken: number;
  version: number;
}

export interface PlaceEvent {
  id: string;
  placeId: string;
  title: string;
  startsAt: string;
  capacity: number;
  taken: number;
}

export interface Promo {
  id: string;
  placeId: string;
  placeName: string;
  zone: Zone;
  title: string;
  discount: string;
  stock: number;
  initialStock: number;
  /** epoch ms */
  expiresAt: number;
  /** epoch ms. Para las de ganadores, solo cuentan partidas terminadas después. */
  launchedAt?: number;
  /** Solo la reclaman quienes queden en el podio de una partida del minijuego. */
  soloGanadores?: boolean;
  /** 1 = solo el ganador, 3 = el podio. */
  puestos?: number;
}

/** Ficha completa (booking · GET /places/:id, más las promociones activas de promo). */
export interface PlaceDetail extends Place {
  slots: Slot[];
  events: PlaceEvent[];
  promos: Promo[];
}

export interface Reservation {
  id: string;
  slotId: string;
  placeId: string;
  placeName: string;
  startsAt: string;
  people: number;
  code: string;
  userId: string;
  userName: string;
  createdAt: number;
}

export interface Coupon {
  id: string;
  promoId: string;
  code: string;
  title: string;
  discount: string;
  placeName: string;
  claimedAt: number;
}

export interface PlanStop {
  placeId: string;
  placeName: string;
  category: Category;
  hour: string;
  why: string;
}

export interface PlanResult {
  intro: string;
  stops: PlanStop[];
  /** Quién armó el plan: el modelo (Claude) o la plantilla de respaldo. */
  source?: 'claude' | 'plantilla';
}

/** Resultado de una llamada que puede fallar de forma esperada (p. ej. 409). */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: ErrorCode };

export type ErrorCode =
  | 'VERSION_CONFLICT'
  | 'SIN_CUPO'
  | 'PROMO_AGOTADA'
  | 'PROMO_VENCIDA'
  | 'YA_RECLAMADA'
  | 'SOLO_GANADORES'
  | 'YA_TIENE_LUGAR'
  | 'CAPACIDAD_MENOR'
  | 'SALA_NO_EXISTE'
  | 'SALA_EN_JUEGO'
  | 'JUGADORES_INSUFICIENTES'
  | 'SIN_CONEXION';

/* ------------------------------------------------------------------ */
/* Tiempo real                                                         */
/* ------------------------------------------------------------------ */

export type EventType =
  | 'PLACE.UPDATE'
  | 'INV.UPDATE'
  | 'RESERVE.OK'
  // booking: una reserva se canceló (los cupos ya volvieron a la franja)
  | 'RESERVE.CANCELLED'
  | 'PROMO.PUSH'
  | 'PROMO.WON'
  | 'PROMO.EXPIRED'
  // promo avisa a quien quedó en el podio que ya puede reclamar un bono de ganadores
  | 'PROMO.UNLOCKED'
  // booking anuncia un lugar nuevo creado por un negocio
  | 'PLACE.CREATED'
  | 'GAME.PARTIDA_FINALIZADA'
  | 'ROOM.JOIN'
  | 'SNAKE.SCORE'
  | 'ROUND.END'
  // planazo-game publica al bus el snapshot de cada tick y la lista de salas
  | 'GAME.STATE_UPDATE'
  | 'LOBBY.ROOMS_UPDATE';

/**
 * Evento del registro. `seq` da el orden global y permite reanudar;
 * `id` es único y permite descartar duplicados (RT-2).
 * `topics` dice a quién se enruta: `zone:zona-g`, `place:p7`, `user:u1`, `room:ABCD`.
 */
export interface RtEvent<T = unknown> {
  seq: number;
  id: string;
  type: EventType;
  payload: T;
  topics: string[];
  at: number;
}

export interface PlaceUpdatePayload {
  placeId: string;
  freeSeats: number | null;
}

export interface PlaceCreatedPayload {
  place: Place;
  ownerName?: string;
}

export interface PromoUnlockedPayload {
  promo: Promo;
  puesto: number;
  salaCodigo?: string;
}

export interface PromoWonPayload {
  promoId: string;
  placeId: string;
  stock: number;
  winner: string;
  userId?: string;
}

export interface ReserveCancelledPayload {
  id: string;
  placeId: string;
  slotId: string;
  people: number;
  userId: string;
}

export interface InvUpdatePayload {
  placeId: string;
  slot: Slot;
}

/* ------------------------------------------------------------------ */
/* Juego                                                               */
/* ------------------------------------------------------------------ */

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export interface GamePlayer {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  score: number;
  isBot?: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  players: GamePlayer[];
}

export interface LeaderEntry {
  playerId: string;
  name: string;
  score: number;
}

/** Puntajes finales registrados (CC-2: ninguno se pierde). */
export interface HallEntry {
  name: string;
  score: number;
  code: string;
  at: number;
}

/** Estado autoritativo que el servidor emite a la sala en cada tick (RT-3). */
export interface GameState {
  code: string;
  status: Room['status'];
  tick: number;
  size: number;
  players: GamePlayer[];
  snakes: Record<string, Point[]>;
  food: Point[];
  /** Ya ordenado por el servidor: todos los clientes ven el mismo orden (CC-2). */
  leaderboard: LeaderEntry[];
  endsAt?: number;
  winnerId?: string;
}
