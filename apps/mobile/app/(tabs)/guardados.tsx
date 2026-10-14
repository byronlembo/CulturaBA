import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import type { UserAction } from '@/api/types';
import { EventCard } from '@/components/ui/EventCard';
import { Button, Chip, EmptyState, ErrorState, Loading, Screen } from '@/components/ui/Primitives';
import { useEventsByIds, useMyActions } from '@/features/hooks';
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
  const events = useEventsByIds(ids);
  const ordered = useMemo(() => {
    const byId = new Map((events.data ?? []).map((e) => [e.id, e]));
    return ids.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  }, [ids, events.data]);

  const header = (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
      }}
    >
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
            message={error.message}
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
                    : 'Nada recomendado aún'
              }
              body="Desde la ficha de un evento podés guardarlo, marcar que vas o recomendarlo."
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
