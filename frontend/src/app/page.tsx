'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/Brand';
import { boom, confeti, saludoMultiverso } from '@/components/fx/eggs';
import { GoogleButton } from '@/components/GoogleButton';
import { Icon, SpiderArt } from '@/components/Icon';
import { RegistroNegocio } from '@/components/RegistroNegocio';
import { CodigoDosPasos } from '@/components/CodigoDosPasos';
import { api } from '@/lib/api';
import { coverUrl } from '@/lib/brand';
import { config } from '@/lib/config';
import {
  entrarConCorreoFirebase,
  mensajeErrorFirebase,
  registrarConCorreoFirebase,
} from '@/lib/firebase';
import { credencialDemo, leerCredencial } from '@/lib/google';
import type { DatosNegocio } from '@/lib/negocio';
import { setSession, useSession, type Role, type SessionUser } from '@/lib/session';

const home = (u: SessionUser) => (u.role === 'cliente' ? '/cliente/mapa' : '/negocio');

const MODOS: Record<Role, { boton: string; icono: 'sparkles' | 'store'; texto: string; detalle: string }> = {
  cliente: {
    boton: 'Voy a salir',
    icono: 'sparkles',
    texto: 'Explora el mapa, reserva cupos, reclama promos y juega por bonos.',
    detalle: 'Entra o crea tu cuenta con Google o con tu correo electrónico.',
  },
  negocio: {
    boton: 'Tengo un negocio',
    icono: 'store',
    texto: 'Crea tu lugar en el mapa, lanza promociones y mira las reservas llegar en vivo.',
    detalle: 'Si ya registraste tu negocio entras a tu panel. Si no, después de autenticarte te pedimos el NIT para verificarlo.',
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

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  // Una cuenta, dos modos. Cliente lo es cualquiera; negocio pide haber registrado el negocio.
  const [modo, setModo] = useState<Role>('cliente');
  // Registro del negocio: la credencial queda guardada mientras se llenan los datos.
  const [registro, setRegistro] = useState<{ credential: string; name: string } | null>(null);
  /** Credencial ya verificada que espera el código de dos pasos para entrar en modo negocio. */
  const [segundoPaso, setSegundoPaso] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosNegocio>(DATOS_VACIOS);
  const [nota, setNota] = useState<string | null>(null);

  // Formulario de correo y contraseña con Firebase Auth
  const [accionCorreo, setAccionCorreo] = useState<'entrar' | 'crear'>('entrar');
  const [nombreCuenta, setNombreCuenta] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');

  const [nombreDemo, setNombreDemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // «Registrar mi negocio» desde la app del cliente llega aquí: hay que confirmar identidad.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('registro') === 'negocio') {
      setModo('negocio');
      setNota('Para registrar tu negocio, confirma tu cuenta.');
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
    if (r.code === '2FA_REQUERIDO') {
      setNota(null);
      setSegundoPaso(credential);
      return;
    }
    if (r.code === 'NEGOCIO_NO_REGISTRADO') {
      const perfil = leerCredencial(credential);
      setNota(null);
      setRegistro({ credential, name: perfil?.name || perfil?.email.split('@')[0] || '' });
      return;
    }
    setError(r.status === 0 ? sinRed : r.error);
  }

  async function enviarCorreo(e: React.FormEvent) {
    e.preventDefault();
    if (!correo.trim() || clave.length < 6) return;
    if (accionCorreo === 'crear' && nombreCuenta.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const cred =
        accionCorreo === 'crear'
          ? await registrarConCorreoFirebase(nombreCuenta, correo, clave)
          : await entrarConCorreoFirebase(correo, clave);
      await entrar(cred);
    } catch (err) {
      setBusy(false);
      setError(mensajeErrorFirebase(err));
    }
  }

  async function entrarConCodigo(codigo: string) {
    if (!segundoPaso) return;
    setBusy(true);
    setError(null);
    const r = await api.loginGoogle(segundoPaso, 'negocio', codigo);
    setBusy(false);
    if (r.ok) return terminar(r.data);
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
      // Pasaron más de 10 minutos: se confirma otra vez y los datos se conservan.
      setRegistro(null);
      setNota('Por seguridad, vuelve a confirmar tu cuenta. Tus datos siguen ahí.');
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
        {segundoPaso ? (
          <CodigoDosPasos
            onEnviar={entrarConCodigo}
            onCancelar={() => {
              setSegundoPaso(null);
              setError(null);
            }}
            busy={busy}
            error={error}
          />
        ) : registro ? (
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

            <GoogleButton
              disabled={busy}
              onCredential={(c) => void entrar(c)}
              onError={(msg) => setError(msg)}
            />

            <div className="row" style={{ gap: 10, margin: '2px 0' }} aria-hidden>
              <span style={{ flex: 1, height: 1, background: 'var(--line-strong)' }} />
              <span className="eyebrow" style={{ fontSize: 10.5 }}>o con tu correo</span>
              <span style={{ flex: 1, height: 1, background: 'var(--line-strong)' }} />
            </div>

            <div className="chips" role="tablist" aria-label="Acción con correo" style={{ padding: 0 }}>
              <button
                type="button"
                className="chip"
                aria-pressed={accionCorreo === 'entrar'}
                onClick={() => {
                  setAccionCorreo('entrar');
                  setError(null);
                }}
                disabled={busy}
              >
                Ya tengo cuenta
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={accionCorreo === 'crear'}
                onClick={() => {
                  setAccionCorreo('crear');
                  setError(null);
                }}
                disabled={busy}
              >
                Crear cuenta
              </button>
            </div>

            <form className="stack" style={{ gap: 10 }} onSubmit={(e) => void enviarCorreo(e)}>
              {accionCorreo === 'crear' && (
                <label className="field">
                  Tu nombre
                  <input
                    value={nombreCuenta}
                    onChange={(e) => setNombreCuenta(e.target.value)}
                    placeholder="Ej. Camila Gómez"
                    maxLength={40}
                    autoComplete="name"
                    required
                  />
                </label>
              )}
              <label className="field">
                Correo electrónico
                <input
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="tu@correo.com"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="field">
                Contraseña
                <input
                  type="password"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  autoComplete={accionCorreo === 'crear' ? 'new-password' : 'current-password'}
                  required
                />
              </label>
              <button
                type="submit"
                className="btn block"
                disabled={
                  busy ||
                  !correo.trim() ||
                  clave.length < 6 ||
                  (accionCorreo === 'crear' && nombreCuenta.trim().length < 2)
                }
              >
                {busy
                  ? 'Autenticando con Firebase…'
                  : accionCorreo === 'crear'
                    ? 'Crear cuenta y entrar'
                    : 'Entrar con correo'}{' '}
                <Icon name="arrowRight" />
              </button>
            </form>

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

            {config.demo && (
              <details style={{ marginTop: 4 }}>
                <summary className="muted small" style={{ cursor: 'pointer' }}>
                  Entrada rápida de demostración (sin cuenta)
                </summary>
                <form
                  className="stack"
                  style={{ gap: 10, marginTop: 10 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (nombreDemo.trim().length >= 2) void entrar(credencialDemo(nombreDemo.trim()));
                  }}
                >
                  <label className="field">
                    <span className="visually-hidden">Nombre para el modo demo</span>
                    <input
                      value={nombreDemo}
                      onChange={(e) => setNombreDemo(e.target.value)}
                      placeholder="Nombre (modo demo rápido)"
                      maxLength={30}
                    />
                  </label>
                  <button type="submit" className="btn ghost sm block" disabled={busy || nombreDemo.trim().length < 2}>
                    Entrar en modo demo <Icon name="arrowRight" />
                  </button>
                </form>
              </details>
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
