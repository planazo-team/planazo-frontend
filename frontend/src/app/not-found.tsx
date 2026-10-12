import Link from 'next/link';
import { SpiderArt } from '@/components/Icon';

/** 404: la página se fue a otra dimensión del multiverso. */
export default function NotFound() {
  return (
    <main className="multiverse">
      <div className="stack" style={{ alignItems: 'center', gap: 18 }}>
        <SpiderArt size={70} color="#f1f7f4" eyes="#070d0c" />
        <div className="glitch" data-text="404">
          404
        </div>
        <span className="caption">Esta página se fue a otra dimensión del multiverso</span>
        <p className="muted" style={{ maxWidth: 420, margin: 0 }}>
          Buscamos en la Tierra-616, en la Tierra-65 y hasta en la Zona T. Nada. Volvamos a un lugar que sí existe.
        </p>
        <Link href="/" className="btn">
          Volver a Planazo
        </Link>
      </div>
    </main>
  );
}
