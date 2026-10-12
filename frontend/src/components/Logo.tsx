import { logoOf, type LogoSpec } from '@/lib/brand';
import type { Place } from '@/lib/types';

/**
 * Logo de un lugar dibujado en SVG: forma de insignia de cómic, colores
 * propios, texto y un detalle (anillo, puntos, rayas o telaraña). Se ve
 * nítido a cualquier tamaño y no depende de imágenes externas.
 */

const FONT: Record<LogoSpec['font'], string> = {
  serif: 'var(--font-serif), Georgia, serif',
  sans: 'var(--font-sans), system-ui, sans-serif',
  comic: 'var(--font-comic), Impact, system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

function forma(shape: LogoSpec['shape'], props: React.SVGProps<SVGPathElement>) {
  switch (shape) {
    case 'circle':
      return <circle cx={50} cy={50} r={46} {...(props as React.SVGProps<SVGCircleElement>)} />;
    case 'square':
      return <rect x={6} y={6} width={88} height={88} rx={20} {...(props as React.SVGProps<SVGRectElement>)} />;
    case 'shield':
      return <path d="M50 4 L90 16 V48 C90 72 72 88 50 96 C28 88 10 72 10 48 V16 Z" {...props} />;
    case 'hex':
      return <path d="M50 4 L90 27 V73 L50 96 L10 73 V27 Z" {...props} />;
    case 'ticket':
      return <path d="M8 18 H92 V40 A10 10 0 0 0 92 60 V82 H8 V60 A10 10 0 0 0 8 40 Z" {...props} />;
    case 'burst': {
      const pts: string[] = [];
      for (let i = 0; i < 24; i++) {
        const r = i % 2 === 0 ? 47 : 38;
        const a = (Math.PI * 2 * i) / 24 - Math.PI / 2;
        pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
      }
      return <polygon points={pts.join(' ')} {...(props as React.SVGProps<SVGPolygonElement>)} />;
    }
  }
}

export function LogoMark({ spec, size = 44, title }: { spec: LogoSpec; size?: number; title?: string }) {
  const id = `l${Math.abs([...(spec.text + spec.bg + spec.shape)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))}`;
  const largo = spec.text.length;
  const fs = largo <= 1 ? 54 : largo === 2 ? 40 : largo === 3 ? 30 : largo === 4 ? 25 : 15;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? spec.text} className="logo-mark">
      <defs>
        <clipPath id={`${id}-c`}>{forma(spec.shape, {})}</clipPath>
        <pattern id={`${id}-d`} width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="1.6" fill={spec.accent} opacity="0.45" />
        </pattern>
      </defs>
      {/* sombra dura de cómic */}
      <g transform="translate(4 4)">{forma(spec.shape, { fill: 'rgba(0,0,0,0.55)' })}</g>
      {forma(spec.shape, { fill: spec.bg, stroke: '#0b0f0e', strokeWidth: 3 })}
      <g clipPath={`url(#${id}-c)`}>
        {spec.deco === 'dots' && <rect width="100" height="100" fill={`url(#${id}-d)`} />}
        {spec.deco === 'stripes' &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={-20 + i * 26} y={-10} width={9} height={130} fill={spec.accent} opacity={0.22} transform="rotate(30 50 50)" />
          ))}
        {spec.deco === 'ring' && <circle cx={50} cy={50} r={36} fill="none" stroke={spec.accent} strokeWidth={2.5} strokeDasharray="4 4" />}
        {spec.deco === 'web' && (
          <g stroke={spec.accent} strokeWidth={1.4} fill="none" opacity={0.75}>
            {[0, 15, 30, 45, 60, 75, 90].map((a) => (
              <line key={a} x1={100} y1={0} x2={100 - 60 * Math.cos((a * Math.PI) / 180)} y2={60 * Math.sin((a * Math.PI) / 180)} />
            ))}
            {[18, 32, 46].map((r) => (
              <path key={r} d={`M ${100 - r} 0 Q ${100 - r * 0.72} ${r * 0.72} 100 ${r}`} />
            ))}
          </g>
        )}
        {/* brillo superior */}
        <ellipse cx={34} cy={22} rx={26} ry={9} fill="#fff" opacity={0.18} />
      </g>
      <text
        x="50"
        y="52"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={spec.fg}
        fontFamily={FONT[spec.font]}
        fontWeight={spec.font === 'serif' ? 400 : 800}
        fontStyle={spec.font === 'serif' ? 'italic' : 'normal'}
        fontSize={fs}
        letterSpacing={spec.font === 'comic' ? 1 : 0}
        style={{ paintOrder: 'stroke' }}
        stroke={spec.font === 'comic' ? '#0b0f0e' : 'none'}
        strokeWidth={spec.font === 'comic' ? 3 : 0}
      >
        {spec.text}
      </text>
    </svg>
  );
}

/** Logo de un lugar a partir de su ficha. */
export function PlaceLogo({ place, size = 44 }: { place: Pick<Place, 'id' | 'name' | 'category'>; size?: number }) {
  return <LogoMark spec={logoOf(place)} size={size} title={`Logo de ${place.name}`} />;
}
