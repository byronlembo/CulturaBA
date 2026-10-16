import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Occurrence } from '@/api/types';
import { Button, Card, Txt } from '@/components/ui/Primitives';
import { useDiary } from '@/features/hooks';
import { formatBaDateRange } from '@/lib/dates';
import { spacing } from '@/theme/tokens';
import { DiaryForm, Stars } from './DiaryForm';
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
  const mine = (diary.data ?? []).filter((e) => e.eventId === eventId);
  const taken = new Set(mine.map((e) => e.attendedOn));
  const options = diaryDateOptions(occurrences).filter((o) => !taken.has(o.date));
  if (mine.length === 0 && options.length === 0) return null;

  return (
    <Card style={{ marginTop: spacing.xl, padding: spacing.md, gap: spacing.md }}>
      <Txt variant="heading">Tu diario</Txt>
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
        <DiaryForm eventId={eventId} options={options} onDone={() => setOpen(null)} />
      ) : options.length > 0 ? (
        <Button
          label="¿Fuiste? Anotalo en tu diario"
          variant="secondary"
          icon="book-outline"
          onPress={() => setOpen('new')}
        />
      ) : null}
    </Card>
  );
}
