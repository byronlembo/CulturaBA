import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { CatalogFilters } from '@/api/types';
import { eventWhen } from '@/components/ui/EventCard';
import { Txt } from '@/components/ui/Primitives';
import { useEventsForMap } from '@/features/hooks';
import { currentPosition } from '@/features/points/points';
import { fonts, radius, spacing, useColors } from '@/theme/tokens';
import { EventMap } from './EventMap';
import { formatDistance, type LatLng, venuePins } from './venues';

/**
 * Explorar en modo mapa (Leaflet en la web, Apple/Google Maps en el teléfono): el mapa ocupa
 * la pantalla debajo de los filtros y, al tocar una sala, la hoja de abajo muestra sus
 * funciones. El modo Lista es la alternativa.
 */
export function MapView({ header, filters }: { header: React.ReactNode; filters: CatalogFilters }) {
  const c = useColors();
  const events = useEventsForMap(filters, true);
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [height, setHeight] = useState(0);
  const closeRef = useRef<View>(null);
  const pins = useMemo(() => venuePins(events.data ?? [], me), [events.data, me]);
  const pin = pins.find((p) => p.key === selected) ?? null;

  // Al abrir una sala: en la web el foco pasa a la hoja (teclado); en el teléfono el lector
  // de pantalla la anuncia.
  const pinName = pin?.name;
  const pinCount = pin?.events.length;
  useEffect(() => {
    if (!pinName) return;
    if (Platform.OS === 'web') closeRef.current?.focus();
    else
      AccessibilityInfo.announceForAccessibility(
        `${pinName}, ${pinCount} ${pinCount === 1 ? 'evento' : 'eventos'}`,
      );
  }, [pinName, pinCount]);

  const locate = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const p = await currentPosition();
      const here = { lat: p.lat, lng: p.lng };
      setMe(here);
      // Con ubicación, venuePins ordena por distancia: la primera es la más cercana.
      const nearest = venuePins(events.data ?? [], here)[0];
      if (nearest) setSelected(nearest.key);
    } catch (err) {
      setLocError((err as Error).message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.root}>
      {header}
      <View style={styles.area} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        {height > 0 ? (
          <EventMap
            pins={pins}
            me={me}
            selected={selected}
            onSelect={setSelected}
            height={height}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver lo que está cerca de mí"
          onPress={() => void locate()}
          style={({ pressed }) => [
            styles.near,
            { backgroundColor: c.surface, borderColor: c.borderStrong },
            pressed && { opacity: 0.8 },
          ]}
        >
          {locating ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <Ionicons name="locate-outline" size={22} color={me ? c.accent : c.text} />
          )}
        </Pressable>

        <View
          style={[styles.sheet, { backgroundColor: c.surface, maxHeight: height * 0.5 }]}
          accessibilityLiveRegion="polite"
        >
          {pin ? (
            <>
              <View style={styles.sheetHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="title" role="heading" aria-level={2} numberOfLines={2}>
                    {pin.name}
                  </Txt>
                  <Txt variant="small" tone="muted">
                    {pin.distance !== null ? `${formatDistance(pin.distance)} · ` : ''}
                    {pin.events.length} {pin.events.length === 1 ? 'evento' : 'eventos'}
                  </Txt>
                </View>
                <Pressable
                  ref={closeRef}
                  accessibilityRole="button"
                  accessibilityLabel={`Cerrar ${pin.name}`}
                  onPress={() => setSelected(null)}
                  style={styles.close}
                >
                  <Ionicons name="close" size={22} color={c.text} />
                </Pressable>
              </View>
              <ScrollView>
                {pin.events.map((e) => (
                  <Link key={e.id} href={`/event/${e.slug}`} asChild>
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`${e.title}, ${eventWhen(e)}`}
                    >
                      {/* Sin style en el Pressable: Link asChild lo pasa al <a> (ver roadmap). */}
                      <View style={[styles.row, { borderColor: c.border }]}>
                        <Txt style={styles.rowTitle} numberOfLines={2}>
                          {e.title}
                        </Txt>
                        <Txt variant="small" tone="accent" numberOfLines={1}>
                          {eventWhen(e)}
                        </Txt>
                      </View>
                    </Pressable>
                  </Link>
                ))}
              </ScrollView>
            </>
          ) : (
            <View style={{ gap: spacing.xs }}>
              {events.isPending ? (
                <Txt tone="muted">Cargando salas…</Txt>
              ) : events.error ? (
                <Pressable accessibilityRole="button" onPress={() => void events.refetch()}>
                  <Txt>No pudimos cargar el mapa. Tocá para reintentar.</Txt>
                </Pressable>
              ) : pins.length === 0 ? (
                <Txt>
                  Nada en el mapa con esos filtros. Probá con otra búsqueda o quitá algún filtro.
                </Txt>
              ) : (
                <Txt>
                  Tocá un punto para ver sus funciones · {pins.length}{' '}
                  {pins.length === 1 ? 'sala' : 'salas'}
                </Txt>
              )}
              <Txt variant="caption" tone="muted">
                El botón de ubicación muestra lo más cercano. Tu ubicación no se guarda.
              </Txt>
              {locError ? (
                <Txt variant="caption" tone="danger">
                  {locError}
                </Txt>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// Leaflet dibuja sus capas hasta z-index 1000: los controles propios van por encima.
const styles = StyleSheet.create({
  root: { flex: 1 },
  area: { flex: 1, position: 'relative', overflow: 'hidden' },
  near: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 1100,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },
  row: {
    minHeight: 56,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { fontFamily: fonts.bodySemi },
});
