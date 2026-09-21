'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import type { HallEntry } from '@/lib/types';

export default function JuegoLobby() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hall, setHall] = useState<HallEntry[]>([]);

  useEffect(() => {
    api.hallOfFame().then(setHall);
  }, []);

  async function create() {
    setBusy('create');
    setError(null);
    const r = await api.createRoom();
    setBusy(null);
    if (r.ok) router.push(`/cliente/juego/${r.data.code}`);
    else setError(r.error);
  }

  async function join() {
    const c = code.trim().toUpperCase();
    if (c.length !== 4) return;
    setBusy('join');
    setError(null);
    const r = await api.joinRoom(c);
    setBusy(null);
    if (r.ok) router.push(`/cliente/juego/${r.data.code}`);
    else setError(r.error);
  }

  return (
    <main className="content">
      <h1>Snake de sala</h1>
      <p className="muted" style={{ marginTop: 6 }}>
        Mientras deciden a dónde ir, jueguen una ronda. Crea una sala y comparte el código con tu grupo.
      </p>

      <section className="section card">
        <h2>Crear una sala</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          Te damos un código de cuatro letras para que tus amigos entren.
        </p>
        <button className="btn block" onClick={create} disabled={!!busy}>
          {busy === 'create' ? 'Creando…' : 'Crear sala'}
        </button>
      </section>

      <section className="section card">
        <h2>Unirme con un código</h2>
        <form
          className="row"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <label className="field" style={{ flex: 1 }}>
            <span className="sr-only" style={{ display: 'none' }}>
              Código
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
              placeholder="ABCD"
              aria-label="Código de la sala"
              style={{ fontFamily: 'var(--mono)', letterSpacing: '0.2em', fontSize: 18 }}
            />
          </label>
          <button className="btn" disabled={code.length !== 4 || !!busy}>
            {busy === 'join' ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        {config.demo && (
          <p className="muted small" style={{ marginTop: 8 }}>
            En modo demo hay una sala abierta con el código <b className="mono">PLAN</b>.
          </p>
        )}
      </section>

      {error && (
        <p className="alert error section" role="alert">
          {error}
        </p>
      )}

      <section className="section">
        <h2>Mejores puntajes</h2>
        {hall.length === 0 ? (
          <p className="muted small">Todavía no hay partidas terminadas. Sé el primero.</p>
        ) : (
          <div className="card flat list">
            {hall.map((h, i) => (
              <div key={`${h.code}-${h.name}-${h.at}`} className="item">
                <span className="mono muted" style={{ width: 22 }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontWeight: 600 }}>{h.name}</span>
                <span className="mono muted">sala {h.code}</span>
                <b style={{ width: 44, textAlign: 'right' }}>{h.score}</b>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
