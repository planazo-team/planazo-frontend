'use client';

import { useSyncExternalStore } from 'react';

/**
 * Sesión: se entra únicamente con Google. El gateway verifica el ID token,
 * booking guarda la cuenta y el gateway firma el JWT de Planazo (POST
 * /api/auth/google). Una cuenta, dos modos: `role` es el modo activo
 * (cliente o negocio); el modo negocio se activa registrando el negocio. La sesión se
 * guarda en localStorage: al recargar sigues adentro hasta que cierres sesión
 * o el token venza.
 */

export type Role = 'cliente' | 'negocio';

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  /** Solo para negocio: el establecimiento que administra (si ya lo creó). */
  placeId?: string;
  /** Si la cuenta tiene el modo negocio activado (puede cambiar a modo negocio). */
  negocio?: boolean;
  token?: string;
}

const KEY = 'planazo.session';
const listeners = new Set<() => void>();
let cached: SessionUser | null | undefined;

function read(): SessionUser | null {
  if (cached !== undefined) return cached;
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function getSession(): SessionUser | null {
  return read();
}

export function setSession(user: SessionUser | null) {
  cached = user;
  try {
    if (user) window.localStorage.setItem(KEY, JSON.stringify(user));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* almacenamiento bloqueado: la sesión vive solo en memoria */
  }
  listeners.forEach((l) => l());
}

/** Actualiza campos de la sesión actual (p. ej. el token nuevo al crear el negocio). */
export function patchSession(p: Partial<SessionUser>) {
  const cur = read();
  if (cur) setSession({ ...cur, ...p });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** `undefined` mientras se hidrata; `null` si no hay sesión. */
export function useSession(): SessionUser | null | undefined {
  return useSyncExternalStore(subscribe, read, () => undefined);
}
