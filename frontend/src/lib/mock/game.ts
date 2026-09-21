import type { ApiResult, Dir, GamePlayer, GameState, HallEntry, LeaderEntry, Point, Room } from '../types';
import { gateway } from './gateway';

/**
 * game-service simulado (modo mock). Replica lo que hace el servicio real:
 *
 *  - RT-3: el servidor es la autoridad. Corre un bucle a 20 Hz, aplica las intenciones de
 *    los jugadores, mueve, detecta colisiones y emite el estado completo a la sala.
 *    El cliente nunca envía posiciones, solo la dirección que quiere tomar.
 *
 *  - CC-2: el marcador se ordena con un puntaje compuesto que desempata por quién llegó
 *    primero según el reloj del servidor, así todos ven exactamente el mismo orden.
 */

const SIZE = 24;
const TICK_MS = 50; // 20 Hz
const MOVE_EVERY = 3; // la serpiente avanza cada 3 ticks (≈150 ms)
const ROUND_MS = 90_000;
const FOOD_COUNT = 4;
const COLORS = ['#2E9A6B', '#E0703D', '#7B5CD6', '#C4386A', '#3F7CB4', '#D69A1F'];
const BOT_NAMES = ['Camilo', 'Vale', 'Sara', 'Nico', 'Luli'];

const DIRS: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

interface Snake {
  body: Point[];
  dir: Dir;
  next: Dir;
}

interface Sim {
  code: string;
  hostId: string;
  status: Room['status'];
  players: GamePlayer[];
  snakes: Map<string, Snake>;
  food: Point[];
  tick: number;
  startedAt: number;
  endsAt?: number;
  winnerId?: string;
  /** ms desde el inicio en que cada jugador alcanzó su puntaje actual. */
  reachedAt: Map<string, number>;
  listeners: Set<(s: GameState) => void>;
  timer?: ReturnType<typeof setInterval>;
}

class MockGame {
  private rooms = new Map<string, Sim>();
  private hall: HallEntry[] = [];

  constructor() {
    // Sala abierta permanente para probar "unirme con un código" sin una segunda persona.
    this.seedRoom('PLAN', 'bot-host', 'Camilo');
  }

  /* ---------------- lobby ---------------- */

  create(host: { id: string; name: string }): ApiResult<Room> {
    let c: string;
    do c = this.newCode();
    while (this.rooms.has(c));
    const sim = this.blank(c, host.id);
    this.addPlayer(sim, host.id, host.name, false);
    this.rooms.set(c, sim);
    // Otros jugadores entran con el código compartido.
    setTimeout(() => this.botJoins(c), 1500);
    setTimeout(() => this.botJoins(c), 3200);
    return { ok: true, data: this.room(sim) };
  }

  join(codeIn: string, who: { id: string; name: string }): ApiResult<Room> {
    const sim = this.rooms.get(codeIn.trim().toUpperCase());
    if (!sim) return { ok: false, status: 404, code: 'SALA_NO_EXISTE', error: 'No existe una sala con ese código.' };
    if (sim.status === 'playing') return { ok: false, status: 409, code: 'SALA_EN_JUEGO', error: 'La partida ya empezó.' };
    if (sim.status === 'finished') this.reset(sim);
    if (!sim.players.some((p) => p.id === who.id)) this.addPlayer(sim, who.id, who.name, false);
    this.broadcast(sim);
    return { ok: true, data: this.room(sim) };
  }

  start(codeIn: string): ApiResult<Room> {
    const sim = this.rooms.get(codeIn);
    if (!sim) return { ok: false, status: 404, code: 'SALA_NO_EXISTE', error: 'No existe una sala con ese código.' };
    if (sim.players.length < 2) {
      return { ok: false, status: 409, code: 'JUGADORES_INSUFICIENTES', error: 'Se necesitan al menos dos jugadores.' };
    }
    if (sim.status !== 'playing') this.begin(sim);
    return { ok: true, data: this.room(sim) };
  }

  hallOfFame(): HallEntry[] {
    return this.hall.slice(0, 10);
  }

  /* ---------------- conexión de juego ---------------- */

  connect(codeIn: string, playerId: string, onState: (s: GameState) => void) {
    const sim = this.rooms.get(codeIn);
    if (!sim) return null;
    sim.listeners.add(onState);
    queueMicrotask(() => onState(this.state(sim)));
    return {
      sendIntent: (dir: Dir) => {
        const sn = sim.snakes.get(playerId);
        if (sn && dir !== OPPOSITE[sn.dir]) sn.next = dir;
      },
      close: () => {
        sim.listeners.delete(onState);
      },
    };
  }

