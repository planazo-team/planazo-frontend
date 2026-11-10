'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { Brand } from '@/components/Brand';
import { boom, confeti, saludoMultiverso } from '@/components/fx/eggs';
import { GoogleButton } from '@/components/GoogleButton';
import { Icon, SpiderArt } from '@/components/Icon';
import { api } from '@/lib/api';
import { coverUrl } from '@/lib/brand';
import { config } from '@/lib/config';
import { credencialDemo, leerCredencial } from '@/lib/google';
import { setSession, useSession, type Role, type SessionUser } from '@/lib/session';

const home = (u: SessionUser) => (u.role === 'cliente' ? '/cliente/mapa' : '/negocio');

const COLLAGE: Array<{ img: string; tag: string; r: string }> = [
  { img: 'p7', tag: 'Cócteles', r: '-3deg' },
  { img: 'p9', tag: 'Rumba', r: '2deg' },
  { img: 'p1', tag: 'Pasta', r: '-1deg' },
  { img: 'p10', tag: 'Stand-up', r: '2.5deg' },
  { img: 'p3', tag: 'Dumplings', r: '-2deg' },
  { img: 'p12', tag: 'Parque', r: '1.5deg' },
];

/** Sin client ID de Google solo se puede entrar en modo demo (servicios simulados). */
const conGoogle = !!config.googleClientId;

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  // La credencial de Google queda guardada mientras la persona elige el rol (la primera vez).
  const [pendiente, setPendiente] = useState<{ credential: string; name: string } | null>(null);
  const [role, setRole] = useState<Role>('cliente');
  const [nombreDemo, setNombreDemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar(credential: string, elegido?: Role) {
    setBusy(true);
    setError(null);
    const r = await api.loginGoogle(credential, elegido);
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'ROL_REQUERIDO') {
        const perfil = leerCredencial(credential);
        setPendiente({ credential, name: perfil?.name || perfil?.email.split('@')[0] || '' });
        return;
      }
      setPendiente(null);
      setError(r.status === 0 ? 'El servidor no respondió. Revisa tu conexión e intenta de nuevo.' : r.error);
      return;
    }
    const multiverso = saludoMultiverso(r.data.name);
    if (multiverso) {
      boom('¡THWIP!', window.innerWidth / 2, window.innerHeight / 2, true);
      confeti(window.innerWidth / 2, window.innerHeight / 2, 50, ['#ff3b5c', '#2f6bff', '#ffffff']);
    }
    setSession(r.data);
    setTimeout(() => router.push(home(r.data)), multiverso ? 700 : 0);
  }

  const multiverso = pendiente ? saludoMultiverso(pendiente.name) : null;

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
        {pendiente ? (
          <div className="stack fade-in" style={{ gap: 14 }}>
            <span className="eyebrow">Un último paso</span>
            <div className="row" style={{ gap: 12 }}>
              <Avatar name={pendiente.name} size={52} />
              <h2 style={{ margin: 0 }}>¡Hola, {pendiente.name.split(' ')[0]}! ¿Cómo vas a usar Planazo?</h2>
            </div>
            {multiverso && (
              <span className="caption pop-in">
                <SpiderArt size={18} color="#2b2200" eyes="#ffd84a" /> {multiverso}
              </span>
            )}

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
            <p className="muted small" style={{ margin: 0 }}>
              Esta elección queda guardada en tu cuenta y no se puede cambiar después.
            </p>

            {error && (
              <p className="alert error fade-in" role="alert" style={{ margin: 0 }}>
                {error}
              </p>
            )}

            <button
              className={`btn block ${role === 'negocio' ? 'yellow' : ''}`}
              disabled={busy}
              onClick={() => entrar(pendiente.credential, role)}
              style={{ minHeight: 54, fontSize: 17 }}
            >
              {busy ? 'Entrando…' : role === 'cliente' ? 'Entrar a explorar' : 'Entrar a mi negocio'}
              <Icon name="arrowRight" />
            </button>
            <button type="button" className="btn ghost block" disabled={busy} onClick={() => setPendiente(null)}>
              Usar otra cuenta
            </button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            <span className="eyebrow">Entrar</span>
            <h2 style={{ marginTop: 6 }}>Entra con tu cuenta de Google</h2>
            <p className="muted small" style={{ margin: '0 0 4px' }}>
              No creamos contraseñas: Google confirma quién eres. La primera vez eliges si vienes a salir o tienes un negocio.
            </p>

            {conGoogle ? (
              <GoogleButton onCredential={(c) => entrar(c)} />
            ) : config.demo ? (
              <form
                className="stack"
                style={{ gap: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (nombreDemo.trim().length >= 2) entrar(credencialDemo(nombreDemo.trim()));
                }}
              >
                <label className="field">
                  <span className="visually-hidden">Nombre para el modo demo</span>
                  <input
                    className="name-input"
                    value={nombreDemo}
                    onChange={(e) => setNombreDemo(e.target.value)}
                    placeholder="Nombre (modo demo, sin Google)"
                    maxLength={30}
                  />
                </label>
                <button className="btn block" disabled={busy || nombreDemo.trim().length < 2}>
                  Entrar en modo demo <Icon name="arrowRight" />
                </button>
              </form>
            ) : (
              <p className="alert error" role="alert" style={{ margin: 0 }}>
                Falta configurar el inicio de sesión con Google (NEXT_PUBLIC_GOOGLE_CLIENT_ID).
              </p>
            )}

            {busy && <span className="caption">Verificando con Google…</span>}
            {error && (
              <p className="alert error fade-in" role="alert" style={{ margin: 0 }}>
                {error}
              </p>
            )}

            {session && (
              <button type="button" className="btn ghost block" onClick={() => router.push(home(session))}>
                Seguir como {session.name}
              </button>
            )}
          </div>
        )}

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
