'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatedNumber } from '@/components/fx/AnimatedNumber';
import { Icon, type IconName } from '@/components/Icon';
import { PromoCard } from '@/components/PromoCard';
import { api } from '@/lib/api';
import { useRtEvent } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Coupon, Promo, PromoWonPayload } from '@/lib/types';

type Filtro = 'todas' | 'relampago' | 'ganadores' | 'zona-g' | 'zona-t';

const FILTROS: Array<{ id: Filtro; label: string; icon: IconName }> = [
  { id: 'todas', label: 'Todas', icon: 'sparkles' },
  { id: 'relampago', label: 'Relámpago', icon: 'bolt' },
  { id: 'ganadores', label: 'Para ganadores', icon: 'trophy' },
  { id: 'zona-g', label: 'Zona G', icon: 'pin' },
  { id: 'zona-t', label: 'Zona T', icon: 'pin' },
];

const cumple = (f: Filtro, p: Promo) =>
  f === 'todas' ||
  (f === 'relampago' && !p.soloGanadores) ||
  (f === 'ganadores' && !!p.soloGanadores) ||
  (f === 'zona-g' && p.zone === 'zona-g') ||
  (f === 'zona-t' && p.zone === 'zona-t');

/**
 * Todas las promociones y descuentos activos, en vivo: las nuevas llegan solas
 * (PROMO.PUSH), el stock baja mientras otros reclaman (PROMO.WON) y las que
 * vencen o se agotan desaparecen.
 */
export default function PromosPage() {
  const me = useSession();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [cupones, setCupones] = useState<Coupon[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [loaded, setLoaded] = useState(false);
  const [nuevas, setNuevas] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([api.activePromos(), api.myCoupons()]);
    setPromos(p);
    setCupones(c);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRtEvent<Promo>(['PROMO.PUSH'], (e) => {
    setPromos((ps) => [...ps.filter((x) => x.id !== e.payload.id), e.payload]);
    setNuevas((s) => new Set(s).add(e.payload.id));
  });
  useRtEvent<PromoWonPayload>(['PROMO.WON'], (e) => {
    setPromos((ps) => ps.map((x) => (x.id === e.payload.promoId ? { ...x, stock: e.payload.stock } : x)));
  });
  useRtEvent<{ promoId: string }>(['PROMO.EXPIRED'], (e) => setPromos((ps) => ps.filter((x) => x.id !== e.payload.promoId)));
  // Un cupón ganado por mí: se refresca la lista de cupones.
  useRtEvent<PromoWonPayload>(['PROMO.WON'], (e) => {
    if (e.payload.userId && e.payload.userId === me?.id) api.myCoupons().then(setCupones);
  });

  const activas = useMemo(
    () => promos.filter((p) => p.expiresAt > Date.now() && p.stock > 0).sort((a, b) => a.expiresAt - b.expiresAt),
    [promos],
  );
  const conteo = useMemo(() => {
    const c = {} as Record<Filtro, number>;
    for (const f of FILTROS) c[f.id] = activas.filter((p) => cumple(f.id, p)).length;
    return c;
  }, [activas]);
  const visibles = activas.filter((p) => cumple(filtro, p));
  const cuponesDisponibles = activas.reduce((a, p) => a + p.stock, 0);

  return (
    <main className="content wide">
      <span className="caption sm">Todo lo que está en oferta ahora mismo</span>
      <h1 style={{ marginTop: 12 }} className="misprint-hover">
        Promos y <em className="serif">descuentos</em>
      </h1>
      <p className="muted" style={{ maxWidth: 620 }}>
        Llegan en vivo y vuelan: cada una tiene cupones contados. Las de <b>ganadores</b> se desbloquean quedando en el podio del
        minijuego.
      </p>

      <div className="stat-tiles section">
        <div className="card stat-tile">
          <span className="eyebrow">Activas</span>
          <AnimatedNumber value={activas.length} className="stat" />
        </div>
        <div className="card stat-tile">
          <span className="eyebrow">Cupones libres</span>
          <AnimatedNumber value={cuponesDisponibles} className="stat" />
        </div>
        <Link href="/cliente/planes" className="card link stat-tile">
          <span className="eyebrow">Tus cupones</span>
          <div className="stat" style={{ color: 'var(--yellow)' }}>
            <AnimatedNumber value={cupones.length} />
          </div>
        </Link>
      </div>

      <div className="chips section" role="group" aria-label="Filtrar promociones" style={{ marginTop: 18 }}>
        {FILTROS.map((f) => (
          <button key={f.id} className="chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
            <Icon name={f.icon} />
            {f.label}
            {loaded && <span className="n">{conteo[f.id]}</span>}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="promo-grid section">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 230 }} />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="empty section">
          <span className="boom" style={{ fontSize: 22, minWidth: 100, minHeight: 74 }}>
            ¡UPS!
          </span>
          <span className="caption">{filtro === 'todas' ? 'Ahora no hay promociones activas' : 'Nada con ese filtro'}</span>
          <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
            {filtro === 'ganadores'
              ? 'Cuando un lugar lance un bono para ganadores aparece aquí. Mientras tanto, practica en el Snake.'
              : 'Las promociones relámpago llegan en vivo: deja la app abierta y te avisamos en el momento.'}
          </p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            {filtro !== 'todas' && (
              <button className="btn sm ghost" onClick={() => setFiltro('todas')}>
                Ver todas
              </button>
            )}
            <Link href="/cliente/juego" className="btn sm">
              <Icon name="gamepad" /> Jugar por bonos
            </Link>
          </div>
        </div>
      ) : (
        <div className="promo-grid section stagger">
          {visibles.map((p, i) => (
            <div key={p.id} style={{ '--i': Math.min(i, 8) } as React.CSSProperties} className={nuevas.has(p.id) ? 'pop-in' : undefined}>
              <PromoCard promo={p} />
            </div>
          ))}
        </div>
      )}

      {cupones.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>
              <Icon name="tag" size={18} /> Tus cupones
            </h2>
            <Link href="/cliente/planes" className="btn ghost sm">
              Ver todos <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          <div className="rail-h">
            {cupones.slice(0, 6).map((c) => (
              <div key={c.id} className="card ticket" style={{ flexBasis: 240 }}>
                <b className="comic" style={{ fontSize: 24, color: 'var(--yellow)' }}>
                  {c.discount}
                </b>
                <div className="small muted">{c.placeName}</div>
                <div className="tear" />
                <span className="coupon-code" style={{ fontSize: 16 }}>
                  {c.code}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
