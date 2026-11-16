'use client';

import { useEffect, useState } from 'react';
import s from './estado.module.css';

/** Estado de un backend tal como lo reporta planazo-balancer. */
export interface BackendLb {
  id: string;
  sano: boolean;
  activas?: number;
  atendidas: number;
  errores: number;
  motivo: string | null;
}

export interface EstadoLb {
  lb: string;
  algoritmo: string;
  backends: BackendLb[];
}

interface EventoLb {
  t: string;
  lb: string;
  tipo: string;
  backend?: string;
  motivo?: string;
  metodo?: string;
  ruta?: string;
  status?: number;
  ms?: number;
  intentos?: number;
}

const MAX_EVENTOS = 60;

/** wss://host/ws → https://host (para pedir /__lb/* al balanceador de realtime). */
export function origenHttp(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.protocol = u.protocol === 'wss:' ? 'https:' : u.protocol === 'ws:' ? 'http:' : u.protocol;
    return u.origin;
  } catch {
    return null;
  }
}

function hora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-CO', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function textoEvento(e: EventoLb): string {
  switch (e.tipo) {
    case 'PETICION':
      return `${e.metodo} ${e.ruta} → ${e.backend} · ${e.status}${e.intentos && e.intentos > 1 ? ` (reintento: ${e.intentos} intentos)` : ''}`;
    case 'BACKEND_CAIDO':
      return `${e.backend} sale de rotación (${e.motivo})`;
    case 'BACKEND_ARRIBA':
      return `${e.backend} vuelve a rotación`;
    case 'FALLO_BACKEND':
      return `${e.backend} falló en ${e.metodo} ${e.ruta} (${e.motivo}); se intenta otro`;
    case 'SIN_BACKENDS':
      return 'sin backends sanos: 503';
    case 'WS_ABIERTO':
      return `WebSocket → ${e.backend}`;
    case 'WS_CERRADO':
      return `WebSocket cerrado en ${e.backend}`;
    default:
      return e.tipo;
  }
}

/**
 * Balanceadores PROPIOS (planazo-balancer): su estado y sus eventos en vivo por SSE.
 * - `fuentes`: orígenes de los balanceadores públicos (gateway y realtime).
 * - `internos`: estado de los balanceadores privados (booking, promo) que trae el gateway.
 * Si no hay balanceador delante (404), la sección no se muestra.
 */
export function Balanceadores({ fuentes, internos }: { fuentes: string[]; internos: EstadoLb[] }) {
  const [publicos, setPublicos] = useState<Record<string, EstadoLb>>({});
  const [eventos, setEventos] = useState<EventoLb[]>([]);

  useEffect(() => {
    const abiertas = fuentes.map((origen) => {
      const es = new EventSource(`${origen}/__lb/events`);
      es.addEventListener('estado', (m) => {
        const d = JSON.parse((m as MessageEvent<string>).data) as EstadoLb;
        setPublicos((p) => ({ ...p, [d.lb]: d }));
      });
      es.addEventListener('evento', (m) => {
        const e = JSON.parse((m as MessageEvent<string>).data) as EventoLb;
        setEventos((l) => [e, ...l].slice(0, MAX_EVENTOS));
      });
      return es;
    });
    return () => abiertas.forEach((es) => es.close());
  }, [fuentes]);

  const todos = [...Object.values(publicos), ...internos.filter((i) => !publicos[i.lb])];
  if (todos.length === 0) return null;

  return (
    <section className={s.lbs} aria-label="Balanceadores propios">
      <h2 className={s.lbsTitle}>Balanceadores propios</h2>
      <p className={s.cardSub}>
        planazo-balancer: código del equipo (round-robin, salud activa y pasiva, reintento). La plataforma solo corre los contenedores.
      </p>
      <div className={s.grid}>
        {todos.map((lb) => (
          <article key={lb.lb} className={s.card}>
            <h3 className={s.cardTitle}>{lb.lb}</h3>
            <p className={s.cardSub}>{lb.algoritmo}</p>
            <ul className={s.reps}>
              {lb.backends.map((b) => (
                <li key={b.id} className={b.sano ? s.rep : s.repCaida}>
                  <div className={s.repTop}>
                    <code className={s.repId}>{b.id}</code>
                    <span className={b.sano ? s.badgeOn : s.badgeOff}>{b.sano ? 'en rotación' : 'fuera de rotación'}</span>
                  </div>
                  <p className={s.repN}>
                    {b.atendidas} atendidas · {b.errores} errores{b.activas ? ` · ${b.activas} abiertas` : ''}
                    {!b.sano && b.motivo ? ` · ${b.motivo}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {eventos.length > 0 ? (
        <ol className={s.logList} aria-label="Eventos de los balanceadores">
          {eventos.map((e, i) => (
            <li key={`${e.t}-${i}`} className={e.tipo === 'BACKEND_CAIDO' || e.tipo === 'SIN_BACKENDS' || e.tipo === 'FALLO_BACKEND' ? s.logErr : s.logOk}>
              <span className={s.logT}>{hora(e.t)}</span>
              <span className={s.logN}>{e.lb}</span>
              <span>{textoEvento(e)}</span>
              <span className={s.logMs}>{typeof e.ms === 'number' ? `${e.ms} ms` : ''}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
