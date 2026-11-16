'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { config } from '@/lib/config';
import s from './estado.module.css';
import { Balanceadores, origenHttp, type EstadoLb } from './Balanceadores';

/** Respuesta de GET /api/health/cluster (api-gateway). */
interface EstadoServicio {
  servicio: string;
  ok: boolean;
  status: number | null;
  ms: number;
  replica: string | null;
}
interface Cluster {
  gateway: string;
  at: number;
  servicios: EstadoServicio[];
  /** Balanceadores propios delante de booking y promo (si los hay). */
  balanceadores?: EstadoLb[];
}

interface Linea {
  n: number;
  t: number;
  ok: boolean;
  ms: number;
  gateway: string | null;
  servicios: EstadoServicio[];
  error?: string;
}

interface Replica {
  id: string;
  vistas: number;
  ultima: number;
}

/** Una réplica que no responde hace más de esto, mientras otras sí, se marca caída. */
const SIN_RESPUESTA_MS = 6000;
const MAX_LINEAS = 80;
const VELOCIDADES = [2, 5, 10] as const;

function corto(replica: string | null): string {
  if (!replica) return '—';
  const at = replica.indexOf('@');
  return at === -1 ? replica : replica.slice(at + 1);
}

function hora(t: number): string {
  return new Date(t).toLocaleTimeString('es-CO', { hour12: false }) + '.' + String(t % 1000).padStart(3, '0');
}

function percentil(valores: number[], p: number): number {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))];
}

/** Agrega una vista de `id` a la capa `capa` y devuelve el mapa nuevo. */
function contar(mapa: Record<string, Record<string, Replica>>, capa: string, id: string | null, t: number) {
  if (!id) return mapa;
  const prev = mapa[capa]?.[id];
  return { ...mapa, [capa]: { ...mapa[capa], [id]: { id, vistas: (prev?.vistas ?? 0) + 1, ultima: t } } };
}

/**
 * /estado — sala de máquinas para la demo de balanceo (ESC-04).
 * Le pregunta al gateway, varias veces por segundo, qué réplica atendió y qué
 * réplica de cada servicio respondió detrás. Se ve cómo se reparte la carga y,
 * si se apaga una réplica, cómo las demás la respaldan.
 */
