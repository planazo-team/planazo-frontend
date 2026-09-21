import type { RtEvent } from '../types';

/**
 * Cliente de tiempo real. Implementa la mitad de RT-2 que le corresponde al frontend:
 *
 *  1. Recuerda el último `seq` recibido.
 *  2. Al reconectar pide RESUME desde ese `seq`, así el servidor reenvía solo lo perdido.
 *  3. Descarta por `id` los eventos que ya vio: una reentrega nunca se muestra dos veces.
 *
 * El transporte es intercambiable: WebSocket real en modo live, gateway simulado en modo mock.
 */

export type ConnState = 'connecting' | 'online' | 'offline';

export interface ConnStatus {
  state: ConnState;
  lastSeq: number;
  /** Eventos nuevos recuperados en la última reconexión. */
  recovered: number;
  /** Duplicados descartados desde que se abrió la app. */
  duplicates: number;
  /** Cuándo cambió `state` por última vez (epoch ms). */
  changedAt: number;
}

export type ClientMsg =
  | { type: 'AUTH'; token: string }
  | { type: 'SUBSCRIBE'; topic: string }
  | { type: 'UNSUBSCRIBE'; topic: string }
  | { type: 'RESUME'; last_seq: number; topics: string[] };

export interface TransportHandlers {
  onOpen(): void;
  onClose(): void;
  onEvent(e: RtEvent): void;
  onReplay(events: RtEvent[]): void;
}

export interface Transport {
  connect(h: TransportHandlers): void;
  send(m: ClientMsg): void;
  close(): void;
  /** Solo en modo demo: corta la conexión durante `ms` para probar la recuperación. */
  simulateDrop?(ms: number): void;
}

type Handler = (e: RtEvent) => void;

/** Cuántos ids recientes se recuerdan para deduplicar. */
const SEEN_LIMIT = 1000;

export class RealtimeClient {
  private lastSeq = 0;
  private seenOrder: string[] = [];
  private seen = new Set<string>();
  private topics = new Map<string, number>();
  private handlers = new Map<string, Set<Handler>>();
  private listeners = new Set<(s: ConnStatus) => void>();
  private everOpened = false;
  private status: ConnStatus = {
    state: 'connecting',
    lastSeq: 0,
    recovered: 0,
    duplicates: 0,
    changedAt: Date.now(),
  };

  constructor(private readonly transport: Transport) {
    transport.connect({
      onOpen: () => this.handleOpen(),
      onClose: () => this.patch({ state: 'offline' }),
      onEvent: (e) => {
        this.deliver(e);
      },
      onReplay: (events) => {
        let fresh = 0;
        for (const e of events) if (this.deliver(e)) fresh++;
        this.patch({ recovered: fresh });
      },
    });
  }

  /** Se suscribe a un tópico (`zone:zona-g`, `place:p7`, `user:u1`, `room:ABCD`). Devuelve la baja. */
  subscribe(topic: string): () => void {
    const n = this.topics.get(topic) ?? 0;
    this.topics.set(topic, n + 1);
    if (n === 0 && this.status.state === 'online') this.transport.send({ type: 'SUBSCRIBE', topic });

    let done = false;
    return () => {
      if (done) return;
      done = true;
      const left = (this.topics.get(topic) ?? 1) - 1;
      if (left > 0) {
        this.topics.set(topic, left);
        return;
      }
      this.topics.delete(topic);
      if (this.status.state === 'online') this.transport.send({ type: 'UNSUBSCRIBE', topic });
    };
  }

  /** Escucha un tipo de evento, o `*` para todos. */
  on(type: string, fn: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
    };
  }

  getStatus(): ConnStatus {
    return this.status;
  }

  onStatus(fn: (s: ConnStatus) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  canSimulateDrop(): boolean {
    return typeof this.transport.simulateDrop === 'function';
  }

  simulateDrop(ms: number) {
    this.transport.simulateDrop?.(ms);
  }

  private handleOpen() {
    const topics = [...this.topics.keys()];
    if (this.everOpened) {
      // Reconexión: pedir solo lo que falta desde el último seq conocido.
      this.transport.send({ type: 'RESUME', last_seq: this.lastSeq, topics });
    } else {
      for (const t of topics) this.transport.send({ type: 'SUBSCRIBE', topic: t });
    }
    this.everOpened = true;
    this.patch({ state: 'online' });
  }

  /** Entrega un evento. Devuelve `false` si era un duplicado. */
  private deliver(e: RtEvent): boolean {
    if (this.seen.has(e.id)) {
      this.patch({ duplicates: this.status.duplicates + 1 });
      return false;
    }
    this.seen.add(e.id);
    this.seenOrder.push(e.id);
    if (this.seenOrder.length > SEEN_LIMIT) this.seen.delete(this.seenOrder.shift()!);

    if (e.seq > this.lastSeq) this.lastSeq = e.seq;
    this.patch({ lastSeq: this.lastSeq });

    this.handlers.get(e.type)?.forEach((h) => h(e));
    this.handlers.get('*')?.forEach((h) => h(e));
    return true;
  }

  private patch(p: Partial<ConnStatus>) {
    const stateChanged = p.state !== undefined && p.state !== this.status.state;
    this.status = { ...this.status, ...p, changedAt: stateChanged ? Date.now() : this.status.changedAt };
    this.listeners.forEach((l) => l(this.status));
  }
}
