import 'leaflet/dist/leaflet.css';
import './map.css';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useColors } from '@/theme/tokens';
import { BA_CENTER, type LatLng, type VenuePin } from './venues';

// shortcut: teselas de OpenStreetMap (uso liviano, con atribución); con más tráfico pasar a un proveedor con plan.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function FollowUser({ me }: { me: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (me) map.setView([me.lat, me.lng], 15);
  }, [map, me]);
  return null;
}

export function EventMap({
  pins,
  me,
  selected,
  onSelect,
  height,
}: {
  pins: VenuePin[];
  me: LatLng | null;
  selected: string | null;
  onSelect: (key: string) => void;
  height: number;
}) {
  const c = useColors();
  return (
    <MapContainer
      aria-label="Mapa de salas con eventos. La lista de abajo tiene la misma información."
      center={[BA_CENTER.lat, BA_CENTER.lng]}
      zoom={12}
      style={{ height, width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url={TILES}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FollowUser me={me} />
      {pins.map((p) => (
        <CircleMarker
          key={`${p.key}${selected === p.key ? '-on' : ''}`}
          center={[p.lat, p.lng]}
          radius={Math.min(6 + p.events.length * 2, 18)}
          pathOptions={{
            color: selected === p.key ? c.text : c.bg,
            weight: selected === p.key ? 3 : 2,
            fillColor: c.accent,
            fillOpacity: selected === p.key ? 1 : 0.85,
          }}
          eventHandlers={{ click: () => onSelect(p.key) }}
        >
          <Tooltip>
            {p.name} · {p.events.length} {p.events.length === 1 ? 'evento' : 'eventos'}
          </Tooltip>
        </CircleMarker>
      ))}
      {me ? (
        <CircleMarker
          center={[me.lat, me.lng]}
          radius={7}
          pathOptions={{ color: c.accent, weight: 3, fillColor: c.text, fillOpacity: 1 }}
        >
          <Tooltip>Estás acá</Tooltip>
        </CircleMarker>
      ) : null}
    </MapContainer>
  );
}
