export type ApiMode = 'mock' | 'live';

const mode: ApiMode = process.env.NEXT_PUBLIC_API_MODE === 'live' ? 'live' : 'mock';

export const config = {
  mode,
  /** En modo mock se muestran detalles técnicos útiles para demostrar los retos. */
  demo: mode === 'mock',
  /** Configuración de Firebase Authentication (planazo-auth). */
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyB5gP2jSP8VKafFsfhs9cvjYJaAtYBI-O4',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'planazo-auth.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'planazo-auth',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'planazo-auth.firebasestorage.app',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '601482275182',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:601482275182:web:5c364ca744b6af92e7797f',
  },
  /** Client ID de OAuth de Google. Se entra únicamente con Google o Firebase. */
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
  /**
   * En `live` estas dos son opcionales: si no están definidas, la app funciona
   * solo por HTTP (sin eventos en vivo ni partida) y lo dice en la interfaz.
   */
  realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL ?? (mode === 'live' ? '' : 'ws://localhost:8081/ws'),
  gameUrl: (process.env.NEXT_PUBLIC_GAME_URL ?? (mode === 'live' ? '' : 'ws://localhost:8082')).replace(/\/$/, ''),
} as const;
