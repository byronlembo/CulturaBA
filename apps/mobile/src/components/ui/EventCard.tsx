import { type DisciplineSlug, disciplineLabel, localDateOf } from '@culturaba/shared';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { EventSummary } from '@/api/types';
import { formatBaDateRange, formatBaDateTimeShort } from '@/lib/dates';
import { disciplineIcon } from '@/lib/disciplineIcons';
import { radius, spacing, useColors } from '@/theme/tokens';
import { EventImage } from './EventImage';
import { Card, Txt } from './Primitives';

/** Texto de "cuándo" para una tarjeta: próxima función, rango de una muestra o "en curso". */
export function eventWhen(e: EventSummary): string {
  if (!e.nextStartsAt) return 'Sin fechas próximas';
  // Los instantes llegan en UTC: convertir a fecha local de Buenos Aires antes de mostrar.
  const start = localDateOf(e.nextStartsAt);
  if (e.isOngoing && e.lastEndsAt) {
    const until = formatBaDateRange(start, localDateOf(e.lastEndsAt)).replace(/^Del .* al /, '');
    return `En curso · hasta ${until}`;
  }
  if (e.nextKind === 'range' && e.nextEndsAt) {
    return formatBaDateRange(start, localDateOf(e.nextEndsAt));
  }
  const when = formatBaDateTimeShort(e.nextStartsAt);
  return e.upcomingCount > 1 ? `${when} · +${e.upcomingCount - 1} fechas` : when;
}

export function EventCard({ event, compact }: { event: EventSummary; compact?: boolean }) {
  const c = useColors();
  const discipline = event.primaryDiscipline as DisciplineSlug | null;
  return (
    <Link href={`/event/${event.slug}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${event.title}, ${eventWhen(event)}`}
      >
        <Card style={[styles.card, compact && styles.compact]}>
          <EventImage
            imageUrl={event.imageUrl}
            imageSource={event.imageSource}
            discipline={event.primaryDiscipline}
            style={compact ? styles.imageCompact : styles.image}
          />
          <View style={styles.body}>
            <View style={styles.row}>
              <Ionicons name={disciplineIcon(discipline)} size={14} color={c.accent} />
              <Txt variant="caption" tone="accent" style={{ marginLeft: 6 }}>
                {discipline ? disciplineLabel(discipline) : 'Cultura'}
              </Txt>
              {event.isFree === true ? (
                <Txt variant="caption" tone="muted" style={{ marginLeft: 'auto' }}>
                  Gratis
                </Txt>
              ) : null}
            </View>
            <Txt variant={compact ? 'heading' : 'title'} numberOfLines={2} style={{ marginTop: 4 }}>
              {event.title}
            </Txt>
            <Txt variant="small" tone="muted" style={{ marginTop: 6 }} numberOfLines={1}>
              {eventWhen(event)}
            </Txt>
            <Txt variant="small" tone="muted" numberOfLines={1}>
              {event.venueName ?? event.institutionName}
            </Txt>
            {event.attendingCount + event.recommendCount > 0 ? (
              <View style={[styles.row, { marginTop: 8 }]}>
                {event.attendingCount > 0 ? (
                  <Txt variant="caption" tone="muted">
                    {event.attendingCount} van
                  </Txt>
                ) : null}
                {event.recommendCount > 0 ? (
                  <Txt
                    variant="caption"
                    tone="muted"
                    style={{ marginLeft: event.attendingCount > 0 ? 10 : 0 }}
                  >
                    {event.recommendCount} recomiendan
                  </Txt>
                ) : null}
              </View>
            ) : null}
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  compact: { flexDirection: 'row' },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#2A2540' },
  imageCompact: {
    width: 110,
    height: '100%',
    minHeight: 110,
    backgroundColor: '#2A2540',
    borderRadius: radius.md,
  },
  body: { padding: spacing.md, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
