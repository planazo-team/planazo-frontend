'use client';

import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { BottomNav } from '@/components/BottomNav';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { PromoToast } from '@/components/PromoToast';
import { useTopics } from '@/lib/hooks';
import { setSession, type SessionUser } from '@/lib/session';

function ClientShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const router = useRouter();
  // El piloto cubre dos zonas: el cliente las sigue ambas, más sus eventos personales.
  useTopics(['zone:zona-g', 'zone:zona-t', `user:${user.id}`]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          Plan<span>azo</span>
        </div>
        <div className="spacer" />
        <ConnectionBadge />
        <button
          className="btn ghost sm"
          onClick={() => {
            setSession(null);
            router.replace('/');
          }}
          title={`Sesión de ${user.name}`}
        >
          Salir
        </button>
      </header>
      {children}
      <PromoToast />
      <BottomNav />
    </div>
  );
}

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate role="cliente">{(user) => <ClientShell user={user}>{children}</ClientShell>}</AuthGate>;
}