export default function EstadoPage() {
  const [corriendo, setCorriendo] = useState(true);
  const [porSegundo, setPorSegundo] = useState<(typeof VELOCIDADES)[number]>(5);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [capas, setCapas] = useState<Record<string, Record<string, Replica>>>({});
  const [totales, setTotales] = useState({ ok: 0, error: 0 });
  const [latencias, setLatencias] = useState<number[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [llave, setLlave] = useState('');
  const [caos, setCaos] = useState<string | null>(null);
  const [internos, setInternos] = useState<EstadoLb[]>([]);
  const fuentesLb = useMemo(
    () => [config.apiUrl, origenHttp(config.realtimeUrl)].filter((x): x is string => Boolean(x)),
    [],
  );
  const n = useRef(0);
  const enVuelo = useRef(0);

  const sondear = useCallback(async () => {
    if (enVuelo.current > 20) return; // no apilar peticiones si el backend está lento
    enVuelo.current++;
    const num = ++n.current;
    const t0 = performance.now();
    const t = Date.now();
    try {
      const r = await fetch(`${config.apiUrl}/api/health/cluster`, { cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);
      if (r.status === 404) {
        setAviso('Este gateway todavía no tiene /api/health/cluster: falta desplegar la versión con balanceo.');
        setCorriendo(false);
        return;
      }
      const datos = (await r.json()) as Cluster;
      if (datos.balanceadores) setInternos(datos.balanceadores);
      const gateway = r.headers.get('x-served-by') ?? datos.gateway ?? null;
      const linea: Linea = { n: num, t, ok: r.ok, ms, gateway, servicios: datos.servicios ?? [] };
      setLineas((ls) => [linea, ...ls].slice(0, MAX_LINEAS));
      setCapas((m) => {
        let out = contar(m, 'api-gateway', gateway, t);
        for (const sv of linea.servicios) if (sv.ok) out = contar(out, sv.servicio, sv.replica ?? `${sv.servicio}@instancia-única`, t);
        return out;
      });
      setTotales((x) => (r.ok ? { ...x, ok: x.ok + 1 } : { ...x, error: x.error + 1 }));
      setLatencias((l) => [...l, ms].slice(-200));
    } catch (e) {
      const linea: Linea = { n: num, t, ok: false, ms: Math.round(performance.now() - t0), gateway: null, servicios: [], error: e instanceof Error ? e.message : 'sin respuesta' };
      setLineas((ls) => [linea, ...ls].slice(0, MAX_LINEAS));
      setTotales((x) => ({ ...x, error: x.error + 1 }));
    } finally {
      enVuelo.current--;
    }
  }, []);

  useEffect(() => {
    if (!corriendo || config.mode !== 'live') return;
    const id = setInterval(() => void sondear(), 1000 / porSegundo);
    return () => clearInterval(id);
  }, [corriendo, porSegundo, sondear]);

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /** Prueba de caos (ESC-04): apaga la réplica del gateway que atienda esta petición. */
  const tumbar = async () => {
    setCaos('Enviando…');
    try {
      const r = await fetch(`${config.apiUrl}/api/health/caos`, { method: 'POST', headers: { 'x-demo-key': llave } });
      if (r.status === 202) {
        const d = (await r.json()) as { apagada: string };
        setCaos(`Se apagó ${d.apagada}. Railway la reinicia; mira cómo la otra réplica sigue atendiendo.`);
      } else if (r.status === 401) setCaos('Llave de demo inválida.');
      else if (r.status === 404) setCaos('La prueba de caos no está habilitada en este gateway.');
      else setCaos(`Respuesta inesperada: ${r.status}`);
    } catch {
      setCaos('No se pudo contactar el gateway.');
    }
  };

  const total = totales.ok + totales.error;
  const p95 = useMemo(() => percentil(latencias, 95), [latencias]);
  const reiniciar = () => {
    setLineas([]);
    setCapas({});
    setTotales({ ok: 0, error: 0 });
    setLatencias([]);
    n.current = 0;
  };

  const ordenCapas = ['api-gateway', 'booking', 'promo', 'game'];

  return (
    <main className={s.page}>
      <header className={s.head}>
        <div>
          <p className={s.kicker}>Tierra-616 · sala de máquinas</p>
          <h1 className={s.title}>Balanceo en vivo</h1>
          <p className={s.lead}>
            Cada fila es una petición real al gateway. Se ve qué réplica la atendió y qué réplica de cada servicio
            respondió detrás. Si una réplica se cae, las demás siguen atendiendo.
          </p>
        </div>
        <Link href="/" className={s.back}>
          Volver a Planazo
        </Link>
      </header>

      {config.mode !== 'live' ? (
        <p className={s.aviso}>Esta vista necesita el backend real (NEXT_PUBLIC_API_MODE=live).</p>
      ) : null}
      {aviso ? <p className={s.aviso}>{aviso}</p> : null}

      <section className={s.controls} aria-label="Controles">
        <button type="button" className={`btn ${corriendo ? 'ghost' : 'hero'}`} onClick={() => setCorriendo((c) => !c)}>
          {corriendo ? 'Pausar' : 'Reanudar'}
        </button>
        <div className={s.speed} role="group" aria-label="Peticiones por segundo">
          {VELOCIDADES.map((v) => (
            <button
              key={v}
              type="button"
              className={v === porSegundo ? s.speedOn : s.speedBtn}
              aria-pressed={v === porSegundo}
              onClick={() => setPorSegundo(v)}
            >
              {v}/s
            </button>
          ))}
        </div>
        <button type="button" className="btn ghost" onClick={reiniciar}>
          Reiniciar contadores
        </button>
      </section>

      <section className={s.caos} aria-label="Prueba de caos">
        <form
          className={s.caosForm}
          onSubmit={(e) => {
            e.preventDefault();
            void tumbar();
          }}
        >
          <label className={s.caosLabel}>
            <span>Llave de demo</span>
            <input
              type="password"
              value={llave}
              onChange={(e) => setLlave(e.target.value)}
              autoComplete="off"
              className={s.caosInput}
            />
          </label>
          <button type="submit" className="btn hero" disabled={!llave}>
            Tumbar una réplica del gateway
          </button>
        </form>
        {caos ? <p className={s.caosMsg}>{caos}</p> : null}
      </section>

      <section className={s.stats} aria-label="Resumen">
        <div className={s.stat}>
          <span className={s.statN}>{total}</span>
          <span className={s.statL}>peticiones</span>
        </div>
        <div className={s.stat}>
          <span className={s.statN}>{total ? ((totales.error / total) * 100).toFixed(1) : '0.0'}%</span>
          <span className={s.statL}>tasa de error</span>
        </div>
        <div className={s.stat}>
          <span className={s.statN}>{p95} ms</span>
          <span className={s.statL}>p95 de latencia</span>
        </div>
      </section>

      {config.mode === 'live' ? <Balanceadores fuentes={fuentesLb} internos={internos} /> : null}

      <section className={s.grid} aria-label="Réplicas por servicio">
        {ordenCapas.map((capa) => {
          const reps = Object.values(capas[capa] ?? {}).sort((a, b) => a.id.localeCompare(b.id));
          const vistas = reps.reduce((acc, r) => acc + r.vistas, 0);
          const alguienVivo = reps.some((r) => ahora - r.ultima < SIN_RESPUESTA_MS);
          return (
            <article key={capa} className={s.card}>
              <h2 className={s.cardTitle}>{capa}</h2>
              <p className={s.cardSub}>
                {reps.length} réplica{reps.length === 1 ? '' : 's'} vista{reps.length === 1 ? '' : 's'}
              </p>
              {reps.length === 0 ? <p className={s.vacio}>Esperando respuestas…</p> : null}
              <ul className={s.reps}>
                {reps.map((r) => {
                  const caida = alguienVivo && ahora - r.ultima >= SIN_RESPUESTA_MS;
                  const pct = vistas ? Math.round((r.vistas / vistas) * 100) : 0;
                  return (
                    <li key={r.id} className={caida ? s.repCaida : s.rep}>
                      <div className={s.repTop}>
                        <code className={s.repId}>{corto(r.id)}</code>
                        <span className={caida ? s.badgeOff : s.badgeOn}>{caida ? 'sin respuesta' : 'atendiendo'}</span>
                      </div>
                      <div className={s.bar} aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <p className={s.repN}>
                        {r.vistas} respuestas · {pct}%
                      </p>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </section>

      <section className={s.logs} aria-label="Registro en vivo">
        <h2 className={s.logsTitle}>Registro en vivo</h2>
        <ol className={s.logList}>
          {lineas.map((l) => (
            <li key={l.n} className={l.ok ? s.logOk : s.logErr}>
              <span className={s.logT}>{hora(l.t)}</span>
              <span className={s.logN}>#{l.n}</span>
              {l.error ? (
                <span>gateway sin respuesta ({l.error})</span>
              ) : (
                <span>
                  <b>gateway@{corto(l.gateway)}</b>
                  {l.servicios.map((sv) => (
                    <span key={sv.servicio} className={sv.ok ? undefined : s.logBad}>
                      {' '}→ {sv.servicio}@{sv.ok ? (sv.replica ? corto(sv.replica) : 'única') : 'caído'}
                    </span>
                  ))}
                </span>
              )}
              <span className={s.logMs}>{l.ms} ms</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
