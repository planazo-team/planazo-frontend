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

  // ---------------- Parques públicos (gratis, sin reserva) ----------------
  { id: 'p13', name: 'Parque de la 93', category: 'aire-libre', zone: 'zona-t', lat: 4.6766, lng: -74.0485, priceLevel: 0, cover: 'parque-1',
    description: 'Plaza verde rodeada de restaurantes. Buen punto para arrancar con un café o un helado. Gratis.' },
  { id: 'p14', name: 'Parque Japón', category: 'aire-libre', zone: 'zona-t', lat: 4.6713, lng: -74.0507, priceLevel: 0, cover: 'parque-2',
    description: 'Parque de barrio tranquilo en la 87, con árboles y bancas. Ideal para un picnic o leer un rato. Gratis.' },
  { id: 'p15', name: 'Sendero Quebrada La Vieja', category: 'aire-libre', zone: 'zona-g', lat: 4.6587, lng: -74.0436, priceLevel: 0, cover: 'parque-2',
    description: 'Caminata por los cerros orientales con vista a toda la ciudad. Solo en la mañana y con inscripción previa. Gratis.' },
  { id: 'p16', name: 'Parque de los Hippies', category: 'aire-libre', zone: 'zona-g', lat: 4.6464, lng: -74.0627, priceLevel: 0, cover: 'aire-libre-2',
    description: 'El parque bohemio de la Séptima con 60: artistas, malabares, músicos y gente parchando en el pasto. Gratis.' },
  { id: 'p17', name: 'Parque El Chicó', category: 'aire-libre', zone: 'zona-t', lat: 4.6779, lng: -74.0438, priceLevel: 0, cover: 'parque-1',
    description: 'Jardines y museo en una casona colonial. Perfecto para una tarde tranquila antes de salir. Gratis.' },
  { id: 'p18', name: 'Ciclovía de la Séptima', category: 'aire-libre', zone: 'zona-g', lat: 4.6602, lng: -74.0545, priceLevel: 0, cover: 'aire-libre-1',
    description: 'Domingos y festivos de 7 a 2 la Séptima es para bicis, patines y trotar. Jugo en la esquina incluido. Gratis.' },

  // ---------------- Spots para parchar ----------------
  { id: 'p19', name: 'Tejo El Turmequé', category: 'evento', zone: 'zona-g', lat: 4.6508, lng: -74.0601, priceLevel: 1, cover: 'parche-1',
    description: 'Canchas de tejo con mechas, cerveza fría y picada. El plan más colombiano para ir en parche.',
    slots: [['18:00', 24, 9], ['20:00', 24, 17]],
    events: [['Torneo relámpago de tejo', '20:00', 32, 21]] },
  { id: 'p20', name: 'La Azotea de la 70', category: 'bar', zone: 'zona-g', lat: 4.6543, lng: -74.0592, priceLevel: 2, cover: 'bar-6',
    description: 'Rooftop con fogata, DJ de vinilos y vista a los cerros. Se arma desde las ocho.',
    slots: [['20:00', 30, 14], ['22:00', 30, 22]] },
  { id: 'p21', name: 'Cervecería Los Cerros', category: 'bar', zone: 'zona-g', lat: 4.6566, lng: -74.0544, priceLevel: 2, cover: 'bar-1',
    description: 'Cerveza artesanal de la casa y mesas largas para ir en grupo grande.',
    slots: [['18:00', 40, 12], ['21:00', 40, 26]] },
  { id: 'p22', name: 'La Ficha · juegos de mesa', category: 'bar', zone: 'zona-g', lat: 4.6531, lng: -74.0575, priceLevel: 1, cover: 'cafe-1',
    description: 'Más de 300 juegos de mesa, café y cerveza. Para parchar sin tener que gritar.',
    slots: [['17:00', 24, 8], ['20:00', 24, 15]] },
  { id: 'p23', name: 'Karaoke El Gritón', category: 'bar', zone: 'zona-t', lat: 4.6669, lng: -74.0519, priceLevel: 2, cover: 'bar-5',
    description: 'Cabinas privadas y tarima abierta. Las canciones de despecho son obligatorias.',
    slots: [['21:00', 20, 9], ['23:00', 20, 14]] },
  { id: 'p24', name: 'Salsa Caleña 82', category: 'discoteca', zone: 'zona-t', lat: 4.6664, lng: -74.0549, priceLevel: 2, cover: 'discoteca-1',
    description: 'Salsa en vivo y clase gratis a las nueve. Aquí nadie se queda sentado.',
    slots: [['21:00', 60, 24], ['23:00', 60, 41]],
    events: [['Clase de salsa caleña', '21:00', 30, 18]] },
  { id: 'p25', name: 'Food trucks de la 85', category: 'restaurante', zone: 'zona-t', lat: 4.6689, lng: -74.0528, priceLevel: 1, cover: 'restaurante-2',
    description: 'Seis food trucks con mesas al aire libre: hamburguesas, tacos y arepas para todos los gustos.',
    slots: [['18:00', 40, 15], ['20:00', 40, 28]] },
  { id: 'p26', name: 'Brunch Club 70', category: 'restaurante', zone: 'zona-g', lat: 4.6537, lng: -74.0563, priceLevel: 2, cover: 'restaurante-3',
    description: 'Brunch todo el día, waffles y jugos. El plan de domingo después de la rumba.',
    slots: [['10:00', 20, 12], ['12:00', 20, 15]] },
  { id: 'p27', name: 'Café Lectura Quinta', category: 'restaurante', zone: 'zona-g', lat: 4.6585, lng: -74.0567, priceLevel: 1, cover: 'restaurante-4',
    description: 'Café con biblioteca y patio interior. Tranquilo para una primera cita.',
    slots: [['16:00', 16, 4], ['18:00', 16, 9]] },
  { id: 'p28', name: 'Cine bajo las estrellas', category: 'evento', zone: 'zona-t', lat: 4.6762, lng: -74.0491, priceLevel: 1, cover: 'evento-2',
    description: 'Pantalla gigante y cojines en el pasto. Lleva cobija; las crispetas van por la casa.',
    events: [['Película al aire libre', '19:30', 80, 47]],
    slots: [['19:30', 80, 47]] },
  { id: 'p29', name: 'Arepas La Esquina', category: 'restaurante', zone: 'zona-g', lat: 4.6501, lng: -74.0612, priceLevel: 1, cover: 'restaurante-1',
    description: 'Arepas rellenas hasta las tres de la mañana. El after perfecto después de bailar.',
    slots: [['22:00', 20, 6], ['00:00', 20, 11]] },

  // ---------------- Entretenimiento ----------------
  { id: 'p30', name: 'Multicine La 82', category: 'evento', zone: 'zona-t', lat: 4.6668, lng: -74.0527, priceLevel: 2, cover: 'evento-1',
    description: 'Ocho salas con estrenos, una IMAX y crispetas de sal y dulce. Reserva la función y llega derecho a la sala.',
    slots: [['19:00', 120, 64], ['21:30', 120, 38]],
    events: [['Estreno de la semana', '19:00', 120, 64], ['Maratón de terror', '23:00', 80, 41]] },
  { id: 'p31', name: 'Teatro de la 71', category: 'evento', zone: 'zona-g', lat: 4.6551, lng: -74.0588, priceLevel: 2, cover: 'evento-3',
    description: 'Teatro de bolsillo con obras cortas, improvisación y monólogos. Sesenta sillas, ni una mala.',
    slots: [['19:30', 60, 33], ['21:30', 60, 21]],
    events: [['Impro: ustedes ponen el tema', '21:30', 60, 21]] },
  { id: 'p32', name: 'Bolera Strike 85', category: 'evento', zone: 'zona-t', lat: 4.6693, lng: -74.0515, priceLevel: 2, cover: 'parche-1',
    description: 'Doce pistas de bolos con luces neón, cerveza y hamburguesas. Se reserva por pista para seis.',
    slots: [['18:00', 72, 30], ['20:00', 72, 54], ['22:00', 72, 40]],
    events: [['Bolos cósmicos con DJ', '22:00', 72, 40]] },
  { id: 'p33', name: 'Feria Chapinero Creativo', category: 'evento', zone: 'zona-g', lat: 4.6526, lng: -74.0560, priceLevel: 0, cover: 'aire-libre-2',
    description: 'Feria de diseño local, comida y música en vivo. Más de 80 emprendimientos. Entrada libre.',
    events: [['Feria de diseño y emprendimiento', '12:00', 400, 180], ['Concierto de cierre', '19:00', 300, 140]] },
  { id: 'p34', name: 'Escape Room La Celda', category: 'evento', zone: 'zona-g', lat: 4.6519, lng: -74.0585, priceLevel: 2, cover: 'evento-2',
    description: 'Sesenta minutos para salir de una cárcel de los años 50. Salas para grupos de dos a seis.',
    slots: [['18:00', 12, 6], ['19:30', 12, 9], ['21:00', 12, 3]] },
  { id: 'p35', name: 'Galería Nocturna 77', category: 'evento', zone: 'zona-t', lat: 4.6646, lng: -74.0560, priceLevel: 1, cover: 'evento-3',
    description: 'Arte joven, vino y DJ los jueves y viernes. Recorrido guiado a las ocho.',
    slots: [['19:00', 50, 18], ['21:00', 50, 26]],
    events: [['Inauguración: arte de la calle', '19:00', 80, 44]] },
  { id: 'p36', name: 'Mini golf Neón', category: 'evento', zone: 'zona-g', lat: 4.6570, lng: -74.0598, priceLevel: 1, cover: 'parche-1',
    description: 'Dieciocho hoyos con luz negra, cocteles y música. Para una cita distinta o un parche competitivo.',
    slots: [['17:00', 30, 11], ['20:00', 30, 22]] },

  // ---------------- Discotecas ----------------
  { id: 'p37', name: 'Vértigo Club', category: 'discoteca', zone: 'zona-t', lat: 4.6657, lng: -74.0518, priceLevel: 3, cover: 'discoteca-2',
    description: 'Electrónica en un sótano con sonido de festival. DJ internacionales los sábados.',
    slots: [['23:00', 150, 92], ['01:00', 150, 120]],
    events: [['DJ invitado desde Berlín', '00:00', 200, 151]] },
  { id: 'p38', name: 'La Rumbera', category: 'discoteca', zone: 'zona-g', lat: 4.6532, lng: -74.0605, priceLevel: 1, cover: 'discoteca-3',
    description: 'Reguetón, vallenato y crossover. La más barata de la zona y la que cierra de última.',
    slots: [['22:00', 90, 40], ['00:00', 90, 71]],
    events: [['Noche de vallenato y crossover', '22:00', 120, 66]] },
  { id: 'p39', name: 'Bajo Cero', category: 'discoteca', zone: 'zona-t', lat: 4.6684, lng: -74.0558, priceLevel: 2, cover: 'discoteca-1',
    description: 'Techno y house con show de luces. Terraza para tomar aire entre set y set.',
    slots: [['23:00', 100, 37], ['01:00', 100, 63]] },

  // ---------------- Hoteles ----------------
  { id: 'p40', name: 'Hotel Casa Virrey', category: 'hotel', zone: 'zona-t', lat: 4.6716, lng: -74.0542, priceLevel: 3, cover: 'hotel-2',
    description: 'Hotel boutique frente al Parque El Virrey, con desayuno en la terraza.' },
  { id: 'p41', name: 'Hostal Parche Chapinero', category: 'hotel', zone: 'zona-g', lat: 4.6497, lng: -74.0619, priceLevel: 1, cover: 'hotel-1',
    description: 'Hostal con camas desde 60 mil, bar en la azotea y planes en grupo cada noche.' },
  { id: 'p42', name: 'Hotel Mirador 93', category: 'hotel', zone: 'zona-t', lat: 4.6761, lng: -74.0472, priceLevel: 3, cover: 'hotel-2',
    description: 'Hotel con rooftop y piscina climatizada a una cuadra del Parque de la 93.' },
  { id: 'p43', name: 'Aparta-hotel Quinta', category: 'hotel', zone: 'zona-g', lat: 4.6580, lng: -74.0551, priceLevel: 2, cover: 'hotel-1',
    description: 'Apartamentos con cocina para grupos, a tres cuadras de la Zona G.' },
];

