import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoJuego } from '../game/types';
import type { ApiResult, GameState } from '../types';
import { mockGame, onPartidaTerminada } from './game';

type G = typeof globalThis & { __planazoGame?: unknown };

function ok<T>(r: ApiResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as G).__planazoGame = undefined;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('salas fijas (protocolo de planazo-game)', () => {
  it('lista el catálogo y rechaza salas que no existen', () => {
    const juego = mockGame();
    expect(juego.listarSalas().map((s) => s.codigo)).toContain('Sala Bogotá');
    expect(juego.unirseSala('nada', { id: 'u1', name: 'Ana' })).toEqual({ ok: false, error: 'La sala no existe.' });
  });

  it('un bot completa la sala, cuenta 3 s y la partida corre hasta terminar', async () => {
    const juego = mockGame();
    const estados: EstadoJuego[] = [];
    const desconectar = juego.conectarSala('sala-001', 'u1', (e) => estados.push(e));
    const r = juego.unirseSala('sala-001', { id: 'u1', name: 'Ana' });
    expect(r.ok && r.sala.cantidadJugadores).toBe(1);
    expect(juego.unirseSala('sala-001', { id: 'u1', name: 'Ana' }).ok).toBe(true); // ya estaba: idempotente

    await vi.advanceTimersByTimeAsync(2600); // entra el bot y arranca la cuenta
    expect(juego.listarSalas().find((s) => s.id === 'sala-001')!.estado).toBe('CUENTA_REGRESIVA');
    expect(juego.unirseSala('sala-001', { id: 'u3', name: 'Tarde' })).toEqual({ ok: false, error: 'La sala está llena.' });

    await vi.advanceTimersByTimeAsync(3100);
    expect(juego.listarSalas().find((s) => s.id === 'sala-001')!.estado).toBe('EN_CURSO');
    expect(juego.unirseSala('sala-001', { id: 'u4', name: 'X' }).ok).toBe(false);

    // Mover, pausar (la serpiente se queda quieta) y volver.
    juego.moverSala('sala-001', 'u1', 'ABAJO');
    juego.moverSala('sala-001', 'u1', 'IZQUIERDA'); // contraria a la dirección actual: se ignora
    juego.pausarSala('sala-001', 'u1');
    juego.pausarSala('sala-001', 'u1'); // ya pausado
    await vi.advanceTimersByTimeAsync(500);
    expect(estados.at(-1)!.jugadores.find((j) => j.jugadorId === 'u1')!.pausado).toBe(true);
    juego.reanudarSala('sala-001', 'u1');
    juego.reanudarSala('sala-001', 'u1'); // no estaba pausado
    await vi.advanceTimersByTimeAsync(95_000); // se acaba el tiempo o alguien choca

    const ultimo = estados.at(-1)!;
    expect(ultimo.estado).toBe('FINALIZADA');
    expect(ultimo.resultado?.puntajes).toHaveLength(2);
    expect(juego.leaderboardGlobal(5).length).toBeGreaterThan(0);
    desconectar();

    // Una sala terminada vuelve a la espera cuando se libera un cupo y alguien entra.
    juego.salirSala('sala-001', 'u1');
    expect(juego.unirseSala('sala-001', { id: 'u5', name: 'Nuevo' }).ok).toBe(true);
    expect(juego.listarSalas().find((s) => s.id === 'sala-001')!.estado).toBe('CUENTA_REGRESIVA'); // con el bot vuelve a quedar llena
  });

  it('una pausa de más de 60 s saca a la serpiente del juego', async () => {
    const juego = mockGame();
    juego.unirseSala('sala-002', { id: 'u1', name: 'Ana' });
    await vi.advanceTimersByTimeAsync(5700);
    juego.pausarSala('sala-002', 'u1');
    let fin: EstadoJuego | undefined;
    juego.conectarSala('sala-002', 'u1', (e) => (fin = e));
    await vi.advanceTimersByTimeAsync(61_000);
    expect(fin!.jugadores.find((j) => j.jugadorId === 'u1')!.estado).toBe('ELIMINADA');
  });

  it('salir durante la cuenta la cancela; salir en partida deja ganador', async () => {
    const juego = mockGame();
    const terminadas: string[] = [];
    const off = onPartidaTerminada((_podio, sala) => terminadas.push(sala));
    juego.unirseSala('sala-003', { id: 'u1', name: 'Ana' });
    await vi.advanceTimersByTimeAsync(2600);
    juego.salirSala('sala-003', 'bot-sala-003-Camilo');
    expect(juego.listarSalas().find((s) => s.id === 'sala-003')!.estado).toBe('ESPERANDO_JUGADORES');

    juego.unirseSala('sala-003', { id: 'u2', name: 'Beto' }); // se vuelve a llenar
    await vi.advanceTimersByTimeAsync(3100);
    expect(juego.listarSalas().find((s) => s.id === 'sala-003')!.estado).toBe('EN_CURSO');
    juego.salirSala('sala-003', 'u1');
    expect(terminadas).toContain('Sala Cali');
    off();
    juego.salirSala('nada', 'u1');
    expect(juego.conectarSala('nada', 'u1', () => {})).toBeTypeOf('function');
  });
});

describe('salas por código (lobby)', () => {
  it('crea, une por código, arranca y juega con bots', async () => {
    const juego = mockGame();
    const sala = ok(juego.create({ id: 'u1', name: 'Ana' }));
    expect(sala.code).toMatch(/^[A-Z]{4}$/);
    expect(juego.start('NADA')).toMatchObject({ ok: false, code: 'SALA_NO_EXISTE' });

    const sola = ok(juego.create({ id: 'u9', name: 'Sola' }));
    expect(juego.start(sola.code)).toMatchObject({ ok: false, code: 'JUGADORES_INSUFICIENTES' });

    await vi.advanceTimersByTimeAsync(3300); // entran dos bots
    expect(ok(juego.join(` ${sala.code.toLowerCase()} `, { id: 'u2', name: 'Beto' })).players).toHaveLength(4);
    expect(juego.join('NADA', { id: 'u2', name: 'Beto' })).toMatchObject({ ok: false, code: 'SALA_NO_EXISTE' });

    const estados: GameState[] = [];
    const conn = juego.connect(sala.code, 'u1', (s) => estados.push(s))!;
    expect(juego.connect('NADA', 'u1', () => {})).toBeNull();
    ok(juego.start(sala.code));
    expect(juego.join(sala.code, { id: 'u3', name: 'Tarde' })).toMatchObject({ ok: false, code: 'SALA_EN_JUEGO' });
    conn.sendIntent('down');
    conn.sendIntent('left'); // contraria: se ignora
    await vi.advanceTimersByTimeAsync(95_000);
    expect(estados.at(-1)!.status).toBe('finished');
    conn.close();

    expect(juego.hallOfFame().length).toBeGreaterThan(0);
    expect(ok(juego.join(sala.code, { id: 'u1', name: 'Ana' })).status).toBe('lobby'); // terminada: se reinicia
  });

  it('la sala PLAN está abierta para probar unirse con código', () => {
    const r = ok(mockGame().join('PLAN', { id: 'u1', name: 'Ana' }));
    expect(r.players.map((p) => p.name)).toEqual(['Camilo', 'Ana']);
  });
});
