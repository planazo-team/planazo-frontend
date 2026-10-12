'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { boom, confeti } from '@/components/fx/eggs';
import { Icon, type IconName } from '@/components/Icon';
import { PlaceCard } from '@/components/PlaceCard';
import { api } from '@/lib/api';
import { COVERS, coverUrl } from '@/lib/brand';
import { setSession, type SessionUser } from '@/lib/session';
import { CATEGORY_LABEL } from '@/lib/seed';
import type { Category, Place } from '@/lib/types';

const PickerMap = dynamic(() => import('./PickerMap'), { ssr: false, loading: () => <div className="map picker-map skeleton" /> });

const CATS: Array<{ id: Category; icon: IconName }> = [
  { id: 'restaurante', icon: 'restaurante' },
  { id: 'bar', icon: 'bar' },
  { id: 'discoteca', icon: 'discoteca' },
  { id: 'evento', icon: 'evento' },
  { id: 'hotel', icon: 'hotel' },
  { id: 'aire-libre', icon: 'aire-libre' },
];

const PRECIOS: Array<{ n: 0 | 1 | 2 | 3; label: string }> = [
  { n: 0, label: 'Gratis' },
  { n: 1, label: '$' },
  { n: 2, label: '$$' },
  { n: 3, label: '$$$' },
];

/** Puntos de partida razonables para cada zona, por si el negocio no quiere buscar en el mapa. */
const SUGERIDAS: Array<{ label: string; ll: [number, number] }> = [
  { label: 'Zona G', ll: [4.6556, -74.0563] },
  { label: 'Zona T', ll: [4.667, -74.0532] },
  { label: 'Parque 93', ll: [4.6766, -74.0484] },
];

/**
 * Alta de un negocio: nombre, categoría, portada, precio y ubicación. A la
 * derecha se ve en vivo la tarjeta con la que aparecerá en el mapa de todos.
 */
