import { getSession, type Role, type SessionUser } from './session';
import type { ApiResult } from './types';

/**
 * Control de acceso basado en roles (`cliente` | `negocio`) y trazabilidad de
 * seguridad en el cliente. Refleja la misma separación que aplica el
 * `planazo-api-gateway`:
 *
 * - `cliente`: explora lugares, reserva cupos, reclama cupones y juega el minijuego.
 * - `negocio`: administra únicamente su propio establecimiento (`placeId`):
 *   edita cupos, consulta las reservas de su lugar, crea eventos y lanza promociones.
 */

export type AccionCliente =
  | 'VER_LUGARES'
  | 'RESERVAR_CUPO'
  | 'VER_MIS_RESERVAS'
  | 'RECLAMAR_PROMO'
  | 'VER_MIS_CUPONES'
  | 'JUGAR_MINIJUEGO'
  | 'PEDIR_PLAN_AGENTE';

export type AccionNegocio =
  | 'CREAR_LUGAR'
  | 'EDITAR_CAPACIDAD_CUPO'
  | 'VER_RESERVAS_LUGAR'
  | 'CREAR_EVENTO'
  | 'LANZAR_PROMO'
  | 'CONFIGURAR_2FA';

export type AccionSeguridad = AccionCliente | AccionNegocio | 'CANCELAR_RESERVA' | 'ACCESO_RUTA';

const SOLO_CLIENTE = new Set<AccionSeguridad>([
  'RESERVAR_CUPO',
  'VER_MIS_RESERVAS',
  'RECLAMAR_PROMO',
  'VER_MIS_CUPONES',
  'JUGAR_MINIJUEGO',
]);

const SOLO_NEGOCIO = new Set<AccionSeguridad>([
  'CREAR_LUGAR',
  'EDITAR_CAPACIDAD_CUPO',
  'VER_RESERVAS_LUGAR',
  'CREAR_EVENTO',
  'LANZAR_PROMO',
  'CONFIGURAR_2FA',
]);

export interface TrazaSeguridad {
  id: string;
  at: number;
  correlationId: string;
  userId: string;
  role: Role | 'anonimo';
  placeId?: string;
  accion: AccionSeguridad;
  recurso?: string;
  resultado: 'PERMITIDO' | 'DENEGADO';
  motivo?: string;
}

const MAX_TRAZAS = 200;
const bitacora: TrazaSeguridad[] = [];
let secuencia = 0;

/** Genera un identificador de correlación único para seguir cada operación hasta el gateway. */
export function nuevoCorrelationId(): string {
  secuencia = (secuencia + 1) % 1_000_000;
  return `plz-${Date.now().toString(36)}-${secuencia.toString(36)}`;
}

/** Registra un evento inmutable de autorización/acceso para trazabilidad de seguridad. */
export function registrarTrazaSeguridad(
  entrada: Omit<TrazaSeguridad, 'id' | 'at' | 'correlationId'> & { correlationId?: string },
): TrazaSeguridad {
  const traza: TrazaSeguridad = Object.freeze({
    id: `tr-${Date.now()}-${bitacora.length + 1}`,
    at: Date.now(),
    correlationId: entrada.correlationId ?? nuevoCorrelationId(),
    ...entrada,
  });
  bitacora.push(traza);
  if (bitacora.length > MAX_TRAZAS) bitacora.shift();
  return traza;
}

/** Devuelve la bitácora de trazas de seguridad registradas en la sesión actual. */
export function leerTrazasSeguridad(): readonly TrazaSeguridad[] {
  return bitacora;
}

/** Limpia las trazas en memoria (útil en pruebas y al cerrar sesión). */
export function limpiarTrazasSeguridad(): void {
  bitacora.length = 0;
}

/**
 * Evalúa si la sesión actual (o el usuario indicado) tiene permiso para
 * ejecutar `accion` sobre `placeIdObjetivo` y deja registro en la bitácora.
 */
export function verificarPermisoRol(
  accion: AccionSeguridad,
  opciones: { user?: SessionUser | null; placeIdObjetivo?: string; correlationId?: string } = {},
): ApiResult<{ correlationId: string }> {
  const user = opciones.user === undefined ? getSession() : opciones.user;
  const correlationId = opciones.correlationId ?? nuevoCorrelationId();

  if (!user) {
    registrarTrazaSeguridad({
      correlationId,
      userId: 'anonimo',
      role: 'anonimo',
      accion,
      recurso: opciones.placeIdObjetivo,
      resultado: 'DENEGADO',
      motivo: 'SIN_SESION',
    });
    return { ok: false, status: 401, code: 'SIN_TOKEN', error: 'Debes iniciar sesión para continuar.' };
  }

  if (user.role !== 'cliente' && user.role !== 'negocio') {
    registrarTrazaSeguridad({
      correlationId,
      userId: user.id,
      role: user.role,
      accion,
      recurso: opciones.placeIdObjetivo,
      resultado: 'DENEGADO',
      motivo: 'ROL_INVALIDO',
    });
    return { ok: false, status: 403, code: 'ROL_NO_AUTORIZADO', error: 'El rol de la sesión no es válido.' };
  }

  if (SOLO_CLIENTE.has(accion) && user.role !== 'cliente') {
    registrarTrazaSeguridad({
      correlationId,
      userId: user.id,
      role: user.role,
      placeId: user.placeId,
      accion,
      recurso: opciones.placeIdObjetivo,
      resultado: 'DENEGADO',
      motivo: 'SOLO_CLIENTE',
    });
    return {
      ok: false,
      status: 403,
      code: 'ROL_NO_AUTORIZADO',
      error: 'Esta acción es exclusiva del rol cliente. Cambia a modo cliente para realizarla.',
    };
  }

  if (SOLO_NEGOCIO.has(accion)) {
    if (user.role !== 'negocio') {
      registrarTrazaSeguridad({
        correlationId,
        userId: user.id,
        role: user.role,
        accion,
        recurso: opciones.placeIdObjetivo,
        resultado: 'DENEGADO',
        motivo: 'SOLO_NEGOCIO',
      });
      return {
        ok: false,
        status: 403,
        code: 'ROL_NO_AUTORIZADO',
        error: 'Esta acción es exclusiva del rol negocio.',
      };
    }

    if (opciones.placeIdObjetivo && user.placeId && opciones.placeIdObjetivo !== user.placeId) {
      registrarTrazaSeguridad({
        correlationId,
        userId: user.id,
        role: user.role,
        placeId: user.placeId,
        accion,
        recurso: opciones.placeIdObjetivo,
        resultado: 'DENEGADO',
        motivo: 'ESTABLECIMIENTO_AJENO',
      });
      return {
        ok: false,
        status: 403,
        code: 'ROL_NO_AUTORIZADO',
        error: 'No puedes administrar ni lanzar promociones en un establecimiento que no es el tuyo.',
      };
    }
  }

  registrarTrazaSeguridad({
    correlationId,
    userId: user.id,
    role: user.role,
    placeId: user.placeId,
    accion,
    recurso: opciones.placeIdObjetivo,
    resultado: 'PERMITIDO',
  });

  return { ok: true, data: { correlationId } };
}
