import { config } from '../config';
import { esCredencialFirebase, esSesionFirebase } from '../firebase';
import { getSession, setSession, type SessionUser } from '../session';
import type { ApiResult, ErrorCode, Place, PlaceDetail, Promo } from '../types';
import { mockApi } from './mock';
import type { Api } from './types';

/**
 * Implementación contra el API Gateway real. Las rutas siguen docs/arquitectura.md.
 * Los 409 no son excepciones: llegan como `{ ok: false, code }` para que la UI los explique.
 */

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const token = getSession()?.token;
  try {
    const res = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      // Token vencido o firmado con otro secreto: se cierra la sesión y se vuelve a entrar con Google.
      // Un código de dos pasos equivocado también es 401, pero la sesión sigue siendo válida.
      const deDosPasos = typeof data?.code === 'string' && data.code.startsWith('2FA_');
      if (res.status === 401 && token && !esSesionFirebase(token) && !deDosPasos && !path.startsWith('/api/auth/google')) {
        setSession(null);
      }
      return {
        ok: false,
        status: res.status,
        error: (data && (data.message || data.error)) || 'No pudimos completar la operación.',
        code: data?.code as ErrorCode | undefined,
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, code: 'SIN_CONEXION', error: 'Sin conexión con el servidor.' };
  }
}

/** Para lecturas: si fallan devolvemos un valor vacío y la UI muestra su estado vacío. */
async function get<T>(path: string, fallback: T): Promise<T> {
  const r = await call<T>('GET', path);
  return r.ok ? r.data : fallback;
}

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

type AuthResponse = {
  token: string;
  user: { id: string; name: string; role: SessionUser['role']; placeId: string | null; negocio?: boolean };
};

const toSession = (r: AuthResponse): SessionUser => ({
  id: r.user.id,
  name: r.user.name,
  role: r.user.role,
  ...(r.user.placeId ? { placeId: r.user.placeId } : {}),
  negocio: r.user.negocio === true,
  token: r.token,
});

export const liveApi: Api = {
  loginGoogle: async (credential, modo, codigo) => {
    if (esCredencialFirebase(credential)) return mockApi.loginGoogle(credential, modo, codigo);
    const r = await call<AuthResponse>('POST', '/api/auth/google', { credential, ...(modo ? { modo } : {}), ...(codigo ? { codigo } : {}) });
    return r.ok ? { ok: true, data: toSession(r.data) } : r;
  },
  registrarNegocio: async (credential, datos) => {
    if (esCredencialFirebase(credential)) return mockApi.registrarNegocio(credential, datos);
    const r = await call<AuthResponse>('POST', '/api/auth/negocio/registro', { credential, ...datos });
    return r.ok ? { ok: true, data: toSession(r.data) } : r;
  },
  cambiarModo: async (modo, codigo) => {
    if (esSesionFirebase()) return mockApi.cambiarModo(modo, codigo);
    const r = await call<AuthResponse>('POST', '/api/auth/modo', { modo, ...(codigo ? { codigo } : {}) });
    return r.ok ? { ok: true, data: toSession(r.data) } : r;
  },
  dosPasos: {
    estado: () => (esSesionFirebase() ? mockApi.dosPasos.estado() : call('GET', '/api/auth/2fa')),
    iniciar: () => (esSesionFirebase() ? mockApi.dosPasos.iniciar() : call('POST', '/api/auth/2fa/iniciar')),
    confirmar: (codigo) => (esSesionFirebase() ? mockApi.dosPasos.confirmar(codigo) : call('POST', '/api/auth/2fa/confirmar', { codigo })),
  },
  createBusiness: async (input) => {
    if (esSesionFirebase()) return mockApi.createBusiness(input);
    const r = await call<AuthResponse & { place: Place }>('POST', '/api/auth/negocio', input);
    return r.ok ? { ok: true, data: { place: r.data.place, user: toSession(r.data) } } : r;
  },

  listPlaces: (q = {}) => (esSesionFirebase() ? mockApi.listPlaces(q) : get(`/api/places${qs({ zone: q.zone, category: q.category })}`, [])),
  getPlace: async (id) => {
    if (esSesionFirebase()) return mockApi.getPlace(id);
    const place = await get<PlaceDetail | null>(`/api/places/${encodeURIComponent(id)}`, null);
    if (!place) return null;
    // booking no conoce las promociones (docs/arquitectura.md, nota de GET /places/:id):
    // la ficha se completa con las activas de promo, filtradas por este lugar.
    const promos = await get<Promo[]>(`/api/promos${qs({ zone: place.zone })}`, []);
    return { ...place, promos: promos.filter((p) => p.placeId === place.id) };
  },
  reserve: (input) => (esSesionFirebase() ? mockApi.reserve(input) : call('POST', '/api/reservations', input)),
  myReservations: () => (esSesionFirebase() ? mockApi.myReservations() : get('/api/reservations/mine', [])),
  cancelReservation: (id) => (esSesionFirebase() ? mockApi.cancelReservation(id) : call('DELETE', `/api/reservations/${encodeURIComponent(id)}`)),

  activePromos: (zone) => (esSesionFirebase() ? mockApi.activePromos(zone) : get(`/api/promos${qs({ zone })}`, [])),
  claimPromo: (id) => (esSesionFirebase() ? mockApi.claimPromo(id) : call('POST', `/api/promos/${encodeURIComponent(id)}/claim`)),
  myCoupons: () => (esSesionFirebase() ? mockApi.myCoupons() : get('/api/promos/mine', [])),

  plan: (text) => (esSesionFirebase() ? mockApi.plan(text) : call('POST', '/api/plan', { text })),

  placeReservations: (placeId) =>
    esSesionFirebase() ? mockApi.placeReservations(placeId) : get(`/api/places/${encodeURIComponent(placeId)}/reservations`, []),
  updateSlotCapacity: (input) =>
    esSesionFirebase()
      ? mockApi.updateSlotCapacity(input)
      : call('PATCH', `/api/places/${encodeURIComponent(input.placeId)}/slots/${encodeURIComponent(input.slotId)}`, {
          capacity: input.capacity,
          version: input.version,
        }),
  createEvent: (input) => (esSesionFirebase() ? mockApi.createEvent(input) : call('POST', '/api/events', input)),
  launchPromo: (input) => (esSesionFirebase() ? mockApi.launchPromo(input) : call('POST', '/api/promos', input)),
};
