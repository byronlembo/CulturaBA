import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Occurrence } from '@/api/types';
import { Button, Card, Txt } from '@/components/ui/Primitives';
import { useDiary } from '@/features/hooks';
import { POINTS_PER_CHECK_IN } from '@/features/points/points';
import { formatBaDateRange } from '@/lib/dates';
import { spacing } from '@/theme/tokens';
import { DiaryForm, type FuiResult, Stars } from './DiaryForm';
import { diaryDateOptions } from './diary';

/** "Tu diario" en la ficha: lo que ya anotaste de este evento y el alta de una función vista. */
export function DiarySection({
  eventId,
  occurrences,
}: {
  eventId: string;
  occurrences: Occurrence[];
}) {
  const diary = useDiary();
  const [open, setOpen] = useState<string | null>(null);
  const [result, setResult] = useState<FuiResult | null>(null);
  const mine = (diary.data ?? []).filter((e) => e.eventId === eventId);
  const taken = new Set(mine.map((e) => e.attendedOn));
  const options = diaryDateOptions(occurrences).filter((o) => !taken.has(o.date));
  if (mine.length === 0 && options.length === 0) return null;

  return (
    <Card style={{ marginTop: spacing.xl, padding: spacing.md, gap: spacing.md }}>
      <Txt variant="heading">{mine.length > 0 ? 'Tu diario' : '¿Fuiste?'}</Txt>
      {mine.length === 0 && open !== 'new' ? (
        <Txt tone="muted">
          Anotá la función a la que fuiste: queda en tu diario y suma {POINTS_PER_CHECK_IN} puntos
          hasta 7 días después. Es de buena fe.
        </Txt>
      ) : null}
      {result?.points ? <Txt tone="accent">¡Listo! Sumaste {result.points} puntos.</Txt> : null}
      {result?.pointsError ? (
        <Txt variant="small" tone="muted">
          {result.pointsError}
        </Txt>
      ) : null}
      {mine.map((e) =>
        open === e.id ? (
          <DiaryForm key={e.id} eventId={eventId} entry={e} onDone={() => setOpen(null)} />
        ) : (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            accessibilityHint="Editar la entrada del diario"
            onPress={() => setOpen(e.id)}
            style={{ gap: 4 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Txt>Fuiste el {formatBaDateRange(e.attendedOn, e.attendedOn)}</Txt>
              <Stars value={e.rating} />
            </View>
            {e.review ? (
              <Txt tone="muted" numberOfLines={3}>
                {e.review}
              </Txt>
            ) : null}
          </Pressable>
        ),
      )}
      {open === 'new' ? (
        <DiaryForm
          eventId={eventId}
          options={options}
          onDone={(r) => {
            setResult(r ?? null);
            setOpen(null);
          }}
        />
      ) : options.length > 0 ? (
        <Button
          label="Fui a esta función"
          variant={mine.length === 0 ? 'primary' : 'secondary'}
          icon="checkmark-circle-outline"
          onPress={() => setOpen('new')}
        />
      ) : null}
    </Card>
  );
}
