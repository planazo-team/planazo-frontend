'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
} from 'firebase/auth';
import { config } from './config';

/**
 * Autenticación con Firebase (`planazo-auth`). Soporta tanto inicio de sesión
 * con Google (ventana emergente de Firebase) como correo y contraseña, y
 * entrega una credencial compatible con el flujo de cliente y negocio de Planazo.
 */

export interface UsuarioFirebaseMinimo {
  uid: string;
  displayName?: string | null;
  email?: string | null;
}

const PREFIJO_FIREBASE = 'eyJhbGciOiJmaXJlYmFzZSJ9.';

/** Inicializa la app de Firebase una sola vez en el navegador. */
export function obtenerAppFirebase(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(config.firebase);
}

/** Instancia de Firebase Authentication asociada a `planazo-auth`. */
export function obtenerAuthFirebase(): Auth {
  return getAuth(obtenerAppFirebase());
}

/**
 * Convierte un usuario autenticado por Firebase en una credencial con el mismo
 * formato JWT (`header.payload.token`) que lee `leerCredencial`.
 */
export function credencialDeFirebase(
  u: UsuarioFirebaseMinimo,
  nombreAlternativo?: string,
  idToken = '',
): string {
  const b64 = (o: object) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '');
  const email = (u.email ?? '').trim();
  const name = (nombreAlternativo || u.displayName || email.split('@')[0] || 'Usuario').trim();
  return `${PREFIJO_FIREBASE}${b64({ sub: u.uid, name, email })}.${idToken}`;
}

/** Indica si una credencial proviene directamente de Firebase Auth. */
export function esCredencialFirebase(credential: string): boolean {
  return credential.startsWith(PREFIJO_FIREBASE);
}

/** Extrae el ID token firmado por Firebase si viene adjunto en la credencial. */
export function tokenDeCredencialFirebase(credential: string): string | undefined {
  if (!esCredencialFirebase(credential)) return undefined;
  const partes = credential.split('.');
  return partes[2] ? partes.slice(2).join('.') : undefined;
}

/** Abre el selector de cuentas de Google mediante Firebase Auth. */
export async function entrarConGoogleFirebase(): Promise<string> {
  const proveedor = new GoogleAuthProvider();
  proveedor.setCustomParameters({ prompt: 'select_account' });
  const res = await signInWithPopup(obtenerAuthFirebase(), proveedor);
  const token = await res.user.getIdToken();
  return credencialDeFirebase(res.user, undefined, token);
}

/** Inicia sesión con correo y contraseña en Firebase Auth. */
export async function entrarConCorreoFirebase(correo: string, clave: string): Promise<string> {
  const res = await signInWithEmailAndPassword(obtenerAuthFirebase(), correo.trim(), clave);
  const token = await res.user.getIdToken();
  return credencialDeFirebase(res.user, undefined, token);
}

/** Crea una cuenta con correo, contraseña y nombre visible en Firebase Auth. */
export async function registrarConCorreoFirebase(nombre: string, correo: string, clave: string): Promise<string> {
  const limpio = nombre.trim();
  const res = await createUserWithEmailAndPassword(obtenerAuthFirebase(), correo.trim(), clave);
  if (limpio) {
    await updateProfile(res.user, { displayName: limpio });
  }
  const token = await res.user.getIdToken();
  return credencialDeFirebase(res.user, limpio, token);
}

/** Cierra la sesión activa de Firebase sin interrumpir si ya estaba cerrada. */
export async function cerrarSesionFirebase(): Promise<void> {
  try {
    await signOut(obtenerAuthFirebase());
  } catch {
    /* sin sesión remota activa */
  }
}

const MENSAJES_FIREBASE: Record<string, string> = {
  'auth/invalid-credential': 'El correo o la contraseña no coinciden. Revisa tus datos o crea tu cuenta.',
  'auth/wrong-password': 'La contraseña no es correcta.',
  'auth/user-not-found': 'No encontramos una cuenta con ese correo. Puedes crearla en la pestaña «Crear cuenta».',
  'auth/email-already-in-use': 'Ese correo ya tiene cuenta en Planazo. Entra con tu contraseña o con Google.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'Escribe un correo electrónico válido.',
  'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
  'auth/cancelled-popup-request': 'Se canceló la ventana anterior de Google.',
  'auth/popup-blocked': 'Tu navegador bloqueó la ventana emergente. Permite ventanas emergentes para entrar con Google.',
  'auth/too-many-requests': 'Demasiados intentos seguidos. Espera un momento e intenta de nuevo.',
  'auth/network-request-failed': 'No pudimos conectar con Firebase. Revisa tu conexión a internet.',
};

/** Traduce los errores del SDK de Firebase a mensajes claros para la interfaz. */
export function mensajeErrorFirebase(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  return MENSAJES_FIREBASE[code] ?? 'No pudimos autenticar tu cuenta con Firebase. Intenta de nuevo.';
}
