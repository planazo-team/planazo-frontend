import { config } from '../config';
import { mockGame } from '../mock/game';
import { getSession } from '../session';
import type { Dir, GameState } from '../types';

/**
 * Canal de la partida. Va aparte del registro de eventos porque su perfil es otro:
 * el estado se emite a 20 Hz y es efímero, no tiene sentido guardarlo ni reenviarlo.
 *
 * El cliente solo envía intenciones (`INTENT`). Nunca posiciones: el servidor es la autoridad.
 */
export interface GameConnection {
  sendIntent(dir: Dir): void;
  close(): void;
}

export function connectGame(
  code: string,
  playerId: string,
  onState: (s: GameState) => void,
  onError?: (msg: string) => void,
): GameConnection {
  if (config.mode === 'mock') {
    const c = mockGame().connect(code, playerId, onState);
    if (!c) {
      onError?.('No existe una sala con ese código.');
      return { sendIntent: () => {}, close: () => {} };
    }
    return c;
  }

  // live: WS /rooms/:code/play en game-service
  let closed = false;
  const ws = new WebSocket(`${config.gameUrl}/rooms/${encodeURIComponent(code)}/play`);
  ws.onopen = () => {
    const token = getSession()?.token;
    if (token) ws.send(JSON.stringify({ type: 'AUTH', token }));
  };
  ws.onmessage = (m) => {
    try {
      const msg = JSON.parse(String(m.data));
      if (msg.type === 'STATE') onState(msg.state as GameState);
      else if (msg.type === 'ERROR') onError?.(String(msg.message));
    } catch {
      /* mensaje malformado: se ignora */
    }
  };
  ws.onclose = () => {
    if (!closed) onError?.('Se perdió la conexión con la partida.');
  };
  return {
    sendIntent: (dir) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'INTENT', dir }));
    },
    close: () => {
      closed = true;
      ws.close();
    },
  };
}
