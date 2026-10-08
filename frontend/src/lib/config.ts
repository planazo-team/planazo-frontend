export type ApiMode = 'mock' | 'live';

const mode: ApiMode = process.env.NEXT_PUBLIC_API_MODE === 'live' ? 'live' : 'mock';

export const config = {
  mode,
  /** En modo mock se muestran detalles técnicos útiles para demostrar los retos. */
  demo: mode === 'mock',
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
  /**
   * En `live` estas dos son opcionales: si no están definidas, la app funciona
   * solo por HTTP (sin eventos en vivo ni partida) y lo dice en la interfaz.
   */
  realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL ?? (mode === 'live' ? '' : 'ws://localhost:8081/ws'),
  gameUrl: (process.env.NEXT_PUBLIC_GAME_URL ?? (mode === 'live' ? '' : 'ws://localhost:8082')).replace(/\/$/, ''),
} as const;
