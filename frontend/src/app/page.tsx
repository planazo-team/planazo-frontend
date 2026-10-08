'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Brand } from '@/components/Brand';
import { CategoryIcon, Icon } from '@/components/Icon';
import { demoLogin } from '@/lib/api/live';
import { config } from '@/lib/config';
import { CATEGORY_COLOR } from '@/lib/seed';
import { DEMO_USERS, setSession, useSession, type SessionUser } from '@/lib/session';
import type { Category } from '@/lib/types';

const home = (u: SessionUser) => (u.role === 'cliente' ? '/cliente/mapa' : '/negocio');

/** Categoría de los establecimientos semilla, para el icono del botón de entrada. */
const BUSINESS_CATEGORY: Record<string, Category> = { p7: 'bar', p1: 'restaurante', p8: 'bar' };

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
    <main className="content login">
      <Brand size={22} />

      <section className="hero" style={{ marginTop: 36 }}>
        <span className="pill-live">
          <span className="dot" />
          En vivo · Zona G y Zona T, Chapinero
        </span>
        <h1>
          La noche de Bogotá,
          <br />
          <em className="serif">planeada en segundos.</em>
        </h1>
        <p>
          Restaurantes, bares, discotecas y eventos en un mapa que se actualiza solo. Reserva un cupo, reclama una
          promoción antes de que se agote o pídele un plan al agente.
        </p>
      </section>

      {session && (
        <div className="card section row between">
          <span>
            Sesión abierta como <b>{session.name}</b>
          </span>
          <button className="btn sm" onClick={() => router.push(home(session))}>
            Continuar <Icon name="check" size={16} />
          </button>
        </div>
      )}

      <div className="login-grid">
        <section className="card">
          <span className="eyebrow">Entrar como cliente</span>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Explora el mapa, reclama promociones, pídele un plan al agente y juega con tu grupo.
          </p>
          <div className="people">
            {clientes.map((u) => (
              <button key={u.id} className="person" disabled={!!busy} onClick={() => enter(u)}>
                <span className="avatar">{u.name[0]}</span>
                {busy === u.id ? 'Entrando…' : u.name}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <span className="eyebrow">Entrar como establecimiento</span>
          <p className="muted small" style={{ margin: '6px 0 12px' }}>
            Define cupos, publica eventos, lanza promociones y ve las reservas llegar en vivo.
          </p>
          <div className="stack" style={{ gap: 8 }}>
            {negocios.map((u) => {
              const cat = BUSINESS_CATEGORY[u.placeId ?? ''] ?? 'bar';
              return (
                <button key={u.id} className="business" disabled={!!busy} onClick={() => enter(u)}>
                  <CategoryIcon category={cat} color={CATEGORY_COLOR[cat]} size={36} />
                  <span style={{ flex: 1 }}>
                    <b>{busy === u.id ? 'Entrando…' : u.name}</b>
                    <span className="muted small">Panel del negocio</span>
                  </span>
                  <Icon name="arrowRight" size={16} className="muted" />
                </button>
              );
            })}
          </div>
        </section>
      </div>

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
