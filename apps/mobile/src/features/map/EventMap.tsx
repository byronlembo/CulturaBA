import type { LatLng, VenuePin } from './venues';

/** Teléfono: Explorar abre en la lista; este archivo solo existe para que el import resuelva. */
// shortcut: sin mapa nativo; sumar react-native-maps cuando haya builds nativos.
export function EventMap(_: {
  pins: VenuePin[];
  me: LatLng | null;
  selected: string | null;
  onSelect: (key: string | null) => void;
  height: number;
}) {
  return null;
}
