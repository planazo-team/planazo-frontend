import Link from 'next/link';
import { coverOf } from '@/lib/brand';
import { CATEGORY_LABEL, ZONES } from '@/lib/seed';
import type { Place } from '@/lib/types';
import { AnimatedNumber } from './fx/AnimatedNumber';
import { Icon } from './Icon';
import { PlaceLogo } from './Logo';

export const PRICE = ['Gratis', '$', '$$', '$$$'];

export function SeatsBadge({ n }: { n: number | null }) {
  if (n === null) return <span className="badge">Sin reserva</span>;
  if (n === 0) return <span className="badge none">Lleno</span>;
  return (
    <span className={`badge ${n <= 5 ? 'low' : 'ok'}`}>
      <Icon name="users" /> <AnimatedNumber value={n} /> cupos
    </span>
  );
}

/** Tarjeta de lugar para la lista del mapa: foto, logo, categoría, cupos en vivo y promo. */
export function PlaceCard({
  place,
  promo,
  flash,
  isNew,
  onHover,
  style,
}: {
  place: Place;
  promo?: boolean;
  flash?: boolean;
  isNew?: boolean;
  onHover?: (id: string | null) => void;
  style?: React.CSSProperties;
}) {
  return (
    <Link
      href={`/cliente/lugar/${place.id}`}
      className={`card link place-card${flash ? ' flash' : ''}`}
      onMouseEnter={() => onHover?.(place.id)}
      onMouseLeave={() => onHover?.(null)}
      style={style}
    >
      <div className="photo halftone">
        <img src={coverOf(place)} alt="" loading="lazy" />
        <span className="logo">
          <PlaceLogo place={place} size={38} />
        </span>
      </div>
      <div className="info">
        <div className="row" style={{ gap: 8 }}>
          <h3 className="grow">{place.name}</h3>
          {isNew && <span className="badge gold">Nuevo</span>}
        </div>
        <div className="muted small">
          {CATEGORY_LABEL[place.category]} · {ZONES[place.zone].label} · <span className="price">{PRICE[place.priceLevel]}</span>
        </div>
        <div className="meta">
          <SeatsBadge n={place.freeSeats} />
          {promo && (
            <span className="badge promo">
              <Icon name="bolt" /> Promo
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
