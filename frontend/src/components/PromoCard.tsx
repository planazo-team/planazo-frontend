'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useNow, useRtEvent } from '@/lib/hooks';
import type { Coupon, Promo } from '@/lib/types';

type Outcome = { ok: true; coupon: Coupon } | { ok: false; error: string };

/**
 * Promoción de stock limitado (CC-1). El stock se actualiza en vivo mientras otros la
 * reclaman, y si no alcanzas se explica por qué — nunca un error genérico.
 */
export function PromoCard({ promo, onClose }: { promo: Promo; onClose?: () => void }) {
  const now = useNow(250);
  const [stock, setStock] = useState(promo.stock);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useRtEvent<{ promoId: string; stock: number }>(['PROMO.WON'], (e) => {
    if (e.payload.promoId === promo.id) setStock(e.payload.stock);
  });
  useRtEvent<{ promoId: string }>(['PROMO.EXPIRED'], (e) => {
    if (e.payload.promoId === promo.id) setExpired(true);
  });

  const leftMs = Math.max(0, promo.expiresAt - now);
  const over = expired || leftMs === 0;
  const soldOut = stock <= 0;
  const secs = Math.ceil(leftMs / 1000);

  async function claim() {
    setBusy(true);
    const r = await api.claimPromo(promo.id);
    setBusy(false);
    setOutcome(r.ok ? { ok: true, coupon: r.data } : { ok: false, error: r.error });
  }

  return (
    <div className="promo-card">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="small" style={{ fontWeight: 700, opacity: 0.9 }}>
            {promo.placeName}
          </div>
          <div className="disc">{promo.discount}</div>
          <div style={{ fontWeight: 600, marginTop: 4 }}>{promo.title}</div>
        </div>
        {onClose && (
          <button className="btn ghost sm" onClick={onClose} aria-label="Cerrar promoción">
            ✕
          </button>
        )}
      </div>

      <div className="row" style={{ margin: '12px 0' }}>
        <span className="pill">{soldOut ? 'Agotada' : `Quedan ${stock} de ${promo.initialStock}`}</span>
        <span className="pill">{over ? 'Terminó' : `${secs} s`}</span>
      </div>

      {outcome?.ok && (
        <div className="result fade-in" role="status">
          ¡Es tuyo! Muestra este código en {promo.placeName}:
          <div className="coupon-code" style={{ marginTop: 4 }}>
            {outcome.coupon.code}
          </div>
        </div>
      )}
      {outcome && !outcome.ok && (
        <div className="result fade-in" role="alert">
          {outcome.error}
        </div>
      )}

      {!outcome?.ok && (
        <button className="btn block" style={{ marginTop: 10 }} disabled={busy || over || soldOut} onClick={claim}>
          {busy ? 'Reclamando…' : over ? 'La promoción terminó' : soldOut ? 'Se agotó' : 'Reclamar ahora'}
        </button>
      )}
    </div>
  );
}
