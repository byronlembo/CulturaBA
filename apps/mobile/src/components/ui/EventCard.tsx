import {
  type DisciplineSlug,
  disciplineLabel,
  formatBaTime,
  localDateOf,
  MONTHS_ES_SHORT,
  toBa,
  WEEKDAYS_ES_SHORT,
} from '@culturaba/shared';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { EventSummary } from '@/api/types';
import { formatBaDateRange, formatBaDateTimeShort } from '@/lib/dates';
import { fonts, radius, spacing, useColors } from '@/theme/tokens';
import { EventImage } from './EventImage';
import { Card, Txt } from './Primitives';

const moreDates = (n: number) => `+${n} ${n === 1 ? 'fecha' : 'fechas'}`;

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
  return e.upcomingCount > 1 ? `${when} · ${moreDates(e.upcomingCount - 1)}` : when;
}

/** Columna de fecha del talón (hora de BA): "vie / 16 / oct", o "hasta / 13 / dic" si está en curso. */
export function ticketDate(e: EventSummary): { top: string; day: string; bottom: string } | null {
  if (!e.nextStartsAt) return null;
  const until = e.isOngoing && e.lastEndsAt ? e.lastEndsAt : null;
  const dt = toBa(until ?? e.nextStartsAt);
  return {
    top: until ? 'hasta' : (WEEKDAYS_ES_SHORT[dt.weekday - 1] ?? ''),
    day: String(dt.day),
    bottom: MONTHS_ES_SHORT[dt.month - 1] ?? '',
  };
}

/** Línea bajo el título: hora destacada (si es una función) y el resto de las fechas. */
export function ticketDetail(e: EventSummary): { time: string | null; note: string | null } {
  if (!e.nextStartsAt) return { time: null, note: 'Sin fechas próximas' };
  if (e.isOngoing) return { time: null, note: 'En curso' };
  if (e.nextKind === 'range') return { time: null, note: eventWhen(e) };
  const more = e.upcomingCount > 1 ? moreDates(e.upcomingCount - 1) : null;
  if (e.nextKind === 'all_day')
    return { time: null, note: ['Todo el día', more].filter(Boolean).join(' · ') };
  return { time: formatBaTime(e.nextStartsAt), note: more };
}

export function EventCard({ event, compact }: { event: EventSummary; compact?: boolean }) {
  const c = useColors();
  const discipline = event.primaryDiscipline as DisciplineSlug | null;
  const date = compact ? null : ticketDate(event);
  const detail = ticketDetail(event);
  return (
    <Link href={`/event/${event.slug}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={[
          event.title,
          eventWhen(event),
          event.venueName,
          discipline ? disciplineLabel(discipline) : null,
          event.isFree === true ? 'Gratis' : null,
        ]
          .filter(Boolean)
          .join(', ')}
      >
        <Card style={[styles.card, compact && styles.compact]}>
          <EventImage
            imageUrl={event.imageUrl}
            imageSource={event.imageSource}
            discipline={event.primaryDiscipline}
            accessibilityLabel={event.title}
            style={compact ? styles.imageCompact : styles.image}
          />
          {compact ? null : (
            <>
              {/* Talón de entrada: dos muescas y la línea de corte. */}
              <View style={styles.perforation}>
                <View style={[styles.notch, styles.notchLeft, { backgroundColor: c.bg }]} />
                <View style={[styles.notch, styles.notchRight, { backgroundColor: c.bg }]} />
              </View>
              {/* shortcut: borde punteado de un solo lado sale liso en iOS; dibujar guiones si molesta. */}
              <View style={[styles.cut, { borderColor: c.borderStrong }]} />
            </>
          )}
          <View style={styles.body}>
            {date ? (
              <View style={styles.date}>
                <Txt variant="caption" tone="muted">
                  {date.top}
                </Txt>
                <Txt variant="numeral">{date.day}</Txt>
                <Txt variant="caption" tone="muted">
                  {date.bottom}
                </Txt>
              </View>
            ) : null}
            <View style={styles.info}>
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {[
                  discipline ? disciplineLabel(discipline) : 'Cultura',
                  event.venueName ?? event.institutionName,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Txt>
              <Txt variant="title" numberOfLines={2} style={compact && styles.titleCompact}>
                {event.title}
              </Txt>
              <View style={styles.row}>
                <Txt variant="small" tone="muted" numberOfLines={1} style={styles.shrink}>
                  {detail.time ? (
                    <Txt variant="small" tone="accent" style={{ fontFamily: fonts.bodySemi }}>
                      {detail.time}
                    </Txt>
                  ) : null}
                  {detail.time && detail.note ? ' · ' : null}
                  {detail.note}
                </Txt>
                {event.isFree === true ? (
                  <Txt variant="small" tone="accent" style={styles.free}>
                    Gratis
                  </Txt>
                ) : null}
              </View>
              {event.attendingCount + event.recommendCount > 0 ? (
                <Txt variant="caption" tone="muted">
                  {[
                    event.attendingCount > 0
                      ? `${event.attendingCount} ${event.attendingCount === 1 ? 'va' : 'van'}`
                      : null,
                    event.recommendCount > 0
                      ? `${event.recommendCount} ${event.recommendCount === 1 ? 'recomienda' : 'recomiendan'}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Txt>
              ) : null}
            </View>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

const NOTCH = 20;

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  compact: { flexDirection: 'row' },
  image: { width: '100%', aspectRatio: 2 },
  imageCompact: {
    width: 110,
    height: '100%',
    minHeight: 110,
    borderRadius: radius.md,
  },
  perforation: { height: 0, zIndex: 1 },
  notch: {
    position: 'absolute',
    top: -NOTCH / 2,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
  },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  cut: { borderTopWidth: 2, borderStyle: 'dashed', marginHorizontal: spacing.lg },
  body: { flexDirection: 'row', gap: spacing.lg, padding: spacing.lg, flex: 1 },
  date: { width: 44, alignItems: 'center' },
  info: { flex: 1, minWidth: 0, gap: 4 },
  titleCompact: { fontSize: 19, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center' },
  shrink: { flexShrink: 1 },
  free: { marginLeft: 'auto', paddingLeft: spacing.sm, fontFamily: fonts.bodySemi },
});
