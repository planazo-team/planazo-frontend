'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
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

export default function MapView({
  places,
  selectedId,
  onSelect,
}: {
  places: Place[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  // El tema es siempre oscuro: las teselas se oscurecen con el filtro .tiles-dark.
  const dark = true;
  return (
    <div className="map">
      <MapContainer center={MAP_CENTER} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        {/* Teselas de OpenStreetMap: no piden API key (CARTO empezó a exigirla). */}
        <TileLayer
          key={dark ? 'dark' : 'light'}
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          className={dark ? 'tiles-dark' : undefined}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
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
