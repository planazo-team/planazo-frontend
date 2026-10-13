'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { boom, confeti } from '@/components/fx/eggs';
import { Icon, SpiderArt } from '@/components/Icon';
import { coloresDe, TableroSnake, textoEstado, textoResultado } from '@/components/TableroSnake';
import { api } from '@/lib/api';
import { CLAVE_SALA, crearGameClient, salirDeSalaGuardada } from '@/lib/game/client';
import type {
  Direccion,
  EntradaLeaderboard,
  EstadoConexion,
  EstadoJuego,
  GameClient,
  ResultadoPartida,
  ResumenSala,
} from '@/lib/game/types';
import { useSession } from '@/lib/session';
import type { Promo } from '@/lib/types';

/**
 * Minijuego Planazo: el cliente de planazo-game (test-client.html de Diego)
 * llevado a la app, con su mismo protocolo y la piel de la app. El usuario ya
 * entró por el gateway: el JWT es el mismo. Quedar en el podio desbloquea los
 * bonos "solo ganadores" de promo.
 */

const TECLAS: Record<string, Direccion> = {
  ArrowUp: 'ARRIBA',
  ArrowDown: 'ABAJO',
  ArrowLeft: 'IZQUIERDA',
  ArrowRight: 'DERECHA',
  w: 'ARRIBA',
  s: 'ABAJO',
  a: 'IZQUIERDA',
  d: 'DERECHA',
  W: 'ARRIBA',
  S: 'ABAJO',
  A: 'IZQUIERDA',
  D: 'DERECHA',
};

const CONEXION: Record<EstadoConexion, string> = {
  conectando: 'Conectando…',
  en_linea: 'En línea',
  desconectado: 'Reconectando…',
};

const textoEstadoSerpiente: Record<string, string> = { VIVA: 'viva', ELIMINADA: 'eliminada 💀', DESCONECTADA_CONGELADA: 'congelada ❄️' };

