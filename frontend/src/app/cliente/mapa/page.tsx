'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AnimatedNumber } from '@/components/fx/AnimatedNumber';
import { Icon, type IconName } from '@/components/Icon';
import { PlaceCard } from '@/components/PlaceCard';
import { PromoCard } from '@/components/PromoCard';
import { api } from '@/lib/api';
import { coverUrl } from '@/lib/brand';
import { useRtEvent } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Category, Place, PlaceCreatedPayload, PlaceUpdatePayload, Promo, PromoWonPayload } from '@/lib/types';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="map skeleton" />,
});

const FILTERS: Array<{ id: Category | 'todos'; label: string; icon: IconName }> = [
  { id: 'todos', label: 'Todos', icon: 'sparkles' },
  { id: 'restaurante', label: 'Restaurantes', icon: 'restaurante' },
  { id: 'bar', label: 'Bares', icon: 'bar' },
  { id: 'discoteca', label: 'Discotecas', icon: 'discoteca' },
  { id: 'evento', label: 'Eventos', icon: 'evento' },
  { id: 'hotel', label: 'Hoteles', icon: 'hotel' },
  { id: 'aire-libre', label: 'Aire libre', icon: 'aire-libre' },
];

const saludo = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

/** Tarjetas fijas al final del carrusel: el carrusel nunca queda medio vacío. */
function Teasers() {
  return (
    <>
      <Link href="/cliente/juego" className="teaser" style={{ background: '#1b2f9a' }}>
        <img src={coverUrl('discoteca-2')} alt="" loading="lazy" />
        <span className="badge gold" style={{ width: 'fit-content' }}>
          <Icon name="trophy" /> Bonos de ganadores
        </span>
        <h3>¡Juega y gana!</h3>
        <span className="small">Queda en el podio del Snake y desbloquea premios de los lugares.</span>
      </Link>
      <Link href="/cliente/agente" className="teaser" style={{ background: '#0e4d3a' }}>
        <img src={coverUrl('bar-2')} alt="" loading="lazy" />
        <span className="badge ok" style={{ width: 'fit-content' }}>
          <Icon name="sparkles" /> Agente
        </span>
        <h3>¿No sabes a dónde ir?</h3>
        <span className="small">Cuéntale al agente con quién vas y te arma la ruta con cupos reales.</span>
      </Link>
    </>
  );
}

