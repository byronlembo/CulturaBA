import {
  BodoniModa_500Medium_Italic,
  BodoniModa_600SemiBold,
} from '@expo-google-fonts/bodoni-moda';
import {
  SchibstedGrotesk_400Regular,
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
} from '@expo-google-fonts/schibsted-grotesk';

/**
 * Identidad "Telón": sala oscura color bordó, dorado de bronce y tipografía de programa de
 * mano. La app es siempre oscura (decisión de diseño), así que hay una sola paleta.
 */
export interface Colors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  tabBar: string;
  text: string;
  muted: string;
  /** Separadores y bordes decorativos. */
  border: string;
  /** Bordes de chips y botones sin relleno (el texto ya identifica el control). */
  borderStrong: string;
  /** Borde de campos de texto: ≥ 3:1 contra el fondo (WCAG 1.4.11). */
  outline: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
}

// Contrastes medidos: text 14,8:1 y muted 8,9:1 sobre surface; accent 8,5:1 sobre surface;
// onAccent sobre accent 9,3:1; outline 3,4:1 sobre surface.
export const colors: Colors = {
  bg: '#1C0F15',
  surface: '#2A1720',
  surfaceAlt: '#3A2029',
  tabBar: '#24131A',
  text: '#F6EEE8',
  muted: '#CBB8B8',
  border: '#4A2A35',
  borderStrong: '#5A3441',
  outline: '#8C6672',
  accent: '#E0B055',
  accentSoft: '#3A2A1C',
  onAccent: '#1C0F15',
  success: '#6FCF97',
  warning: '#F59E6B',
  danger: '#FF8A80',
  overlay: 'rgba(28,15,21,0.78)',
};

/** Caras cargadas en `app/_layout.tsx`. Una familia por peso: en nativo `fontWeight` no elige archivo. */
export const fontFiles = {
  BodoniModa_600SemiBold,
  BodoniModa_500Medium_Italic,
  SchibstedGrotesk_400Regular,
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
};

export const fonts = {
  display: 'BodoniModa_600SemiBold',
  displayItalic: 'BodoniModa_500Medium_Italic',
  body: 'SchibstedGrotesk_400Regular',
  bodyMedium: 'SchibstedGrotesk_500Medium',
  bodySemi: 'SchibstedGrotesk_600SemiBold',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 14, pill: 999 } as const;
// Sin fontWeight: con fuentes propias el navegador sintetizaría una negrita falsa.
export const type = {
  display: { fontFamily: fonts.display, fontSize: 36, lineHeight: 38 },
  title: { fontFamily: fonts.display, fontSize: 23, lineHeight: 26 },
  section: { fontFamily: fonts.displayItalic, fontSize: 22, lineHeight: 28 },
  numeral: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36 },
  heading: { fontFamily: fonts.bodySemi, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
} as const;

export function useColors(): Colors {
  return colors;
}
