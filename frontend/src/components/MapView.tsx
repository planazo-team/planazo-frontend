'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { coverOf } from '@/lib/brand';
import { CATEGORY_LABEL, MAP_CENTER, ZONES } from '@/lib/seed';
import type { Place } from '@/lib/types';
import { boom, toastSuelto } from './fx/eggs';
import { SpiderArt } from './Icon';
import { PlaceLogo } from './Logo';

/**
 * Mapa de Zona G y Zona T. Cada pin es el logo del lugar con sus cupos libres,
 * que se actualizan solos con PLACE.UPDATE (RT-1). Los lugares con promoción
 * activa tienen un punto rojo que late; los recién creados caen con "¡NUEVO!".
 * Se carga solo en el navegador.
 */

const logoCache = new Map<string, string>();
function logoHtml(p: Place) {
  const k = `${p.id}:${p.name}:${p.category}`;
  let h = logoCache.get(k);
  if (!h) {
    h = renderToStaticMarkup(<PlaceLogo place={p} size={44} />);
    logoCache.set(k, h);
  }
  return h;
}

function pinIcon(p: Place, opts: { selected: boolean; promo: boolean; isNew: boolean; bump: boolean; delay: number }) {
  const seats = p.freeSeats;
  const cls = seats === null ? '' : seats === 0 ? ' none' : seats <= 5 ? ' low' : '';
  const label = seats === null ? '' : `<span class="seats${cls}${opts.bump ? ' bump' : ''}">${seats}</span>`;
  return L.divIcon({
    className: '',
    html: `<div class="pin${opts.selected ? ' selected' : ''}${opts.isNew ? ' new' : ''}" style="--d:${opts.delay}ms">${logoHtml(p)}${label}${
      opts.promo ? '<span class="promo-ping"></span>' : ''
    }</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 40],
    popupAnchor: [0, -38],
  });
}

/** Vuela suavemente al lugar seleccionado desde la lista. */
function FlyTo({ place }: { place: Place | null }) {
  const map = useMap();
  useEffect(() => {
    if (place) map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [place, map]);
  return null;
}

/**
 * La rueda del mouse desplaza la página, no el mapa: el zoom con rueda se
 * activa al hacer clic en el mapa y se apaga al salir de él.
 */
function RuedaAlEnfocar() {
  const map = useMap();
  useEffect(() => {
    const on = () => map.scrollWheelZoom.enable();
    const off = () => map.scrollWheelZoom.disable();
    map.on('click', on);
    map.on('mouseout', off);
    return () => {
      map.off('click', on);
      map.off('mouseout', off);
    };
  }, [map]);
  return null;
}

/** El punto azul de «aquí estás». */
const iconoYo = L.divIcon({ className: '', html: '<div class="yo-punto"><span></span></div>', iconSize: [22, 22], iconAnchor: [11, 11] });

type EstadoUbicacion = 'buscando' | 'ok' | 'bloqueada' | 'no-disponible';

/**
 * Tu ubicación en el mapa, en vivo: un punto azul que se mueve contigo
 * (watchPosition) con su círculo de precisión. El botón centra el mapa en ti.
 * No sale del navegador: Planazo no la guarda ni la envía a ningún servicio.
 */
function MiUbicacion() {
  const map = useMap();
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [estado, setEstado] = useState<EstadoUbicacion>('buscando');
  const boton = useRef<HTMLButtonElement>(null);
  const centrarAlLlegar = useRef(false);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setEstado('no-disponible');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const nueva = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setPos(nueva);
        setEstado('ok');
        if (centrarAlLlegar.current) {
          centrarAlLlegar.current = false;
          map.flyTo([nueva.lat, nueva.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
        }
      },
      (err) => setEstado(err.code === err.PERMISSION_DENIED ? 'bloqueada' : 'no-disponible'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [map]);

  // Los clics en el botón no deben mover ni hacer zoom en el mapa.
  useEffect(() => {
    if (boton.current) L.DomEvent.disableClickPropagation(boton.current);
  }, []);

  const centrar = () => {
    if (pos) {
      map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
    } else if (estado === 'bloqueada') {
      toastSuelto('Tu navegador bloqueó la ubicación. Actívala en el candado de la barra de direcciones.');
    } else if (estado === 'no-disponible') {
      toastSuelto('No pudimos obtener tu ubicación. Revisa que el GPS esté encendido.');
    } else {
      centrarAlLlegar.current = true;
      toastSuelto('Buscando tu ubicación…');
    }
  };

  const titulo =
    estado === 'ok' ? 'Centrar en mi ubicación' : estado === 'bloqueada' ? 'Ubicación bloqueada' : estado === 'no-disponible' ? 'Ubicación no disponible' : 'Buscando tu ubicación…';

  return (
    <>
      {pos && (
        <>
          <Circle
            center={[pos.lat, pos.lng]}
            radius={Math.min(pos.acc, 500)}
            pathOptions={{ color: '#2f6bff', weight: 1, fillColor: '#2f6bff', fillOpacity: 0.12 }}
            interactive={false}
          />
          <Marker position={[pos.lat, pos.lng]} icon={iconoYo} zIndexOffset={1000} keyboard={false}>
            <Tooltip direction="top" offset={[0, -12]}>
              Estás aquí
            </Tooltip>
          </Marker>
        </>
      )}
      <button ref={boton} type="button" className={`yo-btn ${estado}`} onClick={centrar} title={titulo} aria-label={titulo}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
    </>
  );
}

/** Easter egg: de vez en cuando una araña cruza el mapa. Si la tocas… */
function ArañaEscondida() {
  const [viaje, setViaje] = useState<null | { id: number; x0: string; y0: string; x1: string; y1: string; dur: number }>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const programar = () => {
      t = setTimeout(() => {
        if (Math.random() < 0.45) {
          const lado = Math.random() < 0.5;
          setViaje({
            id: Date.now(),
            x0: lado ? '-30px' : `${10 + Math.random() * 80}%`,
            y0: lado ? `${10 + Math.random() * 80}%` : '-30px',
            x1: lado ? 'calc(100% + 30px)' : `${10 + Math.random() * 80}%`,
            y1: lado ? `${10 + Math.random() * 80}%` : 'calc(100% + 30px)',
            dur: 8 + Math.random() * 5,
          });
        }
        programar();
      }, 35_000 + Math.random() * 40_000);
    };
    programar();
    return () => clearTimeout(t);
  }, []);
  if (!viaje) return null;
  return (
    <button
      key={viaje.id}
      className="map-spider"
      aria-label="Una araña"
      style={
        { '--x0': viaje.x0, '--y0': viaje.y0, '--x1': viaje.x1, '--y1': viaje.y1, '--dur': `${viaje.dur}s`, background: 'none', border: 0, padding: 0 } as React.CSSProperties
      }
      onAnimationEnd={() => setViaje(null)}
      onClick={(e) => {
        boom('¡ATRAPADA!', e.clientX, e.clientY, true);
        toastSuelto('¡La encontraste! Tienes sentido arácnido. 🕷️');
        setViaje(null);
      }}
    >
      <SpiderArt size={26} color="#f1f7f4" eyes="#0b0f0e" />
    </button>
  );
}

export default function MapView({
  places,
  selectedId,
  onSelect,
  promoPlaceIds,
  newIds,
  tall,
}: {
  places: Place[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  promoPlaceIds?: Set<string>;
  newIds?: Set<string>;
  tall?: boolean;
}) {
  // Detecta qué pines cambiaron de cupos para hacerlos rebotar.
  const prev = useRef(new Map<string, number | null>());
  const bumped = useMemo(() => {
    const b = new Set<string>();
    for (const p of places) {
      const was = prev.current.get(p.id);
      if (was !== undefined && was !== p.freeSeats) b.add(p.id);
    }
    return b;
  }, [places]);
  useEffect(() => {
    prev.current = new Map(places.map((p) => [p.id, p.freeSeats]));
  }, [places]);

  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);

  const selected = places.find((p) => p.id === selectedId) ?? null;

  return (
    <div className={`map${tall ? ' tall' : ''}`}>
      <MapContainer center={MAP_CENTER} zoom={15} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        {/* Teselas de OpenStreetMap: no piden API key. Se oscurecen con .tiles-dark. */}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          className="tiles-dark"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <FlyTo place={selected} />
        <RuedaAlEnfocar />
        <MiUbicacion />
        {places.map((p, i) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={pinIcon(p, {
              selected: p.id === selectedId,
              promo: !!promoPlaceIds?.has(p.id),
              isNew: !!newIds?.has(p.id),
              bump: bumped.has(p.id),
              delay: first.current ? i * 45 : 0,
            })}
            eventHandlers={{ click: () => onSelect?.(p.id) }}
          >
            <Tooltip direction="top" offset={[0, -36]}>
              {p.name}
            </Tooltip>
            <Popup closeButton>
              <div className="map-pop">
                <img src={coverOf(p)} alt="" loading="lazy" />
                <div className="body">
                  <h3>{p.name}</h3>
                  <div className="muted small">
                    {CATEGORY_LABEL[p.category]} · {ZONES[p.zone].label}
                    {p.freeSeats !== null && ` · ${p.freeSeats} cupos`}
                  </div>
                  <Link href={`/cliente/lugar/${p.id}`} className="btn sm block" style={{ marginTop: 10 }}>
                    Ver y reservar
                  </Link>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <ArañaEscondida />
    </div>
  );
}
