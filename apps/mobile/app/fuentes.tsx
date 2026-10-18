import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView } from 'react-native';
import { Card, Txt } from '@/components/ui/Primitives';
import { useCatalogSources } from '@/features/hooks';
import { spacing, useColors } from '@/theme/tokens';

export default function Sources() {
  const c = useColors();
  const sources = useCatalogSources();
  return (
    <ScrollView
      role="main"
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <Txt tone="muted">
        Los eventos se importan solos, varias veces por día, de estas agendas oficiales. Nunca
        inventamos fechas, precios ni imágenes: si un dato falta, no se muestra.
      </Txt>
      <Card>
        {(sources.data ?? []).map((s, i) => (
          <Pressable
            key={s.slug}
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(s.baseUrl)}
            style={{ padding: spacing.md, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}
          >
            <Txt variant="heading">{s.name}</Txt>
            <Txt variant="small" tone="muted">
              {s.baseUrl}
            </Txt>
          </Pressable>
        ))}
        {sources.isPending ? (
          <Txt tone="muted" style={{ padding: spacing.md }}>
            Cargando…
          </Txt>
        ) : null}
      </Card>
    </ScrollView>
  );
}
