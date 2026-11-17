import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverOf, coverUrl, logoOf } from './brand';
import {
  cerrarSesionFirebase,
  credencialDeFirebase,
  entrarConCorreoFirebase,
  entrarConGoogleFirebase,
  esCredencialFirebase,
  mensajeErrorFirebase,
  obtenerAppFirebase,
  obtenerAuthFirebase,
  registrarConCorreoFirebase,
  tokenDeCredencialFirebase,
} from './firebase';
import { cargarGoogle, credencialDemo, leerCredencial } from './google';
import { digitoVerificacion, problemaNit, razonSocialValida, telefonoValido } from './negocio';
import { buildSeed, CATEGORY_LABEL, ZONES } from './seed';
import { getSession, patchSession, setSession } from './session';

vi.mock('firebase/app', () => {
  const apps: object[] = [];
  return {
    getApps: () => apps,
    getApp: () => apps[0],
    initializeApp: (cfg: object) => {
      const app = { cfg };
      apps.push(app);
      return app;
    },
  };
});

vi.mock('firebase/auth', () => ({
  getAuth: (app: object) => ({ app }),
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  signInWithPopup: vi.fn(async () => ({
    user: { uid: 'uid-google', displayName: 'Ana Google', email: 'ana@gmail.com', getIdToken: async () => 'tok-g' },
  })),
  signInWithEmailAndPassword: vi.fn(async (_auth: unknown, email: string) => ({
    user: { uid: 'uid-mail', displayName: null, email, getIdToken: async () => 'tok-m' },
  })),
  createUserWithEmailAndPassword: vi.fn(async (_auth: unknown, email: string) => ({
    user: { uid: 'uid-new', displayName: null, email, getIdToken: async () => 'tok-n' },
  })),
  updateProfile: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
}));

describe('registro de negocio', () => {
  it('calcula el dígito de verificación del NIT como la DIAN', () => {
    expect(digitoVerificacion('900123456')).toBe(8);
    expect(problemaNit('900.123.456-8')).toBeNull();
  });

  it('explica por qué un NIT no sirve', () => {
    expect(problemaNit('123')).toMatch(/dígito de verificación/);
    expect(problemaNit('0123456-1')).toMatch(/dígito de verificación/);
    expect(problemaNit('900123456-1')).toMatch(/no coincide/);
  });

  it('acepta celulares y fijos colombianos, con o sin +57', () => {
    expect(telefonoValido('300 123 4567')).toBe(true);
    expect(telefonoValido('+57 3001234567')).toBe(true);
    expect(telefonoValido('601 234 5678')).toBe(true);
    expect(telefonoValido('12345')).toBe(false);
  });

  it('valida la razón social', () => {
    expect(razonSocialValida('Café Planazo SAS')).toBe(true);
    expect(razonSocialValida('ab')).toBe(false);
    expect(razonSocialValida('<script>')).toBe(false);
  });
});

