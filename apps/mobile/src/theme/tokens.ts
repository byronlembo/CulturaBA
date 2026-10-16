import { useColorScheme } from 'react-native';

export interface Colors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
}

export const palette: Record<'light' | 'dark', Colors> = {
  light: {
    bg: '#FAF7F2',
    surface: '#FFFFFF',
    surfaceAlt: '#F3EEE6',
    text: '#1B1730',
    muted: '#6B6680',
    border: '#E8E3DA',
    accent: '#BC4022',
    accentSoft: '#FBE4DC',
    onAccent: '#FFFFFF',
    success: '#2C7857',
    warning: '#9B5C00',
    danger: '#B3261E',
    overlay: 'rgba(27,23,48,0.55)',
  },
  dark: {
    bg: '#141220',
    surface: '#1F1B2E',
    surfaceAlt: '#2A2540',
    text: '#F4F1FA',
    muted: '#A39DB8',
    border: '#2C2740',
    accent: '#FF7A5C',
    accentSoft: '#3A2430',
    onAccent: '#1B1730',
    success: '#6FCF97',
    warning: '#F2B263',
    danger: '#FF8A80',
    overlay: 'rgba(0,0,0,0.6)',
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
export const type = {
  display: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '700' as const },
  heading: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  small: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
} as const;

export function useColors(): Colors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? palette.dark : palette.light;
}
