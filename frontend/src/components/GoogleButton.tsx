'use client';

import { useEffect, useRef, useState } from 'react';
import { config } from '@/lib/config';
import { cargarGoogle } from '@/lib/google';

/** El botón oficial de Google. `onCredential` recibe el ID token que verifica el gateway. */
export function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    cargarGoogle()
      .then((g) => {
        if (!vivo || !caja.current) return;
        g.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: (r) => cb.current(r.credential),
          ux_mode: 'popup',
          auto_select: false,
          context: 'signin',
        });
        g.accounts.id.renderButton(caja.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'left',
          locale: 'es',
          width: Math.min(caja.current.offsetWidth || 320, 400),
        });
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, []);

  if (error) {
    return (
      <p className="alert error" role="alert" style={{ margin: 0 }}>
        No pudimos cargar el inicio de sesión de Google. Revisa tu conexión (o el bloqueador de anuncios) y recarga la página.
      </p>
    );
  }
  return <div ref={caja} className="google-btn" style={{ minHeight: 44, display: 'flex', justifyContent: 'center' }} />;
}
