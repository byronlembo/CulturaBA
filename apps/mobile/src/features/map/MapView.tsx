import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { CatalogFilters } from '@/api/types';
import { Button, Card, EmptyState, ErrorState, Loading, Txt } from '@/components/ui/Primitives';
import { useEventsForMap } from '@/features/hooks';
import { currentPosition } from '@/features/points/points';
import { formatBaDateTimeShort } from '@/lib/dates';
import { spacing } from '@/theme/tokens';
import { EventMap } from './EventMap';
import { formatDistance, type LatLng, venuePins } from './venues';

/** Explorar en modo mapa: salas con eventos del filtro y, si se comparte, la ubicación. */
export function MapView({ header, filters }: { header: React.ReactNode; filters: CatalogFilters }) {
  const events = useEventsForMap(filters, true);
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const pins = useMemo(() => venuePins(events.data ?? [], me), [events.data, me]);
  const ordered = selected
    ? [...pins.filter((p) => p.key === selected), ...pins.filter((p) => p.key !== selected)]
    : pins;

  const locate = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const p = await currentPosition();
      setMe({ lat: p.lat, lng: p.lng });
    } catch (err) {
      setLocError((err as Error).message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      {header}
      <EventMap pins={pins} me={me} selected={selected} onSelect={setSelected} height={360} />
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {me ? (
          <Txt variant="small" tone="muted">
            Ordenado por cercanía. Tu ubicación no se guarda.
          </Txt>
        ) : (
          <>
            <Button
              label="Ver lo que está cerca"
              variant="secondary"
              icon="locate-outline"
              loading={locating}
              onPress={() => void locate()}
            />
            <Txt variant="small" tone="muted">
              Usamos tu ubicación solo para ordenar las salas por cercanía. No se guarda.
            </Txt>
          </>
        )}
        {locError ? (
          <Txt variant="caption" tone="danger">
            {locError}
          </Txt>
        ) : null}
        {events.isPending ? (
          <Loading />
        ) : events.error ? (
          <ErrorState title="No pudimos cargar el mapa" onRetry={() => void events.refetch()} />
        ) : ordered.length === 0 ? (
          <EmptyState
            icon="map-outline"
            title="Nada en el mapa con esos filtros"
            body="Probá con otra búsqueda o quitá algún filtro."
          />
        ) : (
          ordered.slice(0, 40).map((p) => (
            <Card key={p.key} style={{ padding: spacing.md, gap: spacing.sm }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSelected(p.key)}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Txt variant="heading">{p.name}</Txt>
                <Txt variant="small" tone="muted">
                  {p.distance !== null ? `${formatDistance(p.distance)} · ` : ''}
                  {p.events.length} {p.events.length === 1 ? 'evento' : 'eventos'}
                </Txt>
              </Pressable>
              {p.events.slice(0, p.key === selected ? 10 : 3).map((e) => (
                <Link key={e.id} href={`/event/${e.slug}`} asChild>
                  <Pressable accessibilityRole="link">
                    {/* Sin style en el Pressable: Link asChild lo pasa al <a> (ver roadmap). */}
                    <View style={{ minHeight: 44, justifyContent: 'center' }}>
                      <Txt>{e.title}</Txt>
                      {e.nextStartsAt ? (
                        <Txt variant="caption" tone="muted">
                          {formatBaDateTimeShort(e.nextStartsAt)}
                        </Txt>
                      ) : null}
                    </View>
                  </Pressable>
                </Link>
              ))}
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}
