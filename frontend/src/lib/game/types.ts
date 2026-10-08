/**
 * Contrato del minijuego (planazo-game, Java + Spring). Son los records que el
 * servicio expone por REST (`/api/v1/salas`, `/api/v1/leaderboard`) y por STOMP
 * (`/topic/salas/{id}`): ResumenSala, EstadoJuegoDTO, JugadorEnSalaDTO,
 * ResultadoPartida y EntradaLeaderboard. Si cambian allá, cambian aquí.
 */

export type EstadoSala = 'ESPERANDO_JUGADORES' | 'CUENTA_REGRESIVA' | 'EN_CURSO' | 'FINALIZADA';

export type Direccion = 'ARRIBA' | 'ABAJO' | 'IZQUIERDA' | 'DERECHA';

export type EstadoSerpiente = 'VIVA' | 'ELIMINADA' | 'DESCONECTADA_CONGELADA';

export interface Posicion {
  x: number;
  y: number;
}

/** Una sala del catálogo (SNK-01/02): cupo fijo y pre-existente. */
export interface ResumenSala {
  id: string;
  codigo: string;
  capacidad: number;
  cantidadJugadores: number;
  estado: EstadoSala;
  nombresJugadores: string[];
}

/** Snapshot de una serpiente en un tick. */
export interface JugadorEnSala {
  jugadorId: string;
  jugadorNombre: string;
  cuerpo: Posicion[];
  direccion: Direccion;
  estado: EstadoSerpiente;
  puntaje: number;
  conectado: boolean;
}

export interface PuntajeJugador {
  jugadorId: string;
  jugadorNombre: string;
  puntaje: number;
}

/** Lo que queda al terminar una partida (SNK-10). */
export interface ResultadoPartida {
  salaId: string;
  salaCodigo: string;
  ganadorJugadorId: string | null;
  ganadorJugadorNombre: string | null;
  motivoVictoria: string;
  puntajes: PuntajeJugador[];
  iniciadaEn: string;
  finalizadaEn: string;
}

/** Mensaje de cada tick en `/topic/salas/{salaId}` (RT-3). */
export interface EstadoJuego {
  salaId: string;
  salaCodigo: string;
  estado: EstadoSala;
  capacidad: number;
  segundosCuentaRegresiva: number;
  anchoTablero: number;
  altoTablero: number;
  jugadores: JugadorEnSala[];
  comida: Posicion | null;
  tiempoRestanteSegundos: number;
  resultado: ResultadoPartida | null;
}

/** Fila del marcador global (SNK-08, CC-2). */
export interface EntradaLeaderboard {
  posicion: number;
  jugadorId: string;
  jugadorNombre: string;
  puntajeTotal: number;
}

export type EstadoConexion = 'conectando' | 'en_linea' | 'desconectado';

export interface GameHandlers {
  onSalas(salas: ResumenSala[]): void;
  onEstado(estado: EstadoJuego): void;
  onError(mensaje: string): void;
  onConexion(estado: EstadoConexion): void;
}

/**
 * Lo que la pantalla del juego necesita. Dos implementaciones con la misma forma:
 * `live` (REST por el gateway + STOMP directo contra game) y `mock` (simulado).
 */
export interface GameClient {
  listarSalas(): Promise<ResumenSala[]>;
  unirse(salaId: string): Promise<{ ok: true; sala: ResumenSala } | { ok: false; error: string }>;
  salir(salaId: string): Promise<void>;
  leaderboard(limite?: number): Promise<EntradaLeaderboard[]>;

  conectar(h: GameHandlers): void;
  conectado(): boolean;
  /** Suscribe a la sala y registra la sesión: el servidor responde con el estado actual. */
  suscribirSala(salaId: string): void;
  desuscribirSala(): void;
  mover(direccion: Direccion): void;
  cerrar(): void;
}
