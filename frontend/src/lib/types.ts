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
  | 'PROMO.PUSH'
  | 'PROMO.WON'
  | 'PROMO.EXPIRED'
  | 'ROOM.JOIN'
  | 'SNAKE.SCORE'
  | 'ROUND.END';

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
