'use client';

import { useEffect, useRef, useState } from 'react';
import { config } from '@/lib/config';
import { useConnStatus } from '@/lib/hooks';
import { realtime } from '@/lib/realtime';

const LABEL = { connecting: 'Conectando…', online: 'En vivo', offline: 'Reconectando…' } as const;

/**
 * Estado de la conexión en tiempo real. Tras una reconexión muestra cuántos eventos
 * se recuperaron y cuántos duplicados se descartaron: es RT-2 visible para el usuario.
 */
export function ConnectionBadge() {
  const s = useConnStatus();
  const [note, setNote] = useState<string | null>(null);
  const prev = useRef(s);

  useEffect(() => {
    const was = prev.current;
    prev.current = s;
    if (was.state === 'offline' && s.state === 'online') {
      setNote('Sincronizando…');
      return;
    }
    if (s.state === 'online' && (s.recovered !== was.recovered || s.duplicates !== was.duplicates)) {
      const parts = [`${s.recovered} evento${s.recovered === 1 ? '' : 's'} recuperado${s.recovered === 1 ? '' : 's'}`];
      const dup = s.duplicates - was.duplicates;
      if (dup > 0) parts.push(`${dup} duplicado descartado`);
      setNote(parts.join(' · '));
      const t = setTimeout(() => setNote(null), 4500);
      return () => clearTimeout(t);
    }
  }, [s]);

  return (
    <div className="row" style={{ gap: 8 }}>
      {note && <span className="conn-note fade-in">{note}</span>}
      <span className={`conn ${s.state}`} title={`Último evento recibido: #${s.lastSeq}`}>
        <span className="dot" />
        {LABEL[s.state]}
        {config.demo && s.state === 'online' && <span className="mono">#{s.lastSeq}</span>}
      </span>
      {config.demo && realtime().canSimulateDrop() && (
        <button
          className="btn ghost sm"
          disabled={s.state !== 'online'}
          onClick={() => realtime().simulateDrop(6000)}
          title="Corta la conexión 6 segundos para probar la recuperación"
        >
          Cortar señal
        </button>
      )}
    </div>
  );
}
