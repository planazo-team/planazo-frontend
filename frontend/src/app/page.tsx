'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { demoLogin } from '@/lib/api/live';
import { config } from '@/lib/config';
import { DEMO_USERS, setSession, useSession, type SessionUser } from '@/lib/session';

const home = (u: SessionUser) => (u.role === 'cliente' ? '/cliente/mapa' : '/negocio');

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enter(u: SessionUser) {
    setBusy(u.id);
    setError(null);
    let token: string | undefined;
    if (config.mode === 'live') {
      token = await demoLogin(u.id);
      if (!token) {
        setError('El servidor no respondió. Revisa que el API Gateway esté arriba.');
        setBusy(null);
        return;
      }
    }
    const user = { ...u, token };
    setSession(user);
    router.push(home(user));
  }

  const clientes = DEMO_USERS.filter((u) => u.role === 'cliente');
  const negocios = DEMO_USERS.filter((u) => u.role === 'negocio');

  return (
    <main className="content" style={{ paddingTop: 48 }}>
      <div className="brand" style={{ fontSize: 34 }}>
        Plan<span>azo</span>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        Restaurantes, bares, discotecas y eventos de Zona G y Zona T, con disponibilidad en tiempo real.
      </p>

      {session && (
        <div className="card section row between">
          <span>
            Sesión abierta como <b>{session.name}</b>
          </span>
          <button className="btn sm" onClick={() => router.push(home(session))}>
            Continuar
          </button>
        </div>
      )}

      <section className="section">
        <h2>Entrar como cliente</h2>
        <p className="muted small" style={{ margin: '4px 0 10px' }}>
          Explora el mapa, reclama promociones, pídele un plan al agente y juega con tu grupo.
        </p>
        <div className="row wrap">
          {clientes.map((u) => (
            <button key={u.id} className="btn ghost" disabled={!!busy} onClick={() => enter(u)}>
              {busy === u.id ? 'Entrando…' : u.name}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Entrar como establecimiento</h2>
        <p className="muted small" style={{ margin: '4px 0 10px' }}>
          Define cupos, publica eventos, lanza promociones y ve las reservas llegar en vivo.
        </p>
        <div className="row wrap">
          {negocios.map((u) => (
            <button key={u.id} className="btn ghost" disabled={!!busy} onClick={() => enter(u)}>
              {busy === u.id ? 'Entrando…' : u.name}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className="alert error section" role="alert">
          {error}
        </p>
      )}

      {config.demo && (
        <p className="demo-note section">
          Modo demo: los servicios corren simulados en tu navegador, con otros usuarios compitiendo por los mismos
          cupos y cupones. Los datos se reinician al recargar la página.
        </p>
      )}
    </main>
  );
}
