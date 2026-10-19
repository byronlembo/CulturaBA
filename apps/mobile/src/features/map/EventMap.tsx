import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { fonts, useColors } from '@/theme/tokens';
import { DARK_MAP_STYLE } from './mapStyle';
import { BA_CENTER, type LatLng, pinSize, regionShowing, type VenuePin } from './venues';

/** Alto visible del mapa en grados: la ciudad al abrir, unas cuadras al ubicarte. */
const CITY_DELTA = 0.12;
const NEAR_DELTA = 0.02;

/**
 * Mapa nativo: Apple Maps en iPhone (sin clave) y Google Maps en Android (clave en
 * app.config.ts). Mismas props que EventMap.web.tsx (Leaflet).
 */
export function EventMap({
  pins,
  me,
  selected,
  onSelect,
  height,
}: {
  pins: VenuePin[];
  me: LatLng | null;
  selected: string | null;
  onSelect: (key: string | null) => void;
  height: number;
}) {
  const c = useColors();
  const map = useRef<MapView>(null);
  const delta = useRef(CITY_DELTA);
  // Los marcadores con vista propia se dibujan como imagen: se redibujan un rato después de
  // cada cambio y después quedan quietos (con 100 salas, redibujar siempre traba Android).
  const [redraw, setRedraw] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: los puntos y la elegida son el disparador
  useEffect(() => {
    setRedraw(true);
    const t = setTimeout(() => setRedraw(false), 600);
    return () => clearTimeout(t);
  }, [pins, selected]);

  useEffect(() => {
    if (!me) return;
    delta.current = NEAR_DELTA;
    map.current?.animateToRegion(regionShowing(me, NEAR_DELTA, 0), 400);
  }, [me]);

  const pin = pins.find((p) => p.key === selected);
  const lat = pin?.lat;
  const lng = pin?.lng;
  useEffect(() => {
    if (lat !== undefined && lng !== undefined)
      map.current?.animateToRegion(regionShowing({ lat, lng }, delta.current), 400);
  }, [lat, lng]);

  return (
    <MapView
      ref={map}
      style={{ height, width: '100%' }}
      accessibilityLabel="Mapa de salas con eventos. Elegí un punto para ver sus funciones."
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      userInterfaceStyle="dark"
      customMapStyle={DARK_MAP_STYLE}
      initialRegion={regionShowing(BA_CENTER, CITY_DELTA, 0)}
      onRegionChangeComplete={(r) => {
        delta.current = r.latitudeDelta;
      }}
      // Tocar el mapa fuera de un punto cierra la hoja (tocar un punto también llega acá).
      onPress={(e) => {
        if (e.nativeEvent.action !== 'marker-press') onSelect(null);
      }}
      showsUserLocation={me !== null}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
    >
      {pins.map((p) => {
        const on = p.key === selected;
        const n = p.events.length;
        const size = pinSize(n);
        return (
          <Marker
            key={p.key}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={on ? 1000 : n}
            tracksViewChanges={redraw}
            accessibilityLabel={`${p.name} · ${n} ${n === 1 ? 'evento' : 'eventos'}`}
            onPress={() => onSelect(p.key)}
          >
            <View
              style={[
                styles.pin,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: on ? c.text : c.accent,
                  borderColor: on ? c.accent : c.bg,
                  borderWidth: on ? 3 : 2,
                },
              ]}
            >
              {n > 1 ? <Text style={[styles.count, { color: c.onAccent }]}>{n}</Text> : null}
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: { alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 14 },
});
