'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { PromoCard } from '@/components/PromoCard';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import { useRtEvent, useTopics } from '@/lib/hooks';
import { CATEGORY_COLOR, CATEGORY_LABEL, ZONES } from '@/lib/seed';
import type { InvUpdatePayload, PlaceDetail, Promo, Reservation } from '@/lib/types';

type Result = { ok: true; reservation: Reservation } | { ok: false; error: string };

const PRICE = ['Gratis', '$', '$$', '$$$'];

export default function LugarPage() {
  const { id } = useParams<{ id: string }>();
  const [place, setPlace] = useState<PlaceDetail | null | undefined>(undefined);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [people, setPeople] = useState(2);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());

  const load = useCallback(() => api.getPlace(id).then(setPlace), [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Suscripción a esta ficha: cualquier cambio de inventario llega aquí (RT-1).
  useTopics([`place:${id}`]);

  useRtEvent<InvUpdatePayload>(['INV.UPDATE'], (e) => {
    if (e.payload.placeId !== id) return;
    const s = e.payload.slot;
    setPlace((p) => (p ? { ...p, slots: p.slots.map((x) => (x.id === s.id ? s : x)) } : p));
    setChanged((c) => new Set(c).add(s.id));
    setTimeout(() => setChanged((c) => {
      const n = new Set(c);
      n.delete(s.id);
      return n;
    }), 1200);
  });
  useRtEvent<Promo>(['PROMO.PUSH'], (e) => {
    if (e.payload.placeId === id) setPlace((p) => (p ? { ...p, promos: [...p.promos, e.payload] } : p));
  });

  if (place === undefined) {
    return (
      <main className="content">
        <div className="skeleton" style={{ height: 16, width: 80 }} />
        <div className="skeleton" style={{ height: 150, marginTop: 12 }} />
        <div className="skeleton" style={{ height: 56, marginTop: 24 }} />
        <div className="skeleton" style={{ height: 56, marginTop: 10 }} />
      </main>
    );
  }
  if (place === null) {
    return (
      <main className="content">
        <p className="alert error">Este lugar no existe.</p>
        <Link href="/cliente/mapa" className="btn ghost section">
          Volver al mapa
        </Link>
      </main>
    );
  }

  const slot = place.slots.find((s) => s.id === slotId) ?? null;
  const free = slot ? slot.capacity - slot.taken : 0;
  const color = CATEGORY_COLOR[place.category];

  /**
   * CC-3: se envía la versión de la franja que el usuario está viendo. Si alguien
   * escribió antes, el servidor responde 409 y volvemos a cargar la disponibilidad real.
   */
  async function reserve() {
    if (!slot) return;
    setBusy(true);
    setResult(null);
    const r = await api.reserve({ slotId: slot.id, people, version: slot.version });
    setBusy(false);
    if (r.ok) {
      setResult({ ok: true, reservation: r.data });
    } else {
      setResult({ ok: false, error: r.error });
      await load();
    }
  }

  return (
    <main className="content">
      <Link href="/cliente/mapa" className="row muted small" style={{ gap: 6, width: 'fit-content' }}>
        <Icon name="arrowLeft" size={16} /> Mapa
      </Link>

      <header
        className="place-hero"
        style={{ background: `linear-gradient(135deg, ${color}55, ${color}14 60%, rgba(255,255,255,0.02))` }}
      >
        <Icon name={place.category} size={120} className="wm" />
        <div className="row" style={{ gap: 8 }}>
          <span className="badge" style={{ background: color, color: '#fff' }}>
            {CATEGORY_LABEL[place.category]}
          </span>
          <span className="muted small">
            {ZONES[place.zone].label} · {PRICE[place.priceLevel]}
          </span>
        </div>
        <h1>{place.name}</h1>
        <p className="muted" style={{ margin: '8px 0 0', maxWidth: 480 }}>
          {place.description}
        </p>
        {place.freeSeats !== null && (
          <div className="row" style={{ marginTop: 14, gap: 6 }}>
            <Icon name="users" size={16} className="muted" />
            <span className="small">
              <b>{place.freeSeats}</b> cupos libres ahora
            </span>
          </div>
        )}
      </header>

      {place.promos.length > 0 && (
        <section className="section stack">
          <h2>Promociones ahora</h2>
          {place.promos.map((p) => (
            <PromoCard key={p.id} promo={p} />
          ))}
        </section>
      )}

      {place.events.length > 0 && (
        <section className="section">
          <h2>Eventos de hoy</h2>
          <div className="card flat list">
            {place.events.map((e) => (
              <div key={e.id} className="item">
                <b style={{ width: 54 }}>{e.startsAt}</b>
                <span style={{ flex: 1 }}>{e.title}</span>
                <span className="muted small">{e.capacity - e.taken} cupos</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>Reservar</h2>

        {place.slots.length === 0 ? (
          <p className="alert info">
            {place.category === 'hotel'
              ? 'La reserva de habitaciones no está disponible todavía.'
              : 'Este lugar no requiere reserva: puedes llegar directamente.'}
          </p>
        ) : result?.ok ? (
          <div className="card ticket fade-in">
            <div className="row" style={{ gap: 8 }}>
              <span className="badge ok">
                <Icon name="check" size={14} /> Confirmada
              </span>
              <span className="muted small">
                {result.reservation.people} persona{result.reservation.people === 1 ? '' : 's'} · {result.reservation.startsAt}
              </span>
            </div>
            <h3 style={{ marginTop: 10 }}>{place.name}</h3>
            <div className="tear" />
            <p className="eyebrow" style={{ margin: '0 0 4px' }}>
              Tu código
            </p>
            <div className="coupon-code">{result.reservation.code}</div>
            <div className="row" style={{ marginTop: 14 }}>
              <Link href="/cliente/planes" className="btn">
                Ver mis planes
              </Link>
              <button className="btn ghost" onClick={() => setResult(null)}>
                Reservar otra
              </button>
            </div>
          </div>
        ) : (
          <div className="stack">
            {place.slots.map((s) => {
              const left = s.capacity - s.taken;
              return (
                <button
                  key={s.id}
                  className={`slot${changed.has(s.id) ? ' changed' : ''}`}
                  aria-pressed={slotId === s.id}
                  disabled={left === 0}
                  onClick={() => setSlotId(s.id)}
                >
                  <span className="time">{s.startsAt}</span>
                  <span className="bar">
                    <i style={{ width: `${(s.taken / s.capacity) * 100}%` }} />
                  </span>
                  <span className="small" style={{ width: 72, textAlign: 'right', fontWeight: 700 }}>
                    {left === 0 ? 'Lleno' : `${left} libre${left === 1 ? '' : 's'}`}
                  </span>
                  {config.demo && <span className="mono muted">v{s.version}</span>}
                </button>
              );
            })}

            <div className="row between" style={{ marginTop: 4 }}>
              <span className="muted">Personas</span>
              <div className="stepper">
                <button onClick={() => setPeople((n) => Math.max(1, n - 1))} disabled={people <= 1} aria-label="Menos">
                  −
                </button>
                <output>{people}</output>
                <button onClick={() => setPeople((n) => Math.min(8, n + 1))} disabled={people >= 8} aria-label="Más">
                  +
                </button>
              </div>
            </div>

            {slot && people > free && free > 0 && (
              <p className="alert info">En esta franja solo quedan {free} cupos.</p>
            )}
            {result && !result.ok && (
              <p className="alert error fade-in" role="alert">
                {result.error}
              </p>
            )}

            <button className="btn block" disabled={!slot || busy || people > free} onClick={reserve}>
              {busy ? 'Reservando…' : slot ? `Reservar ${people} a las ${slot.startsAt}` : 'Elige una franja'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
