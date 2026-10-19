import { colors } from '@/theme/tokens';

/**
 * Google Maps (Android) en la paleta Telón. En iPhone el mapa es Apple Maps en modo oscuro
 * (`userInterfaceStyle`), que no acepta estilos propios.
 */
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: colors.surface }] },
  { elementType: 'labels.text.fill', stylers: [{ color: colors.muted }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: colors.bg }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: colors.surfaceAlt }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: colors.borderStrong }],
  },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: colors.border }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: colors.bg }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: colors.border }] },
];
