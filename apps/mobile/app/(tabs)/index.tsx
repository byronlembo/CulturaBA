import { type DisciplineSlug, disciplineLabel } from '@culturaba/shared';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { EventList } from '@/components/ui/EventList';
import { Button, Chip, Screen, Txt } from '@/components/ui/Primitives';
import { useEventsInfinite, useInterests } from '@/features/hooks';
import { disciplineIcon } from '@/lib/disciplineIcons';
import { spacing } from '@/theme/tokens';

export default function ForYou() {
  const router = useRouter();
  const { interests } = useInterests();
  const filters = useMemo(() => ({ disciplines: interests }), [interests]);
  const query = useEventsInfinite(filters);

  const header = (
    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
      <Txt tone="muted">Próximos eventos según tus intereses</Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.md }}
      >
        {interests.map((slug) => (
          <Chip
            key={slug}
            label={disciplineLabel(slug as DisciplineSlug)}
            icon={disciplineIcon(slug)}
            selected
            small
          />
        ))}
        <Chip
          label="Editar"
          icon="create-outline"
          small
          onPress={() => router.push('/(tabs)/perfil')}
        />
      </ScrollView>
    </View>
  );

  return (
    <Screen>
      <EventList
        query={query}
        header={header}
        empty={{
          title: 'Todavía no hay eventos de tus intereses',
          body: 'Probá Explorar o sumá otro interés desde tu perfil.',
          action: (
            <Button
              label="Explorar todo"
              variant="secondary"
              icon="search-outline"
              onPress={() => router.push('/(tabs)/explorar')}
            />
          ),
        }}
      />
    </Screen>
  );
}
