'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { problemaNit, razonSocialValida, telefonoValido, type DatosNegocio } from '@/lib/negocio';

/**
 * Datos para activar el modo negocio. Se validan aquí para avisar rápido,
 * pero quien decide es el servidor (NIT con dígito de verificación, NIT que no
 * esté en otra cuenta, teléfono y términos).
 */
export function RegistroNegocio({
  nombre,
  datos,
  onCambio,
  onEnviar,
  onCancelar,
  busy,
  error,
}: {
  nombre: string;
  datos: DatosNegocio;
  onCambio: (d: DatosNegocio) => void;
  onEnviar: () => void;
  onCancelar: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [tocado, setTocado] = useState(false);
  const nit = problemaNit(datos.nit);
  const problemas = {
    legalName: razonSocialValida(datos.legalName) ? null : 'Escribe la razón social (como aparece en el RUT).',
    nit,
    phone: telefonoValido(datos.phone) ? null : 'Escribe un celular o fijo de Colombia (10 dígitos).',
    acceptTerms: datos.acceptTerms ? null : 'Debes aceptar los términos para negocios.',
  };
  const valido = Object.values(problemas).every((p) => !p);
  const set = (k: keyof DatosNegocio, v: string | boolean) => onCambio({ ...datos, [k]: v });
  const aviso = (k: keyof typeof problemas) =>
    tocado && problemas[k] ? (
      <span className="small" style={{ color: 'var(--danger)', fontWeight: 500 }}>
        {problemas[k]}
      </span>
    ) : null;

  return (
    <form
      className="stack fade-in"
      style={{ gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        setTocado(true);
        if (valido) onEnviar();
      }}
      noValidate
    >
      <span className="eyebrow">Registrar tu negocio</span>
      <h2 style={{ margin: 0 }}>{nombre ? `${nombre.split(' ')[0]}, cuéntanos de tu negocio` : 'Cuéntanos de tu negocio'}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Para que nadie se haga pasar por tu negocio verificamos el NIT. Tu cuenta sigue sirviendo para salir: el modo negocio se suma.
      </p>

      <label className="field">
        Razón social
        <input value={datos.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder="Bar La Telaraña S.A.S." maxLength={120} autoComplete="organization" />
        {aviso('legalName')}
      </label>
      <label className="field">
        NIT con dígito de verificación
        <input value={datos.nit} onChange={(e) => set('nit', e.target.value)} placeholder="900.123.456-8" inputMode="numeric" maxLength={16} />
        {aviso('nit')}
      </label>
      <label className="field">
        Teléfono del negocio
        <input value={datos.phone} onChange={(e) => set('phone', e.target.value)} placeholder="310 555 1234" inputMode="tel" maxLength={18} autoComplete="tel" />
        {aviso('phone')}
      </label>
      <label className="row small" style={{ gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" checked={datos.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} style={{ marginTop: 3 }} />
        <span className="muted">
          Declaro que represento a este negocio, que los datos son verdaderos y acepto los términos para negocios de Planazo
          (versión de noviembre de 2026).
        </span>
      </label>
      {aviso('acceptTerms')}

      {error && (
        <p className="alert error fade-in" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}

      <button className="btn block yellow" disabled={busy} style={{ minHeight: 54, fontSize: 17 }}>
        {busy ? 'Verificando…' : 'Registrar y entrar a mi negocio'}
        <Icon name="arrowRight" />
      </button>
      <button type="button" className="btn ghost block" disabled={busy} onClick={onCancelar}>
        Ahora no
      </button>
    </form>
  );
}
