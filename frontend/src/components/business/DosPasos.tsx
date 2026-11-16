'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { CodigoDosPasos } from '@/components/CodigoDosPasos';
import { boom } from '@/components/fx/eggs';
import { api } from '@/lib/api';

/**
 * Tarjeta «Verificación en dos pasos» del panel del negocio (ESC-01).
 * Activar: se genera un secreto en el servidor, se muestra como QR para la app
 * autenticadora y el primer código la deja activa. Desde entonces, entrar en
 * modo negocio pide Google + el código de 6 dígitos.
 */
export function DosPasos() {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [qr, setQr] = useState<{ imagen: string; secreto: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.dosPasos.estado().then((r) => setActivo(r.ok ? r.data.activo : false));
  }, []);

  async function empezar() {
    setBusy(true);
    setError(null);
    const r = await api.dosPasos.iniciar();
    if (!r.ok) {
      setBusy(false);
      setError(r.error);
      return;
    }
    // El QR se dibuja aquí mismo: el secreto nunca sale a otro servicio.
    const imagen = await QRCode.toDataURL(r.data.otpauthUri, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
    setQr({ imagen, secreto: r.data.secreto });
    setBusy(false);
  }

  async function confirmar(codigo: string) {
    setBusy(true);
    setError(null);
    const r = await api.dosPasos.confirmar(codigo);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setActivo(true);
    setQr(null);
    boom('¡SEGURO!', window.innerWidth / 2, window.innerHeight / 3);
  }

  if (activo === null) return null;

  return (
    <section className="card">
      {activo ? (
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Seguridad</span>
          <h3 style={{ margin: 0 }}>Verificación en dos pasos activa</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Para entrar en modo negocio te pedimos tu cuenta de Google y el código de 6 dígitos de tu app autenticadora.
            Aunque alguien tome tu sesión de Google, sin tu celular no puede tocar tus cupos ni tus promociones.
          </p>
          <span className="badge live" style={{ alignSelf: 'flex-start' }}>
            Activa
          </span>
        </div>
      ) : qr ? (
        <div className="stack" style={{ gap: 12 }}>
          <span className="eyebrow">Paso 1 de 2</span>
          <h3 style={{ margin: 0 }}>Escanea el código con tu app</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Abre Google Authenticator, Microsoft Authenticator o la que uses, toca «Agregar» y escanea este código.
          </p>
          <img
            src={qr.imagen}
            alt="Código QR para la app autenticadora"
            width={220}
            height={220}
            style={{ alignSelf: 'center', background: '#fff', borderRadius: 12, padding: 6 }}
          />
          <details>
            <summary className="small">¿No puedes escanearlo? Escribe la clave a mano</summary>
            <code style={{ display: 'block', marginTop: 8, wordBreak: 'break-all', fontSize: 15, letterSpacing: '0.08em' }}>
              {qr.secreto.match(/.{1,4}/g)?.join(' ')}
            </code>
          </details>
          <CodigoDosPasos
            titulo="Paso 2 de 2: confirma"
            texto="Escribe el código que muestra tu app para terminar de activarla."
            boton="Activar verificación en dos pasos"
            onEnviar={confirmar}
            onCancelar={() => {
              setQr(null);
              setError(null);
            }}
            busy={busy}
            error={error}
          />
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <span className="eyebrow">Seguridad</span>
          <h3 style={{ margin: 0 }}>Protege tu panel con verificación en dos pasos</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Además de Google, al entrar en modo negocio te pediremos un código que cambia cada 30 segundos en tu celular.
          </p>
          {error && (
            <p className="alert error" role="alert" style={{ margin: 0 }}>
              {error}
            </p>
          )}
          <button type="button" className="btn hero" onClick={empezar} disabled={busy}>
            {busy ? 'Generando…' : 'Activar verificación en dos pasos'}
          </button>
        </div>
      )}
    </section>
  );
}