export default function JuegoPage() {
  const me = useSession();
  const jugadorId = me?.id ?? '';

  const client = useRef<GameClient | null>(null);
  const [conexion, setConexion] = useState<EstadoConexion>('conectando');
  const [salas, setSalas] = useState<ResumenSala[]>([]);
  const [salaActualId, setSalaActualId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoJuego | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<ResultadoPartida | null>(null);
  const [leaderboard, setLeaderboard] = useState<EntradaLeaderboard[]>([]);
  const [log, setLog] = useState<string[]>(['Listo. Elige una sala para jugar.']);
  const [premios, setPremios] = useState<Promo[]>([]);
  const celebrada = useRef<string | null>(null);
  /** Resultado de MI última partida: la partida terminó y ya no estoy en la sala. */
  const [fin, setFin] = useState<ResultadoPartida | null>(null);

  const jugadorIdRef = useRef(jugadorId);
  jugadorIdRef.current = jugadorId;
  const salaRef = useRef<string | null>(null);
  salaRef.current = salaActualId;
  const estadoRef = useRef<EstadoJuego | null>(null);
  estadoRef.current = estado;

  const escribir = useCallback((msg: string) => {
    setLog((l) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...l].slice(0, 40));
  }, []);

  const refrescarLeaderboard = useCallback(() => {
    client.current?.leaderboard(10).then(setLeaderboard);
  }, []);

  // Los bonos "solo ganadores" que están en juego ahora mismo.
  useEffect(() => {
    api.activePromos().then((ps) => setPremios(ps.filter((p) => p.soloGanadores)));
  }, []);

  /* ---------- conexión ---------- */
  useEffect(() => {
    if (!me) return;
    const c = crearGameClient();
    client.current = c;
    c.conectar({
      onSalas: setSalas,
      onEstado: (e) => {
        setEstado(e);
        if (e.resultado) {
          // Se resuelve una sola vez por partida: celebrar o avisar, y salir.
          const clave = `${e.salaId}:${e.resultado.finalizadaEn}`;
          const jugue = e.resultado.puntajes.some((p) => p.jugadorId === jugadorIdRef.current);
          if (jugue && celebrada.current !== clave) {
            celebrada.current = clave;
            const gane = e.resultado.ganadorJugadorId === jugadorIdRef.current;
            if (gane) {
              boom('¡SPIDER-CAMPEÓN!', window.innerWidth / 2, window.innerHeight * 0.35, true);
              confeti(window.innerWidth / 2, window.innerHeight * 0.35, 70);
            } else {
              boom('¡PERDISTE!', window.innerWidth / 2, window.innerHeight * 0.35);
            }
            terminarPartida(e.resultado);
          }
          setUltimoResultado((prev) => {
            if (prev?.finalizadaEn !== e.resultado?.finalizadaEn) refrescarLeaderboard();
            return e.resultado;
          });
        }
        if (e.estado === 'EN_CURSO') setUltimoResultado(null);
      },
      onError: (m) => escribir('⚠️ ' + m),
      onConexion: (s) => {
        setConexion(s);
        if (s === 'en_linea') c.listarSalas().then(setSalas);
      },
    });
    refrescarLeaderboard();

    // Recarga de la página: volver a la misma sala (SNK-07). sessionStorage es por pestaña.
    let guardada: string | null = null;
    try {
      guardada = sessionStorage.getItem(CLAVE_SALA);
    } catch {
      /* sin almacenamiento */
    }
    c.listarSalas().then((ss) => {
      setSalas(ss);
      // Pestaña nueva (otra vez desde el QR, o la app se cerró): esta pestaña no
      // guardó nada, pero el servidor sabe en qué sala sigo. Volver a ella.
      if (guardada || salaRef.current || client.current !== c) return;
      const mia = ss.find((s) => s.idsJugadores?.includes(jugadorIdRef.current));
      if (mia) void unirse(mia.id, true);
    });
    if (guardada) {
      const t = setTimeout(() => void unirse(guardada!, true), 600);
      return () => {
        clearTimeout(t);
        c.cerrar();
      };
    }
    return () => c.cerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  /*
   * La partida terminó: el servidor ya vació la sala. Se deja de escuchar esa
   * sala (el tablero se queda con la jugada final) y se olvida, para que al
   * recargar no se vuelva a entrar. Para seguir jugando hay que elegir sala.
   */
  function terminarPartida(r: ResultadoPartida) {
    client.current?.desuscribirSala();
    setSalaActualId(null);
    setFin(r);
    try {
      sessionStorage.removeItem(CLAVE_SALA);
    } catch {
      /* sin almacenamiento */
    }
    const yo = r.puntajes.find((p) => p.jugadorId === jugadorIdRef.current);
    escribir(
      r.ganadorJugadorId === jugadorIdRef.current
        ? `¡Ganaste en ${r.salaCodigo}! La partida terminó.`
        : `Perdiste en ${r.salaCodigo}${yo?.posicionFinal ? ` (puesto ${yo.posicionFinal})` : ''}. Ganó ${r.ganadorJugadorNombre ?? 'nadie'}.`,
    );
    client.current?.listarSalas().then(setSalas);
  }

  /* ---------- salas ---------- */
  async function unirse(salaId: string, esReconexion = false) {
    const c = client.current;
    if (!c) return;
    const r = await c.unirse(salaId);
    if (!r.ok) {
      escribir('No se pudo unir: ' + r.error);
      if (esReconexion) {
        try {
          sessionStorage.removeItem(CLAVE_SALA);
        } catch {
          /* sin almacenamiento */
        }
      }
      return;
    }
    setSalaActualId(salaId);
    setUltimoResultado(null);
    setFin(null);
    try {
      sessionStorage.setItem(CLAVE_SALA, salaId);
    } catch {
      /* sin almacenamiento */
    }
    c.suscribirSala(salaId);
    const faltan = r.sala.capacidad - r.sala.cantidadJugadores;
    escribir(`${esReconexion ? 'Reconectado a' : 'Unido a'} ${r.sala.codigo}.` + (faltan > 0 ? ` Faltan ${faltan} jugador(es) para empezar.` : ''));
    c.listarSalas().then(setSalas);
  }

  async function salirDeSala() {
    const c = client.current;
    const salaId = salaRef.current;
    if (!c || !salaId) return;
    c.desuscribirSala();
    setSalaActualId(null);
    setEstado(null);
    setUltimoResultado(null);
    try {
      sessionStorage.removeItem(CLAVE_SALA);
    } catch {
      /* sin almacenamiento */
    }
    await c.salir(salaId);
    escribir('Saliste de la sala.');
    c.listarSalas().then(setSalas);
  }

  /*
   * Cerrar o recargar la pestaña mientras se espera a que la sala se llene: se
   * libera el cupo de inmediato. La sala sigue guardada, así que al recargar
   * se vuelve a entrar sola. En plena partida no: ahí el servidor congela la
   * serpiente y deja volver (SNK-07).
   */
  useEffect(() => {
    const alIrse = () => {
      if (salaRef.current && estadoRef.current?.estado !== 'EN_CURSO') void salirDeSalaGuardada({ keepalive: true, olvidar: false });
    };
    window.addEventListener('pagehide', alIrse);
    return () => window.removeEventListener('pagehide', alIrse);
  }, []);

  /* ---------- teclado y d-pad ---------- */
  const mover = useCallback((direccion: Direccion) => {
    // La serpiente avanza sola en el servidor: cada tecla solo la hace girar.
    if (estadoRef.current?.estado === 'EN_CURSO') client.current?.mover(direccion);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      const direccion = TECLAS[e.key];
      if (!direccion || !salaRef.current) return;
      e.preventDefault();
      mover(direccion);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mover]);

  if (!me) return null;

  const color = estado ? coloresDe(estado) : {};
  const enPartida = estado?.estado === 'EN_CURSO';

  return (
    <main className="content wide mj">
      <div className="row between wrap" style={{ alignItems: 'flex-end' }}>
        <div>
          <span className="caption sm">Minijuego multijugador en vivo</span>
          <h1 style={{ marginTop: 10 }}>
            Snake <em className="serif">Planazo</em>
          </h1>
        </div>
        <span className={`conn ${conexion === 'en_linea' ? 'online' : conexion === 'desconectado' ? 'offline' : ''}`}>
          <span className="dot" />
          {CONEXION[conexion]}
        </span>
      </div>
      <p className="muted" style={{ margin: '8px 0 18px', maxWidth: 640 }}>
        Únete a una sala; la partida arranca sola cuando se llena. Gana la última serpiente en pie, y el podio desbloquea bonos de
        los lugares.
      </p>

      <div className="mj-layout">
        <div className="mj-side">
          <div className="mj-panel" style={{ background: 'linear-gradient(150deg, #3e7bff, #2f6bff 50%, #1b2f9a)', color: '#fff' }}>
            <h2 style={{ color: 'rgba(255,255,255,.85)' }}>
              <Icon name="trophy" size={14} /> Premios en juego
            </h2>
            {premios.length === 0 ? (
              <div className="small" style={{ opacity: 0.92 }}>
                Ahora no hay bonos para ganadores. Cuando un lugar lance uno, ganar una partida te lo desbloquea.
              </div>
            ) : (
              premios.map((p) => (
                <Link key={p.id} href={`/cliente/lugar/${p.placeId}`} className="row" style={{ padding: '6px 0', gap: 10 }}>
                  <span className="comic" style={{ fontSize: 20, color: 'var(--yellow)', textShadow: '2px 2px 0 #020505' }}>
                    {p.discount}
                  </span>
                  <span className="grow small" style={{ fontWeight: 700 }}>
                    {p.placeName}
                    <span style={{ display: 'block', opacity: 0.8, fontWeight: 500 }}>
                      {p.puestos && p.puestos > 1 ? `Top ${p.puestos}` : 'Solo el ganador'} · quedan {p.stock}
                    </span>
                  </span>
                  <Icon name="arrowRight" size={16} />
                </Link>
              ))
            )}
          </div>

          <div className="mj-panel">
            <h2>Salas en vivo</h2>
            {salas.length === 0 ? (
              <div className="mj-ayuda">{conexion === 'en_linea' ? 'No hay salas todavía.' : 'Conectando con el juego…'}</div>
            ) : (
              salas.map((s) => {
                const esActual = s.id === salaActualId;
                const lleno = s.cantidadJugadores >= s.capacidad;
                // Sigo en esa sala (salí de la pantalla en plena partida): mi lugar sigue siendo mío.
                const mia = !esActual && !!s.idsJugadores?.includes(jugadorId);
                const puede = mia || (!esActual && !lleno && s.estado !== 'EN_CURSO');
                const nombres = s.nombresJugadores.length ? s.nombresJugadores.join(', ') : 'vacía';
                const multiverso = s.codigo === 'Tierra-616';
                return (
                  <div key={s.id} className={`mj-sala${esActual ? ' actual' : ''}`}>
                    <div style={{ minWidth: 0 }}>
                      <b>
                        {multiverso && <SpiderArt size={16} color="#f1f7f4" eyes="#070d0c" />} {s.codigo}
                      </b>{' '}
                      <span className={`mj-chip ${s.estado}`}>{textoEstado(s.estado)}</span>
                      <small>
                        {s.cantidadJugadores}/{s.capacidad} jugadores
                        {s.estado === 'ESPERANDO_JUGADORES' ? ` · faltan ${s.capacidad - s.cantidadJugadores}` : ''}
                      </small>
                      <small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombres}</small>
                    </div>
                    <button className={`btn sm${esActual || mia ? ' yellow' : ''}`} disabled={!puede} onClick={() => void unirse(s.id, mia)}>
                      {esActual ? 'Aquí' : mia ? 'Volver' : lleno ? 'Llena' : 'Unirme'}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="mj-panel">
            <h2>Marcador global</h2>
            {leaderboard.length === 0 ? (
              <div className="mj-ayuda">Todavía no hay partidas terminadas. Sé el primero.</div>
            ) : (
              leaderboard.map((e) => (
                <div
                  key={e.jugadorId}
                  className={`mj-jugador${e.jugadorId === jugadorId ? ' yo' : ''}`}
                  style={{ borderColor: e.posicion === 1 ? 'var(--yellow)' : e.posicion <= 3 ? 'var(--brand)' : 'var(--line-strong)' }}
                >
                  <span>
                    <b className="tnum">#{e.posicion}</b> {e.jugadorNombre}
                    {e.jugadorId === jugadorId ? ' (tú)' : ''}
                  </span>
                  <span className="tnum">{e.puntajeTotal} pts</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mj-panel">
            <div className="mj-fila">
              <b className="grow">
                {estado ? `${estado.salaCodigo} · ${textoEstado(estado.estado)} · ${estado.jugadores.length}/${estado.capacidad}` : 'Sin sala'}
              </b>
              {enPartida && <span className="badge live tnum">{estado!.tiempoRestanteSegundos}s</span>}
              <button className="btn ghost sm" disabled={!salaActualId} onClick={() => void salirDeSala()}>
                Salir de la sala
              </button>
            </div>
            {fin && <FinDePartida r={fin} jugadorId={jugadorId} hayBonos={premios.length > 0} onOtra={() => { setFin(null); setEstado(null); setUltimoResultado(null); }} />}
            <div className="mj-board">
              <TableroSnake
                estado={estado}
                jugadorId={jugadorId}
                ultimoResultado={ultimoResultado}
                textoVacio={salaActualId ? 'Entrando a la sala…' : 'Elige una sala para jugar'}
              />
            </div>
            <div className="mj-dpad" aria-label="Controles táctiles">
              <button className="up" onPointerDown={() => mover('ARRIBA')} disabled={!enPartida} aria-label="Arriba">
                ▲
              </button>
              <button className="left" onPointerDown={() => mover('IZQUIERDA')} disabled={!enPartida} aria-label="Izquierda">
                ◀
              </button>
              <button className="down" onPointerDown={() => mover('ABAJO')} disabled={!enPartida} aria-label="Abajo">
                ▼
              </button>
              <button className="right" onPointerDown={() => mover('DERECHA')} disabled={!enPartida} aria-label="Derecha">
                ▶
              </button>
            </div>
            <div className="mj-ayuda" style={{ marginTop: 10 }}>
              Tu serpiente avanza sola: con <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> o <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> (o
              las flechas de la pantalla) la haces girar. La partida empieza sola cuando la sala está <b>llena</b>. Si tu cabeza toca
              un borde o cualquier cuerpo, mueres; gana la última serpiente en pie. Si te sales en plena partida, tu serpiente se congela
              15 s: vuelve a Snake y sigues donde ibas.
            </div>
          </div>

          <div className="mj-panel">
            <h2>Jugadores</h2>
            {!estado || estado.jugadores.length === 0 ? (
              <div className="mj-ayuda">Aún no hay nadie en tu sala.</div>
            ) : (
              [...estado.jugadores]
                .sort((a, b) => b.puntaje - a.puntaje)
                .map((j) => {
                  const marca =
                    estado.estado === 'EN_CURSO' || ultimoResultado
                      ? `${j.puntaje} pts · ${textoEstadoSerpiente[j.estado] ?? j.estado}`
                      : 'en la sala';
                  return (
                    <div key={j.jugadorId} className={`mj-jugador${j.jugadorId === jugadorId ? ' yo' : ''}`} style={{ borderColor: color[j.jugadorId] }}>
                      <span>
                        {j.jugadorNombre}
                        {j.jugadorId === jugadorId ? ' (tú)' : ''}
                        {j.conectado ? '' : ' 📴'}
                      </span>
                      <span className="tnum">{marca}</span>
                    </div>
                  );
                })
            )}
            {ultimoResultado && (
              <div className="caption sm" style={{ marginTop: 10 }}>
                {textoResultado(ultimoResultado)}
              </div>
            )}
          </div>

          <div className="mj-panel">
            <h2>Bitácora</h2>
            <div className="mj-log">{log.join('\n')}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Lo que ve cada jugador cuando su partida termina: ganó o perdió, y qué sigue. */
function FinDePartida({ r, jugadorId, hayBonos, onOtra }: { r: ResultadoPartida; jugadorId: string; hayBonos: boolean; onOtra: () => void }) {
  const gane = r.ganadorJugadorId === jugadorId;
  const yo = r.puntajes.find((p) => p.jugadorId === jugadorId);
  return (
    <div className={`mj-fin ${gane ? 'gane' : 'perdi'}`} role="status">
      <b>{gane ? '¡Ganaste! 🏆' : 'Perdiste 💥'}</b>
      <span>
        {gane
          ? `Primer puesto en ${r.salaCodigo}${yo ? ` con ${yo.puntaje} pts` : ''}.`
          : `Ganó ${r.ganadorJugadorNombre ?? 'nadie'}.${yo?.posicionFinal ? ` Quedaste en el puesto ${yo.posicionFinal} de ${r.puntajes.length}.` : ''}`}
      </span>
      <span className="nota">
        {gane && hayBonos
          ? 'Si había un bono para ganadores, te llega el aviso: reclámalo en Promos. Cada bono se gana una sola vez.'
          : !gane && hayBonos
            ? 'Todavía hay bonos en juego: entra a otra sala y vuelve a intentarlo.'
            : 'La partida terminó. Para seguir jugando, entra a otra sala.'}
      </span>
      <button className="btn sm" onClick={onOtra}>
        Elegir otra sala
      </button>
    </div>
  );
}
