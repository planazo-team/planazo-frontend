'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useNow, useRtEvent } from '@/lib/hooks';
import type { Promo } from '@/lib/types';
import { Icon } from './Icon';
import { PlaceLogo } from './Logo';

function corto(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} h`;
  if (s >= 60) return `${Math.floor(s / 60)} min`;
  return `${s} s`;
}

/**
 * Promo en formato mini para la franja del mapa: logo, descuento, stock y
 * tiempo, con el stock en vivo. Lleva a la ficha del lugar, donde se reclama.
 */
export function PromoMini({ promo }: { promo: Promo }) {
  const now = useNow(1000);
  const [stock, setStock] = useState(promo.stock);
  useRtEvent<{ promoId: string; stock: number }>(['PROMO.WON'], (e) => {
    if (e.payload.promoId === promo.id) setStock(e.payload.stock);
  });
  const quedaPoco = stock > 0 && stock <= 2;
  return (
    <Link href={`/cliente/lugar/${promo.placeId}`} className={`promo-mini${promo.soloGanadores ? ' winners' : ''}`}>
      <PlaceLogo place={{ id: promo.placeId, name: promo.placeName, category: 'bar' }} size={38} />
      <span className="grow" style={{ minWidth: 0 }}>
        <b className="disc">{promo.discount}</b>
        <span className="name">{promo.placeName}</span>
        <span className="meta">
          {promo.soloGanadores && <Icon name="trophy" size={12} />}
          <span className={quedaPoco ? 'spider-sense' : undefined} style={quedaPoco ? { margin: '0 14px' } : undefined}>
            {stock > 0 ? `${stock} quedan` : 'agotada'}
          </span>
          · {corto(promo.expiresAt - now)}
        </span>
      </span>
    </Link>
  );
}
