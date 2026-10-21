import type { DisciplineSlug } from '@culturaba/shared';
import type { ImageSourcePropType } from 'react-native';

/** Imagen de respaldo por disciplina cuando la fuente no publica una utilizable. */
const FALLBACKS: Record<DisciplineSlug, ImageSourcePropType> = {
  opera_clasica: require('../../assets/images/fallback/opera_clasica.png'),
  teatro_escenicas: require('../../assets/images/fallback/teatro_escenicas.png'),
  museos_exposiciones: require('../../assets/images/fallback/museos_exposiciones.png'),
  musica_vivo_jazz: require('../../assets/images/fallback/musica_vivo_jazz.png'),
  cine: require('../../assets/images/fallback/cine.png'),
  danza: require('../../assets/images/fallback/danza.png'),
  literatura_charlas: require('../../assets/images/fallback/literatura_charlas.png'),
  fotografia_artes_visuales: require('../../assets/images/fallback/fotografia_artes_visuales.png'),
  historia_patrimonio: require('../../assets/images/fallback/historia_patrimonio.png'),
  ciencia: require('../../assets/images/fallback/ciencia.png'),
  otros: require('../../assets/images/fallback/otros.png'),
};

export function fallbackImage(discipline: string | null | undefined): ImageSourcePropType {
  return FALLBACKS[(discipline ?? 'otros') as DisciplineSlug] ?? FALLBACKS.otros;
}

export function eventImageSource(
  imageUrl: string | null | undefined,
  imageSource: string | null | undefined,
  discipline: string | null | undefined,
): ImageSourcePropType {
  if (imageUrl && imageSource === 'source') return { uri: imageUrl };
  return fallbackImage(discipline);
}
