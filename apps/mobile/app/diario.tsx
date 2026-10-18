import { type DisciplineSlug, disciplineLabel } from '@culturaba/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import {
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
  StatTile,
  Txt,
} from '@/components/ui/Primitives';
import { DiaryForm, Stars } from '@/features/diary/DiaryForm';
import { diaryStats } from '@/features/diary/diary';
import { useDiary } from '@/features/hooks';
import { formatBaDateRange } from '@/lib/dates';
import { spacing } from '@/theme/tokens';

export default function Diary() {
  const diary = useDiary();
  const [open, setOpen] = useState<string | null>(null);
  if (diary.isPending) return <Loading />;
  if (diary.error)
    return <ErrorState title="No pudimos cargar tu diario" onRetry={() => void diary.refetch()} />;
  const entries = diary.data ?? [];
  const year = new Date().getFullYear();
  const stats = diaryStats(entries, year);

  return (
    <Screen>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        ListHeaderComponent={
          entries.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <StatTile label={`En ${year}`} value={String(stats.thisYear)} />
                <StatTile label="En total" value={String(stats.total)} />
                {stats.averageRating !== null ? (
                  <StatTile label="Puntaje promedio" value={String(stats.averageRating)} />
                ) : null}
              </View>
              {stats.topDisciplines.length > 0 ? (
                <Txt tone="muted">
                  Lo que más viste:{' '}
                  {stats.topDisciplines
                    .map((d) => `${disciplineLabel(d.slug as DisciplineSlug)} (${d.count})`)
                    .join(', ')}
                </Txt>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="book-outline"
            title="Tu diario está vacío"
            body="En la ficha de una función a la que fuiste, tocá «Fui a esta función»."
          />
        }
        renderItem={({ item: e }) => (
          <Card style={{ padding: spacing.md, gap: spacing.sm }}>
            <Link href={`/event/${e.eventSlug}`} asChild>
              <Pressable accessibilityRole="link">
                <Txt variant="heading">{e.eventTitle}</Txt>
              </Pressable>
            </Link>
            <Txt variant="small" tone="muted">
              {formatBaDateRange(e.attendedOn, e.attendedOn)}
              {e.venueName ? ` · ${e.venueName}` : ''}
            </Txt>
            {open === e.id ? (
              <DiaryForm eventId={e.eventId} entry={e} onDone={() => setOpen(null)} />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Editar la entrada del diario"
                onPress={() => setOpen(e.id)}
                style={{ gap: spacing.sm }}
              >
                <Stars value={e.rating} />
                {e.review ? <Txt>{e.review}</Txt> : null}
                <Txt variant="small" tone="accent">
                  Editar
                </Txt>
              </Pressable>
            )}
          </Card>
        )}
      />
    </Screen>
  );
}
