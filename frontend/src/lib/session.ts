'use client';

import { useSyncExternalStore } from 'react';

/**
 * Autenticación hardcodeada para el MVP (ver README): usuarios semilla,
 * sin registro ni recuperación de contraseña. En modo live el gateway
 * emite un JWT fijo para cada uno de ellos.
 */

export type Role = 'cliente' | 'negocio';

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  /** Solo para negocio: el establecimiento que administra. */
  placeId?: string;
  token?: string;
}

export const DEMO_USERS: SessionUser[] = [
  { id: 'u1', name: 'Juan Diego', role: 'cliente' },
  { id: 'u2', name: 'Valentina', role: 'cliente' },
  { id: 'u3', name: 'Camilo', role: 'cliente' },
  { id: 'u4', name: 'Sara', role: 'cliente' },
  { id: 'u5', name: 'Andrés', role: 'cliente' },
  { id: 'u6', name: 'Laura', role: 'cliente' },
  { id: 'b1', name: 'Bar El Zaguán', role: 'negocio', placeId: 'p7' },
  { id: 'b2', name: 'Fideos de la Nona', role: 'negocio', placeId: 'p1' },
  { id: 'b3', name: 'Terraza 85', role: 'negocio', placeId: 'p8' },
];

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

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** `undefined` mientras se hidrata; `null` si no hay sesión. */
export function useSession(): SessionUser | null | undefined {
  return useSyncExternalStore(subscribe, read, () => undefined);
}
