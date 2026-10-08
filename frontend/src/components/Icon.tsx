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
  user: 'M20 21a8 8 0 0 0-16 0 M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  arrowLeft: 'M19 12H5 M12 19l-7-7 7-7',
  arrowRight: 'M5 12h14 M12 5l7 7-7 7',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  bolt: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  check: 'M20 6L9 17l-5-5',
  pin: 'M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  calendar: 'M3 5h18v16H3z M3 9h18 M8 3v4 M16 3v4',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z M7 7h.01',
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
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Icono de categoría dentro de un círculo con el color de la categoría. */
export function CategoryIcon({ category, color, size = 40 }: { category: Category; color: string; size?: number }) {
  return (
    <span className="cat-icon" style={{ background: color, width: size, height: size }}>
      <Icon name={category} size={Math.round(size / 2)} />
    </span>
  );
}
