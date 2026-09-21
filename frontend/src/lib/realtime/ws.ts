import type { RtEvent } from '../types';
import type { ClientMsg, Transport, TransportHandlers } from './client';

/**
 * Transporte WebSocket contra el Realtime Gateway (modo live).
 *
 * Protocolo:
 *   cliente → servidor   AUTH · SUBSCRIBE · UNSUBSCRIBE · RESUME
 *   servidor → cliente   { type: 'EVENT', event }  ·  { type: 'REPLAY', events }
 *
 * El token viaja en el primer mensaje y no en la URL, para que no quede en logs de acceso.
 * Reconecta sola con backoff exponencial; el RealtimeClient se encarga del RESUME.
 */

type ServerMsg = { type: 'EVENT'; event: RtEvent } | { type: 'REPLAY'; events: RtEvent[] };

export function wsTransport(url: string, getToken: () => string | undefined): Transport {
  let ws: WebSocket | null = null;
  let handlers: TransportHandlers | null = null;
  let stopped = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    if (stopped || !handlers) return;
    const h = handlers;
    const sock = new WebSocket(url);
    ws = sock;

    sock.onopen = () => {
      attempt = 0;
      const token = getToken();
      if (token) sock.send(JSON.stringify({ type: 'AUTH', token } satisfies ClientMsg));
      h.onOpen();
    };

    sock.onmessage = (m) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(m.data)) as ServerMsg;
      } catch {
        return;
      }
      if (msg.type === 'EVENT') h.onEvent(msg.event);
      else if (msg.type === 'REPLAY') h.onReplay(msg.events);
    };

    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      h.onClose();
      if (stopped) return;
      const delay = Math.min(10_000, 500 * 2 ** attempt++) + Math.random() * 300;
      retry = setTimeout(open, delay);
    };

    sock.onerror = () => sock.close();
  };

  return {
    connect(h) {
      handlers = h;
      open();
    },
    send(m) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    },
    close() {
      stopped = true;
      clearTimeout(retry);
      ws?.close();
      ws = null;
    },
  };
}
