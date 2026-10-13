'use client';

import { useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { BottomNav, SideRail } from '@/components/BottomNav';
import { Brand } from '@/components/Brand';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { PromoToast } from '@/components/PromoToast';
import { salirDeSalaGuardada } from '@/lib/game/client';
import { useRtEvent, useTopics } from '@/lib/hooks';
import { setSession, type SessionUser } from '@/lib/session';

function ClientShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  // El piloto cubre dos zonas: el cliente las sigue ambas, más sus eventos personales.
  useTopics(['zone:zona-g', 'zone:zona-t', `user:${user.id}`]);

  // Punto rojo en "Mis planes" cuando llega algo nuevo para mí.
  const [novedad, setNovedad] = useState(false);
  useRtEvent<{ userId?: string }>(['RESERVE.OK', 'PROMO.UNLOCKED', 'PROMO.WON'], (e) => {
    // RESERVE.OK y PROMO.WON también llegan por el tópico del lugar: solo cuentan los míos.
    if (e.type === 'PROMO.UNLOCKED' || e.payload?.userId === user.id) setNovedad(true);
  });
  const badges = { '/cliente/planes': novedad };

  return (
    <div className="shell">
      <header className="topbar">
        <Brand />
        <div className="spacer" />
        <ConnectionBadge />
        <Avatar name={user.name} />
        <button
          className="btn ghost sm icon"
          onClick={async () => {
            // Primero se sale de la sala del Snake (si estaba en una), después de la sesión.
            await salirDeSalaGuardada();
            setSession(null);
            // Recarga completa: la conexión en vivo y todo lo que estaba en memoria
            // eran del usuario anterior y no deben pasar al siguiente.
            window.location.replace('/');
          }}
          title={`Cerrar la sesión de ${user.name}`}
          aria-label="Salir"
        >
          <Icon name="logout" size={16} />
        </button>
      </header>
      <div className="app">
        <SideRail badges={badges} />
        <div className="grow" onClickCapture={(e) => (e.target as HTMLElement).closest('a[href="/cliente/planes"]') && setNovedad(false)}>
          {children}
        </div>
      </div>
      <PromoToast />
      <BottomNav badges={badges} />
    </div>
  );
}

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate role="cliente">{(user) => <ClientShell user={user}>{children}</ClientShell>}</AuthGate>;
}
