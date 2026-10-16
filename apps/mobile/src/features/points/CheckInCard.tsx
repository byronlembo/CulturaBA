import { useRouter } from 'expo-router';
import { useApi } from '@/api/context';
import type { Occurrence } from '@/api/types';
import { Button, Card, Txt } from '@/components/ui/Primitives';
import { usePointsMutation } from '@/features/hooks';
import { spacing } from '@/theme/tokens';
import { checkInCandidate, currentPosition, POINTS_PER_CHECK_IN } from './points';

/** "¿Estás en la función?": check-in con la ubicación del teléfono durante la función. */
export function CheckInCard({ occurrences }: { occurrences: Occurrence[] }) {
  const router = useRouter();
  const { user, account } = useApi();
  const checkIn = usePointsMutation<{ points: number; balance: number }>();
  const candidate = checkInCandidate(occurrences);
  if (!candidate || user.kind !== 'supabase') return null;

  return (
    <Card style={{ marginTop: spacing.xl, padding: spacing.md, gap: spacing.sm }}>
      <Txt variant="heading">¿Estás en la función?</Txt>
      {checkIn.data ? (
        <Txt>
          ¡Listo! Sumaste {checkIn.data.points} puntos. Tenés {checkIn.data.balance}.
        </Txt>
      ) : account?.isAnonymous ? (
        <>
          <Txt tone="muted">
            Con una cuenta sumás {POINTS_PER_CHECK_IN} puntos por cada función a la que vas.
          </Txt>
          <Button label="Crear cuenta" variant="secondary" onPress={() => router.push('/perfil')} />
        </>
      ) : (
        <>
          <Txt tone="muted">
            Hacé check-in desde la sala y sumá {POINTS_PER_CHECK_IN} puntos. Usamos tu ubicación
            solo para confirmar que estás ahí.
          </Txt>
          <Button
            label="Hacer check-in"
            icon="location-outline"
            loading={checkIn.isPending}
            onPress={() =>
              checkIn.mutate(async (u) => u.checkIn(candidate.id, await currentPosition()))
            }
          />
        </>
      )}
      {checkIn.error ? (
        <Txt variant="caption" tone="danger">
          {checkIn.error.message}
        </Txt>
      ) : null}
    </Card>
  );
}
