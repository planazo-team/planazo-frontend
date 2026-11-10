'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/Brand';
import { boom, confeti, saludoMultiverso } from '@/components/fx/eggs';
import { GoogleButton } from '@/components/GoogleButton';
import { Icon, SpiderArt } from '@/components/Icon';
import { RegistroNegocio } from '@/components/RegistroNegocio';
import { api } from '@/lib/api';
import { coverUrl } from '@/lib/brand';
import { config } from '@/lib/config';
import { credencialDemo, leerCredencial } from '@/lib/google';
import type { DatosNegocio } from '@/lib/negocio';
import { setSession, useSession, type Role, type SessionUser } from '@/lib/session';

const home = (u: SessionUser) => (u.role === 'cliente' ? '/cliente/mapa' : '/negocio');

const MODOS: Record<Role, { boton: string; icono: 'sparkles' | 'store'; texto: string; detalle: string }> = {
  cliente: {
    boton: 'Voy a salir',
    icono: 'sparkles',
    texto: 'Explora el mapa, reserva cupos, reclama promos y juega por bonos.',
    detalle: 'Entra o crea tu cuenta con Google. No creamos contraseñas: Google confirma quién eres.',
  },
  negocio: {
    boton: 'Tengo un negocio',
    icono: 'store',
    texto: 'Crea tu lugar en el mapa, lanza promociones y mira las reservas llegar en vivo.',
    detalle: 'Si ya registraste tu negocio entras a tu panel. Si no, después de Google te pedimos el NIT para verificarlo.',
  },
};

const DATOS_VACIOS: DatosNegocio = { legalName: '', nit: '', phone: '', acceptTerms: false };

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
  // Una cuenta, dos modos. Cliente lo es cualquiera; negocio pide haber registrado el negocio.
  const [modo, setModo] = useState<Role>('cliente');
  // Registro del negocio: la credencial de Google queda guardada mientras se llenan los datos.
  const [registro, setRegistro] = useState<{ credential: string; name: string } | null>(null);
  const [datos, setDatos] = useState<DatosNegocio>(DATOS_VACIOS);
  const [nota, setNota] = useState<string | null>(null);
  const [nombreDemo, setNombreDemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // «Registrar mi negocio» desde la app del cliente llega aquí: hay que confirmar con Google.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('registro') === 'negocio') {
      setModo('negocio');
      setNota('Para registrar tu negocio, confirma con Google que eres tú.');
    }
  }, []);

  function terminar(u: SessionUser) {
    const multiverso = saludoMultiverso(u.name);
    if (multiverso) {
      boom('¡THWIP!', window.innerWidth / 2, window.innerHeight / 2, true);
      confeti(window.innerWidth / 2, window.innerHeight / 2, 50, ['#ff3b5c', '#2f6bff', '#ffffff']);
    }
    setSession(u);
    setTimeout(() => router.push(home(u)), multiverso ? 700 : 0);
  }

  const sinRed = 'El servidor no respondió. Revisa tu conexión e intenta de nuevo.';

  async function entrar(credential: string) {
    setBusy(true);
    setError(null);
    const r = await api.loginGoogle(credential, modo);
    setBusy(false);
    if (r.ok) return terminar(r.data);
    if (r.code === 'NEGOCIO_NO_REGISTRADO') {
      const perfil = leerCredencial(credential);
      setNota(null);
      setRegistro({ credential, name: perfil?.name || perfil?.email.split('@')[0] || '' });
      return;
    }
    setError(r.status === 0 ? sinRed : r.error);
  }

  async function registrar() {
    if (!registro) return;
    setBusy(true);
    setError(null);
    const r = await api.registrarNegocio(registro.credential, datos);
    setBusy(false);
    if (r.ok) return terminar(r.data);
    if (r.code === 'CREDENCIAL_VIEJA') {
      // Pasaron más de 10 minutos desde Google: se confirma otra vez y los datos se conservan.
      setRegistro(null);
      setNota('Por seguridad, vuelve a confirmar con Google. Tus datos siguen ahí.');
      return;
    }
    setError(r.status === 0 ? sinRed : r.error);
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
        {registro ? (
          <RegistroNegocio
            nombre={registro.name}
            datos={datos}
            onCambio={setDatos}
            onEnviar={registrar}
            onCancelar={() => {
              setRegistro(null);
              setModo('cliente');
              setError(null);
            }}
            busy={busy}
            error={error}
          />
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            <span className="eyebrow">Crear cuenta o entrar</span>
            <h2 style={{ marginTop: 6 }}>¿Cómo vas a usar Planazo?</h2>
            <div className="segmented" role="group" aria-label="Modo de la cuenta">
              {(Object.keys(MODOS) as Role[]).map((m) => (
                <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)} disabled={busy}>
                  <Icon name={MODOS[m].icono} /> {MODOS[m].boton}
                </button>
              ))}
            </div>
            <p className="muted small" style={{ margin: '-4px 0 0' }}>
              {MODOS[modo].texto}
            </p>
            <p className="muted small" style={{ margin: 0 }}>
              {MODOS[modo].detalle} Con la misma cuenta puedes cambiar de modo cuando quieras.
            </p>

            {nota && (
              <p className="alert info fade-in" role="status" style={{ margin: 0 }}>
                {nota}
              </p>
            )}

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
