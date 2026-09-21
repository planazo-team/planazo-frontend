'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet';
import { CATEGORY_COLOR, MAP_CENTER } from '@/lib/seed';
import type { Place } from '@/lib/types';

/**
 * Mapa de Zona G y Zona T. Cada pin muestra los cupos libres y se actualiza solo
 * cuando llega un PLACE.UPDATE de la zona (RT-1). Se carga solo en el navegador.
 */

function pinIcon(p: Place, selected: boolean) {
  const label = p.freeSeats === null ? '•' : String(p.freeSeats);
  return L.divIcon({
    className: '',
    html: `<div class="pin${selected ? ' selected' : ''}" style="background:${CATEGORY_COLOR[p.category]}"><b>${label}</b></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function useDarkTiles() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(m.matches);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return dark;
}

export default function MapView({
  places,
  selectedId,
  onSelect,
}: {
  places: Place[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const dark = useDarkTiles();
  return (
    <div className="map">
      <MapContainer center={MAP_CENTER} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          key={dark ? 'dark' : 'light'}
          url={`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`}
          subdomains="abcd"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        {places.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={pinIcon(p, p.id === selectedId)}
            eventHandlers={{ click: () => onSelect(p.id) }}
          >
            <Tooltip direction="top" offset={[0, -32]}>
              {p.name}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
