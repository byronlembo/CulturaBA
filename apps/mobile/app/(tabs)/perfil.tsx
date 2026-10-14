import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useApi } from '@/api/context';
import { InterestPicker } from '@/components/ui/InterestPicker';
import { Button, Card, Section, Txt } from '@/components/ui/Primitives';
import { useCatalogSources, useInterests } from '@/features/hooks';
import { usePreferences } from '@/store/preferences';
import { spacing, useColors } from '@/theme/tokens';

export default function Profile() {
  const c = useColors();
  const router = useRouter();
  const { user, mode, sessionPending, sessionError } = useApi();
  const { interests, setInterests } = useInterests();
  const [draft, setDraft] = useState(interests);
  const sources = useCatalogSources();
  const resetOnboarding = usePreferences((s) => s.resetOnboarding);

  useEffect(() => setDraft(interests), [interests]);
  const dirty = draft.join() !== interests.join();

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      style={{ backgroundColor: c.bg }}
    >
      <Section title="Tus intereses">
        <InterestPicker value={draft} onChange={setDraft} min={1} />
        {dirty ? (
          <View style={{ marginTop: spacing.md }}>
            <Button
              label="Guardar cambios"
              disabled={draft.length < 1}
              onPress={() => void setInterests(draft)}
            />
          </View>
        ) : null}
      </Section>

      <Section title="Tu cuenta">
        <Card style={{ padding: spacing.md }}>
          <Txt variant="heading">
            {user.kind === 'supabase' ? 'Modo invitado' : 'Solo en este dispositivo'}
          </Txt>
          <Txt tone="muted" style={{ marginTop: 4 }}>
            {sessionPending
              ? 'Conectando…'
              : user.kind === 'supabase'
                ? 'Tus guardados se sincronizan con una identidad anónima. Si reinstalás la app se pierden; crear una cuenta (próximamente) los conserva.'
                : 'Tus intereses y guardados viven solo en este teléfono.'}
          </Txt>
          {sessionError ? (
            <Txt variant="caption" tone="danger" style={{ marginTop: 6 }}>
              No se pudo iniciar la sesión anónima: {sessionError}
            </Txt>
          ) : null}
        </Card>
      </Section>

      <Section title="Fuentes oficiales">
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
        <Txt variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
          Los eventos se importan automáticamente de las agendas oficiales. Nunca inventamos fechas,
          precios ni imágenes: si un dato falta, no se muestra.
        </Txt>
      </Section>

      <Section title="Acerca de">
        <Txt tone="muted">
          CulturaBA {Constants.expoConfig?.version ?? ''} · origen de datos: {mode}
        </Txt>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            resetOnboarding();
            router.replace('/(onboarding)/welcome');
          }}
          style={{ marginTop: spacing.md }}
        >
          <Txt variant="small" tone="accent">
            Volver a ver la bienvenida
          </Txt>
        </Pressable>
      </Section>
    </ScrollView>
  );
}
