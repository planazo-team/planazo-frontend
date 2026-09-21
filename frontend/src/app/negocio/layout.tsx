'use client';

import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { useTopics } from '@/lib/hooks';
import { setSession, type SessionUser } from '@/lib/session';

function BusinessShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const router = useRouter();
  // El panel sigue su propio establecimiento: reservas, inventario y reclamos de sus promociones.
  useTopics([user.placeId ? `place:${user.placeId}` : null]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          Plan<span>azo</span> <span className="muted small" style={{ fontWeight: 600 }}>· Panel</span>
        </div>
        <div className="spacer" />
        <ConnectionBadge />
        <button
          className="btn ghost sm"
          onClick={() => {
            setSession(null);
            router.replace('/');
          }}
        >
          Salir
        </button>
      </header>
      {children}
    </div>
  );
}

export default function NegocioLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate role="negocio">{(user) => <BusinessShell user={user}>{children}</BusinessShell>}</AuthGate>;
}