  /* ---------------- simulación ---------------- */

  private begin(sim: Sim) {
    sim.status = 'playing';
    sim.tick = 0;
    sim.startedAt = Date.now();
    sim.endsAt = sim.startedAt + ROUND_MS;
    sim.winnerId = undefined;
    sim.snakes.clear();
    sim.reachedAt.clear();
    sim.food = [];
    sim.players.forEach((p, i) => {
      p.alive = true;
      p.score = 0;
      sim.reachedAt.set(p.id, 0);
      const y = 4 + ((i * 5) % (SIZE - 8));
      const x = i % 2 === 0 ? 3 : SIZE - 4;
      const dir: Dir = i % 2 === 0 ? 'right' : 'left';
      const dx = DIRS[dir].x;
      sim.snakes.set(p.id, { body: [{ x, y }, { x: x - dx, y }, { x: x - 2 * dx, y }], dir, next: dir });
    });
    while (sim.food.length < FOOD_COUNT) sim.food.push(this.freeCell(sim));
    clearInterval(sim.timer);
    sim.timer = setInterval(() => this.step(sim), TICK_MS);
    this.broadcast(sim);
  }

  private step(sim: Sim) {
    sim.tick++;
    if (sim.tick % MOVE_EVERY === 0) this.advance(sim);

    const alive = sim.players.filter((p) => p.alive).length;
    if (alive <= 1 || Date.now() >= (sim.endsAt ?? 0)) this.finish(sim);
    else this.broadcast(sim);
  }

  private advance(sim: Sim) {
    for (const p of sim.players) if (p.alive && p.isBot) this.think(sim, p.id);

    // Primero todas las cabezas nuevas, luego colisiones: el orden de jugadores no da ventaja.
    const heads = new Map<string, Point>();
    for (const p of sim.players) {
      if (!p.alive) continue;
      const sn = sim.snakes.get(p.id)!;
      sn.dir = sn.next;
      const h = sn.body[0];
      heads.set(p.id, { x: h.x + DIRS[sn.dir].x, y: h.y + DIRS[sn.dir].y });
    }

    const occupied = new Set<string>();
    for (const p of sim.players) {
      if (!p.alive) continue;
      const body = sim.snakes.get(p.id)!.body;
      body.slice(0, -1).forEach((c) => occupied.add(`${c.x},${c.y}`));
    }

    const dead = new Set<string>();
    for (const [id, h] of heads) {
      const out = h.x < 0 || h.y < 0 || h.x >= SIZE || h.y >= SIZE;
      const hitBody = occupied.has(`${h.x},${h.y}`);
      const headOn = [...heads].some(([other, oh]) => other !== id && oh.x === h.x && oh.y === h.y);
      if (out || hitBody || headOn) dead.add(id);
    }

    const elapsed = Date.now() - sim.startedAt;
    for (const [id, h] of heads) {
      const p = sim.players.find((x) => x.id === id)!;
      if (dead.has(id)) {
        p.alive = false;
        continue;
      }
      const sn = sim.snakes.get(id)!;
      sn.body.unshift(h);
      const fi = sim.food.findIndex((f) => f.x === h.x && f.y === h.y);
      if (fi >= 0) {
        p.score += 10;
        sim.reachedAt.set(id, elapsed);
        sim.food[fi] = this.freeCell(sim);
        gateway().publish('SNAKE.SCORE', { playerId: id, name: p.name, score: p.score }, [`room:${sim.code}`]);
      } else {
        sn.body.pop();
      }
    }
  }

  /** Bot codicioso: va hacia la comida más cercana evitando chocar en el siguiente paso. */
  private think(sim: Sim, id: string) {
    const sn = sim.snakes.get(id)!;
    const h = sn.body[0];
    const target = sim.food.reduce((best, f) =>
      Math.abs(f.x - h.x) + Math.abs(f.y - h.y) < Math.abs(best.x - h.x) + Math.abs(best.y - h.y) ? f : best,
    );
    const blocked = new Set<string>();
    for (const s of sim.snakes.values()) s.body.forEach((c) => blocked.add(`${c.x},${c.y}`));

    const options = (Object.keys(DIRS) as Dir[])
      .filter((d) => d !== OPPOSITE[sn.dir])
      .map((d) => ({ d, x: h.x + DIRS[d].x, y: h.y + DIRS[d].y }))
      .filter((o) => o.x >= 0 && o.y >= 0 && o.x < SIZE && o.y < SIZE && !blocked.has(`${o.x},${o.y}`))
      .map((o) => ({ ...o, cost: Math.abs(target.x - o.x) + Math.abs(target.y - o.y) + Math.random() * 1.5 }))
      .sort((a, b) => a.cost - b.cost);
    if (options.length) sn.next = options[0].d;
  }

