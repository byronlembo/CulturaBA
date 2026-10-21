import type { Ionicons } from '@expo/vector-icons';

type IoniconName = keyof typeof Ionicons.glyphMap;

export const DISCIPLINE_ICONS: Record<string, IoniconName> = {
  opera_clasica: 'musical-notes-outline',
  teatro_escenicas: 'happy-outline',
  museos_exposiciones: 'color-palette-outline',
  musica_vivo_jazz: 'mic-outline',
  cine: 'film-outline',
  danza: 'body-outline',
  literatura_charlas: 'book-outline',
  fotografia_artes_visuales: 'camera-outline',
  historia_patrimonio: 'business-outline',
  ciencia: 'planet-outline',
  otros: 'sparkles-outline',
};

export function disciplineIcon(slug: string | null | undefined): IoniconName {
  return DISCIPLINE_ICONS[slug ?? 'otros'] ?? 'sparkles-outline';
}
