import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { EventDetail, Occurrence } from '@/api/types';
import { OccurrenceRow } from '@/components/ui/OccurrenceRow';
import { Txt } from '@/components/ui/Primitives';
import { addToCalendar, calendarEntry } from '@/lib/calendar';
import { formatBaDateRange, whenText } from '@/lib/dates';
import { fonts, spacing, useColors } from '@/theme/tokens';
import { type DateItem, groupDates, weekdaysText } from './dates';

/** "Fechas" de la ficha: las próximas, con las repetidas juntas y desplegables. */
export function EventDates({
  event,
  occurrences,
}: {
  event: EventDetail;
  occurrences: Occurrence[];
}) {
  const items = groupDates(occurrences);
  if (items.length === 0) return <Txt tone="muted">No hay funciones próximas publicadas.</Txt>;
  return (
    <>
      {items.map((item) =>
        item.kind === 'single' ? (
          <Row key={item.occurrence.id} event={event} occurrence={item.occurrence} />
        ) : (
          <DateGroup key={item.items[0]?.id} event={event} group={item} />
        ),
      )}
    </>
  );
}

function Row({ event, occurrence }: { event: EventDetail; occurrence: Occurrence }) {
  return (
    <OccurrenceRow
      occurrence={occurrence}
      showVenue={Boolean(occurrence.venueName && occurrence.venueName !== event.venueName)}
      onAddToCalendar={() => addToCalendar(calendarEntry(event, occurrence), event.slug)}
    />
  );
}

function DateGroup({
  event,
  group,
}: {
  event: EventDetail;
  group: Extract<DateItem, { kind: 'group' }>;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const next = group.items[0] as Occurrence;
  const n = group.items.length;
  const range = formatBaDateRange(group.startDate, group.endDate);
  const days = weekdaysText(group.weekdays);
  const count = next.kind === 'range' ? null : `${n} funciones`;
  const nextText = whenText(next).replace(/^Del /, 'del ');
  const place =
    next.venueName && next.venueName !== event.venueName
      ? [next.venueName, next.room].filter(Boolean).join(' · ')
      : next.room;

  return (
    <View style={[styles.group, { borderColor: c.border }]}>
      <View
        style={styles.head}
        accessible
        accessibilityLabel={[range, group.time, days, count, place, `próxima: ${nextText}`]
          .filter(Boolean)
          .join(', ')}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="title" style={styles.range}>
            {range}
          </Txt>
          <Txt variant="small" tone="muted">
            {group.time ? (
              <Txt variant="small" tone="accent" style={{ fontFamily: fonts.bodySemi }}>
                {group.time}
              </Txt>
            ) : null}
            {[group.time ? '' : null, days, count].filter((x) => x !== null).join(' · ')}
          </Txt>
          {next.scheduleText ? (
            <Txt variant="small" tone="muted">
              {next.scheduleText}
            </Txt>
          ) : null}
          {place ? (
            <Txt variant="small" tone="muted">
              {place}
            </Txt>
          ) : null}
          {next.priceVerified && next.priceText ? (
            <Txt variant="small" tone="muted">
              {next.priceText}
            </Txt>
          ) : null}
          <Txt variant="small">Próxima: {nextText}</Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Agregar al calendario la próxima: ${nextText}`}
          onPress={() => addToCalendar(calendarEntry(event, next), event.slug)}
          style={styles.iconButton}
        >
          <Ionicons name="calendar-outline" size={22} color={c.muted} />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.toggle}
      >
        <Txt variant="small" tone="accent" style={{ fontFamily: fonts.bodySemi }}>
          {open ? 'Ocultar fechas' : `Ver las ${n} fechas`}
        </Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.accent} />
      </Pressable>
      {open ? group.items.map((o) => <Row key={o.id} event={event} occurrence={o} />) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  range: { fontSize: 20, lineHeight: 26 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
});
