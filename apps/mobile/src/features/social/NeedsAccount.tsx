import { useRouter } from 'expo-router';
import { Button, EmptyState } from '@/components/ui/Primitives';

export function NeedsAccount({ what }: { what: string }) {
  const router = useRouter();
  return (
    <EmptyState
      icon="people-outline"
      title="Necesitás una cuenta"
      body={`Creá tu cuenta con email en Perfil para ${what}.`}
      action={<Button label="Ir a Perfil" onPress={() => router.push('/perfil')} />}
    />
  );
}
