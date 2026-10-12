import { backend } from '../mock/services';
import { getSession, localUserId, patchSession } from '../session';
import type { Api } from './types';

function me() {
  const s = getSession();
  return s ? { id: s.id, name: s.name } : { id: 'anon', name: 'Invitado' };
}

/** Implementación simulada: mismos mecanismos que los servicios, corriendo en el navegador. */
export const mockApi: Api = {
  login: async (name, role) => {
    const id = localUserId(role);
    const placeId = role === 'negocio' ? backend().ownedPlace(id) : undefined;
    return { ok: true, data: { id, name, role, ...(placeId ? { placeId } : {}) } };
  },
  createBusiness: async (input) => {
    const s = getSession();
    if (!s || s.role !== 'negocio') return { ok: false, status: 403, error: 'Solo una cuenta de negocio puede crear un lugar.' };
    const r = await backend().createPlace(s.id, s.name, input);
    if (!r.ok) return r;
    patchSession({ placeId: r.data.id });
    return { ok: true, data: { place: r.data, user: { ...s, placeId: r.data.id } } };
  },

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
