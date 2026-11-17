'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { registrarTrazaSeguridad } from '@/lib/autorizacion';
import { useSession, type Role, type SessionUser } from '@/lib/session';

/**
 * Deja pasar únicamente a la sesión cuyo rol (`cliente` | `negocio`) coincide
 * con la ruta solicitada y deja traza de seguridad ante cualquier intento de
 * acceso cruzado entre roles.
 */
export function AuthGate({ role, children }: { role: Role; children: (user: SessionUser) => React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const allowed = session && session.role === role;

  useEffect(() => {
    if (session === null) {
      registrarTrazaSeguridad({
        userId: 'anonimo',
        role: 'anonimo',
        accion: 'ACCESO_RUTA',
        recurso: role,
        resultado: 'DENEGADO',
        motivo: 'SIN_SESION',
      });
      router.replace('/');
      return;
    }
    if (session && session.role !== role) {
      registrarTrazaSeguridad({
        userId: session.id,
        role: session.role,
        placeId: session.placeId,
        accion: 'ACCESO_RUTA',
        recurso: role,
        resultado: 'DENEGADO',
        motivo: `ROL_REQUERIDO_${role.toUpperCase()}`,
      });
      router.replace(session.role === 'negocio' ? '/negocio' : '/cliente/mapa');
    }
  }, [session, role, router]);

  if (!allowed) {
    return (
      <main className="content">
        <div className="row" style={{ marginTop: 40, justifyContent: 'center' }}>
          <span className="caption">Calibrando el sentido arácnido…</span>
        </div>
      </main>
    );
  }
  return <>{children(session)}</>;
}
