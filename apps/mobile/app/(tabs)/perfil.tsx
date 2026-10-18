import { DISCIPLINES, type DisciplineSlug } from '@culturaba/shared';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useApi } from '@/api/context';
import { Badge, Button, Card, NavRow, Section, StatTile, Txt } from '@/components/ui/Primitives';
import { Stars } from '@/features/diary/DiaryForm';
import {
  useCatalogSources,
  useDiary,
  useFriends,
  useInterests,
  usePoints,
  useUsername,
} from '@/features/hooks';
import { formatBaDateRange } from '@/lib/dates';
import { fonts, spacing, useColors } from '@/theme/tokens';

/**
 * Perfil por importancia: quién sos (y, si sos invitado, crear la cuenta), tus números
 * (cada uno lleva a su detalle), tus intereses, lo último que viste y, al final, ajustes.
 */
export default function Profile() {
  const c = useColors();
  const router = useRouter();
  const { user, account } = useApi();
  const online = user.kind === 'supabase';
  const guest = !account || account.isAnonymous;
  const diary = useDiary();
  const points = usePoints();
  const friends = useFriends();
  const username = useUsername();
  const sources = useCatalogSources();
  const { interests } = useInterests();

  const handle = username.data ? `@${username.data}` : null;
  const name = handle ?? (guest ? 'Invitado' : (account?.email?.split('@')[0] ?? 'Tu cuenta'));
  const initial = (username.data ?? account?.email ?? '').charAt(0).toUpperCase();
  const count = (n: number | undefined) => (n === undefined ? '—' : String(n));
  const accepted = friends.data?.filter((f) => f.status === 'accepted').length;
  const last = diary.data?.[0];

  return (
    <ScrollView
      role="main"
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      style={{ backgroundColor: c.bg }}
    >
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: c.surfaceAlt, borderColor: c.accent }]}>
          {initial ? (
            <Txt style={[styles.initial, { color: c.accent }]}>{initial}</Txt>
          ) : (
            <Ionicons name="person" size={30} color={c.muted} />
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="title" numberOfLines={1}>
            {name}
          </Txt>
          <Txt variant="small" tone="muted" numberOfLines={1}>
            {guest ? 'Sin cuenta todavía' : account?.email}
          </Txt>
          {!guest && online && username.data === null ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/amigos')}
              style={styles.inlineLink}
            >
              <Txt variant="small" tone="accent">
                Elegí tu @usuario
              </Txt>
            </Pressable>
          ) : null}
        </View>
      </View>

      {guest && online ? (
        <View style={styles.block}>
          <Card style={[styles.cta, { borderColor: c.accent }]}>
            <Txt variant="heading">Guardá tu actividad</Txt>
            <Txt tone="muted">
              Con una cuenta no perdés tu diario, tus puntos ni lo guardado si cambiás de teléfono,
              y podés sumar amigos.
            </Txt>
            <Button label="Crear cuenta" onPress={() => router.push('/cuenta')} />
          </Card>
        </View>
      ) : null}

      {online ? (
        <View style={[styles.block, styles.stats]}>
          <StatTile
            label="Funciones vistas"
            value={count(diary.data?.length)}
            onPress={() => router.push('/diario')}
          />
          <StatTile
            label="Puntos"
            value={count(points.data?.balance)}
            onPress={() => router.push('/puntos')}
          />
          <StatTile
            label="Amigos"
            value={guest ? '—' : count(accepted)}
            onPress={() => router.push('/amigos')}
          />
        </View>
      ) : null}

      <Section
        title="Tus intereses"
        right={
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Editar tus intereses"
            onPress={() => router.push('/intereses')}
            style={styles.inlineLink}
          >
            <Txt variant="small" tone="accent">
              Editar
            </Txt>
          </Pressable>
        }
      >
        <View style={styles.chips}>
          {interests.length ? (
            DISCIPLINES.filter((d) => interests.includes(d.slug as DisciplineSlug)).map((d) => (
              <Badge key={d.slug} label={d.shortLabel} tone="accent" />
            ))
          ) : (
            <Txt tone="muted">Elegí qué te interesa para armar «Para vos».</Txt>
          )}
        </View>
      </Section>

      {last ? (
        <Section title="Lo último que viste">
          <Card>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/diario')}
              style={({ pressed }) => [styles.lastRow, pressed && { opacity: 0.8 }]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Txt variant="heading" numberOfLines={1}>
                  {last.eventTitle}
                </Txt>
                <Txt variant="small" tone="muted" numberOfLines={1}>
                  {formatBaDateRange(last.attendedOn, last.attendedOn)}
                  {last.venueName ? ` · ${last.venueName}` : ''}
                </Txt>
                {last.rating ? <Stars value={last.rating} /> : null}
              </View>
              <Txt variant="small" tone="accent">
                Ver diario
              </Txt>
            </Pressable>
          </Card>
        </Section>
      ) : null}

      <Section title="Ajustes">
        <Card>
          <NavRow
            first
            icon="person-circle-outline"
            label="Cuenta y seguridad"
            detail={guest ? 'Crear cuenta o entrar' : (account?.email ?? undefined)}
            onPress={() => router.push('/cuenta')}
          />
          <NavRow
            icon="library-outline"
            label="Fuentes oficiales"
            detail={sources.data ? `${sources.data.length} agendas, actualizadas solas` : undefined}
            onPress={() => router.push('/fuentes')}
          />
          <NavRow
            icon="information-circle-outline"
            label="Acerca de CulturaBA"
            detail={`Versión ${Constants.expoConfig?.version ?? ''}`}
            onPress={() => router.push('/acerca')}
          />
        </Card>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36 },
  inlineLink: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  block: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  cta: { padding: spacing.md, gap: spacing.sm, borderWidth: 1 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lastRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
});
