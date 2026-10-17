import { baNow } from '@culturaba/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useApi } from '@/api/context';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
  Txt,
} from '@/components/ui/Primitives';
import { useLeaderboard, useUsername } from '@/features/hooks';
import { NeedsAccount } from '@/features/social/NeedsAccount';
import { radius, spacing, useColors } from '@/theme/tokens';

export default function Ranking() {
  const c = useColors();
  const router = useRouter();
  const { user, account } = useApi();
  const [scope, setScope] = useState<'friends' | 'global'>('friends');
  const [month, setMonth] = useState(true);
  const since = month ? (baNow().startOf('month').toISO() ?? null) : null;
  const board = useLeaderboard(scope, since);
  const username = useUsername();

  if (user.kind !== 'supabase' || !account || account.isAnonymous)
    return (
      <Screen>
        <NeedsAccount what="competir en el ranking" />
      </Screen>
    );

  return (
    <Screen>
      <FlatList
        data={board.data ?? []}
        keyExtractor={(r) => r.username}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <Chip
                label="Amigos"
                selected={scope === 'friends'}
                onPress={() => setScope('friends')}
              />
              <Chip
                label="Global"
                selected={scope === 'global'}
                onPress={() => setScope('global')}
              />
              <Chip label="Este mes" selected={month} onPress={() => setMonth(true)} />
              <Chip label="Siempre" selected={!month} onPress={() => setMonth(false)} />
            </View>
            <Txt variant="small" tone="muted">
              Puntos por las funciones a las que fuiste. Es de buena fe: anotá solo lo que viste.
            </Txt>
            {username.data === null ? (
              <Button
                label="Elegí tu @usuario para aparecer"
                variant="secondary"
                onPress={() => router.push('/amigos')}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          board.isPending ? (
            <Loading />
          ) : board.error ? (
            <ErrorState title="No pudimos cargar el ranking" onRetry={() => void board.refetch()} />
          ) : (
            <EmptyState
              icon="trophy-outline"
              title={
                scope === 'friends' ? 'Sumá amigos para competir' : 'Todavía nadie sumó puntos'
              }
              body="Tocá «Fui a esta función» en la ficha de lo que viste para sumar puntos."
            />
          )
        }
        renderItem={({ item: r }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: r.isMe ? c.surfaceAlt : c.surface,
            }}
            accessibilityLabel={`Puesto ${r.rank}, @${r.username}, ${r.points} puntos${r.isMe ? ', vos' : ''}`}
          >
            <Txt
              variant="title"
              tone={r.rank <= 3 ? 'accent' : 'muted'}
              style={{ width: 36, fontSize: 26, lineHeight: 30 }}
            >
              {r.rank}
            </Txt>
            <Txt style={{ flex: 1 }}>
              @{r.username}
              {r.isMe ? ' (vos)' : ''}
            </Txt>
            <Txt variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
              {r.points}
            </Txt>
          </View>
        )}
      />
    </Screen>
  );
}
