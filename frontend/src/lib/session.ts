'use client';

import { useSyncExternalStore } from 'react';

/**
 * Sesión del MVP: se entra solo con el nombre. Cada navegador tiene un id de
 * dispositivo estable (localStorage), así que al recargar o volver otro día
 * sigues siendo la misma persona, con tus reservas, cupones y tu negocio.
 * En modo live el gateway firma el JWT (POST /api/auth/login).
 */

export type Role = 'cliente' | 'negocio';

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  /** Solo para negocio: el establecimiento que administra (si ya lo creó). */
  placeId?: string;
  token?: string;
}

const KEY = 'planazo.session';
const DEVICE_KEY = 'planazo.device';
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

let deviceMemo: string | null = null;

/** Id estable de este navegador: 20 caracteres alfanuméricos. */
export function deviceId(): string {
  if (deviceMemo) return deviceMemo;
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);
    if (saved && /^[A-Za-z0-9]{8,40}$/.test(saved)) return (deviceMemo = saved);
  } catch {
    /* sin almacenamiento */
  }
  const A = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  deviceMemo = Array.from(bytes, (b) => A[b % A.length]).join('');
  try {
    window.localStorage.setItem(DEVICE_KEY, deviceMemo);
  } catch {
    /* sin almacenamiento: dura lo que la pestaña */
  }
  return deviceMemo;
}

/** Mismo formato de id que firma el gateway: `c-<dispositivo>` o `n-<dispositivo>`. */
export function localUserId(role: Role): string {
  return `${role === 'negocio' ? 'n' : 'c'}-${deviceId()}`;
}

/** Letras (con tildes), números, espacios y algo de puntuación; de 2 a 30 caracteres. */
export const NOMBRE_VALIDO = /^[\p{L}\p{N} .'\-_]{2,30}$/u;

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** `undefined` mientras se hidrata; `null` si no hay sesión. */
export function useSession(): SessionUser | null | undefined {
  return useSyncExternalStore(subscribe, read, () => undefined);
}
