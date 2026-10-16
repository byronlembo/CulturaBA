import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useApi } from '@/api/context';
import type { Friend } from '@/api/types';
import { Button, Card, Field, Loading, Screen, Section, Txt } from '@/components/ui/Primitives';
import { useFriends, useSocialMutation, useUsername } from '@/features/hooks';
import { NeedsAccount } from '@/features/social/NeedsAccount';
import { UsernameCard } from '@/features/social/UsernameCard';
import { spacing } from '@/theme/tokens';

const SENT: Record<string, string> = {
  sent: 'Solicitud enviada.',
  accepted: '¡Ahora son amigos!',
  pending: 'Ya le habías mandado una solicitud.',
  already_friends: 'Ya son amigos.',
};

function FriendRow({ f, actions }: { f: Friend; actions: { label: string; run: () => void }[] }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Txt style={{ flex: 1 }}>@{f.username}</Txt>
      {actions.map((a) => (
        <Button key={a.label} label={a.label} variant="ghost" onPress={a.run} />
      ))}
    </View>
  );
}

export default function Friends() {
  const { user, account } = useApi();
  const username = useUsername();
  const friends = useFriends();
  const change = useSocialMutation<unknown>();
  const [handle, setHandle] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  if (user.kind !== 'supabase' || !account || account.isAnonymous)
    return (
      <Screen>
        <NeedsAccount what="sumar amigos" />
      </Screen>
    );

  const list = friends.data ?? [];
  const incoming = list.filter((f) => f.status === 'pending' && f.incoming);
  const outgoing = list.filter((f) => f.status === 'pending' && !f.incoming);
  const accepted = list.filter((f) => f.status === 'accepted');
  const run = (fn: Parameters<typeof change.mutate>[0], ok?: string) => {
    setNotice(null);
    change.mutate(fn, { onSuccess: (r) => setNotice(ok ?? SENT[String(r)] ?? null) });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <Section title="Tu @usuario">
          <UsernameCard />
        </Section>
        {username.data ? (
          <Section title="Agregar amigo">
            <Card style={{ padding: spacing.md, gap: spacing.sm }}>
              <Field
                accessibilityLabel="@usuario de tu amigo"
                placeholder="@usuario"
                value={handle}
                onChangeText={setHandle}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                label="Enviar solicitud"
                icon="person-add-outline"
                disabled={handle.trim().replace(/^@/, '').length < 3}
                loading={change.isPending}
                onPress={() => {
                  run((u) => u.sendFriendRequest(handle));
                  setHandle('');
                }}
              />
              {notice ? <Txt variant="small">{notice}</Txt> : null}
              {change.error ? (
                <Txt variant="caption" tone="danger">
                  {change.error.message}
                </Txt>
              ) : null}
            </Card>
          </Section>
        ) : null}
        {friends.isPending ? <Loading /> : null}
        {incoming.length > 0 ? (
          <Section title="Te quieren agregar">
            <Card style={{ padding: spacing.md, gap: spacing.sm }}>
              {incoming.map((f) => (
                <FriendRow
                  key={f.username}
                  f={f}
                  actions={[
                    {
                      label: 'Aceptar',
                      run: () =>
                        run((u) => u.respondFriendRequest(f.username, true), '¡Ahora son amigos!'),
                    },
                    {
                      label: 'Rechazar',
                      run: () => run((u) => u.respondFriendRequest(f.username, false), ''),
                    },
                  ]}
                />
              ))}
            </Card>
          </Section>
        ) : null}
        <Section title="Tus amigos">
          <Card style={{ padding: spacing.md, gap: spacing.sm }}>
            {accepted.length === 0 ? (
              <Txt tone="muted">
                Todavía no tenés amigos en CulturaBA. Buscalos por su @usuario.
              </Txt>
            ) : (
              accepted.map((f) => (
                <FriendRow
                  key={f.username}
                  f={f}
                  actions={[
                    { label: 'Quitar', run: () => run((u) => u.removeFriend(f.username), '') },
                  ]}
                />
              ))
            )}
          </Card>
        </Section>
        {outgoing.length > 0 ? (
          <Section title="Solicitudes enviadas">
            <Card style={{ padding: spacing.md, gap: spacing.sm }}>
              {outgoing.map((f) => (
                <FriendRow
                  key={f.username}
                  f={f}
                  actions={[
                    { label: 'Cancelar', run: () => run((u) => u.removeFriend(f.username), '') },
                  ]}
                />
              ))}
            </Card>
          </Section>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