describe('credencial de Google', () => {
  it('la credencial de demo se lee con el mismo formato que la de Google', () => {
    const perfil = leerCredencial(credencialDemo('José Ñandú'));
    expect(perfil).toEqual({ sub: 'demo-josenandu', name: 'José Ñandú', email: 'demo-josenandu@demo.planazo' });
  });

  it('sin sub o con basura no hay perfil', () => {
    const sinSub = `x.${btoa(JSON.stringify({ name: 'A' }))}.`;
    expect(leerCredencial(sinSub)).toBeNull();
    expect(leerCredencial('basura')).toBeNull();
  });

  it('un perfil sin nombre ni correo queda con textos vacíos', () => {
    const solo = `x.${btoa(JSON.stringify({ sub: 42 }))}.`;
    expect(leerCredencial(solo)).toEqual({ sub: '42', name: '', email: '' });
  });

  it('carga el script de Google una vez y reusa la promesa', async () => {
    const p1 = cargarGoogle();
    const p2 = cargarGoogle();
    expect(p1).toBe(p2);
    const script = document.head.querySelector('script[src*="accounts.google.com"]') as HTMLScriptElement;
    expect(script).not.toBeNull();
    const gis = { accounts: { id: { initialize() {}, renderButton() {}, disableAutoSelect() {} } } };
    window.google = gis;
    script.onload?.(new Event('load'));
    await expect(p1).resolves.toBe(gis);
    await expect(cargarGoogle()).resolves.toBe(gis); // ya cargado: sale directo
    delete window.google;
  });

  it('autentica y arma credenciales desde Firebase (Google y correo)', async () => {
    const app1 = obtenerAppFirebase();
    const app2 = obtenerAppFirebase();
    expect(app1).toBe(app2);
    expect(obtenerAuthFirebase()).toBeTruthy();

    const credG = await entrarConGoogleFirebase();
    expect(esCredencialFirebase(credG)).toBe(true);
    expect(tokenDeCredencialFirebase(credG)).toBe('fb:tok-g');
    expect(leerCredencial(credG)).toEqual({ sub: 'uid-google', name: 'Ana Google', email: 'ana@gmail.com' });

    const credM = await entrarConCorreoFirebase('pepe@correo.com', '123456');
    expect(leerCredencial(credM)).toEqual({ sub: 'uid-mail', name: 'pepe', email: 'pepe@correo.com' });

    const credN = await registrarConCorreoFirebase('Camila', 'cami@correo.com', '123456');
    expect(leerCredencial(credN)).toEqual({ sub: 'uid-new', name: 'Camila', email: 'cami@correo.com' });

    const sinToken = credencialDeFirebase({ uid: 'u-x' });
    expect(tokenDeCredencialFirebase(sinToken)).toBe('fb:sesion');
    expect(tokenDeCredencialFirebase('otra')).toBeUndefined();

    await expect(cerrarSesionFirebase()).resolves.toBeUndefined();
    expect(mensajeErrorFirebase({ code: 'auth/invalid-credential' })).toMatch(/no coinciden/);
    expect(mensajeErrorFirebase({ code: 'desconocido' })).toMatch(/No pudimos autenticar/);
    expect(mensajeErrorFirebase(null)).toMatch(/No pudimos autenticar/);
  });
});

describe('sesión', () => {
  afterEach(() => setSession(null));

  it('guarda, parchea y borra la sesión en localStorage', () => {
    setSession({ id: 'c-1', name: 'Ana', role: 'cliente' });
    expect(JSON.parse(localStorage.getItem('planazo.session')!).name).toBe('Ana');
    patchSession({ placeId: 'p1' });
    expect(getSession()).toMatchObject({ id: 'c-1', placeId: 'p1' });
    setSession(null);
    expect(getSession()).toBeNull();
    patchSession({ name: 'nadie' }); // sin sesión no hace nada
    expect(getSession()).toBeNull();
  });

  it('si el almacenamiento está bloqueado la sesión vive en memoria', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    setSession({ id: 'c-2', name: 'Beto', role: 'cliente' });
    expect(getSession()?.name).toBe('Beto');
  });
});

describe('marca y catálogo semilla', () => {
  const seed = buildSeed();

  it('la semilla trae lugares en las dos zonas con sus franjas', () => {
    expect(seed.places.length).toBeGreaterThan(5);
    expect(new Set(seed.places.map((p) => p.zone))).toEqual(new Set(Object.keys(ZONES)));
    expect(seed.slots.every((s) => seed.places.some((p) => p.id === s.placeId))).toBe(true);
    expect(CATEGORY_LABEL.restaurante).toBeTruthy();
  });

  it('los lugares semilla tienen logo y portada propios', () => {
    const p = seed.places[0];
    expect(logoOf(p).text).toBeTruthy();
    expect(coverOf(p)).toBe(coverUrl(p.id));
  });

  it('un lugar nuevo recibe un logo generado con iniciales y una portada válida', () => {
    expect(logoOf({ id: 'l-x', name: 'La Casa del Tejo', category: 'evento' }).text).toBe('CT');
    expect(logoOf({ id: 'l-y', name: 'Bar', category: 'bar' }).text).toBe('BA');
    expect(logoOf({ id: 'l-z', name: 'de la', category: 'bar' }).text).toBe('DE');
    expect(coverOf({ id: 'l-x', category: 'bar', cover: 'bar-3' })).toBe(coverUrl('bar-3'));
    expect(coverOf({ id: 'l-x', category: 'bar', cover: 'inventada' })).toBe(coverUrl('bar-1'));
    expect(coverOf({ id: 'l-x', category: 'hotel' })).toBe(coverUrl('hotel-1'));
  });
});
