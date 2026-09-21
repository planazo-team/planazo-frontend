'use client';

import { useEffect, useRef } from 'react';
import type { Dir, GameState } from '@/lib/types';

const PX = 720;

/**
 * Dibuja el estado que envía el servidor. No simula nada por su cuenta:
 * lo que ves es exactamente lo que el servidor decidió en ese tick.
 */
export function SnakeBoard({ state, meId, onSwipe }: { state: GameState; meId: string; onSwipe: (d: Dir) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const n = state.size;
    const cell = PX / n;

    ctx.fillStyle = '#0f1c1a';
    ctx.fillRect(0, 0, PX, PX);
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, PX);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(PX, i * cell);
      ctx.stroke();
    }

    for (const f of state.food) {
      const cx = f.x * cell + cell / 2;
      const cy = f.y * cell + cell / 2;
      ctx.fillStyle = 'rgba(255,154,92,0.22)';
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff9a5c';
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of state.players) {
      const body = state.snakes[p.id];
      if (!body) continue;
      ctx.globalAlpha = p.alive ? 1 : 0.18;
      body.forEach((c, i) => {
        const pad = i === 0 ? 1.5 : 3.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(c.x * cell + pad, c.y * cell + pad, cell - pad * 2, cell - pad * 2, i === 0 ? 8 : 6);
        ctx.fill();
      });
      if (p.id === meId && p.alive && body[0]) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(body[0].x * cell + 1.5, body[0].y * cell + 1.5, cell - 3, cell - 3, 8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }, [state, meId]);

  return (
    <div
      className="board"
      onTouchStart={(e) => {
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const t = touch.current;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
        onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      }}
    >
      <canvas ref={canvas} width={PX} height={PX} aria-label="Tablero de la partida" role="img" />
    </div>
  );
}
