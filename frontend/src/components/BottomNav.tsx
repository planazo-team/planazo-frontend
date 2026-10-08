'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './Icon';

const ITEMS: Array<{ href: string; icon: IconName; label: string }> = [
  { href: '/cliente/mapa', icon: 'map', label: 'Mapa' },
  { href: '/cliente/agente', icon: 'sparkles', label: 'Agente' },
  { href: '/cliente/juego', icon: 'gamepad', label: 'Juego' },
  { href: '/cliente/planes', icon: 'ticket', label: 'Mis planes' },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottomnav" aria-label="Navegación principal">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} aria-current={path.startsWith(it.href) ? 'page' : undefined}>
          <Icon name={it.icon} size={22} />
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
