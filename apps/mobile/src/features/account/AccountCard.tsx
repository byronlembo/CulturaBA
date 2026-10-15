import { useState } from 'react';
import { Pressable } from 'react-native';
import { useApi } from '@/api/context';
import { Button, Card, Field, Txt } from '@/components/ui/Primitives';
import { spacing } from '@/theme/tokens';
import { type AccountFlow, EMAIL_RE, sendCode, signOut, verifyCode } from './account';

type Step = { flow: AccountFlow; sent: boolean } | null;

export function AccountCard() {
  const { user, account, sessionPending, sessionError } = useApi();
  const [step, setStep] = useState<Step>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const start = (flow: AccountFlow) => {
    setStep({ flow, sent: false });
    setCode('');
    setError(null);
  };

  if (user.kind !== 'supabase' || !account) {
    return (
      <Card style={{ padding: spacing.md }}>
        <Txt variant="heading">Solo en este dispositivo</Txt>
        <Txt tone="muted" style={{ marginTop: 4 }}>
          {sessionPending
            ? 'Conectando…'
            : 'Tus intereses y guardados viven solo en este teléfono.'}
        </Txt>
        {sessionError ? (
          <Txt variant="caption" tone="danger" style={{ marginTop: 6 }}>
            No se pudo iniciar la sesión: {sessionError}
          </Txt>
        ) : null}
      </Card>
    );
  }

  if (!account.isAnonymous) {
    return (
      <Card style={{ padding: spacing.md, gap: spacing.sm }}>
        <Txt variant="heading">Tu cuenta</Txt>
        <Txt tone="muted">
          Entraste como {account.email}. Tus guardados se sincronizan entre dispositivos.
        </Txt>
        <Button
          label="Cerrar sesión"
          variant="ghost"
          loading={busy}
          onPress={() => void run(signOut)}
        />
        {error ? (
          <Txt variant="caption" tone="danger">
            {error}
          </Txt>
        ) : null}
      </Card>
    );
  }

  return (
    <Card style={{ padding: spacing.md, gap: spacing.sm }}>
      <Txt variant="heading">Modo invitado</Txt>
      {!step ? (
        <>
          <Txt tone="muted">
            Tus guardados están asociados a este dispositivo. Creá una cuenta con tu email para no
            perderlos si cambiás de teléfono o reinstalás la app.
          </Txt>
          <Button label="Crear cuenta" icon="mail-outline" onPress={() => start('create')} />
          <Button label="Ya tengo cuenta" variant="ghost" onPress={() => start('signin')} />
        </>
      ) : !step.sent ? (
        <>
          <Txt tone="muted">
            {step.flow === 'create'
              ? 'Te mandamos un código por email. Lo que guardaste queda en tu cuenta.'
              : 'Te mandamos un código por email. Lo que guardaste como invitado en este dispositivo no se suma a esa cuenta.'}
          </Txt>
          <Field
            accessibilityLabel="Email"
            placeholder="tu@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            autoCorrect={false}
          />
          <Button
            label="Enviar código"
            disabled={!EMAIL_RE.test(email.trim())}
            loading={busy}
            onPress={() =>
              void run(async () => {
                await sendCode(step.flow, email.trim());
                setStep({ ...step, sent: true });
              })
            }
          />
        </>
      ) : (
        <>
          <Txt tone="muted">
            Escribí el código que te mandamos a {email.trim()} (revisá también el correo no
            deseado).
          </Txt>
          <Field
            accessibilityLabel="Código"
            placeholder="Código"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
          />
          <Button
            label="Confirmar"
            disabled={code.replace(/\D/g, '').length < 6}
            loading={busy}
            onPress={() =>
              void run(async () => {
                await verifyCode(step.flow, email.trim(), code);
                setStep(null);
              })
            }
          />
        </>
      )}
      {error ? (
        <Txt variant="caption" tone="danger">
          {error}
        </Txt>
      ) : null}
      {step ? (
        <Pressable accessibilityRole="button" onPress={() => setStep(null)}>
          <Txt variant="small" tone="accent">
            Cancelar
          </Txt>
        </Pressable>
      ) : null}
    </Card>
  );
}
