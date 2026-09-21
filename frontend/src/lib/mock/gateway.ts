import type { EventType, RtEvent } from '../types';
import type { Transport, TransportHandlers } from '../realtime/client';

/**
 * Realtime Gateway simulado (modo mock). Reproduce el comportamiento del servicio real:
 *
 *  - Todo evento se guarda en un registro con `seq` global y `id` único.
 *  - Se difunde solo a las conexiones suscritas a alguno de sus tópicos.
 *  - Ante RESUME reenvía únicamente lo posterior al `seq` del cliente.
 *
 * `simulateDrop` corta la conexión: los eventos se siguen registrando pero no se entregan,
 * que es exactamente lo que pasa cuando al usuario se le cae la señal.
 */

const LOG_LIMIT = 5000;

interface Conn {
  topics: Set<string>;
  online: boolean;
  h: TransportHandlers;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

class MockGateway {
  private log: RtEvent[] = [];
  private seq = 0;
  private conns = new Set<Conn>();

  publish<T>(type: EventType, payload: T, topics: string[]): RtEvent<T> {
    const e: RtEvent<T> = { seq: ++this.seq, id: uid(), type, payload, topics, at: Date.now() };
    this.log.push(e as RtEvent);
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
    for (const c of this.conns) {
      if (c.online && topics.some((t) => c.topics.has(t))) {
        queueMicrotask(() => c.h.onEvent(e as RtEvent));
      }
    }
    return e;
  }

  transport(): Transport {
    let conn: Conn | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;

    const goOnline = () => {
      if (!conn) return;
      conn.online = true;
      conn.h.onOpen();
    };

    return {
      connect: (h) => {
        conn = { topics: new Set(), online: false, h };
        this.conns.add(conn);
        setTimeout(goOnline, 200); // handshake simulado
      },

      send: (m) => {
        const c = conn;
        if (!c || !c.online) return;
        if (m.type === 'SUBSCRIBE') c.topics.add(m.topic);
        else if (m.type === 'UNSUBSCRIBE') c.topics.delete(m.topic);
        else if (m.type === 'RESUME') {
          c.topics = new Set(m.topics);
          const missed = this.log.filter((e) => e.seq > m.last_seq && e.topics.some((t) => c.topics.has(t)));
          // Una red real entrega "al menos una vez": un reintento puede duplicar el último evento.
          // Lo simulamos para que la deduplicación por id del cliente sea visible.
          const replay = missed.length ? [...missed, missed[missed.length - 1]] : [];
          setTimeout(() => c.h.onReplay(replay), 150);
        }
      },

      simulateDrop: (ms) => {
        const c = conn;
        if (!c || !c.online) return;
        c.online = false;
        c.h.onClose();
        clearTimeout(reconnect);
        reconnect = setTimeout(goOnline, ms);
      },

      close: () => {
        clearTimeout(reconnect);
        if (conn) this.conns.delete(conn);
        conn = null;
      },
    };
  }
}

type G = typeof globalThis & { __planazoGateway?: MockGateway };

/** Una sola instancia por pestaña, aunque el módulo se recargue en desarrollo. */
export function gateway(): MockGateway {
  const g = globalThis as G;
  return (g.__planazoGateway ??= new MockGateway());
}
