'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon, SpiderArt } from '@/components/Icon';
import { PlaceLogo } from '@/components/Logo';
import { api } from '@/lib/api';
import { coverOf } from '@/lib/brand';
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

  // Llega a `user:<id>` cuando una reserva propia se confirma o se gana un cupón.
  useRtEvent(['RESERVE.OK', 'PROMO.WON'], () => load());

  return (
    <main className="content">
      <span className="caption sm">Tu noche, en tiquetes</span>
      <h1 style={{ marginTop: 12 }}>
        Mis <em className="serif">planes</em>
      </h1>

      <div className="segmented section" role="tablist" style={{ marginTop: 18 }}>
        <button role="tab" aria-pressed={tab === 'reservas'} onClick={() => setTab('reservas')}>
          <Icon name="ticket" /> Reservas · {reservations.length}
        </button>
        <button role="tab" aria-pressed={tab === 'cupones'} onClick={() => setTab('cupones')}>
          <Icon name="tag" /> Cupones · {coupons.length}
        </button>
      </div>

      {!loaded && (
        <div className="stack section">
          <div className="skeleton" style={{ height: 150 }} />
          <div className="skeleton" style={{ height: 150 }} />
        </div>
      )}

      {loaded && tab === 'reservas' && (
        <div className="stack section stagger">
          {reservations.length === 0 ? (
            <div className="empty">
              <SpiderArt size={64} color="#f1f7f4" eyes="#070d0c" />
              <span className="caption">Tu telaraña está vacía</span>
              <p className="muted small" style={{ margin: 0, maxWidth: 320 }}>
                Todavía no tienes reservas. Explora el mapa, elige una franja y asegura tu cupo antes de que vuele.
              </p>
              <Link href="/cliente/mapa" className="btn sm">
                <Icon name="map" /> Explorar el mapa
              </Link>
            </div>
          ) : (
            reservations.map((r, i) => (
              <div key={r.id} className="card ticket" style={{ '--i': i } as React.CSSProperties}>
                <span className="stamp">CONFIRMADA</span>
                <div className="row">
                  <span className="thumb">
                    <img src={coverOf({ id: r.placeId, category: 'restaurante' })} alt="" />
                  </span>
                  <div className="grow">
                    <h3>{r.placeName}</h3>
                    <p className="muted small" style={{ margin: '2px 0 0' }}>
                      <Icon name="clock" size={13} /> {r.startsAt} · {r.people} persona{r.people === 1 ? '' : 's'}
                    </p>
                    <p className="faint tiny" style={{ margin: 0 }}>
                      reservada a las {time(r.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="tear" />
                <div className="row between">
                  <span className="eyebrow">Código</span>
                  <span className="coupon-code">{r.code}</span>
                </div>
                <Link href={`/cliente/lugar/${r.placeId}`} className="btn ghost sm block" style={{ marginTop: 12 }}>
                  Ver el lugar
                </Link>
              </div>
            ))
          )}
        </div>
      )}

      {loaded && tab === 'cupones' && (
        <div className="stack section stagger">
          {coupons.length === 0 ? (
            <div className="empty">
              <span className="boom" style={{ fontSize: 22, minWidth: 100, minHeight: 74 }}>
                ¿¡Y!?
              </span>
              <span className="caption">Aún no tienes cupones</span>
              <p className="muted small" style={{ margin: 0, maxWidth: 320 }}>
                Cuando un lugar lance una promoción te llega en vivo: reclámala antes de que se agote. O gana una partida del
                minijuego y desbloquea bonos de ganadores.
              </p>
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <Link href="/cliente/mapa" className="btn sm">
                  <Icon name="bolt" /> Ver promos
                </Link>
                <Link href="/cliente/juego" className="btn sm ghost">
                  <Icon name="gamepad" /> Jugar
                </Link>
              </div>
            </div>
          ) : (
            coupons.map((c, i) => (
              <div key={c.id} className="card ticket" style={{ '--i': i } as React.CSSProperties}>
                <span className="stamp gold">CUPÓN</span>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <PlaceLogo place={{ id: c.promoId, name: c.placeName, category: 'bar' }} size={48} />
                  <div className="grow">
                    <b className="comic" style={{ fontSize: 28, color: 'var(--yellow)', lineHeight: 1 }}>
                      {c.discount}
                    </b>
                    <h3 style={{ marginTop: 4 }}>{c.title}</h3>
                    <p className="muted small" style={{ margin: 0 }}>
                      {c.placeName} · reclamado a las {time(c.claimedAt)}
                    </p>
                  </div>
                </div>
                <div className="tear" />
                <div className="row between">
                  <span className="eyebrow">Muéstralo en caja</span>
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
