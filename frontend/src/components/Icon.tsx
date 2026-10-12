import type { Category } from '@/lib/types';

/**
 * Iconos de línea (24x24) dibujados a mano, sin dependencias. Se usan en la
 * navegación, las categorías del catálogo y los botones principales.
 */
const PATHS = {
  map: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z M8 2v16 M16 6v16',
  sparkles:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 1.9 1.9.8-1.9.8L19 21.4l-.8-1.9-1.9-.8 1.9-.8z',
  gamepad:
    'M6 11h4 M8 9v4 M15 12h.01 M18 10h.01 M17.3 5H6.7a4 4 0 0 0-3.9 3.1L2 14.5A3 3 0 0 0 7.5 17l1.3-2h6.4l1.3 2a3 3 0 0 0 5.5-2.5l-.8-6.4A4 4 0 0 0 17.3 5z',
  ticket: 'M3 9a2 2 0 0 0 2-2V5h14v2a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2v2H5v-2a2 2 0 0 0-2-2z M13 5v14',
  building: 'M3 21h18 M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16 M9 7h2 M13 7h2 M9 11h2 M13 11h2 M9 15h2 M13 15h2',
  store: 'M3 9l1.5-5h15L21 9 M3 9v11h18V9 M3 9h18 M9 20v-6h6v6 M7.5 9a2.5 2.5 0 0 1-4.5 1.5 M12 9a2.5 2.5 0 0 1-4.5 0 M16.5 9A2.5 2.5 0 0 1 12 9 M21 10.5A2.5 2.5 0 0 1 16.5 9',
  user: 'M20 21a8 8 0 0 0-16 0 M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  arrowLeft: 'M19 12H5 M12 19l-7-7 7-7',
  arrowRight: 'M5 12h14 M12 5l7 7-7 7',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  bolt: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18 M6 6l12 12',
  plus: 'M12 5v14 M5 12h14',
  pin: 'M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  calendar: 'M3 5h18v16H3z M3 9h18 M8 3v4 M16 3v4',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z M7 7h.01',
  trophy: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M17 5h3v2a3 3 0 0 1-3 3 M7 5H4v2a3 3 0 0 0 3 3',
  flame: 'M12 22c4 0 7-3 7-7 0-3-2-5.5-3.5-7-.3 2-1.5 3.5-3 4 .5-3-.5-6.5-3.5-9 0 4-5 6.5-5 12 0 4 3 7 8 7z',
  send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4z',
  web: 'M12 2v20 M2 12h20 M4.9 4.9l14.2 14.2 M19.1 4.9L4.9 19.1 M12 6l4.2 1.8L18 12l-1.8 4.2L12 18l-4.2-1.8L6 12l1.8-4.2z',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  shuffle: 'M16 3h5v5 M4 20L21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5',
  // categorías
  restaurante: 'M4 2v8a2 2 0 0 0 2 2v10 M8 2v8 M6 2v8 M16 2c-1.5 1-2.5 3-2.5 6v4H16v10 M16 2v20',
  bar: 'M3 3h18l-9 10v8 M8 21h8 M6.5 7h11',
  discoteca: 'M9 18V5l12-2v13 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  hotel: 'M2 20v-8 M2 12h20v8 M22 20v-4 M2 16h20 M6 12V8h6v4 M12 12V9h7a3 3 0 0 1 3 3',
  evento: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10a7 7 0 0 1-14 0 M12 17v5 M8 22h8',
  'aire-libre': 'M12 2L5 12h4l-4 6h5v4h4v-4h5l-4-6h4z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Icono de categoría dentro de una insignia con el color de la categoría. */
export function CategoryIcon({ category, color, size = 40 }: { category: Category; color: string; size?: number }) {
  return (
    <span
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: 12,
        background: color,
        color: '#fff',
        border: '2px solid var(--outline)',
        boxShadow: 'var(--hard-sm)',
        flex: 'none',
      }}
    >
      <Icon name={category} size={Math.round(size / 2)} />
    </span>
  );
}

/** La araña de Spidiverse: aparece en los easter eggs. */
export function SpiderArt({ size = 46, color = '#0b0f0e', eyes = '#f4f7f6' }: { size?: number; color?: string; eyes?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <g stroke={color} strokeWidth={3.2} strokeLinecap="round" fill="none">
        <path d="M24 30 L10 20 L4 26" />
        <path d="M24 34 L8 34 L2 42" />
        <path d="M25 38 L12 46 L10 56" />
        <path d="M27 41 L20 54 L22 62" />
        <path d="M40 30 L54 20 L60 26" />
        <path d="M40 34 L56 34 L62 42" />
        <path d="M39 38 L52 46 L54 56" />
        <path d="M37 41 L44 54 L42 62" />
      </g>
      <ellipse cx="32" cy="38" rx="10" ry="12" fill={color} />
      <circle cx="32" cy="24" r="8" fill={color} />
      <path d="M27.5 23 q2.5 -3 4 1 q-2 2 -4 -1z" fill={eyes} />
      <path d="M36.5 23 q-2.5 -3 -4 1 q2 2 4 -1z" fill={eyes} />
      <path d="M32 31 v14 M27 36 h10 M28 41 h8" stroke="#ff3b5c" strokeWidth={1.6} opacity={0.9} />
    </svg>
  );
}
