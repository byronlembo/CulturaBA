import { StyleSheet, View } from 'react-native';
import type { Occurrence } from '@/api/types';
import { formatBaDateTimeShort, whenText } from '@/lib/dates';
import { spacing, useColors } from '@/theme/tokens';
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
}: {
  occurrence: Occurrence;
  showVenue?: boolean;
}) {
  const c = useColors();
  const badge = statusBadge(occurrence);
  const dim = occurrence.status === 'cancelled';
  return (
    <View
      style={[styles.row, { borderColor: c.border }]}
      accessibilityLabel={`${whenText(occurrence)}${badge ? `, ${badge.label}` : ''}`}
    >
      <View style={{ flex: 1 }}>
        <Txt variant="heading" style={dim ? styles.dim : undefined}>
          {whenText(occurrence)}
        </Txt>
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  dim: { textDecorationLine: 'line-through', opacity: 0.6 },
});
