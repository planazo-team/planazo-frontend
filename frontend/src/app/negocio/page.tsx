'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import { useNow, useRtEvent } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { InvUpdatePayload, PlaceDetail, Promo, Reservation, Slot } from '@/lib/types';

const time = (ms: number) => new Date(ms).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

export default function PanelPage() {
  const me = useSession();
  const placeId = me?.placeId;
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const load = useCallback(async () => {
    if (!placeId) return;
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
  });
  useRtEvent<InvUpdatePayload>(['INV.UPDATE'], (e) => {
    if (e.payload.placeId !== placeId) return;
    setPlace((p) => (p ? { ...p, slots: p.slots.map((s) => (s.id === e.payload.slot.id ? e.payload.slot : s)) } : p));
  });

  if (!placeId) return <main className="content wide">Esta cuenta no tiene un establecimiento asignado.</main>;
  if (!place) {
    return (
      <main className="content wide">
        <p className="muted">Cargando panel…</p>
      </main>
    );
  }

  const free = place.slots.reduce((a, s) => a + s.capacity - s.taken, 0);
  const people = reservations.reduce((a, r) => a + r.people, 0);

  return (
    <main className="content wide">
      <h1>{place.name}</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        Panel del establecimiento · todo se actualiza en vivo
      </p>

      <div className="row wrap section" style={{ gap: 12 }}>
        <div className="card flat" style={{ flex: '1 1 150px' }}>
          <div className="stat">{reservations.length}</div>
          <div className="muted small">reservas hoy</div>
        </div>
        <div className="card flat" style={{ flex: '1 1 150px' }}>
          <div className="stat">{people}</div>
          <div className="muted small">personas esperadas</div>
        </div>
        <div className="card flat" style={{ flex: '1 1 150px' }}>
          <div className="stat">{free}</div>
          <div className="muted small">cupos libres</div>
        </div>
      </div>

      <div className="grid2 section">
        <div className="stack">
          <SlotEditor placeId={place.id} slots={place.slots} onReload={load} />
          <EventForm placeId={place.id} events={place.events} onCreated={load} />
        </div>
        <div className="stack">
          <PromoLauncher placeId={place.id} />
          <Reservations items={reservations} />
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

function PromoLauncher({ placeId }: { placeId: string }) {
  const now = useNow(500);
  const [title, setTitle] = useState('Cóctel de la casa a mitad de precio');
  const [discount, setDiscount] = useState('-50%');
  const [stock, setStock] = useState(3);
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Promo | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useRtEvent<{ promoId: string; stock: number; winner: string }>(['PROMO.WON'], (e) => {
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
    const r = await api.launchPromo({ placeId, title, discount, stock, durationS: duration });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setLive(r.data);
    setClaims([]);
    setExpired(false);
  }

  const left = live ? Math.max(0, Math.ceil((live.expiresAt - now) / 1000)) : 0;
  const over = !!live && (expired || left === 0 || live.stock === 0);

  return (
    <section className="card">
      <h2>Lanzar promoción</h2>
      <p className="muted small" style={{ margin: '4px 0 12px' }}>
        Llega en el momento a quienes están mirando tu zona. Nunca se entregan más cupones que el stock.
      </p>

      {live && !over ? (
        <div className="stack fade-in">
          <div className="row between">
            <div>
              <b className="stat" style={{ color: 'var(--accent)' }}>
                {live.discount}
              </b>
              <div style={{ fontWeight: 600 }}>{live.title}</div>
            </div>
            <span className="badge low">{left} s</span>
          </div>
          <div className="row">
            <span className="bar">
              <i style={{ width: `${(1 - live.stock / live.initialStock) * 100}%`, background: 'var(--accent)' }} />
            </span>
            <b className="small">
              {live.initialStock - live.stock} de {live.initialStock} entregados
            </b>
          </div>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            launch();
          }}
        >
          <label className="field">
            Oferta
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={60} />
          </label>
          <div className="row wrap">
            <label className="field" style={{ flex: 1 }}>
              Descuento
              <input value={discount} onChange={(e) => setDiscount(e.target.value)} required maxLength={10} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              Cupones
              <input type="number" min={1} max={50} value={stock} onChange={(e) => setStock(Number(e.target.value))} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              Duración (s)
              <input
                type="number"
                min={15}
                max={600}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
          </div>
          {live && over && (
            <p className="alert info">
              La promoción anterior terminó: {live.initialStock - live.stock} de {live.initialStock} cupones entregados.
            </p>
          )}
          {error && <p className="alert error">{error}</p>}
          <button className="btn accent block" disabled={busy || stock < 1 || !title.trim()}>
            {busy ? 'Lanzando…' : 'Lanzar ahora'}
          </button>
        </form>
      )}

      {claims.length > 0 && (
        <div className="list" style={{ marginTop: 12 }}>
          {claims.map((c, i) => (
            <div key={`${c.at}-${i}`} className="item small fade-in">
              <span className="badge ok">Entregado</span>
              <span style={{ flex: 1 }}>{c.winner}</span>
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
      <h2>Eventos</h2>
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
      <h2>Reservas entrantes</h2>
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
