import { SELECTABLE_DISCIPLINES } from '@culturaba/shared';
import { StyleSheet, View } from 'react-native';
import { disciplineIcon } from '@/lib/disciplineIcons';
import { spacing } from '@/theme/tokens';
import { Chip, Txt } from './Primitives';

export interface InterestPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  min: number;
  max?: number;
}

/** Devuelve la selección resultante de tocar un slug, respetando el máximo. */
export function toggleInterest(current: string[], slug: string, max?: number): string[] {
  if (current.includes(slug)) return current.filter((s) => s !== slug);
  if (max !== undefined && current.length >= max) return current;
  return [...current, slug];
}

export function interestsHint(count: number, min: number, max?: number): string {
  if (count < min) return `Elegí al menos ${min}${max ? ` (hasta ${max})` : ''}`;
  if (max !== undefined && count >= max)
    return `Máximo ${max}. Podés cambiarlos después en tu perfil.`;
  return max ? `${count} de ${max}` : `${count} seleccionados`;
}

export function InterestPicker({ value, onChange, min, max }: InterestPickerProps) {
  return (
    <View>
      <View style={styles.grid}>
        {SELECTABLE_DISCIPLINES.map((d) => (
          <Chip
            key={d.slug}
            label={d.label}
            icon={disciplineIcon(d.slug)}
            selected={value.includes(d.slug)}
            onPress={() => onChange(toggleInterest(value, d.slug, max))}
          />
        ))}
      </View>
      <Txt
        variant="small"
        tone="muted"
        style={{ marginTop: spacing.md }}
        accessibilityLiveRegion="polite"
      >
        {interestsHint(value.length, min, max)}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
