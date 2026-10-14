import { ScrollView } from 'react-native';
import { Screen, Txt } from '@/components/ui/Primitives';
import { spacing } from '@/theme/tokens';

/** Se muestra cuando el bundle no tiene EXPO_PUBLIC_SUPABASE_* ni EXPO_PUBLIC_DEV_API_URL. */
export function UnconfiguredScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 80 }}>
        <Txt variant="display">CulturaBA</Txt>
        <Txt style={{ marginTop: spacing.lg }}>
          La app no tiene configurado un origen de datos. Definí en{' '}
          <Txt variant="heading">apps/mobile/.env</Txt>:
        </Txt>
        <Txt tone="muted" style={{ marginTop: spacing.md, fontFamily: 'monospace' }}>
          EXPO_PUBLIC_SUPABASE_URL=https://…supabase.co{'\n'}
          EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
        </Txt>
        <Txt tone="muted" style={{ marginTop: spacing.md }}>
          o, para desarrollo local sin Supabase (`pnpm dev:api`):
        </Txt>
        <Txt tone="muted" style={{ marginTop: spacing.sm, fontFamily: 'monospace' }}>
          EXPO_PUBLIC_API_MODE=dev{'\n'}EXPO_PUBLIC_DEV_API_URL=http://localhost:8787
        </Txt>
      </ScrollView>
    </Screen>
  );
}
