'use client';

import { useState } from 'react';
import { CodigoDosPasos } from '@/components/CodigoDosPasos';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/api';
import { setSession, type SessionUser } from '@/lib/session';

/**
 * «Modo negocio» / «Modo cliente» en la barra de arriba. Cambiar de modo es
 * cambiar de sesión: el gateway firma un token nuevo (a negocio solo si la
 * cuenta lo tiene activado) y se recarga, porque la conexión en vivo y lo que
 * estaba en memoria eran del otro modo. Sin negocio registrado lleva al registro.
 */
export function CambiarModo({ user }: { user: SessionUser }) {
  const [busy, setBusy] = useState(false);
  const [pedirCodigo, setPedirCodigo] = useState(false);
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const destino = user.role === 'negocio' ? 'cliente' : 'negocio';
  const etiqueta = destino === 'negocio' ? (user.negocio ? 'Modo negocio' : 'Registrar mi negocio') : 'Modo cliente';

  async function cambiar(codigo?: string) {
    if (destino === 'negocio' && !user.negocio) {
      window.location.assign('/?registro=negocio');
      return;
    }
    setBusy(true);
    setErrorCodigo(null);
    const r = await api.cambiarModo(destino, codigo);
    if (!r.ok) {
      setBusy(false);
      if (r.code === 'NEGOCIO_NO_REGISTRADO') window.location.assign('/?registro=negocio');
      else if (r.code === '2FA_REQUERIDO') setPedirCodigo(true);
      else if (codigo) setErrorCodigo(r.error);
      else window.alert(r.error);
      return;
    }
    setSession(r.data);
    window.location.replace(destino === 'negocio' ? '/negocio' : '/cliente/mapa');
  }

  return (
    <>
      <button className="btn ghost sm" onClick={() => void cambiar()} disabled={busy} title={`Cambiar a ${etiqueta.toLowerCase()}`}>
        <Icon name={destino === 'negocio' ? 'store' : 'sparkles'} size={16} />
        <span className="hide-sm">{busy ? 'Cambiando…' : etiqueta}</span>
      </button>
      {pedirCodigo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Verificación en dos pasos"
          style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.6)', padding: 16 }}
        >
          <div className="card" style={{ width: 'min(420px, 100%)' }}>
            <CodigoDosPasos
              onEnviar={(c) => void cambiar(c)}
              onCancelar={() => {
                setPedirCodigo(false);
                setErrorCodigo(null);
              }}
              busy={busy}
              error={errorCodigo}
            />
          </div>
        </div>
      )}
    </>
  );
}
