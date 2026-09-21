export type ApiMode = 'mock' | 'live';

const mode: ApiMode = process.env.NEXT_PUBLIC_API_MODE === 'live' ? 'live' : 'mock';

export const config = {
  mode,
  /** En modo mock se muestran detalles técnicos útiles para demostrar los retos. */
  demo: mode === 'mock',
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
  realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL ?? 'ws://localhost:8081/ws',
  gameUrl: (process.env.NEXT_PUBLIC_GAME_URL ?? 'ws://localhost:8082').replace(/\/$/, ''),
} as const;
