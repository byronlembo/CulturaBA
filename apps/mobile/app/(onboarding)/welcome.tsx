import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Screen, Txt } from '@/components/ui/Primitives';
import { spacing, useColors } from '@/theme/tokens';

const POINTS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'sparkles-outline',
    title: 'Una sola agenda',
    body: 'Teatro Colón, Bellas Artes, Palacio Libertad y más, actualizados automáticamente.',
  },
  {
    icon: 'heart-outline',
    title: 'Según tus gustos',
    body: 'Elegí tus intereses y vemos primero lo que vale la pena para vos.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Datos verificables',
    body: 'Cada evento enlaza a su fuente oficial y muestra cuándo lo comprobamos.',
  },
];

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useColors();
  return (
    <Screen
      style={{
        paddingTop: insets.top + spacing.xxl,
        paddingBottom: insets.bottom + spacing.lg,
        paddingHorizontal: spacing.xl,
      }}
    >
      <Txt variant="caption" tone="accent" style={{ letterSpacing: 2 }}>
        BUENOS AIRES
      </Txt>
      <Txt variant="display" style={{ marginTop: spacing.sm }}>
        Descubrí qué ver esta semana
      </Txt>
      <View style={{ marginTop: spacing.xxl, gap: spacing.xl }}>
        {POINTS.map((p) => (
          <View key={p.title} style={styles.point}>
            <View style={[styles.iconWrap, { backgroundColor: c.accentSoft }]}>
              <Ionicons name={p.icon} size={22} color={c.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="heading">{p.title}</Txt>
              <Txt tone="muted" style={{ marginTop: 2 }}>
                {p.body}
              </Txt>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Button
        label="Empezar"
        icon="arrow-forward"
        onPress={() => router.push('/(onboarding)/interests')}
      />
      <Txt variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: spacing.md }}>
        Sin registro. Podés crear una cuenta más adelante para sincronizar tus guardados.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
