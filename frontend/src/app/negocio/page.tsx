'use client';

import { useCallback, useEffect, useState } from 'react';
import { CrearLugar } from '@/components/business/CrearLugar';
import { AnimatedNumber } from '@/components/fx/AnimatedNumber';
import { boom } from '@/components/fx/eggs';
import { Icon } from '@/components/Icon';
import { PlaceLogo } from '@/components/Logo';
import { api } from '@/lib/api';
import { coverOf } from '@/lib/brand';
import { config } from '@/lib/config';
import { useNow, useRtEvent, useTopics } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CATEGORY_LABEL, ZONES } from '@/lib/seed';
import type { InvUpdatePayload, PlaceDetail, Promo, PromoWonPayload, Reservation, Slot } from '@/lib/types';

const time = (ms: number) => new Date(ms).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

export default function PanelPage() {
  const me = useSession();
  if (!me) return null;
  // Un negocio recién llegado todavía no tiene lugar: primero lo crea.
  if (!me.placeId) return <CrearLugar user={me} />;
  return <Panel placeId={me.placeId} />;
}

function Panel({ placeId }: { placeId: string }) {
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  // El panel sigue su propio establecimiento: reservas, inventario y reclamos de sus promociones.
  useTopics([`place:${placeId}`]);

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([api.getPlace(placeId), api.placeReservations(placeId)]);
    setPlace(p);
    setReservations(r);
  }, [placeId]);

  useEffect(() => {
    load();
  }, [load]);

  // RT-1 en el panel: cada reserva y cada cambio de inventario llegan solos.
  useRtEvent<Reservation>(['RESERVE.OK'], (e) => {
    if (e.payload.placeId !== placeId) return;
    setReservations((rs) => (rs.some((r) => r.id === e.payload.id) ? rs : [e.payload, ...rs]));
    boom('¡RESERVA!', window.innerWidth - 120, 140);
  });
  useRtEvent<InvUpdatePayload>(['INV.UPDATE'], (e) => {
    if (e.payload.placeId !== placeId) return;
    setPlace((p) => (p ? { ...p, slots: p.slots.map((s) => (s.id === e.payload.slot.id ? e.payload.slot : s)) } : p));
  });

  if (!place) {
    return (
      <main className="content wide">
        <div className="skeleton" style={{ height: 180, borderRadius: 22 }} />
        <div className="stat-tiles section">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 84 }} />
          ))}
        </div>
        <div className="grid2 section">
          <div className="skeleton" style={{ height: 260 }} />
          <div className="skeleton" style={{ height: 260 }} />
        </div>
      </main>
    );
  }

  const free = place.slots.reduce((a, s) => a + s.capacity - s.taken, 0);
  const people = reservations.reduce((a, r) => a + r.people, 0);

  return (
    <main className="content wide">
      <header className="biz-hero">
        <img src={coverOf(place)} alt="" />
        <PlaceLogo place={place} size={78} />
        <div className="grow">
          <span className="caption sm">Panel del establecimiento</span>
          <h1 style={{ marginTop: 10 }} className="misprint-hover">
            {place.name}
          </h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            {CATEGORY_LABEL[place.category]} · {ZONES[place.zone].label} · todo se actualiza en vivo
          </div>
        </div>
      </header>

      <div className="stat-tiles section">
        <div className="card stat-tile">
          <span className="eyebrow">Reservas</span>
          <AnimatedNumber value={reservations.length} className="stat" />
        </div>
        <div className="card stat-tile">
          <span className="eyebrow">Personas</span>
          <AnimatedNumber value={people} className="stat" />
        </div>
        <div className="card stat-tile">
          <span className="eyebrow">Cupos libres</span>
          <div className="stat" style={{ color: free <= 5 ? 'var(--accent)' : undefined }}>
            <AnimatedNumber value={free} />
          </div>
        </div>
      </div>

      <div className="grid2 section">
        <div className="stack" style={{ gap: 16 }}>
          <PromoLauncher placeId={place.id} placeName={place.name} zone={place.zone} />
          <SlotEditor placeId={place.id} slots={place.slots} onReload={load} />
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <Reservations items={reservations} />
          <EventForm placeId={place.id} events={place.events} onCreated={load} />
        </div>
      </div>
    </main>
  );
}

