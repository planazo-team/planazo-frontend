import { config } from '../config';
import { getSession } from '../session';
import type { ApiResult, ErrorCode } from '../types';
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

export const liveApi: Api = {
  listPlaces: (q = {}) => get(`/api/places${qs({ zone: q.zone, category: q.category })}`, []),
  getPlace: (id) => get(`/api/places/${encodeURIComponent(id)}`, null),
  reserve: (input) => call('POST', '/api/reservations', input),
  myReservations: () => get('/api/reservations/mine', []),

  activePromos: (zone) => get(`/api/promos${qs({ zone })}`, []),
  claimPromo: (id) => call('POST', `/api/promos/${encodeURIComponent(id)}/claim`),
  myCoupons: () => get('/api/promos/mine', []),

  plan: (text) => call('POST', '/api/plan', { text }),

  placeReservations: (placeId) => get(`/api/places/${encodeURIComponent(placeId)}/reservations`, []),
  updateSlotCapacity: ({ placeId, slotId, capacity, version }) =>
    call('PATCH', `/api/places/${encodeURIComponent(placeId)}/slots/${encodeURIComponent(slotId)}`, { capacity, version }),
  createEvent: (input) => call('POST', '/api/events', input),
  launchPromo: (input) => call('POST', '/api/promos', input),

  createRoom: () => call('POST', '/api/rooms'),
  joinRoom: (code) => call('POST', `/api/rooms/${encodeURIComponent(code)}/join`),
  startRoom: (code) => call('POST', `/api/rooms/${encodeURIComponent(code)}/start`),
  hallOfFame: () => get('/api/rooms/hall-of-fame', []),
};

/** Login de demo: el gateway firma un JWT fijo para el usuario semilla. */
export async function demoLogin(userId: string): Promise<string | undefined> {
  const r = await call<{ token: string }>('POST', '/api/auth/demo', { userId });
  return r.ok ? r.data.token : undefined;
}
