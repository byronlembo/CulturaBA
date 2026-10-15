import { MONTHS_ES } from '@culturaba/shared';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import type { CalendarOccurrence } from '@/api/types';
import { OccurrenceRow } from '@/components/ui/OccurrenceRow';
import { Chip, EmptyState, ErrorState, Loading, Screen, Txt } from '@/components/ui/Primitives';
import { groupByDate } from '@/features/calendar/groupByDate';
import { useCalendar, useInterests, useMyActions } from '@/features/hooks';
import { timezoneNote, todayLocalDate } from '@/lib/dates';
import { spacing, useColors } from '@/theme/tokens';

const MAX_MONTHS_AHEAD = 11;
type Mode = 'interests' | 'plans' | 'all';

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
  const actions = useMyActions();
  const [mode, setMode] = useState<Mode>('interests');
  const [monthOffset, setMonthOffset] = useState(0);
  const today = todayLocalDate();
  const month = DateTime.fromISO(today).startOf('month').plus({ months: monthOffset });
  const from = monthOffset === 0 ? today : (month.toISODate() ?? today);
  const to = month.endOf('month').toISODate() ?? today;
  const query = useCalendar(from, to, mode === 'interests' ? interests : []);
  const sections = useMemo(() => {
    const planIds = new Set(
      (actions.data ?? []).filter((a) => a.action !== 'recommend').map((a) => a.eventId),
    );
    const items = (query.data ?? []).filter((o) => mode !== 'plans' || planIds.has(o.eventId));
    return groupByDate(items, from, to).map((g) => ({
      title: g.date === today ? `Hoy · ${g.title}` : g.title,
      data: g.items,
    }));
  }, [query.data, actions.data, mode, today, from, to]);
  const tzNote = timezoneNote();

  const header = (
    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
      <View style={styles.monthRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          disabled={monthOffset === 0}
          onPress={() => setMonthOffset((m) => m - 1)}
          hitSlop={8}
          style={{ opacity: monthOffset === 0 ? 0.3 : 1 }}
        >
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Pressable>
        <Txt variant="heading">
          {MONTHS_ES[month.month - 1]?.replace(/^./, (l) => l.toUpperCase())} {month.year}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          disabled={monthOffset === MAX_MONTHS_AHEAD}
          onPress={() => setMonthOffset((m) => m + 1)}
          hitSlop={8}
          style={{ opacity: monthOffset === MAX_MONTHS_AHEAD ? 0.3 : 1 }}
        >
          <Ionicons name="chevron-forward" size={22} color={c.text} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Chip
          label="Mis intereses"
          icon="heart-outline"
          selected={mode === 'interests'}
          onPress={() => setMode('interests')}
        />
        <Chip
          label="Mis planes"
          icon="bookmark-outline"
          selected={mode === 'plans'}
          onPress={() => setMode('plans')}
        />
        <Chip label="Todo" selected={mode === 'all'} onPress={() => setMode('all')} />
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
            title={mode === 'plans' ? 'Sin planes este mes' : 'Nada en estas fechas'}
            body={
              mode === 'plans'
                ? 'Guardá eventos o marcá "Asistiré" en la ficha para verlos acá.'
                : mode === 'interests'
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
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
