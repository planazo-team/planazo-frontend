import type { Category, Place, PlaceEvent, Slot, Zone } from './types';

/**
 * Catálogo semilla de Zona G y Zona T (Chapinero, Bogotá).
 * Los nombres son ficticios; las coordenadas corresponden a las dos zonas reales.
 * En modo live este catálogo lo sirve booking desde su propio seed.
 */

export const MAP_CENTER: [number, number] = [4.6612, -74.0551];

export const ZONES: Record<Zone, { label: string; center: [number, number] }> = {
  'zona-g': { label: 'Zona G', center: [4.6553, -74.0566] },
  'zona-t': { label: 'Zona T', center: [4.6672, -74.0536] },
};

export const CATEGORY_LABEL: Record<Category, string> = {
  restaurante: 'Restaurante',
  bar: 'Bar',
  discoteca: 'Discoteca',
  hotel: 'Hotel',
  evento: 'Evento',
  'aire-libre': 'Aire libre',
};

export const CATEGORY_COLOR: Record<Category, string> = {
  restaurante: '#E0703D',
  bar: '#C4386A',
  discoteca: '#7B5CD6',
  hotel: '#3F7CB4',
  evento: '#D69A1F',
  'aire-libre': '#2E9A6B',
};

type SeedPlace = Omit<Place, 'freeSeats'> & {
  slots?: Array<[startsAt: string, capacity: number, taken: number]>;
  events?: Array<[title: string, startsAt: string, capacity: number, taken: number]>;
};

const RAW: SeedPlace[] = [
  // ---------------- Zona G ----------------
  { id: 'p1', name: 'Fideos de la Nona', category: 'restaurante', zone: 'zona-g', lat: 4.6558, lng: -74.0571, priceLevel: 2,
    description: 'Cocina casera italiana en una casa de Quinta Camacho. Mesas en el patio y pasta hecha a mano.',
    slots: [['19:00', 10, 6], ['20:30', 12, 9], ['22:00', 8, 3]],
    events: [['Noche de pasta fresca', '20:00', 20, 14]] },
  { id: 'p2', name: 'Casa Olivo', category: 'restaurante', zone: 'zona-g', lat: 4.6547, lng: -74.0559, priceLevel: 3,
    description: 'Cocina mediterránea de autor. Menú de degustación de siete tiempos.',
    slots: [['19:30', 8, 7], ['21:30', 8, 4]] },
  { id: 'p3', name: 'Mercado de Dumplings', category: 'restaurante', zone: 'zona-g', lat: 4.6541, lng: -74.0578, priceLevel: 1,
    description: 'Doce puestos de cocina asiática en un solo patio. Fila rápida y precios bajos.',
    slots: [['12:00', 30, 12], ['19:00', 30, 22]] },
  { id: 'p4', name: 'Café Rota', category: 'restaurante', zone: 'zona-g', lat: 4.6563, lng: -74.0562, priceLevel: 1,
    description: 'Café de especialidad y postres. Buen punto de encuentro antes de salir.',
    slots: [['17:00', 14, 5], ['18:30', 14, 9]] },
  { id: 'p5', name: 'La Terraza de Quinta', category: 'bar', zone: 'zona-g', lat: 4.6552, lng: -74.0549, priceLevel: 2,
    description: 'Bar de coctelería en terraza con vista a los cerros.',
    slots: [['20:00', 16, 10], ['22:00', 16, 12]] },
  { id: 'p6', name: 'Hotel Quinta Camacho', category: 'hotel', zone: 'zona-g', lat: 4.6573, lng: -74.0556, priceLevel: 3,
    description: 'Hotel boutique en casona restaurada, a dos cuadras de la Zona G.' },

  // ---------------- Zona T ----------------
  { id: 'p7', name: 'Bar El Zaguán', category: 'bar', zone: 'zona-t', lat: 4.6674, lng: -74.0531, priceLevel: 3,
    description: 'Coctelería de autor en un patio de ocho mesas. Se llena a las nueve en punto.',
    slots: [['19:00', 8, 3], ['21:00', 8, 6], ['23:00', 8, 7]] },
  { id: 'p8', name: 'Terraza 85', category: 'bar', zone: 'zona-t', lat: 4.6683, lng: -74.0541, priceLevel: 2,
    description: 'Terraza amplia sobre la calle 85, música en vivo de jueves a sábado.',
    slots: [['20:00', 20, 11], ['22:00', 20, 15]],
    events: [['Jazz en vivo', '21:00', 40, 26]] },
  { id: 'p9', name: 'Club Salvaje', category: 'discoteca', zone: 'zona-t', lat: 4.6665, lng: -74.0524, priceLevel: 2,
    description: 'Discoteca de tres pisos. La primera hora es la más tranquila de la noche.',
    slots: [['22:00', 40, 18], ['00:00', 40, 31]] },
  { id: 'p10', name: 'Stand-up en la 83', category: 'evento', zone: 'zona-t', lat: 4.6677, lng: -74.0546, priceLevel: 2,
    description: 'Micrófono abierto y tres comediantes invitados. Entrada solo con reserva.',
    events: [['Función de stand-up', '20:00', 50, 41], ['Función tardía', '22:30', 50, 12]],
    slots: [['20:00', 50, 41], ['22:30', 50, 12]] },
  { id: 'p11', name: 'Hotel 82', category: 'hotel', zone: 'zona-t', lat: 4.6660, lng: -74.0541, priceLevel: 3,
    description: 'Hotel de negocios a una cuadra de la Zona T.' },
  { id: 'p12', name: 'Parque El Virrey', category: 'aire-libre', zone: 'zona-t', lat: 4.6721, lng: -74.0556, priceLevel: 0,
    description: 'Parque lineal para caminar, correr o hacer picnic. Gratis y sin reserva.' },
];

export interface SeedData {
  places: Omit<Place, 'freeSeats'>[];
  slots: Slot[];
  events: PlaceEvent[];
}

/** Devuelve una copia nueva del catálogo, para que el estado simulado no mute el seed. */
export function buildSeed(): SeedData {
  const places: SeedData['places'] = [];
  const slots: Slot[] = [];
  const events: PlaceEvent[] = [];
  for (const p of RAW) {
    const { slots: s = [], events: e = [], ...place } = p;
    places.push({ ...place });
    s.forEach(([startsAt, capacity, taken], i) =>
      slots.push({ id: `${p.id}-s${i + 1}`, placeId: p.id, startsAt, capacity, taken, version: 1 }),
    );
    e.forEach(([title, startsAt, capacity, taken], i) =>
      events.push({ id: `${p.id}-e${i + 1}`, placeId: p.id, title, startsAt, capacity, taken }),
    );
  }
  return { places, slots, events };
}
