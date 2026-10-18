import { useState } from 'react';
import { View } from 'react-native';
import type { Account } from '@/api/context';
import { Button, Card, Field, Section, Txt } from '@/components/ui/Primitives';
import { useAuthMethods } from '@/features/hooks';
import { spacing } from '@/theme/tokens';
import {
  changePassword,
  continueWithGoogle,
  deleteAccount,
  passwordProblem,
  signOut,
} from './account';

const PROVIDER_LABELS: Record<string, string> = { google: 'Google', email: 'Email' };

/** Cuenta abierta: cómo se entra, contraseña, cerrar sesión y eliminar la cuenta. */
export function AccountSettings({ account }: { account: Account }) {
  const methods = useAuthMethods();
  const [password, setPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const providers = account.providers.map((p) => PROVIDER_LABELS[p] ?? p);
  const canAddGoogle = Boolean(methods.data?.google) && !account.providers.includes('google');
  const pwProblem = password ? passwordProblem(password) : null;

  return (
    <>
      <Section title="Tu cuenta">
        <Card style={{ padding: spacing.md, gap: spacing.xs }}>
          <Txt variant="heading">{account.email ?? 'Cuenta sin email'}</Txt>
          <Txt tone="muted">
            {providers.length ? `Entrás con ${providers.join(' o ')}.` : null} Tus guardados, tu
            diario y tus puntos se sincronizan entre dispositivos.
          </Txt>
          {canAddGoogle ? (
            <View style={{ marginTop: spacing.sm }}>
              <Button
                label="Conectar Google"
                icon="logo-google"
                variant="secondary"
                loading={busy === 'google'}
                onPress={() => void run('google', () => continueWithGoogle('link'))}
              />
            </View>
          ) : null}
        </Card>
      </Section>

      <Section title="Contraseña">
        <Card style={{ padding: spacing.md, gap: spacing.sm }}>
          <Txt tone="muted">
            {account.providers.includes('email')
              ? 'Cambiala cuando quieras.'
              : 'Elegí una para entrar también con tu email.'}
          </Txt>
          <Field
            accessibilityLabel="Contraseña nueva"
            placeholder="Contraseña nueva"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          {pwProblem ? (
            <Txt variant="caption" tone="muted">
              {pwProblem}
            </Txt>
          ) : null}
          <Button
            label="Guardar contraseña"
            variant="secondary"
            disabled={!password || Boolean(pwProblem)}
            loading={busy === 'password'}
            onPress={() =>
              void run(
                'password',
                async () => {
                  await changePassword(password);
                  setPassword('');
                },
                'Listo: tu contraseña quedó guardada.',
              )
            }
          />
        </Card>
      </Section>

      {notice ? <Txt style={{ marginHorizontal: spacing.lg }}>{notice}</Txt> : null}
      {error ? (
        <Txt
          variant="caption"
          tone="danger"
          accessibilityLiveRegion="polite"
          style={{ marginHorizontal: spacing.lg }}
        >
          {error}
        </Txt>
      ) : null}

      <Section title="Sesión">
        <Button
          label="Cerrar sesión"
          variant="ghost"
          loading={busy === 'signout'}
          onPress={() => void run('signout', signOut)}
        />
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          {!confirmDelete ? (
            <Button
              label="Eliminar mi cuenta"
              variant="ghost"
              icon="trash-outline"
              onPress={() => setConfirmDelete(true)}
            />
          ) : (
            <Card style={{ padding: spacing.md, gap: spacing.sm }}>
              <Txt variant="heading">¿Eliminar tu cuenta?</Txt>
              <Txt tone="muted">
                Se borran tu diario, tus puntos, tus amigos y lo que guardaste. No se puede
                deshacer.
              </Txt>
              <Button
                label="Eliminar definitivamente"
                icon="trash-outline"
                variant="danger"
                loading={busy === 'delete'}
                onPress={() => void run('delete', deleteAccount)}
              />
              <Button label="Cancelar" variant="ghost" onPress={() => setConfirmDelete(false)} />
            </Card>
          )}
        </View>
      </Section>
    </>
  );
}
