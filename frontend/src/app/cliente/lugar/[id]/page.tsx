"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/fx/AnimatedNumber";
import { boom, confeti } from "@/components/fx/eggs";
import { Icon } from "@/components/Icon";
import { PlaceLogo } from "@/components/Logo";
import { PRICE } from "@/components/PlaceCard";
import { PromoCard } from "@/components/PromoCard";
import { api } from "@/lib/api";
import { coverOf } from "@/lib/brand";
import { config } from "@/lib/config";
import { useRtEvent, useTopics } from "@/lib/hooks";
import { CATEGORY_LABEL, ZONES } from "@/lib/seed";
import type {
  InvUpdatePayload,
  PlaceDetail,
  PlaceUpdatePayload,
  Promo,
  Reservation,
} from "@/lib/types";

type Result =
  { ok: true; reservation: Reservation } | { ok: false; error: string };

export default function LugarPage() {
  const { id } = useParams<{ id: string }>();
  const [place, setPlace] = useState<PlaceDetail | null | undefined>(undefined);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [people, setPeople] = useState(2);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const reservarBtn = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => api.getPlace(id).then(setPlace), [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Suscripción a esta ficha: cualquier cambio de inventario llega aquí (RT-1).
  useTopics([`place:${id}`]);

  useRtEvent<InvUpdatePayload>(["INV.UPDATE"], (e) => {
    if (e.payload.placeId !== id) return;
    const s = e.payload.slot;
    setPlace((p) =>
      p ? { ...p, slots: p.slots.map((x) => (x.id === s.id ? s : x)) } : p,
    );
    setChanged((c) => new Set(c).add(s.id));
    setTimeout(
      () =>
        setChanged((c) => {
          const n = new Set(c);
          n.delete(s.id);
          return n;
        }),
      1200,
    );
  });
  useRtEvent<PlaceUpdatePayload>(["PLACE.UPDATE"], (e) => {
    if (e.payload.placeId === id)
      setPlace((p) => (p ? { ...p, freeSeats: e.payload.freeSeats } : p));
  });
  useRtEvent<Promo>(["PROMO.PUSH"], (e) => {
    if (e.payload.placeId === id)
      setPlace((p) =>
        p
          ? {
              ...p,
              promos: [
                ...p.promos.filter((x) => x.id !== e.payload.id),
                e.payload,
              ],
            }
          : p,
      );
  });

  if (place === undefined) {
    return (
      <main className="content">
        <div className="skeleton" style={{ height: 16, width: 80 }} />
        <div
          className="skeleton"
          style={{ height: 260, marginTop: 12, borderRadius: 22 }}
        />
        <div className="skeleton" style={{ height: 56, marginTop: 24 }} />
        <div className="skeleton" style={{ height: 56, marginTop: 10 }} />
      </main>
    );
  }
  if (place === null) {
    return (
      <main className="content">
        <div className="empty" style={{ marginTop: 30 }}>
          <span className="caption">Este lugar se fue a otra dimensión</span>
          <p className="muted small" style={{ margin: 0 }}>
            No lo encontramos en el mapa. Puede que haya cerrado.
          </p>
          <Link href="/cliente/mapa" className="btn sm">
            Volver al mapa
          </Link>
        </div>
      </main>
    );
  }

  const slot = place.slots.find((s) => s.id === slotId) ?? null;
  const free = slot ? slot.capacity - slot.taken : 0;
  const totalLibre = place.slots.reduce((a, s) => a + s.capacity - s.taken, 0);

  /**
   * CC-3: se envía la versión de la franja que el usuario está viendo. Si alguien
   * escribió antes, el servidor responde 409 y volvemos a cargar la disponibilidad real.
   */
  async function reserve() {
    if (!slot) return;
    setBusy(true);
    setResult(null);
    const r = await api.reserve({
      slotId: slot.id,
      people,
      version: slot.version,
    });
    setBusy(false);
    if (r.ok) {
      setResult({ ok: true, reservation: r.data });
      const rect = reservarBtn.current?.getBoundingClientRect();
      boom("¡LISTO!", rect ? rect.left + rect.width / 2 : undefined, rect?.top);
      confeti(rect ? rect.left + rect.width / 2 : undefined, rect?.top, 40);
    } else {
      setResult({ ok: false, error: r.error });
      await load();
    }
  }

  return (
    <main className="content wide">
      <Link
        href="/cliente/mapa"
        className="btn ghost sm"
        style={{ width: "fit-content" }}
      >
        <Icon name="arrowLeft" size={16} /> Mapa
      </Link>

      <header className="place-hero">
        <img src={coverOf(place)} alt="" />
        <span className="logo-float">
          <PlaceLogo place={place} size={70} />
        </span>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="caption sm">{CATEGORY_LABEL[place.category]}</span>
          <span
            className="badge"
            style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}
          >
            <Icon name="pin" /> {ZONES[place.zone].label}
          </span>
          <span
            className="badge"
            style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}
          >
            {PRICE[place.priceLevel]}
          </span>
        </div>
        <h1 className="misprint">{place.name}</h1>
        <p
          style={{
            margin: "6px 0 0",
            maxWidth: 520,
            color: "rgba(255,255,255,.85)",
          }}
        >
          {place.description}
        </p>
        {place.slots.length > 0 && (
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <span className="badge ok">
              <Icon name="users" /> <AnimatedNumber value={totalLibre} /> cupos
              libres ahora
            </span>
            {place.promos.length > 0 && (
              <span className="badge promo">
                <Icon name="bolt" /> {place.promos.length} promo
                {place.promos.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
      </header>

      <div className="place-grid">
        <div>
          {place.promos.length > 0 && (
            <section className="section stack">
              <h2>
                <Icon name="bolt" size={18} /> Promociones ahora
              </h2>
              {place.promos.map((p) => (
                <PromoCard key={p.id} promo={p} />
              ))}
            </section>
          )}

          <section className="section">
            <h2 style={{ marginBottom: 10 }}>
              <Icon name="calendar" size={18} /> Eventos de hoy
            </h2>
            {place.events.length === 0 ? (
              <p className="alert info" style={{ margin: 0 }}>
                Hoy no hay eventos especiales: es una buena noche para
                descubrirlo sin afanes.
              </p>
            ) : (
              <div className="card flat list" style={{ padding: "4px 14px" }}>
                {place.events.map((e) => (
                  <div key={e.id} className="item">
                    <span className="caption sm" style={{ transform: "none" }}>
                      {e.startsAt}
                    </span>
                    <span className="grow" style={{ fontWeight: 700 }}>
                      {e.title}
                    </span>
                    <span className="muted small">
                      {e.capacity - e.taken} cupos
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <h2 style={{ marginBottom: 10 }}>
              <Icon name="pin" size={18} /> Cómo es
            </h2>
            <div className="card flat stack" style={{ gap: 8 }}>
              <div className="row">
                <Icon name="pin" />
                <span className="grow">
                  {ZONES[place.zone].label}, Chapinero · Bogotá
                </span>
              </div>
              <div className="row">
                <Icon name="tag" />
                <span className="grow">
                  Precio:{" "}
                  {["gratis", "económico", "medio", "alto"][place.priceLevel]}
                </span>
              </div>
              <div className="row">
                <Icon name="bolt" />
                <span className="grow">
                  Cupos y promociones en vivo: no hace falta recargar
                </span>
              </div>
            </div>
          </section>
        </div>

        <section className="section reserve-col">
          <h2 style={{ marginBottom: 10 }}>
            <Icon name="ticket" size={18} /> Reservar
          </h2>

          {place.slots.length === 0 ? (
            <p className="alert info">
              {place.category === "hotel"
                ? "La reserva de habitaciones llega pronto. Por ahora puedes escribirles directamente."
                : "Este lugar no requiere reserva: puedes llegar directamente."}
            </p>
          ) : result?.ok ? (
            <div className="card ticket pop-in">
              <span className="stamp">¡CONFIRMADA!</span>
              <div className="row">
                <span className="thumb">
                  <img src={coverOf(place)} alt="" />
                </span>
                <div>
                  <h3>{place.name}</h3>
                  <span className="muted small">
                    {result.reservation.people} persona
                    {result.reservation.people === 1 ? "" : "s"} ·{" "}
                    {result.reservation.startsAt}
                  </span>
                </div>
              </div>
              <div className="tear" />
              <p className="eyebrow" style={{ margin: "0 0 4px" }}>
                Tu código
              </p>
              <div className="coupon-code">{result.reservation.code}</div>
              <div className="row wrap" style={{ marginTop: 14 }}>
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
                    className={`slot${changed.has(s.id) ? " changed" : ""}`}
                    aria-pressed={slotId === s.id}
                    disabled={left === 0}
                    onClick={() => setSlotId(s.id)}
                  >
                    <span className="time">{s.startsAt}</span>
                    <span className="bar">
                      <i
                        style={{ width: `${(s.taken / s.capacity) * 100}%` }}
                      />
                    </span>
                    <span
                      className="small"
                      style={{ width: 76, textAlign: "right", fontWeight: 800 }}
                    >
                      {left === 0
                        ? "Lleno"
                        : `${left} libre${left === 1 ? "" : "s"}`}
                    </span>
                    {config.demo && (
                      <span className="mono muted">v{s.version}</span>
                    )}
                  </button>
                );
              })}

              <div className="row between" style={{ marginTop: 4 }}>
                <span className="muted" style={{ fontWeight: 700 }}>
                  Personas
                </span>
                <div className="stepper">
                  <button
                    onClick={() => setPeople((n) => Math.max(1, n - 1))}
                    disabled={people <= 1}
                    aria-label="Menos"
                  >
                    −
                  </button>
                  <output>{people}</output>
                  <button
                    onClick={() => setPeople((n) => Math.min(8, n + 1))}
                    disabled={people >= 8}
                    aria-label="Más"
                  >
                    +
                  </button>
                </div>
              </div>

              {slot && people > free && free > 0 && (
                <p className="alert info">
                  En esta franja solo quedan {free} cupos.
                </p>
              )}
              {result && !result.ok && (
                <p className="alert error fade-in" role="alert">
                  {result.error}
                </p>
              )}

              <button
                ref={reservarBtn}
                className="btn block"
                disabled={!slot || busy || people > free}
                onClick={reserve}
                style={{ minHeight: 54 }}
              >
                {busy
                  ? "Reservando…"
                  : slot
                    ? `Reservar ${people} a las ${slot.startsAt}`
                    : "Elige una franja"}
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
