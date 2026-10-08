'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { coloresDe, TableroSnake, textoEstado, textoResultado } from '@/components/TableroSnake';
import { crearGameClient } from '@/lib/game/client';
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

/**
 * Minijuego Planazo: el cliente de planazo-game (test-client.html de Diego)
 * llevado a la app, con su mismo diseño y su mismo protocolo. La única
 * diferencia es que el usuario ya entró por el gateway: el JWT es el mismo.
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
  conectando: '⏳ conectando…',
  en_linea: '🟢 en línea',
  desconectado: '🔴 desconectado — reintentando…',
};

const textoEstadoSerpiente: Record<string, string> = { VIVA: 'viva', ELIMINADA: 'eliminada 💀', DESCONECTADA_CONGELADA: 'congelada ❄️' };

const CLAVE_SALA = 'minijuego.sala';

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
    c.listarSalas().then(setSalas);
    refrescarLeaderboard();

    // Recarga de la página: volver a la misma sala (SNK-07). sessionStorage es por pestaña.
    let guardada: string | null = null;
    try {
      guardada = sessionStorage.getItem(CLAVE_SALA);
    } catch {
      /* sin almacenamiento */
    }
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

  /* ---------- teclado y d-pad ---------- */
  const mover = useCallback((direccion: Direccion) => {
    // Cada pulsación (y cada repetición al mantenerla) es un paso; el servidor limita a 10 pasos/seg.
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
      <h1>🐍 Minijuego Planazo</h1>

      <div className="mj-layout">
        <div>
          <div className="mj-panel">
            <h2>1. Jugador</h2>
            <div className="mj-fila">
              <span>✅ {me.name}</span> <span className="mj-conexion">{CONEXION[conexion]}</span>
            </div>
          </div>

          <div className="mj-panel">
            <h2>2. Salas (en vivo)</h2>
            {salas.length === 0 ? (
              <div className="mj-ayuda">{conexion === 'en_linea' ? 'No hay salas todavía.' : 'Conectando con el juego…'}</div>
            ) : (
              salas.map((s) => {
                const esActual = s.id === salaActualId;
                const lleno = s.cantidadJugadores >= s.capacidad;
                const puede = !esActual && !lleno && s.estado !== 'EN_CURSO';
                const nombres = s.nombresJugadores.length ? s.nombresJugadores.join(', ') : 'vacía';
                return (
                  <div key={s.id} className={`mj-sala${esActual ? ' actual' : ''}`}>
                    <div>
                      <b>{s.codigo}</b> <span className={`mj-chip ${s.estado}`}>{textoEstado(s.estado)}</span>
                      <small>
                        {s.cantidadJugadores}/{s.capacidad} jugadores
                        {s.estado === 'ESPERANDO_JUGADORES' ? ` · faltan ${s.capacidad - s.cantidadJugadores}` : ''}
                      </small>
                      <small>{nombres}</small>
                    </div>
                    <button disabled={!puede} onClick={() => void unirse(s.id)}>
                      {esActual ? 'Aquí' : lleno ? 'Llena' : 'Unirme'}
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
                <div key={e.jugadorId} className={`mj-jugador${e.jugadorId === jugadorId ? ' yo' : ''}`} style={{ borderColor: '#374151' }}>
                  <span>
                    #{e.posicion} {e.jugadorNombre}
                    {e.jugadorId === jugadorId ? ' (tú)' : ''}
                  </span>
                  <span>{e.puntajeTotal} pts</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mj-panel">
            <div className="mj-fila">
              <b>
                {estado
                  ? `${estado.salaCodigo} · ${textoEstado(estado.estado)} · ${estado.jugadores.length}/${estado.capacidad}`
                  : 'Sin sala'}
              </b>
              <button className="secundario" disabled={!salaActualId} onClick={() => void salirDeSala()}>
                Salir de la sala
              </button>
              <span className="mj-ayuda">{enPartida ? `⏱ ${estado!.tiempoRestanteSegundos}s` : ''}</span>
            </div>
            <TableroSnake
              estado={estado}
              jugadorId={jugadorId}
              ultimoResultado={ultimoResultado}
              textoVacio={salaActualId ? 'Entrando a la sala…' : 'Elige una sala para jugar'}
            />
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
            <div className="mj-ayuda" style={{ marginTop: 8 }}>
              Cada tecla (<kbd>←</kbd>
              <kbd>↑</kbd>
              <kbd>→</kbd>
              <kbd>↓</kbd> o <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd>) mueve tu serpiente una celda; mantenla presionada para avanzar seguido. Si no tocas nada, tu
              serpiente se queda quieta. Solo la ventana con el foco recibe las teclas. La partida empieza sola cuando la
              sala está <b>llena</b>. Si tu cabeza toca un borde o cualquier cuerpo, mueres; gana la última serpiente en
              pie.
            </div>
          </div>

          <div className="mj-panel">
            <h2>Jugadores</h2>
            {!estado || estado.jugadores.length === 0 ? (
              <div className="mj-ayuda">—</div>
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
                      <span>{marca}</span>
                    </div>
                  );
                })
            )}
            {ultimoResultado && (
              <div className="mj-ayuda" style={{ marginTop: 6 }}>
                {textoResultado(ultimoResultado)}
              </div>
            )}
          </div>

          <div className="mj-panel">
            <div className="mj-log">{log.join('\n')}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