  private finish(sim: Sim) {
    clearInterval(sim.timer);
    sim.timer = undefined;
    sim.status = 'finished';
    const board = this.leaderboard(sim);
    sim.winnerId = board[0]?.playerId;

    // CC-2: cada puntaje final queda registrado. Nunca se reescribe la tabla completa.
    for (const e of board) {
      this.hall.push({ name: e.name, score: e.score, code: sim.code, at: Date.now() });
    }
    this.hall.sort((a, b) => b.score - a.score || a.at - b.at);
    this.hall = this.hall.slice(0, 50);

    gateway().publish(
      'ROUND.END',
      { code: sim.code, winnerId: sim.winnerId, leaderboard: board },
      [`room:${sim.code}`],
    );
    this.broadcast(sim);
  }

  /**
   * Orden del marcador. Puntaje compuesto: a igual puntaje gana quien lo alcanzó primero,
   * medido con el reloj del servidor. Si también empatan en tiempo, decide el id.
   */
  private leaderboard(sim: Sim): LeaderEntry[] {
    const composite = (p: GamePlayer) => p.score * 1_000_000 + (1_000_000 - Math.floor((sim.reachedAt.get(p.id) ?? 0) / 100));
    return [...sim.players]
      .sort((a, b) => composite(b) - composite(a) || a.id.localeCompare(b.id))
      .map((p) => ({ playerId: p.id, name: p.name, score: p.score }));
  }

  /* ---------------- utilidades ---------------- */

  private blank(c: string, hostId: string): Sim {
    return {
      code: c,
      hostId,
      status: 'lobby',
      players: [],
      snakes: new Map(),
      food: [],
      tick: 0,
      startedAt: 0,
      reachedAt: new Map(),
      listeners: new Set(),
    };
  }

  private reset(sim: Sim) {
    clearInterval(sim.timer);
    sim.status = 'lobby';
    sim.snakes.clear();
    sim.food = [];
    sim.winnerId = undefined;
    sim.players.forEach((p) => {
      p.alive = true;
      p.score = 0;
    });
  }

  private seedRoom(c: string, hostId: string, hostName: string) {
    const sim = this.blank(c, hostId);
    this.addPlayer(sim, hostId, hostName, true);
    this.rooms.set(c, sim);
  }

  private addPlayer(sim: Sim, id: string, name: string, isBot: boolean) {
    if (sim.players.length >= COLORS.length) return;
    sim.players.push({ id, name, color: COLORS[sim.players.length], alive: true, score: 0, isBot });
    gateway().publish('ROOM.JOIN', { code: sim.code, playerId: id, name }, [`room:${sim.code}`]);
  }

  private botJoins(c: string) {
    const sim = this.rooms.get(c);
    if (!sim || sim.status !== 'lobby') return;
    const taken = new Set(sim.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !taken.has(n));
    if (!name) return;
    this.addPlayer(sim, `bot-${c}-${name}`, name, true);
    this.broadcast(sim);
  }

  private freeCell(sim: Sim): Point {
    const taken = new Set<string>();
    for (const s of sim.snakes.values()) s.body.forEach((c) => taken.add(`${c.x},${c.y}`));
    sim.food.forEach((f) => taken.add(`${f.x},${f.y}`));
    for (let i = 0; i < 500; i++) {
      const p = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) };
      if (!taken.has(`${p.x},${p.y}`)) return p;
    }
    return { x: 0, y: 0 };
  }

  private newCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  }

  private room(sim: Sim): Room {
    return { code: sim.code, hostId: sim.hostId, status: sim.status, players: sim.players.map((p) => ({ ...p })) };
  }

  private state(sim: Sim): GameState {
    const snakes: Record<string, Point[]> = {};
    for (const [id, s] of sim.snakes) snakes[id] = s.body.map((c) => ({ ...c }));
    return {
      code: sim.code,
      status: sim.status,
      tick: sim.tick,
      size: SIZE,
      players: sim.players.map((p) => ({ ...p })),
      snakes,
      food: sim.food.map((f) => ({ ...f })),
      leaderboard: this.leaderboard(sim),
      endsAt: sim.endsAt,
      winnerId: sim.winnerId,
    };
  }

  private broadcast(sim: Sim) {
    const s = this.state(sim);
    sim.listeners.forEach((l) => l(s));
  }
}

type G = typeof globalThis & { __planazoGame?: MockGame };

export function mockGame(): MockGame {
  const g = globalThis as G;
  return (g.__planazoGame ??= new MockGame());
}
