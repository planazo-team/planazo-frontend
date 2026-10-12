'use client';

import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { Avatar } from '@/components/Avatar';
import { Brand } from '@/components/Brand';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { Icon } from '@/components/Icon';
import { PromoToast } from '@/components/PromoToast';
import { useTopics } from '@/lib/hooks';
import { setSession, type SessionUser } from '@/lib/session';

function BusinessShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const router = useRouter();
  // El panel sigue su propio establecimiento: reservas, inventario y reclamos de sus promociones.
  useTopics([user.placeId ? `place:${user.placeId}` : null]);

  return (
    <div className="shell">
      <header className="topbar">
        <Brand sub="Negocios" />
        <div className="spacer" />
        <ConnectionBadge />
        <Avatar name={user.name} />
        <button
          className="btn ghost sm icon"
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
      <PromoToast />
    </div>
  );
}

export default function NegocioLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate role="negocio">{(user) => <BusinessShell user={user}>{children}</BusinessShell>}</AuthGate>;
}
