'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { PlaceLogo } from '@/components/Logo';
import { api } from '@/lib/api';
import { coverOf } from '@/lib/brand';
import { config } from '@/lib/config';
import { CATEGORY_LABEL } from '@/lib/seed';
import type { Category, PlanResult } from '@/lib/types';

const EXAMPLES = [
  'Cita tranquila para dos 💘',
  'Somos cinco amigos y queremos rumba',
  'Tengo poca plata pero ganas de salir',
  'Cumpleaños: comida rica y después bailar',
  'Algo para reírnos un rato',
];

const PENSANDO = ['Revisando cupos en vivo…', 'Cruzando la Zona G con la Zona T…', 'Calibrando el sentido arácnido…', 'Armando la ruta…'];

type Turno = { pregunta: string; plan?: PlanResult; error?: string };

/** La mascota del agente: un pin con antifaz que piensa tu plan. */
function AgentFace({ thinking }: { thinking?: boolean }) {
  return (
    <svg className="agent-face" viewBox="0 0 80 80" aria-hidden>
      <path d="M40 76s26-23 26-43a26 26 0 1 0-52 0c0 20 26 43 26 43z" fill="#3fcf9e" stroke="#020505" strokeWidth="3" />
      <path d="M18 30 q22-12 44 0 v8 q-22 8 -44 0z" fill="#020505" />
      <ellipse cx="30" cy="34" rx="6" ry={thinking ? 2 : 4.5} fill="#f4f7f6" />
      <ellipse cx="50" cy="34" rx="6" ry={thinking ? 2 : 4.5} fill="#f4f7f6" />
      <path d="M33 50 q7 5 14 0" fill="none" stroke="#020505" strokeWidth="3" strokeLinecap="round" />
      <g stroke="#020505" strokeWidth="1.2" opacity=".35" fill="none">
        <path d="M40 7v18 M24 13l8 14 M56 13l-8 14" />
      </g>
    </svg>
  );
}

export default function AgentePage() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [frase, setFrase] = useState(0);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setFrase((f) => (f + 1) % PENSANDO.length), 1100);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turnos, busy]);

  async function ask(q: string) {
    const pregunta = q.trim();
    if (!pregunta || busy) return;
    setText('');
    setBusy(true);
    setTurnos((t) => [...t, { pregunta }]);
    const r = await api.plan(pregunta);
    setBusy(false);
    setTurnos((t) => t.map((x, i) => (i === t.length - 1 ? (r.ok ? { ...x, plan: r.data } : { ...x, error: r.error }) : x)));
  }

  return (
    <main className="content">
      <div className="agent-hero">
        <AgentFace thinking={busy} />
        <div>
          <span className="caption sm">Tu agente de planes</span>
          <h1 style={{ marginTop: 10 }}>
            Arma tu <em className="serif">plan</em>
          </h1>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Cuéntame con quién vas, cuánto quieres gastar y qué ánimo traes. Te armo una ruta con lugares que tienen cupo ahora mismo.
      </p>

      <div className="chips section" style={{ marginTop: 14 }}>
        {EXAMPLES.map((e) => (
          <button key={e} className="chip" onClick={() => ask(e)} disabled={busy}>
            {e}
          </button>
        ))}
      </div>

      <div className="stack section" style={{ gap: 22 }}>
        {turnos.length === 0 && (
          <div className="bubble left dark fade-in" style={{ maxWidth: 520 }}>
            ¡Hola! Soy tu agente. Escríbeme algo como «plan barato para cuatro con algo de música» y te propongo a dónde ir y
            en qué orden. 🕸️
          </div>
        )}

        {turnos.map((t, i) => (
          <div key={i} className="stack" style={{ gap: 16 }}>
            <div className="bubble fade-in" style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
              {t.pregunta}
            </div>

            {!t.plan && !t.error && (
              <div className="bubble left dark" style={{ maxWidth: 320 }}>
                <span className="typing" aria-label="Pensando">
                  <i />
                  <i />
                  <i />
                </span>
                <div className="muted small">{PENSANDO[frase]}</div>
              </div>
            )}

            {t.error && (
              <p className="alert error fade-in" role="alert" style={{ margin: 0 }}>
                {t.error}
              </p>
            )}

            {t.plan && (
              <div className="stack fade-in" style={{ gap: 14 }}>
                <div className="bubble left dark" style={{ maxWidth: 560 }}>
                  {t.plan.intro}
                  <div style={{ marginTop: 8 }}>
                    <span className={`badge ${t.plan.source === 'claude' ? 'ok' : ''}`}>
                      <Icon name="sparkles" /> {t.plan.source === 'claude' ? 'Armado con Claude' : 'Sugerencia rápida'}
                    </span>
                  </div>
                </div>
                {t.plan.stops.length === 0 ? (
                  <p className="alert info">No encontré lugares con cupo para ese plan ahora mismo. Prueba con otra idea.</p>
                ) : (
                  <div className="steps stagger">
                    {t.plan.stops.map((s, k) => (
                      <div key={s.placeId} className="step" style={{ '--i': k } as React.CSSProperties}>
                        <span className="step-n">{k + 1}</span>
                        <Link href={`/cliente/lugar/${s.placeId}`} className="card link">
                          <div className="halftone" style={{ position: 'relative' }}>
                            <img src={coverOf({ id: s.placeId, category: s.category as Category })} alt="" loading="lazy" />
                            <span style={{ position: 'absolute', left: 10, bottom: -18 }}>
                              <PlaceLogo place={{ id: s.placeId, name: s.placeName, category: s.category as Category }} size={42} />
                            </span>
                            <span className="caption sm" style={{ position: 'absolute', right: 10, top: 10 }}>
                              {s.hour}
                            </span>
                          </div>
                          <div className="body" style={{ paddingTop: 22 }}>
                            <h3>{s.placeName}</h3>
                            <div className="small muted">{CATEGORY_LABEL[s.category as Category] ?? s.category}</div>
                            <p className="small" style={{ margin: '6px 0 0' }}>
                              {s.why}
                            </p>
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={fin} />
      </div>

      <form
        className="card section"
        style={{ position: 'sticky', bottom: 'calc(var(--nav-h) + 12px + env(safe-area-inset-bottom))', zIndex: 5 }}
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field grow">
            <span className="visually-hidden">¿Qué plan tienes en mente?</span>
            <textarea
              value={text}
              rows={1}
              style={{ minHeight: 48, resize: 'none' }}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(text);
                }
              }}
              placeholder="Ej.: algo tranquilo para dos, sin gastar mucho"
            />
          </label>
          <button className="btn icon" disabled={busy || !text.trim()} aria-label="Enviar" style={{ width: 52, minHeight: 48 }}>
            <Icon name="send" />
          </button>
        </div>
      </form>

      {config.demo && (
        <p className="demo-note section">
          Modo demo: las sugerencias salen de plantillas sobre el catálogo semilla. En producción las genera el agente con
          Claude.
        </p>
      )}
    </main>
  );
}
