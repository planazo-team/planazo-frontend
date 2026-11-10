/**
 * Validaciones del registro de negocio. Son las mismas que aplica booking en
 * el servidor (que es el que manda); aquí solo sirven para avisar antes de
 * enviar. Ver planazo-booking/src/booking/cuentas.ts.
 */

/** Dígito de verificación del NIT según la DIAN. */
export function digitoVerificacion(base: string): number {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let suma = 0;
  for (let i = 0; i < base.length; i++) suma += Number(base[base.length - 1 - i]) * pesos[i];
  const r = suma % 11;
  return r > 1 ? 11 - r : r;
}

/** `null` si el NIT es válido; si no, por qué. */
export function problemaNit(nit: string): string | null {
  const m = nit.replace(/[\s.]/g, '').match(/^(\d{6,10})-?(\d)$/);
  if (!m || m[1].startsWith('0')) return 'Escribe el NIT con su dígito de verificación, por ejemplo 900.123.456-8.';
  if (digitoVerificacion(m[1]) !== Number(m[2])) return 'El dígito de verificación no coincide con el NIT. Revísalo en el RUT.';
  return null;
}

export function telefonoValido(tel: string): boolean {
  const t = tel.replace(/[\s\-()]/g, '').replace(/^\+?57(?=\d{10}$)/, '');
  return /^(3\d{9}|60\d{8})$/.test(t);
}

export function razonSocialValida(nombre: string): boolean {
  const n = nombre.trim();
  return n.length >= 3 && n.length <= 120 && !/[<>]/.test(n);
}

export interface DatosNegocio {
  legalName: string;
  nit: string;
  phone: string;
  acceptTerms: boolean;
}
