'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SnakeBoard } from '@/components/SnakeBoard';
import { api } from '@/lib/api';
import { connectGame, type GameConnection } from '@/lib/game/connection';
import { useNow, useTopics } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Dir, GameState } from '@/lib/types';

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

export default function SalaPage() {
  const { code } = useParams<{ code: string }>();
  const me = useSession();
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const conn = useRef<GameConnection | null>(null);
  const now = useNow(500);

  useTopics([`room:${code}`]);

  useEffect(() => {
    if (!me) return;
    const c = connectGame(code, me.id, setState, setError);
    conn.current = c;
    return () => {
      c.close();
      conn.current = null;
    };
  }, [code, me]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = KEYS[e.key];
      if (!d || state?.status !== 'playing') return;
      e.preventDefault();
      conn.current?.sendIntent(d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state?.status]);

  const send = (d: Dir) => conn.current?.sendIntent(d);

  if (error) {
    return (
      <main className="content">
        <p className="alert error">{error}</p>
        <Link href="/cliente/juego" className="btn ghost section">
          Volver
        </Link>
      </main>
    );
  }
  if (!state || !me) {
    return (
      <main className="content">
        <p className="muted">Entrando a la sala…</p>
      </main>
    );
  }

  const inRoom = state.players.some((p) => p.id === me.id);

  /* ---------------- sala de espera ---------------- */
  if (state.status === 'lobby') {
    return (
      <main className="content">
        <Link href="/cliente/juego" className="muted small">
          ← Salir
        </Link>
        <div className="card section" style={{ textAlign: 'center' }}>
          <p className="muted small" style={{ margin: 0 }}>
            Código de la sala
          </p>
          <div className="room-code">{state.code}</div>
          <button
            className="btn ghost sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              } catch {
                /* portapapeles no disponible */
              }
            }}
          >
            {copied ? 'Copiado' : 'Copiar código'}
          </button>
        </div>

        <section className="section">
          <h2>En la sala · {state.players.length}</h2>
          <div className="card flat list" style={{ marginTop: 10 }}>
            {state.players.map((p) => (
              <div key={p.id} className="item fade-in">
                <span className="swatch" style={{ background: p.color }} />
                <span style={{ flex: 1, fontWeight: 600 }}>
                  {p.name}
                  {p.id === me.id && <span className="muted"> (tú)</span>}
                </span>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Los demás aparecen aquí apenas entran con el código.
          </p>
        </section>

        {!inRoom && <p className="alert info section">Estás viendo esta sala sin haber entrado.</p>}

        <button
          className="btn block section"
          disabled={state.players.length < 2 || starting || !inRoom}
          onClick={async () => {
            setStarting(true);
            const r = await api.startRoom(state.code);
            setStarting(false);
            if (!r.ok) setError(r.error);
          }}
        >
          {state.players.length < 2 ? 'Esperando a otro jugador…' : starting ? 'Iniciando…' : 'Iniciar partida'}
        </button>
      </main>
    );
  }

  const mine = state.players.find((p) => p.id === me.id);
  const secs = state.endsAt ? Math.max(0, Math.ceil((state.endsAt - now) / 1000)) : 0;

  /* ---------------- partida y resultado ---------------- */
  return (
    <main className="content">
      <div className="row between" style={{ marginBottom: 10 }}>
        <span className="mono muted">Sala {state.code}</span>
        {state.status === 'playing' && <span className="badge ok">{secs} s</span>}
      </div>

      {state.status === 'finished' && (
        <div className="card section fade-in" style={{ marginTop: 0, marginBottom: 14, textAlign: 'center' }}>
          <p className="muted small" style={{ margin: 0 }}>
            Ganó
          </p>
          <h1>{state.players.find((p) => p.id === state.winnerId)?.name ?? '—'}</h1>
          <p className="alert ok" style={{ marginTop: 12 }}>
            Tu puntaje de {mine?.score ?? 0} quedó registrado.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button
              className="btn"
              onClick={async () => {
                const r = await api.joinRoom(state.code);
                if (!r.ok) setError(r.error);
              }}
            >
              Jugar otra vez
            </button>
            <Link href="/cliente/juego" className="btn ghost">
              Salir
            </Link>
          </div>
        </div>
      )}

      <SnakeBoard state={state} meId={me.id} onSwipe={send} />

      {state.status === 'playing' && (
        <div className="dpad section" style={{ marginTop: 14 }}>
          <button className="up" onClick={() => send('up')} aria-label="Arriba">
            ▲
          </button>
          <button className="left" onClick={() => send('left')} aria-label="Izquierda">
            ◀
          </button>
          <button className="down" onClick={() => send('down')} aria-label="Abajo">
            ▼
          </button>
          <button className="right" onClick={() => send('right')} aria-label="Derecha">
            ▶
          </button>
        </div>
      )}

      <section className="section">
        <h2>Marcador</h2>
        <div className="card flat list" style={{ marginTop: 10 }}>
          {state.leaderboard.map((e, i) => {
            const p = state.players.find((x) => x.id === e.playerId);
            return (
              <div key={e.playerId} className="item">
                <span className="mono muted" style={{ width: 18 }}>
                  {i + 1}
                </span>
                <span className="swatch" style={{ background: p?.color }} />
                <span style={{ flex: 1, fontWeight: e.playerId === me.id ? 800 : 600 }}>
                  {e.name}
                  {p && !p.alive && state.status === 'playing' && <span className="muted small"> · eliminado</span>}
                </span>
                <b className="mono" style={{ fontSize: 14 }}>
                  {e.score}
                </b>
              </div>
            );
          })}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          El servidor ordena el marcador: a igual puntaje gana quien llegó primero, y todos ven el mismo orden.
        </p>
      </section>
    </main>
  );
}