export function CrearLugar({ user }: { user: SessionUser }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('bar');
  const [cover, setCover] = useState<string>(COVERS.bar[0]);
  const [priceLevel, setPrice] = useState<0 | 1 | 2 | 3>(2);
  const [description, setDescription] = useState('');
  const [ll, setLl] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegirCategoria = (c: Category) => {
    setCategory(c);
    setCover(COVERS[c][0]);
    if (c === 'aire-libre') setPrice(0);
  };

  const preview: Place = useMemo(
    () => ({
      id: 'preview',
      name: name.trim() || 'Tu lugar',
      category,
      zone: ll && Math.hypot(ll[0] - 4.6553, ll[1] + 74.0566) > Math.hypot(ll[0] - 4.6672, ll[1] + 74.0536) ? 'zona-t' : 'zona-g',
      lat: ll?.[0] ?? 0,
      lng: ll?.[1] ?? 0,
      description,
      priceLevel,
      // Los mismos cupos con los que arranca booking (new-place.ts).
      freeSeats: { restaurante: 44, bar: 56, discoteca: 120, evento: 90, hotel: null, 'aire-libre': null }[category],
      cover,
    }),
    [name, category, ll, description, priceLevel, cover],
  );

  const listo = name.trim().length >= 3 && !!ll;

  async function crear() {
    if (!ll) return;
    setBusy(true);
    setError(null);
    const r = await api.createBusiness({ name: name.trim(), category, lat: ll[0], lng: ll[1], description: description.trim(), priceLevel, cover });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    boom('¡ABIERTO!', window.innerWidth / 2, window.innerHeight / 2);
    confeti(window.innerWidth / 2, window.innerHeight / 2, 70);
    setSession({ ...user, ...r.data.user });
  }

  return (
    <main className="content wide">
      <span className="caption sm">Bienvenido, {user.name.split(' ')[0]}</span>
      <h1 style={{ marginTop: 12 }}>
        Pon tu lugar en <em className="serif">el mapa</em>
      </h1>
      <p className="muted" style={{ maxWidth: 620 }}>
        En un minuto quedas visible para todos los que están explorando la Zona G y la Zona T. Después ajustas tus cupos, publicas
        eventos y lanzas promociones desde tu panel.
      </p>

      <div className="wizard section">
        <div className="stack" style={{ gap: 18 }}>
          <section className="card stack" style={{ gap: 14 }}>
            <span className="eyebrow">1 · Lo básico</span>
            <label className="field">
              Nombre del lugar
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: La Guarida" maxLength={40} />
            </label>
            <div className="field">
              Categoría
              <div className="cat-grid">
                {CATS.map((c) => (
                  <button key={c.id} type="button" className="cat-pick" aria-pressed={category === c.id} onClick={() => elegirCategoria(c.id)}>
                    <Icon name={c.icon} />
                    {CATEGORY_LABEL[c.id]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              Precio
              <div className="segmented">
                {PRECIOS.map((p) => (
                  <button key={p.n} type="button" aria-pressed={priceLevel === p.n} onClick={() => setPrice(p.n)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              Descripción corta <span className="faint">(opcional)</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Qué te hace especial, en una o dos frases." />
            </label>
          </section>

          <section className="card stack" style={{ gap: 12 }}>
            <span className="eyebrow">2 · Tu portada</span>
            <div className="cover-grid">
              {COVERS[category].map((k) => (
                <button key={k} type="button" className="cover-pick" aria-pressed={cover === k} onClick={() => setCover(k)} aria-label={`Portada ${k}`}>
                  <img src={coverUrl(k)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
            <p className="muted tiny" style={{ margin: 0 }}>
              Tu logo se genera con tu nombre y categoría: míralo en la vista previa.
            </p>
          </section>

          <section className="card stack" style={{ gap: 12 }}>
            <span className="eyebrow">3 · ¿Dónde queda?</span>
            <p className="muted small" style={{ margin: 0 }}>
              Toca el mapa para dejar tu pin (puedes arrastrarlo). La zona punteada es el piloto: Zona G y Zona T.
            </p>
            <div className="chips">
              {SUGERIDAS.map((s) => (
                <button key={s.label} type="button" className="chip" onClick={() => setLl(s.ll)}>
                  <Icon name="pin" /> {s.label}
                </button>
              ))}
            </div>
            <PickerMap value={ll} onPick={(lat, lng) => setLl([lat, lng])} />
            {ll && (
              <span className="badge ok fade-in" style={{ width: 'fit-content' }}>
                <Icon name="check" /> Ubicado en la {preview.zone === 'zona-g' ? 'Zona G' : 'Zona T'}
              </span>
            )}
          </section>
        </div>

        <aside className="preview-col stack" style={{ gap: 14 }}>
          <div className="preview-label">
            <span className="caption sm">Así te verán</span>
          </div>
          <div style={{ pointerEvents: 'none' }}>
            <PlaceCard place={preview} isNew />
          </div>
          <div className="card stack" style={{ gap: 10 }}>
            <div className="row">
              <Icon name="sparkles" />
              <b className="grow">Arrancas con</b>
            </div>
            <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Franjas de reserva típicas de un {CATEGORY_LABEL[category].toLowerCase()} (las ajustas después).</li>
              <li>Aparecer en vivo en el mapa de todos, con aviso de «¡Nuevo!».</li>
              <li>Promociones relámpago y bonos para los ganadores del minijuego.</li>
            </ul>
          </div>
          {error && (
            <p className="alert error" role="alert" style={{ margin: 0 }}>
              {error}
            </p>
          )}
          <button className="btn yellow block" style={{ minHeight: 56, fontSize: 17 }} disabled={!listo || busy} onClick={crear}>
            <Icon name="store" />
            {busy ? 'Abriendo…' : listo ? 'Abrir mi lugar' : !ll ? 'Ubica tu lugar en el mapa' : 'Escribe el nombre'}
          </button>
        </aside>
      </div>
    </main>
  );
}
