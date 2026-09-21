'use client';

import { useState } from 'react';
import { useRtEvent } from '@/lib/hooks';
import type { Promo } from '@/lib/types';
import { PromoCard } from './PromoCard';

/** Muestra en el momento las promociones que se lanzan en las zonas que el usuario sigue (RT-2). */
export function PromoToast() {
  const [promo, setPromo] = useState<Promo | null>(null);

  useRtEvent<Promo>(['PROMO.PUSH'], (e) => setPromo(e.payload));

  if (!promo) return null;
  return (
    <div className="toast" key={promo.id}>
      <PromoCard promo={promo} onClose={() => setPromo(null)} />
    </div>
  );
}
