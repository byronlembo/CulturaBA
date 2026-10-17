import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Occurrence } from '@/api/types';
import { formatBaDateShort, formatBaDateTimeShort, formatBaTime, whenText } from '@/lib/dates';
import { fonts, spacing, useColors } from '@/theme/tokens';
import { Badge, Txt } from './Primitives';

export function statusBadge(
  o: Occurrence,
): { label: string; tone: 'danger' | 'warning' | 'success' | 'muted' } | null {
  switch (o.status) {
    case 'cancelled':
      return { label: 'Cancelada', tone: 'danger' };
    case 'postponed':
      return { label: 'Postergada', tone: 'warning' };
    case 'sold_out':
      return { label: 'Agotada', tone: 'muted' };
    case 'rescheduled':
      return {
        label: o.previousStartsAt
          ? `Reprogramada (antes: ${formatBaDateTimeShort(o.previousStartsAt)})`
          : 'Reprogramada',
        tone: 'warning',
      };
    default:
      return null;
  }
}

export function OccurrenceRow({
  occurrence,
  showVenue,
  onAddToCalendar,
  divider = true,
}: {
  occurrence: Occurrence;
  showVenue?: boolean;
  onAddToCalendar?: () => void;
  divider?: boolean;
}) {
  const c = useColors();
  const badge = statusBadge(occurrence);
  const dim = occurrence.status === 'cancelled';
  return (
    <View
      style={[
        styles.row,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
      ]}
      accessibilityLabel={`${whenText(occurrence)}${badge ? `, ${badge.label}` : ''}`}
    >
      <View style={{ flex: 1 }}>
        <View style={[styles.when, dim && styles.dim]}>
          <Txt variant="title" style={styles.date}>
            {occurrence.kind === 'timed'
              ? formatBaDateShort(occurrence.startsAt)
              : whenText(occurrence)}
          </Txt>
          {occurrence.kind === 'timed' ? (
            <Txt tone="accent" style={styles.time}>
              {formatBaTime(occurrence.startsAt)}
            </Txt>
          ) : null}
        </View>
        {occurrence.scheduleText ? (
          <Txt variant="small" tone="muted">
            {occurrence.scheduleText}
          </Txt>
        ) : null}
        {showVenue && (occurrence.venueName || occurrence.room) ? (
          <Txt variant="small" tone="muted">
            {[occurrence.venueName, occurrence.room].filter(Boolean).join(' · ')}
          </Txt>
        ) : occurrence.room ? (
          <Txt variant="small" tone="muted">
            {occurrence.room}
          </Txt>
        ) : null}
        {occurrence.priceVerified && occurrence.priceText ? (
          <Txt variant="small" tone="muted">
            {occurrence.priceText}
          </Txt>
        ) : null}
      </View>
      {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
      {onAddToCalendar && occurrence.status !== 'cancelled' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Agregar al calendario: ${whenText(occurrence)}`}
          onPress={onAddToCalendar}
          style={styles.iconButton}
        >
          <Ionicons name="calendar-outline" size={22} color={c.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  when: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.md },
  date: { fontSize: 20, lineHeight: 26 },
  time: { fontFamily: fonts.bodySemi },
  dim: { textDecorationLine: 'line-through', opacity: 0.6 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
