import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RtEvent } from '../types';
import { gateway, uid } from '../mock/gateway';
import { RealtimeClient, type ClientMsg, type Transport, type TransportHandlers } from './client';
import { wsTransport } from './ws';

const ev = (seq: number, id = `e${seq}`, type = 'PROMO.PUSH'): RtEvent =>
  ({ seq, id, type, payload: { n: seq }, topics: ['zone:zona-g'], at: 0 }) as RtEvent;

/** Transporte de prueba: la prueba decide cuándo abre, cierra o llegan eventos. */
function transporteFalso() {
  let h!: TransportHandlers;
  const enviados: ClientMsg[] = [];
  const t: Transport = {
    connect: (handlers) => (h = handlers),
    send: (m) => enviados.push(m),
    close: () => {},
  };
  return { t, enviados, h: () => h };
}

describe('RealtimeClient (RT-2)', () => {
  it('al abrir por primera vez se suscribe a los tópicos pedidos antes', () => {
    const { t, enviados, h } = transporteFalso();
    const rt = new RealtimeClient(t);
    rt.subscribe('zone:zona-g');
    rt.subscribe('zone:zona-g'); // contado dos veces, se envía una
    expect(rt.getStatus().state).toBe('connecting');
    h().onOpen();
    expect(enviados).toEqual([{ type: 'SUBSCRIBE', topic: 'zone:zona-g' }]);
    expect(rt.getStatus().state).toBe('online');
  });

  it('suscribirse en línea envía SUBSCRIBE; la última baja envía UNSUBSCRIBE una sola vez', () => {
    const { t, enviados, h } = transporteFalso();
    const rt = new RealtimeClient(t);
    h().onOpen();
    const baja1 = rt.subscribe('place:p1');
    const baja2 = rt.subscribe('place:p1');
    baja1();
    baja1(); // repetir la baja no hace nada
    expect(enviados).toEqual([{ type: 'SUBSCRIBE', topic: 'place:p1' }]);
    baja2();
    expect(enviados.at(-1)).toEqual({ type: 'UNSUBSCRIBE', topic: 'place:p1' });
  });

  it('entrega cada evento una sola vez, por tipo y a los comodines', () => {
    const { t, h } = transporteFalso();
    const rt = new RealtimeClient(t);
    const porTipo = vi.fn();
    const todos = vi.fn();
    const off = rt.on('PROMO.PUSH', porTipo);
    rt.on('*', todos);
    h().onEvent(ev(1));
    h().onEvent(ev(1)); // reentrega: se descarta
    h().onEvent(ev(0, 'efimero', 'GAME.STATE_UPDATE')); // seq 0: efímero, siempre pasa
    expect(porTipo).toHaveBeenCalledTimes(1);
    expect(todos).toHaveBeenCalledTimes(2);
    expect(rt.getStatus()).toMatchObject({ lastSeq: 1, duplicates: 1 });
    off();
    h().onEvent(ev(2));
    expect(porTipo).toHaveBeenCalledTimes(1);
  });

  it('al reconectar pide RESUME desde el último seq y cuenta lo recuperado', () => {
    const { t, enviados, h } = transporteFalso();
    const rt = new RealtimeClient(t);
    const estados: string[] = [];
    const offEstado = rt.onStatus((s) => estados.push(s.state));
    rt.subscribe('zone:zona-g');
    h().onOpen();
    h().onEvent(ev(3));
    h().onClose();
    h().onOpen();
    expect(enviados.at(-1)).toEqual({ type: 'RESUME', last_seq: 3, topics: ['zone:zona-g'] });
    h().onReplay([ev(3), ev(4), ev(5)]);
    expect(rt.getStatus()).toMatchObject({ recovered: 2, lastSeq: 5 });
    expect(estados).toContain('offline');
    offEstado();
  });

  it('olvida los ids más viejos para no crecer sin límite', () => {
    const { t, h } = transporteFalso();
    const rt = new RealtimeClient(t);
    for (let i = 1; i <= 1001; i++) h().onEvent(ev(i));
    h().onEvent(ev(1)); // ya olvidado: se entrega otra vez
    expect(rt.getStatus().duplicates).toBe(0);
  });

  it('solo el transporte simulado permite cortar la conexión', () => {
    const { t } = transporteFalso();
    expect(new RealtimeClient(t).canSimulateDrop()).toBe(false);
    const drop = vi.fn();
    const rt = new RealtimeClient({ ...t, simulateDrop: drop });
    expect(rt.canSimulateDrop()).toBe(true);
    rt.simulateDrop(500);
    expect(drop).toHaveBeenCalledWith(500);
  });
});