/* ================================================================== */
/* Cupos por franja — CC-3 desde el lado del negocio                   */
/* ================================================================== */

type Draft = { capacity: number; baseVersion: number };

function SlotEditor({ placeId, slots, onReload }: { placeId: string; slots: Slot[]; onReload: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /** La versión base se toma cuando el usuario EMPIEZA a editar, no cuando guarda. */
  function change(s: Slot, delta: number) {
    setDrafts((d) => {
      const cur = d[s.id] ?? { capacity: s.capacity, baseVersion: s.version };
      return { ...d, [s.id]: { ...cur, capacity: Math.max(1, cur.capacity + delta) } };
    });
  }

  async function save(s: Slot) {
    const d = drafts[s.id];
    if (!d) return;
    setSaving(s.id);
    setMsg(null);
    const r = await api.updateSlotCapacity({ placeId, slotId: s.id, capacity: d.capacity, version: d.baseVersion });
    setSaving(null);
    setDrafts(({ [s.id]: _, ...rest }) => rest);
    if (r.ok) {
      setMsg({ ok: true, text: `Franja de las ${s.startsAt} actualizada a ${r.data.capacity} cupos.` });
    } else {
      setMsg({ ok: false, text: r.error });
      onReload();
    }
  }

  return (
    <section className="card">
      <h2>Cupos por franja</h2>
      <p className="muted small" style={{ margin: '4px 0 12px' }}>
        Si otro dispositivo de tu equipo cambia la misma franja antes que tú, te avisamos en lugar de pisar su cambio.
      </p>
      <div className="list">
        {slots.map((s) => {
          const d = drafts[s.id];
          const shown = d?.capacity ?? s.capacity;
          const stale = d && d.baseVersion !== s.version;
          return (
            <div key={s.id} className="item" style={{ flexWrap: 'wrap' }}>
              <b style={{ width: 54, fontVariantNumeric: 'tabular-nums' }}>{s.startsAt}</b>
              <span className="muted small" style={{ flex: 1, minWidth: 90 }}>
                {s.taken} reservados
                {config.demo && <span className="mono"> · v{s.version}</span>}
              </span>
              <div className="stepper">
                <button onClick={() => change(s, -1)} disabled={shown <= Math.max(1, s.taken)} aria-label="Menos cupos">
                  −
                </button>
                <output>{shown}</output>
                <button onClick={() => change(s, 1)} aria-label="Más cupos">
                  +
                </button>
              </div>
              <button className="btn sm" disabled={!d || saving === s.id} onClick={() => save(s)}>
                {saving === s.id ? 'Guardando…' : 'Guardar'}
              </button>
              {config.demo && api.demo && (
                <button
                  className="btn ghost sm"
                  onClick={() => api.demo!.bumpFromOtherDevice(s.id)}
                  title="Simula que otro dispositivo del equipo edita esta franja"
                >
                  Otro dispositivo
                </button>
              )}
              {stale && (
                <p className="alert info small" style={{ width: '100%', margin: '6px 0 0' }}>
                  Esta franja cambió mientras la editabas. Al guardar se detectará el conflicto.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {msg && (
        <p className={`alert ${msg.ok ? 'ok' : 'error'} fade-in`} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 12 }}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

/* ================================================================== */
/* Lanzar promoción — CC-1 visto desde el negocio                      */
/* ================================================================== */

type Claim = { winner: string; stock: number; at: number };

const PLANTILLAS: Array<{ title: string; discount: string }> = [
  { title: 'Cóctel de la casa a mitad de precio', discount: '-50%' },
  { title: '2x1 en la primera ronda', discount: '2x1' },
  { title: 'Postre gratis con tu plato', discount: 'Postre gratis' },
  { title: 'Entrada sin cover antes de las 11', discount: 'Cover gratis' },
];

function PromoLauncher({ placeId, placeName, zone }: { placeId: string; placeName: string; zone: PlaceDetail['zone'] }) {
  const now = useNow(500);
  const [title, setTitle] = useState(PLANTILLAS[0].title);
  const [discount, setDiscount] = useState(PLANTILLAS[0].discount);
  const [stock, setStock] = useState(3);
  const [duration, setDuration] = useState(120);
  const [soloGanadores, setSoloGanadores] = useState(false);
  const [puestos, setPuestos] = useState(1);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Promo | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useRtEvent<PromoWonPayload>(['PROMO.WON'], (e) => {
    if (!live || e.payload.promoId !== live.id) return;
    setLive((p) => (p ? { ...p, stock: e.payload.stock } : p));
    setClaims((c) => [{ winner: e.payload.winner, stock: e.payload.stock, at: e.at }, ...c]);
  });
  useRtEvent<{ promoId: string }>(['PROMO.EXPIRED'], (e) => {
    if (live && e.payload.promoId === live.id) setExpired(true);
  });

  async function launch() {
    setBusy(true);
    setError(null);
    const r = await api.launchPromo({
      placeId,
      title,
      discount,
      stock,
      durationS: duration,
      soloGanadores,
      puestos: soloGanadores ? puestos : undefined,
      // Si promo aún no conoce este lugar (recién creado), con esto lo registra.
      placeName,
      zone,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setLive(r.data);
    setClaims([]);
    setExpired(false);
    boom(soloGanadores ? '¡A JUGAR!' : '¡LANZADA!', window.innerWidth / 2, 220, soloGanadores);
  }

  const left = live ? Math.max(0, Math.ceil((live.expiresAt - now) / 1000)) : 0;
  const over = !!live && (expired || left === 0 || live.stock === 0);

  return (
    <section className="card">
      <div className="row between">
        <h2>
          <Icon name="bolt" size={18} /> Lanzar promoción
        </h2>
        {live && !over && <span className="badge live">En el aire</span>}
      </div>
      <p className="muted small" style={{ margin: '6px 0 14px' }}>
        Llega en el momento a quienes miran tu zona. Nunca se entregan más cupones que el stock, y cada persona reclama una sola vez.
      </p>

      {live && !over ? (
        <div className={`promo-card fade-in${live.soloGanadores ? ' winners' : ''}`}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div>
              {live.soloGanadores && (
                <span className="badge gold" style={{ marginBottom: 6 }}>
                  <Icon name="trophy" /> {live.puestos && live.puestos > 1 ? `Top ${live.puestos}` : 'Solo el ganador'}
                </span>
              )}
              <div className="disc">{live.discount}</div>
              <div className="title">{live.title}</div>
            </div>
            <span className="pill">
              <Icon name="clock" /> {left} s
            </span>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <span className="bar" style={{ background: 'rgba(0,0,0,.25)' }}>
              <i style={{ width: `${(1 - live.stock / live.initialStock) * 100}%`, background: '#fff' }} />
            </span>
            <b className="small tnum">
              {live.initialStock - live.stock} de {live.initialStock}
            </b>
          </div>
        </div>
      ) : (
        <form
          className="stack"
          style={{ gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            launch();
          }}
        >
          <div className="chips" aria-label="Ideas rápidas">
            {PLANTILLAS.map((p) => (
              <button
                key={p.title}
                type="button"
                className="chip"
                aria-pressed={title === p.title}
                onClick={() => {
                  setTitle(p.title);
                  setDiscount(p.discount);
                }}
              >
                {p.discount}
              </button>
            ))}
          </div>
          <label className="field">
            Oferta
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
          </label>
          <div className="row wrap">
            <label className="field" style={{ flex: '1 1 110px' }}>
              Descuento
              <input value={discount} onChange={(e) => setDiscount(e.target.value)} required maxLength={40} />
            </label>
            <label className="field" style={{ flex: '1 1 80px' }}>
              Cupones
              <input type="number" min={1} max={1000} value={stock} onChange={(e) => setStock(Number(e.target.value))} />
            </label>
            <label className="field" style={{ flex: '1 1 90px' }}>
              Duración (s)
              <input type="number" min={10} max={86400} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </label>
          </div>

          <div className="card flat" style={{ padding: 12, background: soloGanadores ? 'rgba(47,107,255,.14)' : undefined }}>
            <label className="switch">
              <input type="checkbox" checked={soloGanadores} onChange={(e) => setSoloGanadores(e.target.checked)} />
              <span className="grow">
                <b style={{ display: 'block' }}>
                  <Icon name="trophy" size={15} /> Solo para ganadores del minijuego
                </b>
                <span className="muted small">La reclama quien quede en el podio de una partida jugada después de lanzarla.</span>
              </span>
            </label>
            {soloGanadores && (
              <div className="segmented fade-in" style={{ marginTop: 10 }}>
                {[1, 2, 3].map((n) => (
                  <button key={n} type="button" aria-pressed={puestos === n} onClick={() => setPuestos(n)}>
                    {n === 1 ? '🥇 Solo el 1.º' : n === 2 ? '🥇🥈 Top 2' : '🏆 Podio'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {live && over && (
            <p className="alert info" style={{ margin: 0 }}>
              La promoción anterior terminó: {live.initialStock - live.stock} de {live.initialStock} cupones entregados.
            </p>
          )}
          {error && (
            <p className="alert error" style={{ margin: 0 }}>
              {error}
            </p>
          )}
          <button className={`btn block ${soloGanadores ? 'yellow' : 'hero'}`} disabled={busy || stock < 1 || !title.trim()} style={{ minHeight: 52 }}>
            <Icon name={soloGanadores ? 'trophy' : 'bolt'} />
            {busy ? 'Lanzando…' : soloGanadores ? 'Lanzar bono para ganadores' : 'Lanzar ahora'}
          </button>
        </form>
      )}

      {claims.length > 0 && (
        <div className="list" style={{ marginTop: 12 }}>
          {claims.map((c, i) => (
            <div key={`${c.at}-${i}`} className="item small pop-in">
              <span className="badge ok">Entregado</span>
              <span className="grow" style={{ fontWeight: 700 }}>
                {c.winner}
              </span>
              <span className="muted">quedan {c.stock}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ================================================================== */
/* Eventos                                                             */
/* ================================================================== */

function EventForm({
  placeId,
  events,
  onCreated,
}: {
  placeId: string;
  events: PlaceDetail['events'];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('21:00');
  const [capacity, setCapacity] = useState(30);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const r = await api.createEvent({ placeId, title: title.trim(), startsAt, capacity });
    setBusy(false);
    if (r.ok) {
      setTitle('');
      onCreated();
    }
  }

  return (
    <section className="card">
      <h2>
        <Icon name="calendar" size={18} /> Eventos
      </h2>
      {events.length > 0 && (
        <div className="list" style={{ margin: '10px 0' }}>
          {events.map((e) => (
            <div key={e.id} className="item small">
              <b style={{ width: 48 }}>{e.startsAt}</b>
              <span style={{ flex: 1 }}>{e.title}</span>
              <span className="muted">
                {e.taken}/{e.capacity}
              </span>
            </div>
          ))}
        </div>
      )}
      <form
        className="stack"
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          Nombre del evento
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Noche de jazz" required maxLength={60} />
        </label>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            Hora
            <input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </label>
          <label className="field" style={{ flex: 1 }}>
            Cupo máximo
            <input type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          </label>
        </div>
        <button className="btn ghost block" disabled={busy || !title.trim()}>
          {busy ? 'Publicando…' : 'Publicar evento'}
        </button>
      </form>
    </section>
  );
}

/* ================================================================== */
/* Reservas entrantes                                                  */
/* ================================================================== */

function Reservations({ items }: { items: Reservation[] }) {
  return (
    <section className="card">
      <h2>
        <Icon name="users" size={18} /> Reservas entrantes
      </h2>
      {items.length === 0 ? (
        <p className="muted small" style={{ marginTop: 8 }}>
          Todavía no hay reservas. Aparecen aquí en el momento en que alguien confirma.
        </p>
      ) : (
        <div className="list" style={{ marginTop: 8, maxHeight: 360, overflowY: 'auto' }}>
          {items.map((r) => (
            <div key={r.id} className="item fade-in">
              <b style={{ width: 48, fontVariantNumeric: 'tabular-nums' }}>{r.startsAt}</b>
              <span style={{ flex: 1 }}>
                {r.userName} · {r.people} persona{r.people === 1 ? '' : 's'}
              </span>
              <span className="mono muted">{r.code}</span>
              <span className="muted small">{time(r.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
