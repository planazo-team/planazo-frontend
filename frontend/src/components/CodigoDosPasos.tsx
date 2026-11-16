'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';

/**
 * Pide el código de 6 dígitos de la app autenticadora (verificación en dos
 * pasos del modo negocio). Lo usan el login, el cambio de modo y la activación.
 */
export function CodigoDosPasos({
  titulo = 'Verificación en dos pasos',
  texto = 'Abre tu app autenticadora (Google Authenticator, Microsoft Authenticator…) y escribe el código de Planazo.',
  boton = 'Verificar',
  onEnviar,
  onCancelar,
  busy,
  error,
}: {
  titulo?: string;
  texto?: string;
  boton?: string;
  onEnviar: (codigo: string) => void;
  onCancelar?: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [codigo, setCodigo] = useState('');
  const listo = /^\d{6}$/.test(codigo);

  return (
    <form
      className="stack fade-in"
      style={{ gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (listo) onEnviar(codigo);
      }}
    >
      <span className="eyebrow">
        <Icon name="sparkles" size={14} /> Seguridad
      </span>
      <h2 style={{ margin: 0 }}>{titulo}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {texto}
      </p>
      <label className="field">
        <span>Código de 6 dígitos</span>
        <input
          className="input"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="123456"
          aria-invalid={!!error}
          autoFocus
          style={{ fontSize: 26, letterSpacing: '0.35em', textAlign: 'center', fontFamily: 'var(--mono)' }}
        />
      </label>
      {error && (
        <p className="alert error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <button type="submit" className="btn block hero" disabled={busy || !listo}>
        {busy ? 'Verificando…' : boton}
      </button>
      {onCancelar && (
        <button type="button" className="btn ghost block" onClick={onCancelar} disabled={busy}>
          Cancelar
        </button>
      )}
    </form>
  );
}