/**
 * Más eventos de la noche, repartidos por los lugares. Van aparte para no
 * cambiar los ids de los que ya existían (`<lugar>-e<n>` sigue la numeración).
 */
const MAS_EVENTOS: Record<string, Array<[title: string, startsAt: string, capacity: number, taken: number]>> = {
  p2: [['Cena maridaje de vinos', '20:00', 16, 13]],
  p3: [['Concurso de dumplings picantes', '19:30', 40, 25]],
  p4: [['Cata de café de origen', '17:00', 12, 7]],
  p5: [['Atardecer con DJ de house', '18:00', 30, 12]],
  p7: [['Noche de mezcal y cócteles de autor', '21:00', 16, 9]],
  p9: [['Noche de reguetón old school', '23:00', 120, 88], ['After de techno', '01:00', 80, 30]],
  p12: [['Yoga al atardecer', '17:30', 40, 18]],
  p13: [['Feria de emprendedores', '15:00', 200, 90]],
  p16: [['Jam session en el pasto', '16:00', 60, 22]],
  p17: [['Concierto de cámara en el jardín', '16:00', 80, 41]],
  p20: [['Vinilos y fogata', '21:00', 30, 17]],
  p21: [['Trivia de cultura pop', '20:00', 48, 31]],
  p22: [['Torneo de Catan', '18:00', 24, 16]],
  p23: [['Batalla de despecho', '22:00', 40, 27]],
  p25: [['Noche de tacos y mariachi', '20:00', 60, 34]],
};

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
    const { slots: s = [], events: propios = [], ...place } = p;
    const e = [...propios, ...(MAS_EVENTOS[p.id] ?? [])];
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
