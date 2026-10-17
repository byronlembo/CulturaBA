import 'leaflet/dist/leaflet.css';
import './map.css';
import L from 'leaflet';
import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { useColors } from '@/theme/tokens';
import { BA_CENTER, type LatLng, pinSize, type VenuePin } from './venues';

// shortcut: teselas de OpenStreetMap (uso liviano, con atribución); con más tráfico pasar a un proveedor con plan.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function FollowUser({ me }: { me: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (me) map.setView([me.lat, me.lng], 15);
  }, [map, me]);
  return null;
}

/** Lleva la sala elegida un poco por encima del centro, para que no la tape la hoja de abajo. */
function ShowSelected({ pin }: { pin: VenuePin | null }) {
  const map = useMap();
  useEffect(() => {
    if (!pin) return;
    const zoom = map.getZoom();
    const target = map.project([pin.lat, pin.lng], zoom).add([0, map.getSize().y * 0.22]);
    map.panTo(map.unproject(target, zoom));
  }, [map, pin]);
  return null;
}

/** Tocar el mapa fuera de un punto cierra la hoja. */
function ClearOnMapClick({ onSelect }: { onSelect: (key: string | null) => void }) {
  useMapEvents({ click: () => onSelect(null) });
  return null;
}

// Área táctil de 44 px; el círculo de adentro crece con la cantidad de eventos. Se reusan
// los íconos: cambiar el de un marcador reemplaza su elemento (y le quita el foco).
const icons = new Map<string, L.DivIcon>();
function pinIcon(count: number, on: boolean) {
  const id = `${count}:${on}`;
  const cached = icons.get(id);
  if (cached) return cached;
  const s = pinSize(count);
  const icon = L.divIcon({
    className: 'pin-icon',
    html: `<span class="pin-hit"><span class="pin${on ? ' on' : ''}" style="width:${s}px;height:${s}px">${count > 1 ? count : ''}</span></span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
  icons.set(id, icon);
  return icon;
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
  onSelect: (key: string | null) => void;
  height: number;
}) {
  const c = useColors();
  return (
    <MapContainer
      aria-label="Mapa de salas con eventos. Elegí un punto para ver sus funciones."
      center={[BA_CENTER.lat, BA_CENTER.lng]}
      zoom={12}
      style={{ height, width: '100%' }}
    >
      <TileLayer
        url={TILES}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FollowUser me={me} />
      <ShowSelected pin={pins.find((p) => p.key === selected) ?? null} />
      <ClearOnMapClick onSelect={onSelect} />
      {pins.map((p) => (
        // Los marcadores de Leaflet se enfocan con Tab (role="button"); `title` es su nombre.
        <Marker
          key={p.key}
          position={[p.lat, p.lng]}
          icon={pinIcon(p.events.length, selected === p.key)}
          title={`${p.name} · ${p.events.length} ${p.events.length === 1 ? 'evento' : 'eventos'}`}
          zIndexOffset={selected === p.key ? 1000 : 0}
          eventHandlers={{
            click: () => onSelect(p.key),
            // Leaflet solo abre popups con Enter: el teclado se maneja acá (Enter y espacio).
            keypress: (e: L.LeafletKeyboardEvent) => {
              if (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ') onSelect(p.key);
            },
          }}
        />
      ))}
      {me ? (
        <CircleMarker
          center={[me.lat, me.lng]}
          radius={7}
          interactive={false}
          pathOptions={{ color: c.accent, weight: 3, fillColor: c.text, fillOpacity: 1 }}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>
            Estás acá
          </Tooltip>
        </CircleMarker>
      ) : null}
    </MapContainer>
  );
}
