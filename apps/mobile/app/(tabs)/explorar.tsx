import { SELECTABLE_DISCIPLINES } from '@culturaba/shared';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { EventList } from '@/components/ui/EventList';
import { Chip, Screen, Txt } from '@/components/ui/Primitives';
import {
  DATE_PRESETS,
  filtersReducer,
  hasActiveFilters,
  initialFilters,
  presetRange,
} from '@/features/explore/filters';
import { useEventsInfinite } from '@/features/hooks';
import { MapView } from '@/features/map/MapView';
import { disciplineIcon } from '@/lib/disciplineIcons';
import { radius, spacing, useColors } from '@/theme/tokens';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Explore() {
  const c = useColors();
  const [filters, dispatch] = useReducer(filtersReducer, initialFilters);
  const q = useDebounced(filters.q, 300);

  const catalogFilters = useMemo(() => {
    const range = presetRange(filters.datePreset);
    return {
      q: q.trim() || undefined,
      disciplines: filters.disciplines.length ? filters.disciplines : undefined,
      from: range?.from,
      to: range?.to,
      freeOnly: filters.freeOnly || undefined,
    };
  }, [q, filters.disciplines, filters.datePreset, filters.freeOnly]);

  const [mode, setMode] = useState<'map' | 'list'>('map');
  const query = useEventsInfinite(catalogFilters, mode === 'list');

  const header = (
    <View style={{ paddingBottom: spacing.sm }}>
      <View
        style={[
          styles.search,
          { backgroundColor: c.surface, borderColor: c.border, marginHorizontal: spacing.lg },
        ]}
      >
        <Ionicons name="search-outline" size={18} color={c.muted} />
        <TextInput
          accessibilityLabel="Buscar eventos"
          placeholder="Título, institución, artista…"
          placeholderTextColor={c.muted}
          value={filters.q}
          onChangeText={(t) => dispatch({ type: 'query', q: t })}
          style={[styles.input, { color: c.text }]}
          returnKeyType="search"
          autoCorrect={false}
        />
        {filters.q ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Borrar búsqueda"
            onPress={() => dispatch({ type: 'query', q: '' })}
          >
            <Ionicons name="close-circle" size={18} color={c.muted} />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.chips, { flexDirection: 'row' }]}>
        <Chip
          label="Mapa"
          icon="map-outline"
          selected={mode === 'map'}
          onPress={() => setMode('map')}
        />
        <Chip
          label="Lista"
          icon="list-outline"
          selected={mode === 'list'}
          onPress={() => setMode('list')}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {DATE_PRESETS.map((p) => (
          <Chip
            key={p.key}
            label={p.label}
            selected={filters.datePreset === p.key}
            onPress={() => dispatch({ type: 'datePreset', preset: p.key })}
          />
        ))}
        <Chip
          label="Gratis"
          icon="pricetag-outline"
          selected={filters.freeOnly}
          onPress={() => dispatch({ type: 'freeOnly', value: !filters.freeOnly })}
        />
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {SELECTABLE_DISCIPLINES.map((d) => (
          <Chip
            key={d.slug}
            label={d.shortLabel}
            icon={disciplineIcon(d.slug)}
            selected={filters.disciplines.includes(d.slug)}
            onPress={() => dispatch({ type: 'toggleDiscipline', slug: d.slug })}
          />
        ))}
      </ScrollView>
      {hasActiveFilters(filters) ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => dispatch({ type: 'reset' })}
          style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}
        >
          <Txt variant="small" tone="accent">
            Limpiar filtros
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );

  if (mode === 'map')
    return (
      <Screen>
        <MapView header={header} filters={catalogFilters} />
      </Screen>
    );

  return (
    <Screen>
      <EventList
        query={query}
        header={header}
        empty={{
          title: hasActiveFilters(filters)
            ? 'Nada con esos filtros'
            : 'No hay eventos publicados todavía',
          body: hasActiveFilters(filters)
            ? 'Probá con otra búsqueda o quitá algún filtro.'
            : 'Las agendas se actualizan varias veces por día.',
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  input: { flex: 1, alignSelf: 'stretch', fontSize: 15, paddingVertical: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
