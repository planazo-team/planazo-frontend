'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './Icon';

const ITEMS: Array<{ href: string; icon: IconName; label: string }> = [
  { href: '/cliente/mapa', icon: 'map', label: 'Mapa' },
  { href: '/cliente/promos', icon: 'tag', label: 'Promos' },
  { href: '/cliente/agente', icon: 'sparkles', label: 'Agente' },
  { href: '/cliente/juego', icon: 'gamepad', label: 'Juego' },
  { href: '/cliente/planes', icon: 'ticket', label: 'Mis planes' },
];

function activo(path: string) {
  // La ficha de un lugar se navega desde el mapa.
  const i = ITEMS.findIndex((it) => path.startsWith(it.href));
  return i === -1 && path.startsWith('/cliente/lugar') ? 0 : i;
}

/** Navegación del cliente: barra inferior en teléfono (con indicador que se desliza). */
export function BottomNav({ badges = {} }: { badges?: Partial<Record<string, boolean>> }) {
  const path = usePathname();
  const i = activo(path);
  return (
    <nav className="bottomnav" aria-label="Navegación principal">
      {i >= 0 && <span className="indicator" style={{ '--i': i } as React.CSSProperties} />}
      {ITEMS.map((it, k) => (
        <Link key={it.href} href={it.href} aria-current={k === i ? 'page' : undefined}>
          <Icon name={it.icon} size={22} />
          {it.label}
          {badges[it.href] && <span className="dot-badge" aria-label="novedad" />}
        </Link>
      ))}
    </nav>
  );
}

/** La misma navegación como riel lateral en escritorio. */
export function SideRail({ badges = {} }: { badges?: Partial<Record<string, boolean>> }) {
  const path = usePathname();
  const i = activo(path);
  return (
    <nav className="rail" aria-label="Navegación principal">
      {ITEMS.map((it, k) => (
        <Link key={it.href} href={it.href} aria-current={k === i ? 'page' : undefined}>
          <Icon name={it.icon} size={20} />
          <span className="grow">{it.label}</span>
          {badges[it.href] && <span className="badge promo">nuevo</span>}
        </Link>
      ))}
      <div className="rail-foot">
        Zona G · Zona T · Chapinero
        <br />
        Hecho con gran poder y gran responsabilidad.
      </div>
    </nav>
  );
}
