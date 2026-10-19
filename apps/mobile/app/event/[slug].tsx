import {
  buildEventUrl,
  buildMapUrl,
  buildShareMessage,
  type DisciplineSlug,
  descriptionPreview,
  disciplineLabel,
} from '@culturaba/shared';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EventDetail, UserAction } from '@/api/types';
import { EventImage } from '@/components/ui/EventImage';
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
import { EventDates } from '@/features/event/EventDates';
import {
  useEvent,
  useEventSources,
  useHasAction,
  useOccurrences,
  useStats,
  useToggleAction,
} from '@/features/hooks';
import { relativeTimeEs, whenText } from '@/lib/dates';
import { env } from '@/lib/env';
import { fonts, radius, spacing, useColors } from '@/theme/tokens';

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
      style={({ pressed }) => [
        styles.action,
        active
          ? { backgroundColor: c.accent, borderColor: c.accent }
          : { borderColor: c.borderStrong },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Ionicons name={icon} size={20} color={active ? c.onAccent : c.text} />
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

/** "Sobre el evento": el comienzo del texto oficial y, si es largo, "Leer más". */
function AboutEvent({ text, attribution }: { text: string; attribution: string | null }) {
  const [open, setOpen] = useState(false);
  const preview = descriptionPreview(text);
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Txt variant="section" role="heading" aria-level={2}>
        Sobre el evento
      </Txt>
      <Txt style={{ marginTop: 4 }}>{open || !preview.more ? text : preview.text}</Txt>
      {preview.more ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Txt variant="small" tone="accent" style={{ fontFamily: fonts.bodySemi }}>
            {open ? 'Leer menos' : 'Leer más'}
          </Txt>
        </Pressable>
      ) : null}
      {attribution ? (
        <Txt variant="caption" tone="muted" style={{ marginTop: 6 }}>
          {attribution}
        </Txt>
      ) : null}
    </View>
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
        <Txt variant="small" tone="muted">
          {[discipline ? disciplineLabel(discipline) : 'Cultura', event.institutionName]
            .filter(Boolean)
            .join(' · ')}
        </Txt>
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
            style={[styles.action, { borderColor: c.borderStrong }]}
          >
            <Ionicons name="share-outline" size={20} color={c.text} />
            <Txt variant="caption" style={{ marginTop: 4 }}>
              Compartir
            </Txt>
          </Pressable>
        </View>

        <Txt variant="section" role="heading" aria-level={2} style={{ marginTop: spacing.xl }}>
          Fechas
        </Txt>
        {occurrences.isPending ? (
          <Loading />
        ) : (
          <EventDates event={event} occurrences={occurrences.data ?? []} />
        )}

        <DiarySection eventId={event.id} occurrences={occurrences.data ?? []} />

        {event.venueName ? (
          <Card style={{ marginTop: spacing.xl, padding: spacing.lg }}>
            <Txt variant="title" style={{ fontSize: 20 }}>
              {event.venueName}
            </Txt>
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
                  variant="ghost"
                  icon="navigate-outline"
                  onPress={() => void Linking.openURL(mapUrl)}
                />
              </View>
            ) : null}
          </Card>
        ) : null}

        {event.priceVerified && event.priceText ? (
          <View style={{ marginTop: spacing.xl }}>
            <Txt variant="section" role="heading" aria-level={2}>
              Entradas
            </Txt>
            <Txt style={{ marginTop: 4 }}>{event.priceText}</Txt>
          </View>
        ) : event.isFree === true ? (
          <View style={{ marginTop: spacing.xl }}>
            <Txt variant="section" role="heading" aria-level={2}>
              Entradas
            </Txt>
            <Txt style={{ marginTop: 4 }}>Entrada gratuita</Txt>
          </View>
        ) : null}

        {event.aiSummary ? (
          <View style={{ marginTop: spacing.xl }}>
            <Txt variant="section" role="heading" aria-level={2}>
              Qué esperar
            </Txt>
            <Txt style={{ marginTop: 4 }}>{event.aiSummary}</Txt>
            <Txt variant="caption" tone="muted" style={{ marginTop: 4 }}>
              Resumen generado automáticamente a partir del texto oficial.
            </Txt>
          </View>
        ) : null}

        {event.description ? (
          <AboutEvent text={event.description} attribution={event.descriptionAttribution} />
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
  hero: { width: '100%', aspectRatio: 16 / 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  provenance: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
