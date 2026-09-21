'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/lib/seed';
import type { PlanResult } from '@/lib/types';

const EXAMPLES = [
  'Salida con mi novia, algo tranquilo',
  'Somos cinco amigos esta noche',
  'Tengo poca plata',
  'Quiero comer bien y después bailar',
];

export default function AgentePage() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    const query = q.trim();
    if (!query) return;
    setText(query);
    setBusy(true);
    setError(null);
    setPlan(null);
    const r = await api.plan(query);
    setBusy(false);
    if (r.ok) setPlan(r.data);
    else setError(r.error);
  }

  return (
    <main className="content">
      <h1>Arma tu plan</h1>
      <p className="muted" style={{ marginTop: 6 }}>
        Cuéntame qué quieres hacer hoy —con quién, cuánto quieres gastar, qué ánimo traes— y te sugiero a dónde ir.
      </p>

      <div className="chips section">
        {EXAMPLES.map((e) => (
          <button key={e} className="chip" onClick={() => ask(e)} disabled={busy}>
            {e}
          </button>
        ))}
      </div>

      <form
        className="stack section"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <label className="field">
          ¿Qué plan tienes en mente?
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: algo tranquilo para dos, sin gastar mucho" />
        </label>
        <button className="btn block" disabled={busy || !text.trim()}>
          {busy ? 'Pensando…' : 'Sugerir lugares'}
        </button>
      </form>

      {error && (
        <p className="alert error section" role="alert">
          {error}
        </p>
      )}

      {plan && (
        <section className="section fade-in">
          <p>{plan.intro}</p>
          {plan.stops.length === 0 ? (
            <p className="alert info">No encontré lugares con cupo para ese plan ahora mismo.</p>
          ) : (
            <div className="stack">
              {plan.stops.map((s, i) => (
                <Link key={s.placeId} href={`/cliente/lugar/${s.placeId}`} className="card link flat">
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <b className="stat" style={{ fontSize: 20, width: 28 }}>
                      {i + 1}
                    </b>
                    <div style={{ flex: 1 }}>
                      <div className="row between">
                        <h3>{s.placeName}</h3>
                        <span className="badge ok">{s.hour}</span>
                      </div>
                      <div className="row small muted" style={{ gap: 6, marginTop: 2 }}>
                        <span className="swatch" style={{ background: CATEGORY_COLOR[s.category] }} />
                        {CATEGORY_LABEL[s.category]}
                      </div>
                      <p className="small muted" style={{ margin: '6px 0 0' }}>
                        {s.why}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <p className="muted small" style={{ marginTop: 10 }}>
            Toca un lugar para ver su disponibilidad y reservar.
          </p>
        </section>
      )}

      {config.demo && (
        <p className="demo-note section">
          Modo demo: las sugerencias salen de plantillas sobre el catálogo semilla. En producción las genera el
          servicio del agente con el modelo de lenguaje.
        </p>
      )}
    </main>
  );
}
