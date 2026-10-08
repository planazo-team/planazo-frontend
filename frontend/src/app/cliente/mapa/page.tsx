'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CategoryIcon } from '@/components/Icon';
import { api } from '@/lib/api';
import { useRtEvent } from '@/lib/hooks';
import { CATEGORY_COLOR, CATEGORY_LABEL, ZONES } from '@/lib/seed';
import type { Category, Place, PlaceUpdatePayload, Promo } from '@/lib/types';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="map skeleton" />,
});

const FILTERS: Array<{ id: Category | 'todos'; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'restaurante', label: 'Restaurantes' },
  { id: 'bar', label: 'Bares' },
  { id: 'discoteca', label: 'Discotecas' },
  { id: 'evento', label: 'Eventos' },
  { id: 'hotel', label: 'Hoteles' },
  { id: 'aire-libre', label: 'Aire libre' },
];

function SeatsBadge({ n }: { n: number | null }) {
  if (n === null) return <span className="badge">Sin reserva</span>;
  if (n === 0) return <span className="badge none">Lleno</span>;
  return <span className={`badge ${n <= 5 ? 'low' : 'ok'}`}>{n} cupos</span>;
}

export default function MapaPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [filter, setFilter] = useState<Category | 'todos'>('todos');
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api.listPlaces(), api.activePromos()]).then(([p, pr]) => {
      setPlaces(p);
      setPromos(pr);
      setLoaded(true);
    });
  }, []);

  // RT-1: la disponibilidad cambia sola, sin recargar.
  useRtEvent<PlaceUpdatePayload>(['PLACE.UPDATE'], (e) => {
    setPlaces((ps) => ps.map((p) => (p.id === e.payload.placeId ? { ...p, freeSeats: e.payload.freeSeats } : p)));
  });
  useRtEvent<Promo>(['PROMO.PUSH'], (e) => setPromos((ps) => [...ps.filter((x) => x.id !== e.payload.id), e.payload]));
  useRtEvent<{ promoId: string; stock: number }>(['PROMO.WON'], (e) =>
    setPromos((ps) => ps.map((x) => (x.id === e.payload.promoId ? { ...x, stock: e.payload.stock } : x)).filter((x) => x.stock > 0)),
  );
  useRtEvent<{ promoId: string }>(['PROMO.EXPIRED'], (e) => setPromos((ps) => ps.filter((x) => x.id !== e.payload.promoId)));

  const visible = useMemo(
    () => (filter === 'todos' ? places : places.filter((p) => p.category === filter)),
    [places, filter],
  );
  const promoBy = useMemo(() => new Set(promos.filter((p) => p.expiresAt > Date.now()).map((p) => p.placeId)), [promos]);
  const freeTotal = useMemo(() => places.reduce((a, p) => a + (p.freeSeats ?? 0), 0), [places]);

  return (
    <main className="content">
      <div className="row between" style={{ marginBottom: 14, alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">
            {ZONES['zona-g'].label} · {ZONES['zona-t'].label} · Chapinero
          </span>
          <h1 style={{ marginTop: 4 }}>
            ¿Qué hay <em className="serif">cerca?</em>
          </h1>
        </div>
        {loaded && (
          <div style={{ textAlign: 'right' }}>
            <div className="stat" style={{ color: 'var(--brand)', fontSize: 24 }}>
              {freeTotal}
            </div>
            <div className="muted small">cupos libres</div>
          </div>
        )}
      </div>

      <div className="chips" role="group" aria-label="Filtrar por categoría" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <MapView
        places={visible}
        selectedId={selected}
        onSelect={(id) => {
          setSelected(id);
          router.push(`/cliente/lugar/${id}`);
        }}
      />

      <section className="section">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2>{loaded ? `${visible.length} lugares` : 'Lugares'}</h2>
          {promoBy.size > 0 && <span className="badge promo">{promoBy.size} con promo</span>}
        </div>
        <div className="stack">
          {!loaded &&
            [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}
          {visible.map((p) => (
            <Link key={p.id} href={`/cliente/lugar/${p.id}`} className="card link flat">
              <div className="row">
                <CategoryIcon category={p.category} color={CATEGORY_COLOR[p.category]} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{p.name}</h3>
                  <div className="muted small">
                    {CATEGORY_LABEL[p.category]} · {ZONES[p.zone].label}
                  </div>
                </div>
                <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                  <SeatsBadge n={p.freeSeats} />
                  {promoBy.has(p.id) && <span className="badge promo">Promo</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
