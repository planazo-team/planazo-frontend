import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as eggs from './eggs';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
});

describe('easter eggs (efectos de un solo disparo)', () => {
  it('el confeti dibuja sus partículas y se limpia solo', () => {
    eggs.confeti(100, 100, 6);
    expect(document.querySelectorAll('.burst-layer i.p')).toHaveLength(6);
    vi.advanceTimersByTime(1600);
    expect(document.querySelector('.burst-layer')).toBeNull();
  });

  it('con movimiento reducido no hay confeti', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    eggs.confeti();
    expect(document.querySelector('.burst-layer')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('la onomatopeya aparece, se desvanece y se va', () => {
    eggs.boom('¡THWIP!', 5, 5, true);
    const b = document.querySelector('.boom') as HTMLElement;
    expect(b.textContent).toBe('¡THWIP!');
    expect(b.className).toContain('blue');
    vi.advanceTimersByTime(1000);
    expect(b.style.opacity).toBe('0');
    vi.advanceTimersByTime(500);
    expect(document.querySelector('.boom')).toBeNull();
    eggs.boom('¡ZAS!');
    expect(document.querySelector('.boom')!.className).not.toContain('blue');
  });

  it('telaraña, araña y toast suelto se montan y se retiran', () => {
    eggs.lanzarTelaraña(50, 50);
    eggs.lanzarTelaraña();
    eggs.soltarAraña();
    eggs.soltarAraña('hola');
    eggs.toastSuelto('¡Bien!');
    expect(document.body.children.length).toBeGreaterThan(0);
    vi.advanceTimersByTime(20_000);
    expect(document.body.children.length).toBe(0);
  });

  it('el saludo del multiverso reconoce ciertos nombres y al resto no', () => {
    const nombres = ['Peter Parker', 'Miles', 'Gwen', 'Spider', 'Ana'];
    const saludos = nombres.map((n) => eggs.saludoMultiverso(n));
    expect(saludos.some((s) => s !== null)).toBe(true);
    expect(eggs.saludoMultiverso('Zzzz Qqqq')).toBeNull();
  });
});
