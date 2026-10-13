import type { Category, Place } from './types';

/**
 * Identidad visual de cada lugar: portada (foto en /public/img/lugares) y
 * logo (SVG dibujado por components/Logo.tsx a partir de esta ficha).
 * Los 12 del catálogo semilla tienen logo diseñado a mano; los que crean los
 * negocios reciben uno generado de su nombre y categoría, y eligen portada
 * de la galería de su categoría.
 */

export type LogoShape = 'circle' | 'square' | 'shield' | 'burst' | 'hex' | 'ticket';
export type LogoFont = 'serif' | 'sans' | 'comic' | 'mono';
export type LogoDeco = 'ring' | 'dots' | 'stripes' | 'web' | 'none';

export interface LogoSpec {
  shape: LogoShape;
  bg: string;
  fg: string;
  accent: string;
  text: string;
  font: LogoFont;
  deco: LogoDeco;
}

const SEMILLA: Record<string, LogoSpec> = {
  p1: { shape: 'circle', bg: '#F3E3C3', fg: '#B23A2E', accent: '#2E6B3A', text: 'Nona', font: 'serif', deco: 'ring' },
  p2: { shape: 'hex', bg: '#2F4A2A', fg: '#ECE6C8', accent: '#A3B86C', text: 'CO', font: 'serif', deco: 'dots' },
  p3: { shape: 'burst', bg: '#E3412D', fg: '#FFF2D6', accent: '#FFD84A', text: 'MD', font: 'comic', deco: 'none' },
  p4: { shape: 'square', bg: '#3B2A20', fg: '#F2C98A', accent: '#C97B4A', text: 'Rota', font: 'sans', deco: 'ring' },
  p5: { shape: 'ticket', bg: '#F28C38', fg: '#1E1A2E', accent: '#FFE2C2', text: 'LTQ', font: 'mono', deco: 'stripes' },
  p6: { shape: 'shield', bg: '#1D2B4F', fg: '#D8B76A', accent: '#D8B76A', text: 'QC', font: 'serif', deco: 'ring' },
  // Un zaguán con telaraña en la esquina: el equipo se llama Spidiverse.
  p7: { shape: 'hex', bg: '#6E2A5E', fg: '#FFD84A', accent: '#FF9BD2', text: 'Z', font: 'comic', deco: 'web' },
  p8: { shape: 'circle', bg: '#0E6E6E', fg: '#FFE9B0', accent: '#46C2B4', text: '85', font: 'sans', deco: 'stripes' },
  p9: { shape: 'burst', bg: '#7B5CD6', fg: '#FFFFFF', accent: '#FF3B8B', text: 'SALVAJE', font: 'comic', deco: 'none' },
  p10: { shape: 'square', bg: '#FFD84A', fg: '#1A1A1A', accent: '#E3412D', text: 'HA!', font: 'comic', deco: 'dots' },
  p11: { shape: 'square', bg: '#23314F', fg: '#9EC3FF', accent: '#9EC3FF', text: '82', font: 'mono', deco: 'ring' },
  p12: { shape: 'circle', bg: '#2E9A6B', fg: '#F2FFE9', accent: '#BDF27A', text: 'EV', font: 'serif', deco: 'dots' },
};

const PALETAS: Record<Category, Array<[bg: string, fg: string, accent: string]>> = {
  restaurante: [['#E0703D', '#FFF4E6', '#FFD84A'], ['#F3E3C3', '#8C2F1F', '#2E6B3A'], ['#5B2A1A', '#FFC48A', '#E0703D']],
  bar: [['#C4386A', '#FFE9F1', '#FFD84A'], ['#1F1B3A', '#FF7AA8', '#7BE0FF'], ['#6E2A5E', '#FFD84A', '#FF9BD2']],
  discoteca: [['#7B5CD6', '#FFFFFF', '#FF3B8B'], ['#111133', '#7BE0FF', '#FF3B8B'], ['#2A0E4A', '#FFD84A', '#7B5CD6']],
  hotel: [['#3F7CB4', '#F4F8FF', '#D8B76A'], ['#1D2B4F', '#D8B76A', '#9EC3FF']],
  evento: [['#D69A1F', '#1A1A1A', '#E3412D'], ['#1A1A1A', '#FFD84A', '#E3412D']],
  'aire-libre': [['#2E9A6B', '#F2FFE9', '#BDF27A'], ['#0E4D3A', '#BDF27A', '#FFD84A']],
};

const FORMAS: LogoShape[] = ['circle', 'square', 'hex', 'burst', 'shield', 'ticket'];
const FUENTES: LogoFont[] = ['comic', 'serif', 'sans', 'mono'];
const DECOS: LogoDeco[] = ['ring', 'dots', 'stripes', 'none'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function iniciales(nombre: string): string {
  const palabras = nombre
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !['el', 'la', 'los', 'las', 'de', 'del', 'y', 'en', 'the'].includes(w.toLowerCase()));
  if (palabras.length === 0) return nombre.slice(0, 2).toUpperCase();
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

/** Logo del lugar: el diseñado si es del catálogo semilla, uno generado si no. */
export function logoOf(p: Pick<Place, 'id' | 'name' | 'category'>): LogoSpec {
  const fijo = SEMILLA[p.id];
  if (fijo) return fijo;
  const h = hash(p.name + p.id);
  const paleta = PALETAS[p.category] ?? PALETAS.bar;
  const [bg, fg, accent] = paleta[h % paleta.length];
  return {
    shape: FORMAS[(h >>> 3) % FORMAS.length],
    bg,
    fg,
    accent,
    text: iniciales(p.name),
    font: FUENTES[(h >>> 7) % FUENTES.length],
    deco: DECOS[(h >>> 11) % DECOS.length],
  };
}

/** Galería de portadas que puede elegir un negocio nuevo, por categoría. */
export const COVERS: Record<Category, string[]> = {
  restaurante: ['restaurante-1', 'restaurante-2', 'restaurante-3', 'restaurante-4', 'cafe-1'],
  bar: ['bar-1', 'bar-2', 'bar-3', 'bar-4', 'bar-5', 'bar-6'],
  discoteca: ['discoteca-1', 'discoteca-2', 'discoteca-3'],
  evento: ['evento-1', 'evento-2', 'evento-3', 'parche-1'],
  hotel: ['hotel-1', 'hotel-2'],
  'aire-libre': ['aire-libre-1', 'aire-libre-2', 'parque-1', 'parque-2'],
};

const TODAS = new Set(Object.values(COVERS).flat());

export const coverUrl = (key: string) => `/img/lugares/${key}.webp`;

/** Foto de portada del lugar. Nunca vacía: si no eligió, la primera de su categoría. */
export function coverOf(p: Pick<Place, 'id' | 'category'> & { cover?: string | null }): string {
  if (SEMILLA[p.id]) return coverUrl(p.id);
  if (p.cover && TODAS.has(p.cover)) return coverUrl(p.cover);
  return coverUrl(COVERS[p.category]?.[0] ?? 'bar-1');
}
