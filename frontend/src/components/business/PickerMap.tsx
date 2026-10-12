'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, Rectangle, TileLayer, useMapEvents } from 'react-leaflet';
import { MAP_CENTER } from '@/lib/seed';

/** Caja del piloto (debe coincidir con planazo-booking/src/booking/new-place.ts). */
export const CAJA_PILOTO = { latMin: 4.645, latMax: 4.682, lngMin: -74.07, lngMax: -74.035 };

const dentro = (lat: number, lng: number) =>
  lat >= CAJA_PILOTO.latMin && lat <= CAJA_PILOTO.latMax && lng >= CAJA_PILOTO.lngMin && lng <= CAJA_PILOTO.lngMax;

const icono = L.divIcon({
  className: '',
  html: '<div class="pin" style="--d:0ms"><svg viewBox="0 0 24 24" width="44" height="44"><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" fill="#ffd84a" stroke="#020505" stroke-width="1.6"/><circle cx="12" cy="10" r="3" fill="#020505"/></svg></div>',
  iconSize: [44, 44],
  iconAnchor: [22, 42],
});

function Clic({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (dentro(e.latlng.lat, e.latlng.lng)) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Mapa para ubicar el lugar: un clic deja el pin (solo dentro del piloto, marcado en amarillo). */
export default function PickerMap({ value, onPick }: { value: [number, number] | null; onPick: (lat: number, lng: number) => void }) {
  return (
    <div className="map picker-map">
      <MapContainer center={value ?? MAP_CENTER} zoom={15} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} className="tiles-dark" attribution="&copy; OpenStreetMap" />
        <Rectangle
          bounds={[
            [CAJA_PILOTO.latMin, CAJA_PILOTO.lngMin],
            [CAJA_PILOTO.latMax, CAJA_PILOTO.lngMax],
          ]}
          pathOptions={{ color: '#ffd84a', weight: 2, dashArray: '6 6', fillOpacity: 0.04 }}
        />
        <Clic onPick={onPick} />
        {value && (
          <Marker
            position={value}
            icon={icono}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                if (dentro(ll.lat, ll.lng)) onPick(ll.lat, ll.lng);
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
