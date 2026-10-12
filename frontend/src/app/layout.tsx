import type { Metadata, Viewport } from 'next';
import { Bangers, Instrument_Serif, Manrope } from 'next/font/google';
import { EasterEggs } from '@/components/fx/EasterEggs';
import './globals.css';

const sans = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});
/** La letra de las onomatopeyas y las cajas de narración (estética de cómic). */
const comic = Bangers({ subsets: ['latin'], weight: '400', variable: '--font-comic', display: 'swap' });

export const metadata: Metadata = {
  title: 'Planazo · la noche de Bogotá en vivo',
  description:
    'Restaurantes, bares, discotecas y eventos de la Zona G y la Zona T con cupos en tiempo real, promociones relámpago, un minijuego con premios y un agente que arma tu plan.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#070d0c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${serif.variable} ${comic.variable}`}>
      <body>
        {children}
        <EasterEggs />
      </body>
    </html>
  );
}
