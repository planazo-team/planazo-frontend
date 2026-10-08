'use client';

import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { Brand } from '@/components/Brand';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { Icon } from '@/components/Icon';
import { useTopics } from '@/lib/hooks';
import { setSession, type SessionUser } from '@/lib/session';

function BusinessShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const router = useRouter();
  // El panel sigue su propio establecimiento: reservas, inventario y reclamos de sus promociones.
  useTopics([user.placeId ? `place:${user.placeId}` : null]);

  return (
    <div className="shell">
      <header className="topbar">
        <Brand sub="Panel" />
        <div className="spacer" />
        <ConnectionBadge />
        <span className="muted small" style={{ fontWeight: 600 }}>
          {user.name}
        </span>
        <button
          className="btn ghost sm"
          onClick={() => {
            setSession(null);
            router.replace('/');
          }}
          aria-label="Salir"
          title="Cerrar sesión"
        >
          <Icon name="logout" size={16} />
        </button>
      </header>
      {children}
    </div>
  );
}

export default function NegocioLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate role="negocio">{(user) => <BusinessShell user={user}>{children}</BusinessShell>}</AuthGate>;
}
