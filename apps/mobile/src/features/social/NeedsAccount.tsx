import { useRouter } from 'expo-router';
import { Button, EmptyState } from '@/components/ui/Primitives';

export function NeedsAccount({ what }: { what: string }) {
  const router = useRouter();
  return (
    <EmptyState
      icon="people-outline"
      title="Necesitás una cuenta"
      body={`Creá tu cuenta con Google o con tu email para ${what}.`}
      action={<Button label="Crear cuenta" onPress={() => router.push('/cuenta')} />}
    />
  );
}
