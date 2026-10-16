import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import type { UserAction } from '@/api/types';
import { EventCard } from '@/components/ui/EventCard';
import { statusBadge } from '@/components/ui/OccurrenceRow';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
  Txt,
} from '@/components/ui/Primitives';
import { useEventsByIds, useMyActions, usePlanChanges } from '@/features/hooks';
import { whenText } from '@/lib/dates';
import { spacing } from '@/theme/tokens';

const TABS: {
  key: UserAction;
  label: string;
  icon: 'bookmark-outline' | 'checkmark-circle-outline' | 'thumbs-up-outline';
}[] = [
  { key: 'save', label: 'Guardados', icon: 'bookmark-outline' },
  { key: 'attending', label: 'Asistiré', icon: 'checkmark-circle-outline' },
  { key: 'recommend', label: 'Recomendados', icon: 'thumbs-up-outline' },
];

export default function Saved() {
  const router = useRouter();
  const [tab, setTab] = useState<UserAction>('save');
  const actions = useMyActions();
  const ids = useMemo(
    () => (actions.data ?? []).filter((a) => a.action === tab).map((a) => a.eventId),
    [actions.data, tab],
  );
  const planIds = useMemo(
    () => [
      ...new Set(
        (actions.data ?? []).filter((a) => a.action !== 'recommend').map((a) => a.eventId),
      ),
    ],
    [actions.data],
  );
  const changes = usePlanChanges(planIds);
  const events = useEventsByIds(ids);
  const titles = useEventsByIds(planIds);
  const ordered = useMemo(() => {
    const byId = new Map((events.data ?? []).map((e) => [e.id, e]));
    return ids.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  }, [ids, events.data]);

  const eventsById = new Map((titles.data ?? []).map((e) => [e.id, e]));
  const header = (
    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }}>
      {changes.length > 0 ? (
        <Card style={{ padding: spacing.md, gap: spacing.sm }}>
          <Txt variant="heading">Cambios en tus planes</Txt>
          {changes.map((o) => {
            const event = eventsById.get(o.eventId);
            return (
              <Link key={o.id} href={`/event/${event?.slug ?? o.eventId}`} asChild>
                <Pressable accessibilityRole="link">
                  <View>
                    <Txt>{event?.title ?? 'Evento'}</Txt>
                    <Txt variant="small" tone="muted">
                      {statusBadge(o)?.label} · {whenText(o)}
                    </Txt>
                  </View>
                </Pressable>
              </Link>
            );
          })}
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {TABS.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            icon={t.icon}
            selected={tab === t.key}
            onPress={() => setTab(t.key)}
          />
        ))}
      </View>
    </View>
  );

  const loading = actions.isPending || (ids.length > 0 && events.isPending);
  const error = actions.error ?? events.error;

  return (
    <Screen>
      {loading ? (
        <>
          {header}
          <Loading />
        </>
      ) : error ? (
        <>
          {header}
          <ErrorState
            title="No pudimos cargar tus guardados"
            onRetry={() => {
              void actions.refetch();
              void events.refetch();
            }}
          />
        </>
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EventCard event={item} compact />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon={TABS.find((t) => t.key === tab)?.icon}
              title={
                tab === 'save'
                  ? 'Todavía no guardaste nada'
                  : tab === 'attending'
                    ? 'Sin planes confirmados'
                    : 'Todavía no recomendaste nada'
              }
              body="Desde la ficha de un evento podés guardarlo, marcar «Asistiré» o recomendarlo."
              action={
                <Button
                  label="Explorar"
                  variant="secondary"
                  icon="search-outline"
                  onPress={() => router.push('/(tabs)/explorar')}
                />
              }
            />
          }
          contentContainerStyle={{ paddingTop: spacing.md, flexGrow: 1 }}
        />
      )}
    </Screen>
  );
}
