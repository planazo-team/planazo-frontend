'use client';

import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { BottomNav } from '@/components/BottomNav';
import { Brand } from '@/components/Brand';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { Icon } from '@/components/Icon';
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
        <Brand />
        <div className="spacer" />
        <ConnectionBadge />
        <span className="avatar" style={{ width: 30, height: 30, fontSize: 12 }} title={user.name} aria-hidden>
          {user.name[0]}
        </span>
        <button
          className="btn ghost sm"
          onClick={() => {
            setSession(null);
            router.replace('/');
          }}
          title={`Cerrar la sesión de ${user.name}`}
          aria-label="Salir"
        >
          <Icon name="logout" size={16} />
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
