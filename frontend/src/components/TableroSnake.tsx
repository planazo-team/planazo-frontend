'use client';

import { useEffect, useRef } from 'react';
import type { EstadoJuego, JugadorEnSala, ResultadoPartida } from '@/lib/game/types';

/**
 * Tablero del minijuego. Es el dibujo del cliente de planazo-game
 * (`test-client.html`) tal cual: misma grilla, mismos colores, cuerpo
 * continuo y cabeza con ojos mirando hacia donde va. No simula nada: pinta
 * el snapshot que manda el servidor en cada tick (RT-3).
 */

export const CELDA = 20;
const ANCHO_POR_DEFECTO = 24;
const ALTO_POR_DEFECTO = 18;
export const COLORES = ['#22c55e', '#3b82f6', '#f97316', '#e11d48', '#a855f7', '#14b8a6'];

export const textoEstado = (e: string) =>
  ({ ESPERANDO_JUGADORES: 'esperando', CUENTA_REGRESIVA: 'arrancando', EN_CURSO: 'en partida', FINALIZADA: 'finalizada' })[e] ?? e;

export const textoResultado = (r: ResultadoPartida) => `🏆 ${r.ganadorJugadorNombre || 'Nadie'} gana`;

/** Color fijo por orden de llegada, no por puntaje: así no cambia a mitad de partida. */
export function coloresDe(estado: EstadoJuego): Record<string, string> {
  const color: Record<string, string> = {};
  estado.jugadores.forEach((j, i) => (color[j.jugadorId] = COLORES[i % COLORES.length]));
  return color;
}

export function TableroSnake({
  estado,
  jugadorId,
  ultimoResultado,
  textoVacio,
}: {
  estado: EstadoJuego | null;
  jugadorId: string;
  ultimoResultado: ResultadoPartida | null;
  textoVacio: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ancho = (estado?.anchoTablero || ANCHO_POR_DEFECTO) * CELDA;
  const alto = (estado?.altoTablero || ALTO_POR_DEFECTO) * CELDA;

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;

    const rotulo = (texto: string, sub?: string, grande?: boolean) => {
      ctx.fillStyle = 'rgba(11,15,23,.72)';
      ctx.fillRect(0, 0, ancho, alto);
      ctx.fillStyle = '#e5e7eb';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = grande ? 'bold 96px system-ui' : 'bold 22px system-ui';
      ctx.fillText(texto, ancho / 2, alto / 2 - (sub ? 16 : 0));
      if (sub) {
        ctx.font = '15px system-ui';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(sub, ancho / 2, alto / 2 + (grande ? 64 : 18));
      }
    };

    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, ancho, alto);

    if (!estado) {
      rotulo(textoVacio);
      return;
    }

    const color = coloresDe(estado);
    const yo = estado.jugadores.find((j) => j.jugadorId === jugadorId);
    const faltan = estado.capacidad - estado.jugadores.length;

    ctx.strokeStyle = '#151c2c';
    ctx.lineWidth = 1;
    for (let x = 0; x <= ancho / CELDA; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELDA, 0);
      ctx.lineTo(x * CELDA, alto);
      ctx.stroke();
    }
    for (let y = 0; y <= alto / CELDA; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELDA);
      ctx.lineTo(ancho, y * CELDA);
      ctx.stroke();
    }

    if (estado.comida) {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(estado.comida.x * CELDA + CELDA / 2, estado.comida.y * CELDA + CELDA / 2, CELDA / 2 - 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Primero las muertas (debajo), luego las vivas, y la mía al final (encima).
    const peso = (j: JugadorEnSala) => (j.jugadorId === jugadorId ? 2 : j.estado === 'ELIMINADA' ? 0 : 1);
    [...estado.jugadores]
      .sort((a, b) => peso(a) - peso(b))
      .forEach((j) => dibujarSerpiente(ctx, j, j.estado === 'ELIMINADA' ? '#4b5563' : color[j.jugadorId], jugadorId));

    if (estado.estado === 'CUENTA_REGRESIVA') {
      rotulo(
        String(estado.segundosCuentaRegresiva || '¡Ya!'),
        ultimoResultado ? `${textoResultado(ultimoResultado)} · revancha en…` : '¡Sala llena! Prepárate…',
        true,
      );
    } else if (ultimoResultado) {
      rotulo(textoResultado(ultimoResultado), faltan > 0 ? `Esperando ${faltan} jugador(es) para la revancha` : '');
    } else if (estado.estado === 'ESPERANDO_JUGADORES') {
      rotulo(
        `Esperando jugadores ${estado.jugadores.length}/${estado.capacidad}`,
        `Faltan ${faltan}: la partida empieza cuando la sala esté llena`,
      );
    } else if (yo && yo.estado === 'ELIMINADA') {
      rotulo('Te eliminaron 💥', 'Mira cómo termina la partida');
    }
  }, [estado, jugadorId, ultimoResultado, textoVacio, ancho, alto]);

  return <canvas ref={canvas} className="mj-tablero" width={ancho} height={alto} />;
}

/** Cuerpo continuo (segmentos unidos) y cabeza con ojos mirando hacia donde va. */
function dibujarSerpiente(ctx: CanvasRenderingContext2D, j: JugadorEnSala, color: string, jugadorId: string) {
  const cuerpo = j.cuerpo;
  if (!cuerpo.length) return;
  ctx.globalAlpha = j.estado === 'ELIMINADA' ? 0.3 : j.estado === 'DESCONECTADA_CONGELADA' ? 0.45 : 1;
  ctx.fillStyle = color;
  const m = 3; // margen interno del cuerpo
  for (let i = cuerpo.length - 1; i >= 1; i--) {
    const a = cuerpo[i];
    const b = cuerpo[i - 1];
    // rectángulo que une cada segmento con el siguiente: se ve una sola pieza
    const x = Math.min(a.x, b.x) * CELDA + m;
    const y = Math.min(a.y, b.y) * CELDA + m;
    const w = (Math.abs(a.x - b.x) + 1) * CELDA - 2 * m;
    const h = (Math.abs(a.y - b.y) + 1) * CELDA - 2 * m;
    ctx.fillRect(x, y, w, h);
  }
  const c = cuerpo[0];
  ctx.fillRect(c.x * CELDA + 1, c.y * CELDA + 1, CELDA - 2, CELDA - 2);
  if (j.estado !== 'ELIMINADA') {
    const d = ({ ARRIBA: [0, -1], ABAJO: [0, 1], IZQUIERDA: [-1, 0], DERECHA: [1, 0] } as Record<string, number[]>)[j.direccion] ?? [1, 0];
    const cx = c.x * CELDA + CELDA / 2;
    const cy = c.y * CELDA + CELDA / 2;
    [-1, 1].forEach((lado) => {
      const ex = cx + d[0] * 4 + d[1] * lado * 4;
      const ey = cy + d[1] * 4 + d[0] * lado * 4;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(ex + d[0], ey + d[1], 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (j.jugadorId === jugadorId) {
    // marca "tú"
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x * CELDA, c.y * CELDA, CELDA, CELDA);
    ctx.lineWidth = 1;
  }
  ctx.globalAlpha = 1;
}
