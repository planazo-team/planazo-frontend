import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockGame } from '../mock/game';
import { setSession } from '../session';
import { CLAVE_SALA, crearGameClient, fueraDePantalla, salirDeSalaGuardada } from './client';
import type { GameHandlers } from './types';

type G = typeof globalThis & { __planazoGame?: unknown };

const manejadores = (): GameHandlers & Record<string, ReturnType<typeof vi.fn>> =>
  ({ onConexion: vi.fn(), onSalas: vi.fn(), onEstado: vi.fn(), onError: vi.fn() }) as never;

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as G).__planazoGame = undefined;
  setSession({ id: 'c-1', name: 'Ana', role: 'cliente' });
  sessionStorage.clear();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  setSession(null);
});

describe('cliente del juego en modo simulado', () => {
  it('lista, entra, juega y sale de una sala con el mismo protocolo que el real', async () => {
    const juego = crearGameClient();
    const h = manejadores();
    expect(juego.conectado()).toBe(false);
    juego.conectar(h);
    expect(h.onConexion).toHaveBeenCalledWith('conectando');
    await vi.advanceTimersByTimeAsync(1100);
    expect(h.onConexion).toHaveBeenCalledWith('en_linea');
    expect(h.onSalas).toHaveBeenCalled();
    expect(juego.conectado()).toBe(true);

    expect((await juego.listarSalas()).length).toBeGreaterThan(0);
    expect(await juego.unirse('nada')).toEqual({ ok: false, error: 'La sala no existe.' });
    const r = await juego.unirse('sala-004');
    expect(r.ok).toBe(true);

    juego.mover('ARRIBA'); // sin sala suscrita: nada
    juego.suscribirSala('sala-004');
    await vi.advanceTimersByTimeAsync(10);
    expect(h.onEstado).toHaveBeenCalled();
    juego.mover('ABAJO');
    juego.pausar();
    juego.reanudar();
    await juego.salir('sala-004');
    expect(mockGame().listarSalas().find((s) => s.id === 'sala-004')!.idsJugadores).not.toContain('c-1');
    expect(await juego.leaderboard()).toEqual([]);

    juego.desuscribirSala();
    juego.pausar();
    juego.cerrar();
    expect(juego.conectado()).toBe(false);
  });

  it('sin sesión juega como anónimo', async () => {
    setSession(null);
    const r = await crearGameClient().unirse('sala-005');
    expect(r.ok && r.sala.idsJugadores).toContain('anon');
  });
});

describe('salir de la sala guardada', () => {
  it('saca al jugador de la sala de esta pestaña y la olvida', async () => {
    mockGame().unirseSala('sala-007', { id: 'c-1', name: 'Ana' });
    sessionStorage.setItem(CLAVE_SALA, 'sala-007');
    await salirDeSalaGuardada();
    expect(sessionStorage.getItem(CLAVE_SALA)).toBeNull();
    expect(mockGame().listarSalas().find((s) => s.id === 'sala-007')!.cantidadJugadores).toBe(0);
  });

  it('con olvidar: false conserva la sala; sin sala o sin sesión no hace nada', async () => {
    sessionStorage.setItem(CLAVE_SALA, 'sala-007');
    await salirDeSalaGuardada({ olvidar: false });
    expect(sessionStorage.getItem(CLAVE_SALA)).toBe('sala-007');
    sessionStorage.clear();
    await expect(salirDeSalaGuardada()).resolves.toBeUndefined();
  });

  it('si el almacenamiento está bloqueado no falla', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    await expect(salirDeSalaGuardada()).resolves.toBeUndefined();
  });
});

describe('¿está frente a la pantalla?', () => {
  it('fuera de pantalla si la pestaña no tiene foco', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(fueraDePantalla()).toBe(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    expect(fueraDePantalla()).toBe(false);
  });
});