export default function MapaPage() {
  const me = useSession();
  const [places, setPlaces] = useState<Place[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [filter, setFilter] = useState<Category | 'todos'>('todos');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  const [feed, setFeed] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([api.listPlaces(), api.activePromos()]).then(([p, pr]) => {
      setPlaces(p);
      setPromos(pr);
      setLoaded(true);
    });
  }, []);

  const nombre = (id: string) => places.find((p) => p.id === id)?.name ?? 'un lugar';
  const contar = (linea: string) => setFeed((f) => [linea, ...f].slice(0, 8));
  const destellar = (id: string) => {
    setFlash((s) => new Set(s).add(id));
    setTimeout(() => setFlash((s) => { const n = new Set(s); n.delete(id); return n; }), 1200);
  };

  // RT-1: la disponibilidad cambia sola, sin recargar.
  useRtEvent<PlaceUpdatePayload>(['PLACE.UPDATE'], (e) => {
    const antes = places.find((p) => p.id === e.payload.placeId)?.freeSeats;
    setPlaces((ps) => ps.map((p) => (p.id === e.payload.placeId ? { ...p, freeSeats: e.payload.freeSeats } : p)));
    destellar(e.payload.placeId);
    if (antes != null && e.payload.freeSeats != null && e.payload.freeSeats < antes) {
      const n = antes - e.payload.freeSeats;
      contar(`Alguien acaba de reservar ${n} cupo${n === 1 ? '' : 's'} en ${nombre(e.payload.placeId)}`);
    }
  });
  useRtEvent<PlaceCreatedPayload>(['PLACE.CREATED'], (e) => {
    setPlaces((ps) => (ps.some((p) => p.id === e.payload.place.id) ? ps : [...ps, e.payload.place]));
    setNuevos((s) => new Set(s).add(e.payload.place.id));
    contar(`¡${e.payload.place.name} acaba de abrir en Planazo!`);
  });
  useRtEvent<Promo>(['PROMO.PUSH'], (e) => {
    setPromos((ps) => [...ps.filter((x) => x.id !== e.payload.id), e.payload]);
    contar(`${e.payload.placeName} lanzó: ${e.payload.discount} · ${e.payload.title}`);
  });
  useRtEvent<PromoWonPayload>(['PROMO.WON'], (e) => {
    setPromos((ps) => ps.map((x) => (x.id === e.payload.promoId ? { ...x, stock: e.payload.stock } : x)).filter((x) => x.stock > 0));
    contar(`${e.payload.winner} se llevó un cupón en ${nombre(e.payload.placeId)}`);
  });
  useRtEvent<{ promoId: string }>(['PROMO.EXPIRED'], (e) => setPromos((ps) => ps.filter((x) => x.id !== e.payload.promoId)));

  const activas = useMemo(() => promos.filter((p) => p.expiresAt > Date.now() && p.stock > 0), [promos]);
  const promoBy = useMemo(() => new Set(activas.map((p) => p.placeId)), [activas]);
  const conteo = useMemo(() => {
    const c: Record<string, number> = { todos: places.length };
    for (const p of places) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [places]);
  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return places
      .filter((p) => (filter === 'todos' || p.category === filter) && (!t || p.name.toLowerCase().includes(t) || p.description.toLowerCase().includes(t)))
      .sort((a, b) => Number(nuevos.has(b.id)) - Number(nuevos.has(a.id)) || Number(promoBy.has(b.id)) - Number(promoBy.has(a.id)));
  }, [places, filter, q, promoBy, nuevos]);
  const freeTotal = useMemo(() => places.reduce((a, p) => a + (p.freeSeats ?? 0), 0), [places]);

  // La tira nunca está vacía: arranca con lo que está pasando ahora mismo.
  const tira = useMemo(() => {
    if (feed.length) return feed;
    const top = [...places].filter((p) => p.freeSeats).sort((a, b) => (b.freeSeats ?? 0) - (a.freeSeats ?? 0))[0];
    return [
      `${freeTotal} cupos libres en este momento entre la Zona G y la Zona T`,
      activas.length ? `${activas.length} promociones relámpago activas` : 'Las promociones llegan en vivo: mantén la app abierta',
      top ? `${top.name} tiene ${top.freeSeats} cupos esperándote` : 'Los cupos se actualizan solos, sin recargar',
      'Gana una partida en el minijuego y desbloquea bonos exclusivos',
    ];
  }, [feed, places, activas, freeTotal]);

  return (
    <main className="content full">
      <div className="headline">
        <div>
          <span className="caption sm">
            {saludo()}, {me?.name?.split(' ')[0] ?? 'parcero'}. Mientras tanto, en Chapinero…
          </span>
          <h1 style={{ marginTop: 12 }} className="misprint-hover">
            ¿Qué hay <em className="serif">cerca?</em>
          </h1>
        </div>
        {loaded && (
          <div className="counter">
            <AnimatedNumber value={freeTotal} className="stat" />
            <div className="muted small">cupos libres</div>
          </div>
        )}
      </div>

      <div className="ticker section" style={{ marginTop: 16 }} aria-live="off">
        <span className="label">EN VIVO</span>
        <div className="track" style={{ '--t': `${Math.max(24, tira.length * 9)}s` } as React.CSSProperties}>
          {[...tira, ...tira].map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>
            <Icon name="bolt" size={18} /> Promos relámpago
          </h2>
          {activas.length > 0 && <span className="badge live">{activas.length} activas</span>}
        </div>
        {!loaded ? (
          <div className="rail-h">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 220 }} />
            ))}
          </div>
        ) : activas.length === 0 ? (
          <div className="empty">
            <span className="caption">¡Silencio en la ciudad!</span>
            <p className="muted small" style={{ margin: 0 }}>
              Ahora no hay promociones activas. Cuando un lugar lance una, te llega aquí en el momento.
            </p>
            <Link href="/cliente/juego" className="btn sm ghost">
              <Icon name="gamepad" /> Mientras tanto, juega por un bono
            </Link>
          </div>
        ) : (
          <div className="rail-h">
            {activas.map((p) => (
              <PromoCard key={p.id} promo={p} compact />
            ))}
            <Teasers />
          </div>
        )}
      </section>

      <div className="chips section" role="group" aria-label="Filtrar por categoría" style={{ marginTop: 18 }}>
        {FILTERS.map((f) => (
          <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            <Icon name={f.icon} />
            {f.label}
            {loaded && <span className="n">{conteo[f.id] ?? 0}</span>}
          </button>
        ))}
      </div>

      <div className="explore" style={{ marginTop: 10 }}>
        <div className="map-col">
          <MapView
            places={visible}
            selectedId={selected}
            onSelect={setSelected}
            promoPlaceIds={promoBy}
            newIds={nuevos}
            tall
          />
        </div>

        <section>
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 className="grow">{loaded ? `${visible.length} lugar${visible.length === 1 ? '' : 'es'}` : 'Lugares'}</h2>
            <label className="row" style={{ gap: 6, flex: '0 1 220px' }}>
              <span className="visually-hidden">Buscar</span>
              <input className="input" style={{ minHeight: 40, fontSize: 14, width: '100%' }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          <div className="stack stagger">
            {!loaded && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 104 }} />)}
            {loaded && visible.length === 0 && (
              <div className="empty">
                <span className="caption">¡Nada por aquí!</span>
                <p className="muted small" style={{ margin: 0 }}>
                  No hay lugares con ese filtro. Prueba otra categoría o borra la búsqueda.
                </p>
                <button className="btn sm ghost" onClick={() => { setFilter('todos'); setQ(''); }}>
                  Ver todos
                </button>
              </div>
            )}
            {visible.map((p, i) => (
              <PlaceCard
                key={p.id}
                place={p}
                promo={promoBy.has(p.id)}
                flash={flash.has(p.id)}
                isNew={nuevos.has(p.id)}
                onHover={(id) => id && setSelected(id)}
                style={{ '--i': Math.min(i, 10) } as React.CSSProperties}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
