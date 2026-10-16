import {
  buildEventUrl,
  buildMapUrl,
  buildShareMessage,
  type DisciplineSlug,
  disciplineLabel,
  firstParagraph,
} from '@culturaba/shared';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EventDetail, UserAction } from '@/api/types';
import { EventImage } from '@/components/ui/EventImage';
import { OccurrenceRow } from '@/components/ui/OccurrenceRow';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
  Txt,
} from '@/components/ui/Primitives';
import { DiarySection } from '@/features/diary/DiarySection';
import {
  useEvent,
  useEventSources,
  useHasAction,
  useOccurrences,
  useStats,
  useToggleAction,
} from '@/features/hooks';
import { CheckInCard } from '@/features/points/CheckInCard';
import { addToCalendar, calendarEntry } from '@/lib/calendar';
import { relativeTimeEs, whenText } from '@/lib/dates';
import { disciplineIcon } from '@/lib/disciplineIcons';
import { env } from '@/lib/env';
import { radius, spacing, useColors } from '@/theme/tokens';

function ActionButton({
  eventId,
  action,
  icon,
  label,
  count,
}: {
  eventId: string;
  action: UserAction;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
}) {
  const c = useColors();
  const active = useHasAction(eventId, action);
  const toggle = useToggleAction(eventId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}${count ? `, ${count}` : ''}`}
      onPress={() => toggle.mutate({ action, next: !active })}
      style={[styles.action, { backgroundColor: active ? c.accent : c.surfaceAlt }]}
    >
      <Ionicons name={icon} size={18} color={active ? c.onAccent : c.text} />
      <Txt variant="caption" style={{ color: active ? c.onAccent : c.text, marginTop: 4 }}>
        {label}
      </Txt>
      {count > 0 ? (
        <Txt variant="caption" style={{ color: active ? c.onAccent : c.muted }}>
          {count}
        </Txt>
      ) : null}
    </Pressable>
  );
}

function Body({ event }: { event: EventDetail }) {
  const c = useColors();
  const occurrences = useOccurrences(event.id);
  const sources = useEventSources(event.id);
  const stats = useStats(event.id);
  const discipline = event.primaryDiscipline as DisciplineSlug | null;
  const next = occurrences.data?.find(
    (o) => o.status !== 'cancelled' && Date.parse(o.endsAt ?? o.startsAt) >= Date.now(),
  );
  const eventUrl = buildEventUrl(env.webBaseUrl, event.slug);
  const mapUrl = buildMapUrl(
    {
      name: event.venueName,
      address: event.venueAddress,
      lat: event.venueLat,
      lng: event.venueLng,
    },
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
  );
  const summary = event.description ? firstParagraph(event.description, 220) : null;

  async function share() {
    const message = buildShareMessage({
      title: event.title,
      whenText: next ? whenText(next) : null,
      venueName: event.venueName,
      eventUrl,
      officialUrl: event.officialUrl,
    });
    await Share.share(
      Platform.OS === 'ios'
        ? { message, url: eventUrl, title: event.title }
        : { message, title: event.title },
    );
  }

  return (
    <>
      <EventImage
        imageUrl={event.imageUrl}
        imageSource={event.imageSource}
        discipline={event.primaryDiscipline}
        accessibilityLabel={event.title}
        style={styles.hero}
      />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <View style={styles.row}>
          <Ionicons name={disciplineIcon(discipline)} size={14} color={c.accent} />
          <Txt variant="caption" tone="accent" style={{ marginLeft: 6 }}>
            {discipline ? disciplineLabel(discipline) : 'Cultura'}
          </Txt>
          <Txt variant="caption" tone="muted" style={{ marginLeft: 'auto' }}>
            {event.institutionName}
          </Txt>
        </View>
        <Txt variant="display" style={{ marginTop: spacing.sm }} accessibilityRole="header">
          {event.title}
        </Txt>
        {event.subtitle ? (
          <Txt tone="muted" style={{ marginTop: 4 }}>
            {event.subtitle}
          </Txt>
        ) : null}
        {event.imageCredit ? (
          <Txt variant="caption" tone="muted" style={{ marginTop: 4 }}>
            Foto: {event.imageCredit}
          </Txt>
        ) : null}

        <View style={[styles.actions, { marginTop: spacing.lg }]}>
          <ActionButton
            eventId={event.id}
            action="attending"
            icon="checkmark-circle-outline"
            label="Asistiré"
            count={stats.data?.attending ?? event.attendingCount}
          />
          <ActionButton
            eventId={event.id}
            action="recommend"
            icon="thumbs-up-outline"
            label="Recomiendo"
            count={stats.data?.recommend ?? event.recommendCount}
          />
          <ActionButton
            eventId={event.id}
            action="save"
            icon="bookmark-outline"
            label="Guardar"
            count={0}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartir"
            onPress={() => void share()}
            style={[styles.action, { backgroundColor: c.surfaceAlt }]}
          >
            <Ionicons name="share-outline" size={18} color={c.text} />
            <Txt variant="caption" style={{ marginTop: 4 }}>
              Compartir
            </Txt>
          </Pressable>
        </View>

        <Txt variant="heading" style={{ marginTop: spacing.xl }}>
          Fechas
        </Txt>
        {occurrences.isPending ? (
          <Loading />
        ) : occurrences.data && occurrences.data.length > 0 ? (
          occurrences.data.map((o) => (
            <OccurrenceRow
              key={o.id}
              occurrence={o}
              showVenue={Boolean(o.venueName && o.venueName !== event.venueName)}
              onAddToCalendar={
                Date.parse(o.endsAt ?? o.startsAt) >= Date.now()
                  ? () => addToCalendar(calendarEntry(event, o), event.slug)
                  : undefined
              }
            />
          ))
        ) : (
          <Txt tone="muted">No hay funciones próximas publicadas.</Txt>
        )}

        <CheckInCard occurrences={occurrences.data ?? []} />
        <DiarySection eventId={event.id} occurrences={occurrences.data ?? []} />

        {event.venueName ? (
          <Card style={{ marginTop: spacing.xl, padding: spacing.md }}>
            <Txt variant="heading">{event.venueName}</Txt>
            {event.venueAddress ? (
              <Txt tone="muted" style={{ marginTop: 2 }}>
                {event.venueAddress}
                {event.venueNeighborhood ? ` · ${event.venueNeighborhood}` : ''}
              </Txt>
            ) : null}
            {mapUrl ? (
              <View style={{ marginTop: spacing.md }}>
                <Button
                  label="Cómo llegar"
                  variant="secondary"
                  icon="navigate-outline"
                  onPress={() => void Linking.openURL(mapUrl)}
                />
              </View>
            ) : null}
          </Card>
        ) : null}

        {event.priceVerified && event.priceText ? (
          <View style={{ marginTop: spacing.xl }}>
            <Txt variant="heading">Entradas</Txt>
            <Txt style={{ marginTop: 4 }}>{event.priceText}</Txt>
          </View>
        ) : event.isFree === true ? (
          <View style={{ marginTop: spacing.xl }}>
            <Txt variant="heading">Entradas</Txt>
            <Txt style={{ marginTop: 4 }}>Entrada gratuita</Txt>
          </View>
        ) : null}

        {event.aiSummary ? (
          <View style={{ marginTop: spacing.xl }}>
            <Txt variant="heading">Qué esperar</Txt>
            <Txt style={{ marginTop: 4 }}>{event.aiSummary}</Txt>
            <Txt variant="caption" tone="muted" style={{ marginTop: 4 }}>
              Resumen generado automáticamente a partir del texto oficial.
            </Txt>
          </View>
        ) : summary ? (
          <View style={{ marginTop: spacing.xl }}>
            <Txt variant="heading">En breve</Txt>
            <Txt style={{ marginTop: 4 }}>{summary}</Txt>
          </View>
        ) : null}

        {event.description ? (
          <View style={{ marginTop: spacing.xl }}>
            <Txt variant="heading">Sobre el evento</Txt>
            <Txt style={{ marginTop: 4 }}>{event.description}</Txt>
            {event.descriptionAttribution ? (
              <Txt variant="caption" tone="muted" style={{ marginTop: 6 }}>
                {event.descriptionAttribution}
              </Txt>
            ) : null}
          </View>
        ) : null}

        {event.durationMinutes || event.language || event.ageRating ? (
          <Txt variant="small" tone="muted" style={{ marginTop: spacing.lg }}>
            {[
              event.durationMinutes ? `${event.durationMinutes} min` : null,
              event.language,
              event.ageRating,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Txt>
        ) : null}

        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          {event.ticketsUrl ? (
            <Button
              label="Entradas"
              icon="ticket-outline"
              onPress={() => void WebBrowser.openBrowserAsync(event.ticketsUrl ?? '')}
            />
          ) : null}
          {event.officialUrl ? (
            <Button
              label="Sitio oficial"
              variant="secondary"
              icon="open-outline"
              onPress={() => void WebBrowser.openBrowserAsync(event.officialUrl ?? '')}
            />
          ) : null}
        </View>

        <View style={[styles.provenance, { borderColor: c.border }]}>
          <Ionicons name="shield-checkmark-outline" size={14} color={c.muted} />
          <Txt variant="caption" tone="muted" style={{ marginLeft: 6, flex: 1 }}>
            {sources.data && sources.data.length > 0
              ? `Fuente: ${sources.data.map((s) => s.sourceName).join(', ')}`
              : 'Fuente oficial'}
            {event.lastVerifiedAt ? ` · Verificado ${relativeTimeEs(event.lastVerifiedAt)}` : ''}
          </Txt>
        </View>
      </View>
    </>
  );
}

export default function EventScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const query = useEvent(slug ?? '');

  return (
    <Screen>
      <Stack.Screen options={{ title: query.data?.institutionName ?? '' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState title="No pudimos cargar el evento" onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <EmptyState
            icon="help-circle-outline"
            title="Este evento ya no está disponible"
            body="Puede haber sido retirado de la agenda oficial."
          />
        ) : (
          <Body event={query.data} />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', aspectRatio: 16 / 10, backgroundColor: '#2A2540' },
  row: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md },
  provenance: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
