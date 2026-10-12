'use client';

import { useRef } from 'react';
import { soltarAraña } from './fx/eggs';

/**
 * Logotipo: un pin de mapa con una telaraña adentro, y el nombre. `sub` agrega
 * un contexto (p. ej. "Panel"). Cinco toques seguidos sobre la marca...
 * bueno, pruébalo.
 */
export function Brand({ sub, size = 19 }: { sub?: string; size?: number }) {
  const toques = useRef<number[]>([]);

  function toque() {
    const ahora = Date.now();
    toques.current = [...toques.current.filter((t) => ahora - t < 1600), ahora];
    if (toques.current.length >= 5) {
      toques.current = [];
      soltarAraña();
    }
  }

  return (
    <div className="brand" style={{ fontSize: size }} onClick={toque}>
      <span className="mark" style={{ width: size + 9, height: size + 9 }}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" fill="#03201a" />
          <g stroke="#8ff2cc" strokeWidth="1.1" fill="none" strokeLinecap="round">
            <path d="M12 5v10 M7.2 10h9.6 M8.6 6.6l6.8 6.8 M15.4 6.6l-6.8 6.8" />
            <path d="M12 7.4l2.2 1 .9 1.6-.9 1.7-2.2 1-2.2-1-.9-1.7.9-1.6z" />
          </g>
        </svg>
      </span>
      <span className="word">
        Plan<span>azo</span>
      </span>
      {sub && <span className="sub">· {sub}</span>}
    </div>
  );
}
