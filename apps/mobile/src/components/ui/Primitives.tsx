import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native';
import { fonts, radius, spacing, type as typeScale, useColors } from '@/theme/tokens';

export function Screen({ style, ...props }: ViewProps) {
  const c = useColors();
  return <View role="main" style={[styles.screen, { backgroundColor: c.bg }, style]} {...props} />;
}

export function Txt({
  variant = 'body',
  tone = 'text',
  style,
  ...props
}: TextProps & {
  variant?: keyof typeof typeScale;
  tone?: 'text' | 'muted' | 'accent' | 'onAccent' | 'danger';
}) {
  const c = useColors();
  return <Text style={[typeScale[variant], { color: c[tone] }, style]} {...props} />;
}

export function Button({
  label,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  ...props
}: PressableProps & {
  label: string;
  /** danger: solo para acciones que no se deshacen (eliminar la cuenta). */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
}) {
  const c = useColors();
  const bg = { primary: c.accent, secondary: c.surfaceAlt, ghost: 'transparent', danger: c.danger }[
    variant
  ];
  const fg = variant === 'primary' || variant === 'danger' ? c.onAccent : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: c.borderStrong },
        typeof style === 'object' ? style : null,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? (
            <Ionicons name={icon} size={18} color={fg} style={{ marginRight: spacing.sm }} />
          ) : null}
          <Text style={[typeScale.heading, { fontSize: 15, color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ style, ...props }: TextInputProps) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      style={[
        styles.field,
        { color: c.text, backgroundColor: c.surface, borderColor: c.outline },
        style,
      ]}
      {...props}
    />
  );
}

export function Card({ style, ...props }: ViewProps) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.surface }, style]} {...props} />;
}

export function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Txt variant="section" role="heading" aria-level={2}>
          {title}
        </Txt>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Chip({
  label,
  icon,
  selected,
  onPress,
  small,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  onPress?: () => void;
  small?: boolean;
}) {
  const c = useColors();
  const content = (
    <View
      style={[
        styles.chip,
        small && styles.chipSmall,
        onPress && { minHeight: 44 },
        {
          backgroundColor: selected ? c.accent : 'transparent',
          borderColor: selected ? c.accent : c.borderStrong,
        },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={small ? 13 : 16}
          color={selected ? c.onAccent : c.text}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text
        style={[
          small ? typeScale.caption : typeScale.small,
          selected && { fontFamily: fonts.bodySemi },
          { color: selected ? c.onAccent : c.text },
        ]}
      >
        {label}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

export function Badge({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'muted' | 'danger' | 'warning' | 'success' | 'accent';
}) {
  const c = useColors();
  const color = tone === 'muted' ? c.muted : c[tone];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[typeScale.caption, { color }]}>{label}</Text>
    </View>
  );
}

/** Cifra destacada con su rótulo (la cifra va en la sans, no en la display). Con onPress, lleva a su detalle. */
export function StatTile({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const c = useColors();
  // La cifra arriba: alineada en la fila aunque un rótulo ocupe dos líneas.
  const body = (
    <>
      <Txt style={styles.statValue}>{value}</Txt>
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
    </>
  );
  const style = [styles.stat, { backgroundColor: c.surfaceAlt }];
  if (!onPress)
    return (
      <View accessible accessibilityLabel={`${label}: ${value}`} style={style}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/** Fila de navegación de una lista de ajustes: ícono, texto, detalle opcional y flecha. */
export function NavRow({
  icon,
  label,
  detail,
  onPress,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
  first?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.navRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={22} color={c.muted} />
      <View style={{ flex: 1 }}>
        <Txt>{label}</Txt>
        {detail ? (
          <Txt variant="small" tone="muted" numberOfLines={1}>
            {detail}
          </Txt>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );
}

export function Skeleton({
  height = 16,
  width = '100%',
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  style?: ViewProps['style'];
}) {
  const c = useColors();
  return (
    <View
      style={[{ height, width, borderRadius: radius.sm, backgroundColor: c.surfaceAlt }, style]}
    />
  );
}

export function EmptyState({
  icon = 'calendar-outline',
  title,
  body,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.state}>
      <Ionicons name={icon} size={40} color={c.muted} />
      <Txt
        variant="title"
        role="heading"
        aria-level={2}
        style={{ marginTop: spacing.md, textAlign: 'center' }}
      >
        {title}
      </Txt>
      {body ? (
        <Txt tone="muted" style={{ textAlign: 'center', marginTop: spacing.sm }}>
          {body}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

/** El mensaje técnico no se muestra: suele venir del servidor y en inglés. */
export function ErrorState({ title, onRetry }: { title: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title={title}
      body="Revisá tu conexión e intentá de nuevo."
      action={
        onRetry ? <Button label="Reintentar" variant="secondary" onPress={onRetry} /> : undefined
      }
    />
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={styles.state}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    minHeight: 48,
  },
  field: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 15,
    fontFamily: fonts.body,
  },
  card: { borderRadius: radius.lg, overflow: 'hidden' },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipSmall: { paddingVertical: 4, paddingHorizontal: 8 },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  stat: { flex: 1, padding: spacing.md, borderRadius: radius.md, gap: 2 },
  statValue: { fontFamily: fonts.bodySemi, fontSize: 28, lineHeight: 34 },
  pressed: { opacity: 0.8 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  state: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, flexGrow: 1 },
});
