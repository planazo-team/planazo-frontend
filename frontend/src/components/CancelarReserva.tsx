'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { boom } from './fx/eggs';
import { Icon } from './Icon';

/**
 * Cancelar una reserva con confirmación en el mismo lugar (sin ventanas
 * emergentes). Los cupos vuelven a la franja en vivo para todos.
 */
export function CancelarReserva({ id, onCancelada, compacto }: { id: string; onCancelada: () => void; compacto?: boolean }) {
  const [paso, setPaso] = useState<'idle' | 'confirmar' | 'enviando'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function cancelar(e: React.MouseEvent) {
    setPaso('enviando');
    setError(null);
    const r = await api.cancelReservation(id);
    if (r.ok) {
      boom('¡LIBERADO!', e.clientX, e.clientY, true);
      onCancelada();
    } else {
      setError(r.error);
      setPaso('idle');
    }
  }

  if (paso === 'idle') {
    return (
      <>
        <button className={`btn ghost sm${compacto ? ' icon' : ''}`} onClick={() => setPaso('confirmar')} aria-label="Cancelar reserva">
          <Icon name="x" size={16} />
          {!compacto && 'Cancelar'}
        </button>
        {error && <span className="small" style={{ color: 'var(--danger)' }}>{error}</span>}
      </>
    );
  }
  return (
    <span className="row fade-in" style={{ gap: 6 }}>
      <span className="small muted">¿Cancelar?</span>
      <button className="btn sm hero" disabled={paso === 'enviando'} onClick={cancelar}>
        {paso === 'enviando' ? 'Cancelando…' : 'Sí'}
      </button>
      <button className="btn sm ghost" disabled={paso === 'enviando'} onClick={() => setPaso('idle')}>
        No
      </button>
    </span>
  );
}
