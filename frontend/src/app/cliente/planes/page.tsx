'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/api';
import { useRtEvent } from '@/lib/hooks';
import type { Coupon, Reservation } from '@/lib/types';

const time = (ms: number) => new Date(ms).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

export default function PlanesPage() {
  const [tab, setTab] = useState<'reservas' | 'cupones'>('reservas');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([api.myReservations(), api.myCoupons()]);
    setReservations(r);
    setCoupons(c);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Llega a `user:<id>` cuando una reserva propia se confirma.
  useRtEvent(['RESERVE.OK'], () => load());

  return (
    <main className="content">
      <span className="eyebrow">Tus reservas y cupones</span>
      <h1 style={{ marginTop: 4 }}>
        Mis <em className="serif">planes</em>
      </h1>

      <div className="chips section" role="tablist">
        <button className="chip" role="tab" aria-pressed={tab === 'reservas'} onClick={() => setTab('reservas')}>
          Reservas · {reservations.length}
        </button>
        <button className="chip" role="tab" aria-pressed={tab === 'cupones'} onClick={() => setTab('cupones')}>
          Cupones · {coupons.length}
        </button>
      </div>

      {!loaded && (
        <div className="stack section">
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      )}

      {loaded && tab === 'reservas' && (
        <div className="stack section">
          {reservations.length === 0 ? (
            <div className="alert info">
              Todavía no tienes reservas. <Link href="/cliente/mapa">Explora el mapa</Link> y asegura tu cupo.
            </div>
          ) : (
            reservations.map((r) => (
              <div key={r.id} className="card ticket flat">
                <div className="row between">
                  <h3>{r.placeName}</h3>
                  <span className="badge ok">
                    <Icon name="check" size={14} /> Confirmada
                  </span>
                </div>
                <p className="muted small" style={{ margin: '4px 0 0' }}>
                  <Icon name="clock" size={13} /> {r.startsAt} · {r.people} persona{r.people === 1 ? '' : 's'} · reservada a
                  las {time(r.createdAt)}
                </p>
                <div className="tear" />
                <div className="row between">
                  <span className="eyebrow">Código</span>
                  <span className="coupon-code">{r.code}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {loaded && tab === 'cupones' && (
        <div className="stack section">
          {coupons.length === 0 ? (
            <div className="alert info">
              Aún no tienes cupones. Cuando un lugar cercano lance una promoción te llegará en vivo: reclámala antes de
              que se agote.
            </div>
          ) : (
            coupons.map((c) => (
              <div key={c.id} className="card ticket flat">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <b className="stat" style={{ fontSize: 24, color: 'var(--accent)' }}>
                      {c.discount}
                    </b>
                    <h3 style={{ marginTop: 4 }}>{c.title}</h3>
                    <p className="muted small" style={{ margin: 0 }}>
                      {c.placeName} · reclamado a las {time(c.claimedAt)}
                    </p>
                  </div>
                  <span className="badge promo">
                    <Icon name="tag" size={13} /> Cupón
                  </span>
                </div>
                <div className="tear" />
                <div className="row between">
                  <span className="eyebrow">Muéstralo en {c.placeName}</span>
                  <span className="coupon-code">{c.code}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}
