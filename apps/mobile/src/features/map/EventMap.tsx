import { Txt } from '@/components/ui/Primitives';
import { spacing } from '@/theme/tokens';
import type { LatLng, VenuePin } from './venues';

/** Teléfono: el mapa llega con los builds nativos; la lista de salas de abajo sigue igual. */
// shortcut: sin mapa nativo; sumar react-native-maps cuando haya builds nativos.
export function EventMap(_: {
  pins: VenuePin[];
  me: LatLng | null;
  selected: string | null;
  onSelect: (key: string) => void;
  height: number;
}) {
  return (
    <Txt tone="muted" style={{ padding: spacing.lg }}>
      El mapa está disponible en la web de CulturaBA. Acá abajo tenés las salas.
    </Txt>
  );
}
