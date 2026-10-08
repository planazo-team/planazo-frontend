import { backend } from '../mock/services';
import { getSession } from '../session';
import type { ApiResult } from '../types';
import type { Api } from './types';

function me() {
  const s = getSession();
  return s ? { id: s.id, name: s.name } : { id: 'anon', name: 'Invitado' };
}


/** Implementación simulada: mismos mecanismos que los servicios, corriendo en el navegador. */
export const mockApi: Api = {
  listPlaces: async (q) => backend().listPlaces(q),
  getPlace: async (id) => backend().getPlace(id),
  reserve: (input) => backend().reserve(me(), input),
  myReservations: async () => backend().myReservations(me().id),

  activePromos: async (zone) => backend().activePromos(zone),
  claimPromo: (id) => backend().claim(me(), id),
  myCoupons: async () => backend().myCoupons(me().id),

  plan: (text) => backend().plan(text),

  placeReservations: async (placeId) => backend().placeReservations(placeId),
  updateSlotCapacity: ({ slotId, capacity, version }) => backend().updateSlotCapacity({ slotId, capacity, version }),
  createEvent: ({ placeId, ...rest }) => backend().createEvent(placeId, rest),
  launchPromo: ({ placeId, ...rest }) => backend().launchPromo(placeId, rest),


  demo: {
    bumpFromOtherDevice: (slotId) => backend().bumpFromOtherDevice(slotId),
  },
};
