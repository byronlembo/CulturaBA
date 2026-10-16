import { ONBOARDING_MAX_INTERESTS, ONBOARDING_MIN_INTERESTS } from '@culturaba/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InterestPicker } from '@/components/ui/InterestPicker';
import { Button, Screen, Txt } from '@/components/ui/Primitives';
import { useInterests } from '@/features/hooks';
import { usePreferences } from '@/store/preferences';
import { spacing } from '@/theme/tokens';

export default function Interests() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { interests, setInterests } = useInterests();
  const completeOnboarding = usePreferences((s) => s.completeOnboarding);
  const [selected, setSelected] = useState<string[]>(interests.slice(0, ONBOARDING_MAX_INTERESTS));
  const [saving, setSaving] = useState(false);

  const canContinue = selected.length >= ONBOARDING_MIN_INTERESTS;

  async function continueToApp() {
    setSaving(true);
    await setInterests(selected);
    completeOnboarding();
    setSaving(false);
    router.replace('/(tabs)');
  }

  return (
    <Screen style={{ paddingTop: insets.top + spacing.xl }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl }}
      >
        <Txt variant="caption" tone="accent" style={{ letterSpacing: 2 }}>
          TUS INTERESES
        </Txt>
        <Txt variant="display" style={{ marginTop: spacing.sm }}>
          ¿Qué te interesa?
        </Txt>
        <Txt tone="muted" style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
          Elegí entre {ONBOARDING_MIN_INTERESTS} y {ONBOARDING_MAX_INTERESTS} para empezar. Siempre
          podés explorar todo lo demás.
        </Txt>
        <InterestPicker
          value={selected}
          onChange={setSelected}
          min={ONBOARDING_MIN_INTERESTS}
          max={ONBOARDING_MAX_INTERESTS}
        />
      </ScrollView>
      <View style={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.lg }}>
        <Button
          label="Ver mi agenda"
          icon="sparkles-outline"
          disabled={!canContinue}
          loading={saving}
          onPress={continueToApp}
        />
      </View>
    </Screen>
  );
}
