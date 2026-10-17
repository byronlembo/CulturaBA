import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useApi } from '@/api/context';
import { Button, Card, Section, Txt } from '@/components/ui/Primitives';
import { usePoints, usePointsMutation, useRewards } from '@/features/hooks';
import { relativeTimeEs } from '@/lib/dates';
import { fonts, spacing, useColors } from '@/theme/tokens';
import { POINTS_PER_CHECK_IN } from './points';

/** Perfil: saldo, últimos movimientos, recompensas disponibles y canjes. */
export function PointsSection() {
  const c = useColors();
  const router = useRouter();
  const { account } = useApi();
  const points = usePoints();
  const rewards = useRewards();
  const redeem = usePointsMutation<{ code: string; balance: number }>();
  const balance = points.data?.balance ?? 0;
  const rewardList = rewards.data?.rewards ?? [];

  return (
    <Section title="Tus puntos">
      <Card style={{ padding: spacing.md, gap: spacing.sm }}>
        <Txt accessibilityLabel={`${balance} puntos`} style={styles.hero}>
          {balance}
          <Txt tone="muted"> puntos</Txt>
        </Txt>
        <Txt tone="muted">
          Sumás {POINTS_PER_CHECK_IN} puntos por cada función a la que fuiste: tocá "Fui a esta
          función" en la ficha, hasta 7 días después. Es de buena fe: por ahora sirven para el
          ranking.
        </Txt>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label="Ranking"
            variant="secondary"
            icon="trophy-outline"
            onPress={() => router.push('/ranking')}
            style={{ flex: 1 }}
          />
          <Button
            label="Amigos"
            variant="secondary"
            icon="people-outline"
            onPress={() => router.push('/amigos')}
            style={{ flex: 1 }}
          />
        </View>
        {(points.data?.moves ?? []).slice(0, 5).map((m) => (
          <View
            key={`${m.createdAt}${m.delta}`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}
          >
            <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>
              {m.note ?? (m.reason === 'redeem' ? 'Canje' : 'Ajuste')} ·{' '}
              {relativeTimeEs(m.createdAt)}
            </Txt>
            <Txt variant="small" style={{ color: m.delta > 0 ? c.success : c.text }}>
              {m.delta > 0 ? `+${m.delta}` : m.delta}
            </Txt>
          </View>
        ))}
      </Card>

      {/* Sin catálogo no hay sección: los puntos hoy sirven para el ranking. */}
      {rewardList.length > 0 ? (
        <>
          <Txt variant="heading" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
            Recompensas
          </Txt>
          {rewardList.map((r) => (
            <Card
              key={r.id}
              style={{ padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm }}
            >
              <Txt variant="heading">{r.title}</Txt>
              {r.description ? <Txt tone="muted">{r.description}</Txt> : null}
              {r.terms ? (
                <Txt variant="caption" tone="muted">
                  {r.terms}
                </Txt>
              ) : null}
              <Button
                label={`Canjear por ${r.cost} puntos`}
                variant="secondary"
                disabled={balance < r.cost || Boolean(account?.isAnonymous)}
                loading={redeem.isPending}
                onPress={() => redeem.mutate((u) => u.redeemReward(r.id))}
              />
            </Card>
          ))}
        </>
      ) : null}
      {redeem.data ? (
        <Txt style={{ marginTop: spacing.sm }}>
          Tu código: {redeem.data.code}. Mostralo al retirar la recompensa.
        </Txt>
      ) : null}
      {redeem.error ? (
        <Txt variant="caption" tone="danger" style={{ marginTop: spacing.sm }}>
          {redeem.error.message}
        </Txt>
      ) : null}
      {(rewards.data?.redemptions ?? []).length > 0 ? (
        <Card style={{ padding: spacing.md, gap: spacing.sm, marginTop: spacing.md }}>
          <Txt variant="heading">Tus canjes</Txt>
          {(rewards.data?.redemptions ?? []).map((r) => (
            <Txt key={r.id} variant="small">
              {r.rewardTitle} · código {r.code}
              {r.usedAt ? ' · usado' : ''}
            </Txt>
          ))}
        </Card>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  hero: { fontFamily: fonts.bodySemi, fontSize: 48, lineHeight: 56 },
});
