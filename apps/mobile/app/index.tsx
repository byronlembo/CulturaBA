import { Redirect } from 'expo-router';
import { useApi } from '@/api/context';
import { Loading, Screen } from '@/components/ui/Primitives';
import { UnconfiguredScreen } from '@/features/system/UnconfiguredScreen';
import { usePreferences } from '@/store/preferences';

export default function Index() {
  const hydrated = usePreferences((s) => s.hydrated);
  const onboardingDone = usePreferences((s) => s.onboardingDone);
  const { mode } = useApi();

  if (mode === 'unconfigured') return <UnconfiguredScreen />;
  if (!hydrated) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  return <Redirect href={onboardingDone ? '/(tabs)' : '/(onboarding)/welcome'} />;
}
