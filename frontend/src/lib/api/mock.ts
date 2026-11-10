import { backend } from '../mock/services';
import { leerCredencial } from '../google';
import { problemaNit, razonSocialValida, telefonoValido } from '../negocio';
import { getSession, patchSession, type Role, type SessionUser } from '../session';
import type { Api } from './types';

// Simulación de booking en el navegador: qué cuentas registraron su negocio y con qué NIT.
const NEGOCIOS = 'planazo.mock.negocios';

function negocios(): Record<string, { nit: string; legalName: string }> {
  try {
    return JSON.parse(localStorage.getItem(NEGOCIOS) ?? '{}');
  } catch {
    return {};
  }
}

/** Misma forma de id que el gateway: `c-g…` en modo cliente y `n-g…` en modo negocio. */
const cuentaDe = (sub: string) => `g${sub.replace(/[^A-Za-z0-9]/g, '').slice(-16)}`;

function sesionMock(cuenta: string, name: string, modo: Role): SessionUser {
  const id = `${modo === 'negocio' ? 'n' : 'c'}-${cuenta}`;
  const placeId = modo === 'negocio' ? backend().ownedPlace(id) : undefined;
  return { id, name, role: modo, negocio: !!negocios()[cuenta], ...(placeId ? { placeId } : {}) };
}

function me() {
  const s = getSession();
  return s ? { id: s.id, name: s.name } : { id: 'anon', name: 'Invitado' };
}

/** Implementación simulada: mismos mecanismos que los servicios, corriendo en el navegador. */
export const mockApi: Api = {
  loginGoogle: async (credential, modo) => {
    // Simulación: la credencial no se verifica (en el navegador no hay forma).
    const perfil = leerCredencial(credential);
    if (!perfil) return { ok: false, status: 401, code: 'CREDENCIAL_INVALIDA', error: 'No pudimos leer tu cuenta de Google.' };
    const cuenta = cuentaDe(perfil.sub);
    if (modo === 'negocio' && !negocios()[cuenta]) {
      return { ok: false, status: 409, code: 'NEGOCIO_NO_REGISTRADO', error: 'Registra tu negocio para entrar al panel.' };
    }
    return { ok: true, data: sesionMock(cuenta, perfil.name || perfil.email.split('@')[0], modo ?? 'cliente') };
  },
  registrarNegocio: async (credential, datos) => {
    const perfil = leerCredencial(credential);
    if (!perfil) return { ok: false, status: 401, code: 'CREDENCIAL_INVALIDA', error: 'No pudimos leer tu cuenta de Google.' };
    const nit = datos.nit.replace(/\D/g, '');
    if (!razonSocialValida(datos.legalName)) return { ok: false, status: 400, code: 'RAZON_SOCIAL_INVALIDA', error: 'Escribe la razón social.' };
    if (problemaNit(datos.nit)) return { ok: false, status: 400, code: 'NIT_INVALIDO', error: problemaNit(datos.nit)! };
    if (!telefonoValido(datos.phone)) return { ok: false, status: 400, code: 'TELEFONO_INVALIDO', error: 'Teléfono inválido.' };
    if (!datos.acceptTerms) return { ok: false, status: 400, code: 'TERMINOS_REQUERIDOS', error: 'Debes aceptar los términos.' };
    const cuenta = cuentaDe(perfil.sub);
    const todos = negocios();
    if (Object.entries(todos).some(([c, n]) => n.nit === nit && c !== cuenta)) {
      return { ok: false, status: 409, code: 'NIT_EN_USO', error: 'Ese NIT ya está registrado en otra cuenta.' };
    }
    try {
      localStorage.setItem(NEGOCIOS, JSON.stringify({ ...todos, [cuenta]: { nit, legalName: datos.legalName.trim() } }));
    } catch {
      /* sin almacenamiento */
    }
    return { ok: true, data: sesionMock(cuenta, perfil.name || perfil.email.split('@')[0], 'negocio') };
  },
  cambiarModo: async (modo) => {
    const s = getSession();
    const cuenta = s?.id.slice(2);
    if (!s || !cuenta?.startsWith('g')) return { ok: false, status: 403, error: 'Esta sesión no puede cambiar de modo.' };
    if (modo === 'negocio' && !negocios()[cuenta]) {
      return { ok: false, status: 403, code: 'NEGOCIO_NO_REGISTRADO', error: 'Primero registra tu negocio.' };
    }
    return { ok: true, data: sesionMock(cuenta, s.name, modo) };
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
