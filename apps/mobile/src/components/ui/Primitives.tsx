import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native';
import { radius, spacing, type as typeScale, useColors } from '@/theme/tokens';

export function Screen({ style, ...props }: ViewProps) {
  const c = useColors();
  return <View style={[styles.screen, { backgroundColor: c.bg }, style]} {...props} />;
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
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
}) {
  const c = useColors();
  const bg =
    variant === 'primary' ? c.accent : variant === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = variant === 'primary' ? c.onAccent : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: c.border },
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
          <Text style={[typeScale.heading, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ style, ...props }: ViewProps) {
  const c = useColors();
  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}
      {...props}
    />
  );
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
        <Txt variant="heading">{title}</Txt>
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
        {
          backgroundColor: selected ? c.accent : c.surfaceAlt,
          borderColor: selected ? c.accent : c.border,
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
    <View style={styles.state} accessibilityRole="summary">
      <Ionicons name={icon} size={40} color={c.muted} />
      <Txt variant="heading" style={{ marginTop: spacing.md, textAlign: 'center' }}>
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

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="No pudimos cargar la agenda"
      body={message ?? 'Revisá tu conexión e intentá de nuevo.'}
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
    borderRadius: radius.md,
    minHeight: 46,
  },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
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
    paddingHorizontal: 12,
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
  state: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, flexGrow: 1 },
});
