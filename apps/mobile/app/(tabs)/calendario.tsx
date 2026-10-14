import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import type { CalendarOccurrence } from '@/api/types';
import { OccurrenceRow } from '@/components/ui/OccurrenceRow';
import { Chip, EmptyState, ErrorState, Loading, Screen, Txt } from '@/components/ui/Primitives';
import { groupByDate } from '@/features/calendar/groupByDate';
import { useCalendar, useInterests } from '@/features/hooks';
import { plusDaysLocalDate, timezoneNote, todayLocalDate } from '@/lib/dates';
import { spacing, useColors } from '@/theme/tokens';

const DAYS = 30;

function CalendarItem({ item }: { item: CalendarOccurrence }) {
  const c = useColors();
  return (
    <Link href={`/event/${item.eventSlug}`} asChild>
      <Pressable accessibilityRole="link">
        <View style={[styles.item, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Txt variant="caption" tone="accent">
            {item.institutionName}
          </Txt>
          <Txt variant="heading" numberOfLines={2}>
            {item.eventTitle}
          </Txt>
          <OccurrenceRow occurrence={item} showVenue />
        </View>
      </Pressable>
    </Link>
  );
}

export default function Calendar() {
  const c = useColors();
  const { interests } = useInterests();
  const [onlyMine, setOnlyMine] = useState(true);
  const today = todayLocalDate();
  const to = plusDaysLocalDate(DAYS);
  const query = useCalendar(today, to, onlyMine ? interests : []);
  const sections = useMemo(
    () =>
      groupByDate(query.data ?? [], today, to).map((g) => ({
        title: g.date === today ? `Hoy · ${g.title}` : g.title,
        data: g.items,
      })),
    [query.data, today, to],
  );
  const tzNote = timezoneNote();

  const header = (
    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
      <Txt tone="muted">Próximos {DAYS} días</Txt>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Chip
          label="Mis intereses"
          icon="heart-outline"
          selected={onlyMine}
          onPress={() => setOnlyMine(true)}
        />
        <Chip label="Todo" selected={!onlyMine} onPress={() => setOnlyMine(false)} />
      </View>
      {tzNote ? (
        <Txt variant="caption" tone="muted">
          {tzNote}
        </Txt>
      ) : null}
    </View>
  );

  if (query.isPending)
    return (
      <Screen>
        {header}
        <Loading />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen>
        {header}
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(item, i) => `${item.id}-${i}`}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: c.bg }]}>
            <Txt variant="heading" tone="accent">
              {section.title}
            </Txt>
          </View>
        )}
        renderItem={({ item }) => <CalendarItem item={item} />}
        ListEmptyComponent={
          <EmptyState
            title="Nada en los próximos días"
            body={
              onlyMine
                ? 'Mirá "Todo" o sumá intereses en tu perfil.'
                : 'Las agendas se actualizan varias veces por día.'
            }
          />
        }
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xxl, flexGrow: 1 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  item: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