describe('gateway simulado', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('difunde solo a quien está suscrito y reenvía lo perdido al reanudar', async () => {
    const t = gateway().transport();
    const recibidos: RtEvent[] = [];
    const replays: RtEvent[][] = [];
    const h: TransportHandlers = { onOpen: vi.fn(), onClose: vi.fn(), onEvent: (e) => recibidos.push(e), onReplay: (r) => replays.push(r) };
    t.connect(h);
    t.send({ type: 'SUBSCRIBE', topic: 'x' }); // aún no conecta: se ignora
    await vi.advanceTimersByTimeAsync(250);
    expect(h.onOpen).toHaveBeenCalled();
    t.send({ type: 'SUBSCRIBE', topic: 'zone:zona-g' });

    const e1 = gateway().publish('PROMO.PUSH', {}, ['zone:zona-g']);
    gateway().publish('PROMO.PUSH', {}, ['zone:zona-t']);
    await vi.advanceTimersByTimeAsync(0);
    expect(recibidos.map((e) => e.id)).toEqual([e1.id]);

    t.simulateDrop!(1000);
    expect(h.onClose).toHaveBeenCalled();
    t.simulateDrop!(1000); // ya caído: nada
    const perdido = gateway().publish('PROMO.PUSH', {}, ['zone:zona-g']);
    await vi.advanceTimersByTimeAsync(1100);
    t.send({ type: 'RESUME', last_seq: e1.seq, topics: ['zone:zona-g'] });
    await vi.advanceTimersByTimeAsync(200);
    // Al menos una vez: el último llega repetido para probar la deduplicación del cliente.
    expect(replays[0].map((e) => e.id)).toEqual([perdido.id, perdido.id]);

    t.send({ type: 'RESUME', last_seq: perdido.seq, topics: ['zone:zona-g'] });
    await vi.advanceTimersByTimeAsync(200);
    expect(replays[1]).toEqual([]);

    t.send({ type: 'UNSUBSCRIBE', topic: 'zone:zona-g' });
    gateway().publish('PROMO.PUSH', {}, ['zone:zona-g']);
    await vi.advanceTimersByTimeAsync(0);
    expect(recibidos).toHaveLength(1);
    t.close();
  });

  it('genera ids únicos aunque no haya randomUUID', () => {
    expect(uid()).not.toBe(uid());
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    expect(uid()).toMatch(/^[a-z0-9]+-[a-z0-9]{8}$/);
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
  });
});

/** WebSocket de mentiras para probar el transporte sin red. */
class SocketFalso {
  static OPEN = 1;
  static ultimos: SocketFalso[] = [];
  readyState = 0;
  enviados: string[] = [];
  onopen?: () => void;
  onmessage?: (m: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor(public url: string) {
    SocketFalso.ultimos.push(this);
  }
  send(d: string) {
    this.enviados.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  abrir() {
    this.readyState = 1;
    this.onopen?.();
  }
}

describe('transporte WebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    SocketFalso.ultimos = [];
    vi.stubGlobal('WebSocket', SocketFalso);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('se autentica en el primer mensaje, entrega eventos y replays, y reconecta con backoff', async () => {
    const h: TransportHandlers = { onOpen: vi.fn(), onClose: vi.fn(), onEvent: vi.fn(), onReplay: vi.fn() };
    const t = wsTransport('ws://rt/ws', () => 'tok');
    t.connect(h);
    const s = SocketFalso.ultimos[0];
    t.send({ type: 'SUBSCRIBE', topic: 'a' }); // aún cerrado: no se envía
    s.abrir();
    expect(JSON.parse(s.enviados[0])).toEqual({ type: 'AUTH', token: 'tok' });
    t.send({ type: 'SUBSCRIBE', topic: 'a' });
    expect(s.enviados).toHaveLength(2);

    s.onmessage!({ data: JSON.stringify({ type: 'EVENT', event: ev(1) }) });
    s.onmessage!({ data: JSON.stringify({ type: 'REPLAY', events: [ev(2)] }) });
    s.onmessage!({ data: 'no es json' });
    s.onmessage!({ data: JSON.stringify({ type: 'OTRO' }) });
    expect(h.onEvent).toHaveBeenCalledTimes(1);
    expect(h.onReplay).toHaveBeenCalledTimes(1);

    s.onerror!(); // un error cierra el socket y programa el reintento
    expect(h.onClose).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(900);
    expect(SocketFalso.ultimos).toHaveLength(2);

    t.close();
    expect(SocketFalso.ultimos[1].readyState).toBe(3);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(SocketFalso.ultimos).toHaveLength(2); // cerrado a propósito: no reintenta
  });

  it('sin token no manda AUTH', () => {
    const h: TransportHandlers = { onOpen: vi.fn(), onClose: vi.fn(), onEvent: vi.fn(), onReplay: vi.fn() };
    wsTransport('ws://rt/ws', () => undefined).connect(h);
    SocketFalso.ultimos[0].abrir();
    expect(SocketFalso.ultimos[0].enviados).toEqual([]);
    expect(h.onOpen).toHaveBeenCalled();
  });
});
