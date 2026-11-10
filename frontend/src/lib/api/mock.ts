import { backend } from '../mock/services';
import { leerCredencial } from '../google';
import { getSession, patchSession, type Role } from '../session';
import type { Api } from './types';

const ROLES = 'planazo.mock.roles';

function roles(): Record<string, Role> {
  try {
    return JSON.parse(localStorage.getItem(ROLES) ?? '{}');
  } catch {
    return {};
  }
}
const rolGuardado = (sub: string): Role | undefined => roles()[sub];
function guardarRol(sub: string, role: Role): Role {
  try {
    localStorage.setItem(ROLES, JSON.stringify({ ...roles(), [sub]: role }));
  } catch {
    /* sin almacenamiento: dura lo que la pestaña */
  }
  return role;
}

function me() {
  const s = getSession();
  return s ? { id: s.id, name: s.name } : { id: 'anon', name: 'Invitado' };
}

/** Implementación simulada: mismos mecanismos que los servicios, corriendo en el navegador. */
export const mockApi: Api = {
  loginGoogle: async (credential, elegido) => {
    // Simulación: la credencial no se verifica (en el navegador no hay forma);
    // el rol se guarda una vez por cuenta, como en booking.
    const perfil = leerCredencial(credential);
    if (!perfil) return { ok: false, status: 401, code: 'CREDENCIAL_INVALIDA', error: 'No pudimos leer tu cuenta de Google.' };
    const role = rolGuardado(perfil.sub) ?? (elegido && guardarRol(perfil.sub, elegido));
    if (!role) return { ok: false, status: 409, code: 'ROL_REQUERIDO', error: '¿Vienes a salir o tienes un negocio?' };
    const id = `${role === 'negocio' ? 'n' : 'c'}-g${perfil.sub.replace(/[^A-Za-z0-9]/g, '').slice(-16)}`;
    const placeId = role === 'negocio' ? backend().ownedPlace(id) : undefined;
    const name = perfil.name || perfil.email.split('@')[0];
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
  cancelReservation: (id) => backend().cancelReservation(getSession(), id),

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
