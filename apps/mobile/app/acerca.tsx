import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { useApi } from '@/api/context';
import { Txt } from '@/components/ui/Primitives';
import { usePreferences } from '@/store/preferences';
import { spacing, useColors } from '@/theme/tokens';

export default function About() {
  const c = useColors();
  const router = useRouter();
  const { mode } = useApi();
  const resetOnboarding = usePreferences((s) => s.resetOnboarding);
  return (
    <ScrollView
      role="main"
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <Txt>
        CulturaBA reúne en un solo lugar la agenda cultural de Buenos Aires, tomada de las agendas
        oficiales de cada institución.
      </Txt>
      <Txt tone="muted">
        Versión {Constants.expoConfig?.version ?? ''} · origen de datos: {mode}
      </Txt>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          resetOnboarding();
          router.replace('/(onboarding)/welcome');
        }}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Txt variant="small" tone="accent">
          Volver a ver la bienvenida
        </Txt>
      </Pressable>
    </ScrollView>
  );
}
