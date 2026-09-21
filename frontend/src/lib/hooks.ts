'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { realtime, type ConnStatus } from './realtime';
import type { EventType, RtEvent } from './types';

const OFFLINE: ConnStatus = { state: 'connecting', lastSeq: 0, recovered: 0, duplicates: 0, changedAt: 0 };

/** Estado de la conexión de tiempo real, para mostrarlo en la interfaz. */
export function useConnStatus(): ConnStatus {
  return useSyncExternalStore(
    (fn) => realtime().onStatus(fn),
    () => realtime().getStatus(),
    () => OFFLINE,
  );
}

/** Mantiene una suscripción mientras el componente está montado. */
export function useTopics(topics: Array<string | null | undefined>) {
  const key = topics.filter(Boolean).join('|');
  useEffect(() => {
    if (!key) return;
    const offs = key.split('|').map((t) => realtime().subscribe(t));
    return () => offs.forEach((off) => off());
  }, [key]);
}

/** Escucha eventos de ciertos tipos. El handler siempre es el más reciente. */
export function useRtEvent<T = unknown>(types: EventType[], handler: (e: RtEvent<T>) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  const key = types.join('|');
  useEffect(() => {
    const offs = key.split('|').map((t) => realtime().on(t, (e) => ref.current(e as RtEvent<T>)));
    return () => offs.forEach((off) => off());
  }, [key]);
}

/** Reloj que se actualiza cada `ms`: para cuentas regresivas. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
