'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useNow, useRtEvent } from '@/lib/hooks';
import type { Coupon, ErrorCode, Promo } from '@/lib/types';
import { boom, confeti } from './fx/eggs';
import { Icon } from './Icon';
import { PlaceLogo } from './Logo';

type Outcome = { ok: true; coupon: Coupon } | { ok: false; error: string; code?: ErrorCode };

function restante(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  if (s >= 60) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  return `${s} s`;
}

/**
 * Promoción de stock limitado (CC-1). El stock se actualiza en vivo mientras
 * otros la reclaman, y si no alcanzas se explica por qué. Las de "solo
 * ganadores" piden quedar en el podio del minijuego.
 */
export function PromoCard({ promo, onClose, compact }: { promo: Promo; onClose?: () => void; compact?: boolean }) {
  const now = useNow(1000);
  const [stock, setStock] = useState(promo.stock);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useRtEvent<{ promoId: string; stock: number }>(['PROMO.WON'], (e) => {
    if (e.payload.promoId === promo.id) setStock(e.payload.stock);
  });
  useRtEvent<{ promoId: string }>(['PROMO.EXPIRED'], (e) => {
    if (e.payload.promoId === promo.id) setExpired(true);
  });

  const leftMs = Math.max(0, promo.expiresAt - now);
  const over = expired || leftMs === 0;
  const soldOut = stock <= 0;
  const ganadores = !!promo.soloGanadores;
  const sentido = !soldOut && !over && stock <= 2;

  async function claim() {
    setBusy(true);
    const r = await api.claimPromo(promo.id);
    setBusy(false);
    if (r.ok) {
      setOutcome({ ok: true, coupon: r.data });
      const rect = btn.current?.getBoundingClientRect();
      const x = rect ? rect.left + rect.width / 2 : undefined;
      const y = rect ? rect.top : undefined;
      boom(ganadores ? '¡CAMPEÓN!' : '¡ZAS!', x, y, ganadores);
      confeti(x, y);
    } else {
      setOutcome({ ok: false, error: r.error, code: r.code });
    }
  }

  return (
    <div className={`promo-card${ganadores ? ' winners' : ''}`}>
      {onClose && (
        <button className="close" onClick={onClose} aria-label="Cerrar promoción">
          ✕
        </button>
      )}
      <div className="place-line" style={onClose ? { paddingRight: 40 } : undefined}>
        <PlaceLogo place={{ id: promo.placeId, name: promo.placeName, category: 'bar' }} size={30} />
        <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {promo.placeName}
        </span>
        {ganadores && (
          <span className="badge gold">
            <Icon name="trophy" /> {promo.puestos && promo.puestos > 1 ? `Top ${promo.puestos}` : 'Ganador'}
          </span>
        )}
      </div>
      <div className="disc">{promo.discount}</div>
      <div className="title">{promo.title}</div>

      <div className="row wrap" style={{ margin: '12px 0', gap: 8 }}>
        <span className={`pill${sentido ? ' spider-sense' : ''}`} title={sentido ? 'Sentido arácnido: se está agotando' : undefined}>
          <Icon name="flame" />
          {soldOut ? 'Agotada' : `Quedan ${stock} de ${promo.initialStock}`}
        </span>
        <span className="pill">
          <Icon name="clock" />
          {over ? 'Terminó' : restante(leftMs)}
        </span>
      </div>

      {!compact && ganadores && !outcome && (
        <p className="small" style={{ margin: '0 0 10px', opacity: 0.92 }}>
          Solo para quien quede {promo.puestos && promo.puestos > 1 ? `en el top ${promo.puestos}` : 'de primero'} en una partida del
          minijuego jugada después del lanzamiento.
        </p>
      )}

      {outcome?.ok && (
        <div className="result pop-in" role="status">
          ¡Es tuyo! Muéstralo en {promo.placeName}:
          <div className="coupon-code" style={{ marginTop: 4 }}>
            {outcome.coupon.code}
          </div>
        </div>
      )}
      {outcome && !outcome.ok && (
        <div className="result fade-in" role="alert">
          {outcome.error}
          {outcome.code === 'SOLO_GANADORES' && (
            <Link href="/cliente/juego" className="btn sm" style={{ marginTop: 10, width: '100%' }}>
              <Icon name="gamepad" /> Ir a jugar por el bono
            </Link>
          )}
          {outcome.code === 'YA_RECLAMADA' && (
            <Link href="/cliente/planes" className="btn sm ghost" style={{ marginTop: 10, width: '100%' }}>
              Ver mis cupones
            </Link>
          )}
        </div>
      )}

      {!outcome?.ok && outcome?.code !== 'SOLO_GANADORES' && (
        <button ref={btn} className="btn block" style={{ marginTop: 10 }} disabled={busy || over || soldOut} onClick={claim}>
          {busy ? 'Reclamando…' : over ? 'La promoción terminó' : soldOut ? 'Se agotó' : ganadores ? 'Reclamar mi premio' : 'Reclamar ahora'}
        </button>
      )}
    </div>
  );
}
