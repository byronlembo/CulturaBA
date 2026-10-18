import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { InterestPicker } from '@/components/ui/InterestPicker';
import { Button, Txt } from '@/components/ui/Primitives';
import { useInterests } from '@/features/hooks';
import { spacing, useColors } from '@/theme/tokens';

export default function Interests() {
  const c = useColors();
  const router = useRouter();
  const { interests, setInterests } = useInterests();
  const [draft, setDraft] = useState(interests);
  useEffect(() => setDraft(interests), [interests]);
  const dirty = draft.join() !== interests.join();

  return (
    <ScrollView
      role="main"
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
    >
      <Txt tone="muted">Con esto armamos «Para vos». Elegí al menos uno.</Txt>
      <InterestPicker value={draft} onChange={setDraft} min={1} />
      <View>
        <Button
          label="Guardar cambios"
          disabled={!dirty || draft.length < 1}
          onPress={() =>
            void setInterests(draft).then(() =>
              router.canGoBack() ? router.back() : router.replace('/perfil'),
            )
          }
        />
      </View>
    </ScrollView>
  );
}
