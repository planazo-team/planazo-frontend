'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRtEvent } from '@/lib/hooks';
import type { PlaceCreatedPayload, Promo, PromoUnlockedPayload } from '@/lib/types';
import { boom, confeti } from './fx/eggs';
import { Icon } from './Icon';
import { PlaceLogo } from './Logo';
import { PromoCard } from './PromoCard';

type Aviso =
  | { kind: 'promo'; id: string; promo: Promo }
  | { kind: 'premio'; id: string; data: PromoUnlockedPayload }
  | { kind: 'lugar'; id: string; data: PlaceCreatedPayload };

/**
 * Avisos en vivo, siempre por encima del mapa y de la barra:
 *  - PROMO.PUSH: una promoción relámpago en las zonas que sigues (RT-2).
 *  - PROMO.UNLOCKED: ganaste una partida y desbloqueaste un bono.
 *  - PLACE.CREATED: un negocio nuevo apareció en el mapa.
 */
export function PromoToast({ conPromos = true }: { conPromos?: boolean }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const quitar = useCallback((id: string) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const poner = useCallback(
    (a: Aviso, ms?: number) => {
      setAvisos((xs) => [...xs.filter((x) => x.id !== a.id), a].slice(-3));
      if (ms) setTimeout(() => quitar(a.id), ms);
    },
    [quitar],
  );

  // El panel del negocio no muestra promos para reclamar (un negocio no reclama).
  useRtEvent<Promo>(['PROMO.PUSH'], (e) => conPromos && poner({ kind: 'promo', id: `p-${e.payload.id}`, promo: e.payload }, 25_000));
  useRtEvent<PromoUnlockedPayload>(['PROMO.UNLOCKED'], (e) => {
    poner({ kind: 'premio', id: `u-${e.payload.promo.id}`, data: e.payload });
    boom('¡GANASTE!', window.innerWidth / 2, window.innerHeight * 0.4);
    confeti(window.innerWidth / 2, window.innerHeight * 0.4, 60);
  });
  useRtEvent<PlaceCreatedPayload>(['PLACE.CREATED'], (e) =>
    poner({ kind: 'lugar', id: `l-${e.payload.place.id}`, data: e.payload }, 8_000),
  );

  if (avisos.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {avisos.map((a) =>
        a.kind === 'promo' ? (
          <PromoCard key={a.id} promo={a.promo} compact onClose={() => quitar(a.id)} />
        ) : a.kind === 'premio' ? (
          <div key={a.id} className="toast-note win">
            <Icon name="trophy" size={28} />
            <div className="grow">
              <b>
                ¡Quedaste {a.data.puesto === 1 ? 'de primero' : `en el puesto ${a.data.puesto}`}
                {a.data.salaCodigo ? ` en ${a.data.salaCodigo}` : ''}!
              </b>
              Desbloqueaste: {a.data.promo.discount} en {a.data.promo.placeName}
            </div>
            <Link className="btn sm" href={`/cliente/lugar/${a.data.promo.placeId}`} onClick={() => quitar(a.id)}>
              Reclamar
            </Link>
          </div>
        ) : (
          <Link key={a.id} href={`/cliente/lugar/${a.data.place.id}`} className="toast-note" onClick={() => quitar(a.id)}>
            <PlaceLogo place={a.data.place} size={40} />
            <div className="grow">
              <span className="caption sm" style={{ marginBottom: 4 }}>
                ¡Nuevo en el mapa!
              </span>
              <b>{a.data.place.name}</b>
              <span className="muted small">acaba de abrir en Planazo</span>
            </div>
            <Icon name="arrowRight" />
          </Link>
        ),
      )}
    </div>
  );
}
