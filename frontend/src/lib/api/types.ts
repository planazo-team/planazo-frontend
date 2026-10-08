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

/**
 * Lo que el frontend necesita de los servicios. Hay dos implementaciones con la misma forma:
 * `live` (HTTP contra el API Gateway) y `mock` (servicios simulados en el navegador).
 */
export interface Api {
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
  }): Promise<ApiResult<Promo>>;

  // El minijuego no pasa por aquí: tiene su propio cliente en lib/game/client.ts
  // (REST por el gateway + STOMP directo contra planazo-game).

  /** Herramientas que solo existen en modo demo. */
  demo?: {
    bumpFromOtherDevice(slotId: string): void;
  };
}
