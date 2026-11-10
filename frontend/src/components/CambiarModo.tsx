'use client';

import { useState } from 'react';
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
  const destino = user.role === 'negocio' ? 'cliente' : 'negocio';
  const etiqueta = destino === 'negocio' ? (user.negocio ? 'Modo negocio' : 'Registrar mi negocio') : 'Modo cliente';

  async function cambiar() {
    if (destino === 'negocio' && !user.negocio) {
      window.location.assign('/?registro=negocio');
      return;
    }
    setBusy(true);
    const r = await api.cambiarModo(destino);
    if (!r.ok) {
      setBusy(false);
      if (r.code === 'NEGOCIO_NO_REGISTRADO') window.location.assign('/?registro=negocio');
      else window.alert(r.error);
      return;
    }
    setSession(r.data);
    window.location.replace(destino === 'negocio' ? '/negocio' : '/cliente/mapa');
  }

  return (
    <button className="btn ghost sm" onClick={cambiar} disabled={busy} title={`Cambiar a ${etiqueta.toLowerCase()}`}>
      <Icon name={destino === 'negocio' ? 'store' : 'sparkles'} size={16} />
      <span className="hide-sm">{busy ? 'Cambiando…' : etiqueta}</span>
    </button>
  );
}
