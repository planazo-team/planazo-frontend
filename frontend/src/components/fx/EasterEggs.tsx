'use client';

import { useEffect } from 'react';
import { boom, lanzarTelaraña, soltarAraña } from './eggs';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

/**
 * Easter eggs globales del equipo Spidiverse:
 *   - Escribir "thwip" en cualquier parte (fuera de un campo): telarañas.
 *   - Código Konami: la araña baja del techo.
 *   - Abrir la consola: hay una firma.
 */
export function EasterEggs() {
  useEffect(() => {
    let buffer = '';
    let konami = 0;
    let ultimoX = window.innerWidth / 2;
    let ultimoY = window.innerHeight / 2;

    const onMove = (e: PointerEvent) => {
      ultimoX = e.clientX;
      ultimoY = e.clientY;
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      konami = e.key === KONAMI[konami] || e.key.toLowerCase() === KONAMI[konami] ? konami + 1 : e.key === KONAMI[0] ? 1 : 0;
      if (konami === KONAMI.length) {
        konami = 0;
        soltarAraña('Arriba, arriba, abajo, abajo… sentido arácnido activado.');
      }

      if (e.key.length === 1) {
        buffer = (buffer + e.key.toLowerCase()).slice(-5);
        if (buffer === 'thwip') {
          buffer = '';
          lanzarTelaraña(ultimoX, ultimoY);
          boom('¡THWIP!', ultimoX, ultimoY, true);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', onMove, { passive: true });

    const w = window as typeof window & { __spidiverse?: boolean };
    if (!w.__spidiverse) {
      w.__spidiverse = true;
      console.log(
        '%c🕷️  Planazo · hecho por Spidiverse\n%c¿Buscando bugs? Aquí solo hay arañas. Escribe "thwip" en la app.',
        'font: 700 16px system-ui; color: #3fcf9e',
        'font: 13px system-ui; color: #ffd84a',
      );
    }

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return null;
}
