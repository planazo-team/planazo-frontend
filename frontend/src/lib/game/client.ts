import { Client, type StompSubscription } from '@stomp/stompjs';
import { config } from '../config';
import { mockGame } from '../mock/game';
import { realtime } from '../realtime';
import { getSession } from '../session';
import type { Direccion, EntradaLeaderboard, EstadoJuego, GameClient, GameHandlers, ResumenSala } from './types';

export type * from './types';

/* ------------------------------------------------------------------ */
/* live: REST por el gateway, STOMP directo contra planazo-game         */
/* ------------------------------------------------------------------ */

/** El servicio envuelve toda respuesta en `{ data }` y los errores en `{ codigo, mensaje }`. */
async function rest<T>(method: string, path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = getSession()?.token;
  try {
    const res = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: body?.mensaje || body?.message || body?.error || 'No pudimos completar la operación.' };
    }
    return { ok: true, data: (body?.data ?? body) as T };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor.' };
  }
}

/**
 * En producción los comandos van por STOMP directo a game (registrar la sesión,
 * mover), pero los snapshots de cada tick y la lista de salas los publica game
 * en el bus (`GAME.STATE_UPDATE` en `salas:<id>`, `LOBBY.ROOMS_UPDATE` en
 * `salas`) y llegan por el canal de realtime, igual que el resto de eventos.
 */
class LiveGameClient implements GameClient {
  private stomp: Client | null = null;
  private subSala: StompSubscription | null = null;
  private salaActual: string | null = null;
  private h: GameHandlers | null = null;
  private offs: Array<() => void> = [];
  private offTopicSala: (() => void) | null = null;

  async listarSalas() {
    const r = await rest<ResumenSala[]>('GET', '/api/salas');
    return r.ok ? r.data : [];
  }

  async unirse(salaId: string) {
    const r = await rest<ResumenSala>('POST', `/api/salas/${encodeURIComponent(salaId)}/jugadores`);
    return r.ok ? { ok: true as const, sala: r.data } : r;
  }

  async salir(salaId: string) {
    const me = getSession()?.id ?? '';
    await rest<void>('DELETE', `/api/salas/${encodeURIComponent(salaId)}/jugadores/${encodeURIComponent(me)}`);
  }

  async leaderboard(limite = 10) {
    const r = await rest<EntradaLeaderboard[]>('GET', `/api/leaderboard?limite=${limite}`);
    return r.ok ? r.data : [];
  }

  conectar(h: GameHandlers) {
    this.h = h;
    const token = getSession()?.token;
    if (!config.gameUrl || !token) {
      h.onConexion('desconectado');
      return;
    }
    h.onConexion('conectando');

    // Estado y salas: por el bus, vía realtime.
    const rt = realtime();
    this.offs = [
      rt.subscribe('salas'),
      rt.on('LOBBY.ROOMS_UPDATE', (e) => h.onSalas(e.payload as ResumenSala[])),
      rt.on('GAME.STATE_UPDATE', (e) => {
        const estado = e.payload as EstadoJuego;
        if (estado.salaId === this.salaActual) h.onEstado(estado);
      }),
    ];

    // El endpoint STOMP está publicado con SockJS; su transporte WebSocket nativo vive en /ws/websocket.
    this.stomp = new Client({
      brokerURL: `${config.gameUrl}/ws/websocket`,
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 2000,
      debug: () => {},
      onConnect: () => {
        h.onConexion('en_linea');
        this.stomp!.subscribe('/topic/salas', (m) => h.onSalas(JSON.parse(m.body) as ResumenSala[]));
        this.stomp!.subscribe('/user/queue/errores', (m) => h.onError(String(JSON.parse(m.body).mensaje ?? m.body)));
        // Reconexión: volver a la misma sala (SNK-07).
        if (this.salaActual) this.suscribirSala(this.salaActual);
      },
      onWebSocketClose: () => {
        this.subSala = null;
        h.onConexion('desconectado');
      },
      onStompError: (f) => h.onError(f.headers['message'] ?? 'Error de conexión con el juego.'),
    });
    this.stomp.activate();
  }

  conectado() {
    return !!this.stomp?.connected;
  }

  suscribirSala(salaId: string) {
    if (this.salaActual !== salaId) {
      this.offTopicSala?.();
      this.offTopicSala = realtime().subscribe(`salas:${salaId}`);
    }
    this.salaActual = salaId;
    if (!this.stomp?.connected) return;
    this.subSala?.unsubscribe();
    // Primero suscribirse y luego registrar la sesión: el servidor responde al
    // registro difundiendo el estado actual, que así llega a esta ventana.
    this.subSala = this.stomp.subscribe(`/topic/salas/${salaId}`, (m) => this.h?.onEstado(JSON.parse(m.body) as EstadoJuego));
    this.stomp.publish({ destination: `/app/salas/${salaId}/registrar-sesion`, body: '{}' });
  }

  desuscribirSala() {
    this.subSala?.unsubscribe();
    this.subSala = null;
    this.offTopicSala?.();
    this.offTopicSala = null;
    this.salaActual = null;
  }

  mover(direccion: Direccion) {
    if (!this.stomp?.connected || !this.salaActual) return;
    this.stomp.publish({ destination: `/app/salas/${this.salaActual}/mover`, body: JSON.stringify({ direccion }) });
  }

  cerrar() {
    this.desuscribirSala();
    this.offs.forEach((off) => off());
    this.offs = [];
    void this.stomp?.deactivate();
    this.stomp = null;
  }
}

/* ------------------------------------------------------------------ */
/* mock: el simulador del navegador hablando el mismo protocolo         */
/* ------------------------------------------------------------------ */

class MockGameClient implements GameClient {
  private h: GameHandlers | null = null;
  private salaActual: string | null = null;
  private off: (() => void) | null = null;
  private timer?: ReturnType<typeof setInterval>;

  private me() {
    const s = getSession();
    return { id: s?.id ?? 'anon', name: s?.name ?? 'Anónimo' };
  }

  async listarSalas() {
    return mockGame().listarSalas();
  }

  async unirse(salaId: string) {
    const r = mockGame().unirseSala(salaId, this.me());
    return r.ok ? { ok: true as const, sala: r.sala } : { ok: false as const, error: r.error };
  }

  async salir(salaId: string) {
    mockGame().salirSala(salaId, this.me().id);
  }

  async leaderboard(limite = 10) {
    return mockGame().leaderboardGlobal(limite);
  }

  conectar(h: GameHandlers) {
    this.h = h;
    h.onConexion('conectando');
    setTimeout(() => {
      h.onConexion('en_linea');
      h.onSalas(mockGame().listarSalas());
    }, 300);
    // El simulador no tiene canal de salas: se consulta cada segundo.
    this.timer = setInterval(() => h.onSalas(mockGame().listarSalas()), 1000);
  }

  conectado() {
    return !!this.h;
  }

  suscribirSala(salaId: string) {
    this.off?.();
    this.salaActual = salaId;
    this.off = mockGame().conectarSala(salaId, this.me().id, (e) => this.h?.onEstado(e));
  }

  desuscribirSala() {
    this.off?.();
    this.off = null;
    this.salaActual = null;
  }

  mover(direccion: Direccion) {
    if (this.salaActual) mockGame().moverSala(this.salaActual, this.me().id, direccion);
  }

  cerrar() {
    clearInterval(this.timer);
    this.desuscribirSala();
    this.h = null;
  }
}

export function crearGameClient(): GameClient {
  return config.mode === 'live' ? new LiveGameClient() : new MockGameClient();
}
