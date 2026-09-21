'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/cliente/mapa', icon: '🗺️', label: 'Mapa' },
  { href: '/cliente/agente', icon: '✨', label: 'Agente' },
  { href: '/cliente/juego', icon: '🎮', label: 'Juego' },
  { href: '/cliente/planes', icon: '🎟️', label: 'Mis planes' },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottomnav" aria-label="Navegación principal">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} aria-current={path.startsWith(it.href) ? 'page' : undefined}>
          <span className="ic" aria-hidden>
            {it.icon}
          </span>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
