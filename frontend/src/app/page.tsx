'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { Brand } from '@/components/Brand';
import { boom, confeti, saludoMultiverso } from '@/components/fx/eggs';
import { Icon, SpiderArt } from '@/components/Icon';
import { api } from '@/lib/api';
import { coverUrl } from '@/lib/brand';
import { config } from '@/lib/config';
import { NOMBRE_VALIDO, setSession, useSession, type Role, type SessionUser } from '@/lib/session';

const home = (u: SessionUser) => (u.role === 'cliente' ? '/cliente/mapa' : '/negocio');

const COLLAGE: Array<{ img: string; tag: string; r: string }> = [
  { img: 'p7', tag: 'Cócteles', r: '-3deg' },
  { img: 'p9', tag: 'Rumba', r: '2deg' },
  { img: 'p1', tag: 'Pasta', r: '-1deg' },
  { img: 'p10', tag: 'Stand-up', r: '2.5deg' },
  { img: 'p3', tag: 'Dumplings', r: '-2deg' },
  { img: 'p12', tag: 'Parque', r: '1.5deg' },
];

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('cliente');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recordar el último nombre usado en este navegador.
  useEffect(() => {
    try {
      const ultimo = localStorage.getItem('planazo.lastName');
      if (ultimo) setName(ultimo);
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  const limpio = name.trim().replace(/\s+/g, ' ');
  const valido = NOMBRE_VALIDO.test(limpio);
  const multiverso = saludoMultiverso(limpio);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) {
      setError('Escribe un nombre de 2 a 30 letras.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await api.login(limpio, role);
    if (!r.ok) {
      setBusy(false);
      setError(r.status === 0 ? 'El servidor no respondió. Revisa tu conexión e intenta de nuevo.' : r.error);
      return;
    }
    try {
      localStorage.setItem('planazo.lastName', limpio);
    } catch {
      /* sin almacenamiento */
    }
    if (multiverso) {
      boom('¡THWIP!', window.innerWidth / 2, window.innerHeight / 2, true);
      confeti(window.innerWidth / 2, window.innerHeight / 2, 50, ['#ff3b5c', '#2f6bff', '#ffffff']);
    }
    setSession(r.data);
    setTimeout(() => router.push(home(r.data)), multiverso ? 700 : 0);
  }

  return (
    <main className="login">
      <div className="login-top">
        <Brand size={22} />
        <span className="badge live">En vivo · Chapinero</span>
      </div>

      <section className="hero page">
        <span className="caption">La noche de Bogotá, edición especial</span>
        <h1>
          Tu plan de hoy,
          <br />
          <em className="serif misprint">en segundos.</em>
        </h1>
        <p>
          Restaurantes, bares, discotecas y eventos de la Zona G y la Zona T con cupos que cambian en vivo. Reserva, reclama
          promociones relámpago, gana bonos en el minijuego o pídele un plan al agente.
        </p>
        <div className="collage" aria-hidden>
          <span className="boom boom-float" style={{ position: 'absolute', right: 8, top: -26, zIndex: 2, fontSize: 24, minWidth: 110, minHeight: 80 }}>
            ¡POW!
          </span>
          {COLLAGE.map((c, i) => (
            <div key={c.img} className="shot halftone" style={{ '--r': c.r, '--i': i } as React.CSSProperties}>
              <img src={coverUrl(c.img)} alt="" />
              <span className="tag">
                <span className="caption sm">{c.tag}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card login-card page" style={{ animationDelay: '120ms' }}>
        <span className="eyebrow">Entrar</span>
        <h2 style={{ marginTop: 6 }}>¿Cómo te llamas?</h2>
        <p className="muted small" style={{ margin: '6px 0 16px' }}>
          Sin contraseña ni registro: con tu nombre basta. Este navegador te recuerda.
        </p>

        <form className="stack" style={{ gap: 14 }} onSubmit={entrar}>
          <div className="row" style={{ gap: 12 }}>
            {limpio ? <Avatar name={limpio} size={52} /> : <span className="avatar" style={{ width: 52, height: 52 }}><Icon name="user" /></span>}
            <label className="field grow">
              <span className="visually-hidden">Tu nombre</span>
              <input
                className="name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                autoComplete="given-name"
                maxLength={30}
                autoFocus
              />
            </label>
          </div>

          <div className="greeting">
            {multiverso ? (
              <span className="caption pop-in" key={multiverso}>
                <SpiderArt size={18} color="#2b2200" eyes="#ffd84a" /> {multiverso}
              </span>
            ) : limpio.length >= 2 ? (
              <span className="muted small fade-in">¡Hola, {limpio.split(' ')[0]}! ¿Vienes a salir o a atender tu negocio?</span>
            ) : null}
          </div>

          <div className="segmented" role="group" aria-label="Tipo de cuenta">
            <button type="button" aria-pressed={role === 'cliente'} onClick={() => setRole('cliente')}>
              <Icon name="sparkles" /> Voy a salir
            </button>
            <button type="button" aria-pressed={role === 'negocio'} onClick={() => setRole('negocio')}>
              <Icon name="store" /> Tengo un negocio
            </button>
          </div>
          <p className="muted small" style={{ margin: '-4px 0 0' }}>
            {role === 'cliente'
              ? 'Explora el mapa, reserva cupos, reclama promos y juega por bonos.'
              : 'Crea tu lugar en el mapa, lanza promociones y mira las reservas llegar en vivo.'}
          </p>

          {error && (
            <p className="alert error fade-in" role="alert" style={{ margin: 0 }}>
              {error}
            </p>
          )}

          <button className={`btn block ${role === 'negocio' ? 'yellow' : ''}`} disabled={busy || !valido} style={{ minHeight: 54, fontSize: 17 }}>
            {busy ? 'Entrando…' : role === 'cliente' ? 'Entrar a explorar' : 'Entrar a mi negocio'}
            <Icon name="arrowRight" />
          </button>

          {session && (
            <button type="button" className="btn ghost block" onClick={() => router.push(home(session))}>
              Seguir como {session.name}
            </button>
          )}
        </form>

        {config.demo && (
          <p className="demo-note" style={{ marginTop: 16 }}>
            Modo demo: los servicios corren simulados en tu navegador, con otros usuarios compitiendo por los mismos cupos y
            cupones. Los datos se reinician al recargar.
          </p>
        )}
      </section>

      <footer className="credit">
        <SpiderArt size={16} color="#5d726d" eyes="#070d0c" />
        Hecho con gran poder y gran responsabilidad por <b>Spidiverse</b> · Zona G · Zona T · Bogotá
      </footer>
    </main>
  );
}
