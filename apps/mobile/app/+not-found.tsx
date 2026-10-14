import { useRouter } from 'expo-router';
import { Button, EmptyState, Screen } from '@/components/ui/Primitives';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        icon="help-circle-outline"
        title="No encontramos esa página"
        body="Puede que el enlace haya cambiado o que el evento ya no esté publicado."
        action={<Button label="Ir al inicio" onPress={() => router.replace('/(tabs)')} />}
      />
    </Screen>
  );
}
