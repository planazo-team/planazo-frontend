'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession, type Role, type SessionUser } from '@/lib/session';

/** Deja pasar solo a la sesión con el rol indicado. Sin sesión, vuelve al inicio. */
export function AuthGate({ role, children }: { role: Role; children: (user: SessionUser) => React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const allowed = session && session.role === role;

  useEffect(() => {
    if (session === null || (session && session.role !== role)) router.replace('/');
  }, [session, role, router]);

  if (!allowed) {
    return (
      <main className="content">
        <p className="muted">Cargando…</p>
      </main>
    );
  }
  return <>{children(session)}</>;
}
