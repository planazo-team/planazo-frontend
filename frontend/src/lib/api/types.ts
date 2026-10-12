import type {
  ApiResult,
  Category,
  Coupon,
  Place,
  PlaceDetail,
  PlaceEvent,
  PlanResult,
  Promo,
  Reservation,
  Slot,
  Zone,
} from '../types';
import type { Role, SessionUser } from '../session';

/** Lo que un negocio llena para aparecer en el mapa (POST /api/auth/negocio). */
export interface NewPlaceInput {
  name: string;
  category: Category;
  lat: number;
  lng: number;
  description?: string;
  priceLevel: 0 | 1 | 2 | 3;
  cover?: string;
}

/**
 * Lo que el frontend necesita de los servicios. Hay dos implementaciones con la misma forma:
 * `live` (HTTP contra el API Gateway) y `mock` (servicios simulados en el navegador).
 */
export interface Api {
  // sesión
  /** Entra solo con el nombre. En live el gateway firma el token. */
  login(name: string, role: Role): Promise<ApiResult<SessionUser>>;
  /** Un negocio crea su lugar; devuelve el lugar y la sesión actualizada (con placeId). */
  createBusiness(input: NewPlaceInput): Promise<ApiResult<{ place: Place; user: SessionUser }>>;

  // booking
  listPlaces(q?: { zone?: Zone; category?: Category }): Promise<Place[]>;
  getPlace(id: string): Promise<PlaceDetail | null>;
  reserve(input: { slotId: string; people: number; version: number }): Promise<ApiResult<Reservation>>;
  myReservations(): Promise<Reservation[]>;

  // promo
  activePromos(zone?: Zone): Promise<Promo[]>;
  claimPromo(promoId: string): Promise<ApiResult<Coupon>>;
  myCoupons(): Promise<Coupon[]>;

  // agent
  plan(text: string): Promise<ApiResult<PlanResult>>;

  // panel del negocio
  placeReservations(placeId: string): Promise<Reservation[]>;
  updateSlotCapacity(input: { placeId: string; slotId: string; capacity: number; version: number }): Promise<ApiResult<Slot>>;
  createEvent(input: { placeId: string; title: string; startsAt: string; capacity: number }): Promise<ApiResult<PlaceEvent>>;
  launchPromo(input: {
    placeId: string;
    title: string;
    discount: string;
    stock: number;
    durationS: number;
    soloGanadores?: boolean;
    puestos?: number;
    placeName?: string;
    zone?: Zone;
  }): Promise<ApiResult<Promo>>;

  // El minijuego no pasa por aquí: tiene su propio cliente en lib/game/client.ts
  // (REST por el gateway + STOMP directo contra planazo-game).

  /** Herramientas que solo existen en modo demo. */
  demo?: {
    bumpFromOtherDevice(slotId: string): void;
  };
}
