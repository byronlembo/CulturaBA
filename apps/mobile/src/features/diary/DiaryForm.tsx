import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { DiaryEntry } from '@/api/types';
import { Button, Chip, Field, Txt } from '@/components/ui/Primitives';
import { useDiaryMutation } from '@/features/hooks';
import { POINTS_PER_CHECK_IN } from '@/features/points/points';
import { spacing, useColors } from '@/theme/tokens';
import type { DiaryDateOption } from './diary';

export function Stars({
  value,
  onChange,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
}) {
  const c = useColors();
  return (
    <View
      style={{ flexDirection: 'row', gap: 4 }}
      accessibilityLabel={value ? `${value} de 5` : 'Sin puntaje'}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <Ionicons
            key={n}
            name={value !== null && n <= value ? 'star' : 'star-outline'}
            size={onChange ? 28 : 16}
            color={c.accent}
          />
        );
        return onChange ? (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${n} de 5`}
            accessibilityState={{ selected: value === n }}
            onPress={() => onChange(value === n ? null : n)}
            hitSlop={4}
          >
            {star}
          </Pressable>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

/** Lo que pasó con los puntos al anotar un "Fui". */
export interface FuiResult {
  points?: number;
  pointsError?: string;
}

/**
 * Alta ("Fui": elige la fecha entre `options` y, si es de los últimos 7 días, suma puntos) o
 * edición de una entrada existente (`entry`).
 */
export function DiaryForm({
  eventId,
  options,
  entry,
  onDone,
}: {
  eventId: string;
  options?: DiaryDateOption[];
  entry?: DiaryEntry;
  onDone: (result?: FuiResult) => void;
}) {
  const save = useDiaryMutation();
  const [picked, setPicked] = useState(options?.[0] ?? null);
  const [rating, setRating] = useState<number | null>(entry?.rating ?? null);
  const [review, setReview] = useState(entry?.review ?? '');
  const text = review.trim() || null;

  return (
    <View style={{ gap: spacing.md }}>
      {options ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {options.map((o) => (
            <Chip
              key={o.date}
              label={o.points ? `${o.label} · +${POINTS_PER_CHECK_IN}` : o.label}
              selected={picked?.date === o.date}
              onPress={() => setPicked(o)}
            />
          ))}
        </View>
      ) : null}
      <Stars value={rating} onChange={setRating} />
      <Field
        accessibilityLabel="Tu reseña"
        placeholder="¿Qué te pareció? (opcional)"
        value={review}
        onChangeText={setReview}
        multiline
        maxLength={2000}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <Button
        label={entry ? 'Guardar cambios' : 'Fui'}
        disabled={!entry && !picked}
        loading={save.isPending}
        onPress={() => {
          if (entry) {
            save.mutate((u) => u.updateDiaryEntry(entry.id, { rating, review: text }), {
              onSuccess: () => onDone(),
            });
            return;
          }
          const result: FuiResult = {};
          save.mutate(
            async (u) => {
              await u.addDiaryEntry(eventId, {
                attendedOn: picked?.date ?? '',
                occurrenceId: picked?.occurrenceId ?? null,
                rating,
                review: text,
              });
              // La entrada ya quedó; si los puntos fallan, se avisa sin deshacerla.
              if (picked?.points) {
                try {
                  result.points = (await u.checkIn(picked.occurrenceId)).points;
                } catch (err) {
                  result.pointsError = (err as Error).message;
                }
              }
            },
            { onSuccess: () => onDone(result) },
          );
        }}
      />
      {entry ? (
        <Button
          label="Borrar del diario"
          variant="ghost"
          disabled={save.isPending}
          onPress={() =>
            save.mutate((u) => u.deleteDiaryEntry(entry.id), { onSuccess: () => onDone() })
          }
        />
      ) : null}
      {save.error ? (
        <Txt variant="caption" tone="danger">
          {save.error.message}
        </Txt>
      ) : null}
    </View>
  );
}
