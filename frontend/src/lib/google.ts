'use client';

/**
 * «Iniciar sesión con Google» (Google Identity Services). El botón entrega un
 * ID token (un JWT firmado por Google) que el gateway verifica. Aquí solo se
 * lee su contenido para mostrar el nombre mientras se elige el rol: la
 * verificación de verdad la hace el servidor.
 */

const SCRIPT = 'https://accounts.google.com/gsi/client';

export interface GoogleProfile {
  sub: string;
  name: string;
  email: string;
}

interface Gis {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean; context?: string }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
      disableAutoSelect(): void;
    };
  };
}

declare global {
  interface Window {
    google?: Gis;
  }
}

let cargando: Promise<Gis> | null = null;

/** Carga el script de Google una sola vez. */
export function cargarGoogle(): Promise<Gis> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  cargando ??= new Promise<Gis>((ok, mal) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.google ? ok(window.google) : mal(new Error('Google no cargó')));
    s.onerror = () => {
      cargando = null;
      mal(new Error('No se pudo cargar Google'));
    };
    document.head.appendChild(s);
  });
  return cargando;
}

/** Lee (sin verificar) el contenido del ID token. Solo para mostrar el nombre. */
export function leerCredencial(credential: string): GoogleProfile | null {
  try {
    const b64 = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      Array.from(atob(b64), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    );
    const p = JSON.parse(json) as Partial<GoogleProfile>;
    return p.sub ? { sub: String(p.sub), name: String(p.name ?? ''), email: String(p.email ?? '') } : null;
  } catch {
    return null;
  }
}

/**
 * Solo para el modo demo (servicios simulados, sin client ID de Google): arma
 * una credencial con la misma forma, sin firma. El gateway real la rechaza.
 */
export function credencialDemo(nombre: string): string {
  const b64 = (o: object) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '');
  const sub = `demo-${nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')}`;
  return `${b64({ alg: 'none' })}.${b64({ sub, name: nombre, email: `${sub}@demo.planazo` })}.`;
}
