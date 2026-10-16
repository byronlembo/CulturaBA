import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Field, Txt } from '@/components/ui/Primitives';
import { useSocialMutation, useUsername } from '@/features/hooks';
import { spacing } from '@/theme/tokens';

/** Tu @usuario: lo que ven tus amigos y el ranking. */
export function UsernameCard() {
  const username = useUsername();
  const save = useSocialMutation<void>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const current = username.data ?? null;

  return (
    <Card style={{ padding: spacing.md, gap: spacing.sm }}>
      <Txt variant="heading">{current ? `@${current}` : 'Elegí tu @usuario'}</Txt>
      <Txt tone="muted">
        Es lo que ven tus amigos y el ranking. Tus puntos aparecen junto a él en el ranking global.
      </Txt>
      {!current || editing ? (
        <View style={{ gap: spacing.sm }}>
          <Field
            accessibilityLabel="Tu @usuario"
            placeholder="@usuario"
            value={draft}
            onChangeText={setDraft}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={21}
          />
          <Button
            label="Guardar"
            disabled={draft.trim().replace(/^@/, '').length < 3}
            loading={save.isPending}
            onPress={() =>
              save.mutate((u) => u.setUsername(draft), {
                onSuccess: () => {
                  setEditing(false);
                  setDraft('');
                },
              })
            }
          />
        </View>
      ) : (
        <Button label="Cambiar" variant="ghost" onPress={() => setEditing(true)} />
      )}
      {save.error ? (
        <Txt variant="caption" tone="danger">
          {save.error.message}
        </Txt>
      ) : null}
    </Card>
  );
}
