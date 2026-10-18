import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Field, Loading, Txt } from '@/components/ui/Primitives';
import { useAuthMethods } from '@/features/hooks';
import { spacing, useColors } from '@/theme/tokens';
import {
  continueWithGoogle,
  EMAIL_RE,
  finishEmailAccount,
  finishEmailAccountByLink,
  passwordProblem,
  resetPasswordWithCode,
  sendPasswordReset,
  signInWithPassword,
  startEmailAccount,
} from './account';

export type AuthMode = 'create' | 'signin' | 'forgot';

const TITLES: Record<AuthMode, string> = {
  create: 'Creá tu cuenta',
  signin: 'Entrá a tu cuenta',
  forgot: 'Cambiá tu contraseña',
};

/** Invitado: crear cuenta (conserva lo guardado), entrar a una existente u olvidé la contraseña. */
export function AuthPanel({
  initialMode = 'create',
  initialError = null,
}: {
  initialMode?: AuthMode;
  initialError?: string | null;
}) {
  const c = useColors();
  const methods = useAuthMethods();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

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
  const go = (next: AuthMode) => {
    setMode(next);
    setCodeSent(false);
    setCode('');
    setError(null);
  };

  if (methods.isPending) return <Loading />;
  const google = methods.data?.google ?? false;
  const emailOn = methods.data?.email ?? false;
  if (!google && !emailOn)
    return (
      <Card style={styles.card}>
        <Txt variant="heading">Las cuentas llegan muy pronto</Txt>
        <Txt tone="muted">Mientras tanto, lo que guardás queda en este dispositivo.</Txt>
      </Card>
    );

  const validEmail = EMAIL_RE.test(email.trim());
  const pwProblem = password ? passwordProblem(password) : null;
  const codeOk = code.replace(/\D/g, '').length >= 6;

  return (
    <Card style={styles.card}>
      <Txt variant="heading" role="heading" aria-level={2}>
        {TITLES[mode]}
      </Txt>
      <Txt tone="muted">
        {mode === 'create'
          ? 'Lo que guardaste, tu diario y tus puntos pasan a tu cuenta y los ves en cualquier dispositivo.'
          : mode === 'signin'
            ? 'Lo que guardaste como invitado en este dispositivo no se suma a esa cuenta.'
            : 'Te mandamos un código a tu email para elegir una contraseña nueva.'}
      </Txt>

      {google && mode !== 'forgot' && !codeSent ? (
        <Button
          label="Seguir con Google"
          icon="logo-google"
          // Botón oscuro con el logo, como piden las pautas de marca de Google.
          variant="secondary"
          loading={busy}
          onPress={() => void run(() => continueWithGoogle(mode === 'create' ? 'link' : 'signin'))}
        />
      ) : null}
      {google && emailOn && mode !== 'forgot' && !codeSent ? (
        <View style={styles.or} accessible={false}>
          <View style={[styles.rule, { backgroundColor: c.border }]} />
          <Txt variant="small" tone="muted">
            o con tu email
          </Txt>
          <View style={[styles.rule, { backgroundColor: c.border }]} />
        </View>
      ) : null}

      {emailOn && !codeSent ? (
        <>
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
          {mode !== 'forgot' ? (
            <Field
              accessibilityLabel="Contraseña"
              placeholder="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              textContentType={mode === 'create' ? 'newPassword' : 'password'}
            />
          ) : null}
          {mode === 'create' && pwProblem ? (
            <Txt variant="caption" tone="muted">
              {pwProblem}
            </Txt>
          ) : null}
          <Button
            label={
              mode === 'create'
                ? 'Crear cuenta'
                : mode === 'signin'
                  ? 'Entrar'
                  : 'Mandarme un código'
            }
            disabled={
              !validEmail ||
              (mode === 'create' && (!password || Boolean(pwProblem))) ||
              (mode === 'signin' && !password)
            }
            loading={busy}
            onPress={() =>
              void run(async () => {
                const e = email.trim();
                if (mode === 'signin') return signInWithPassword(e, password);
                if (mode === 'create') await startEmailAccount(e);
                else await sendPasswordReset(e);
                setCodeSent(true);
              })
            }
          />
        </>
      ) : null}

      {codeSent ? (
        <>
          <Txt tone="muted">
            Te escribimos a {email.trim()} (revisá también el correo no deseado). Escribí el código
            del email{mode === 'forgot' ? ' y tu contraseña nueva' : ''}.
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
          {mode === 'forgot' ? (
            <>
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
            </>
          ) : null}
          <Button
            label={mode === 'create' ? 'Confirmar y crear cuenta' : 'Guardar contraseña'}
            disabled={!codeOk || !password || Boolean(passwordProblem(password))}
            loading={busy}
            onPress={() =>
              void run(() =>
                mode === 'create'
                  ? finishEmailAccount(email.trim(), code, password)
                  : resetPasswordWithCode(email.trim(), code, password),
              )
            }
          />
          {mode === 'create' ? (
            <Button
              label="El email trajo un enlace y ya lo toqué"
              variant="ghost"
              loading={busy}
              onPress={() => void run(() => finishEmailAccountByLink(password))}
            />
          ) : null}
        </>
      ) : null}

      {error ? (
        <Txt variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}

      <View style={styles.links}>
        {mode === 'create' ? (
          <TextLink label="¿Ya tenés cuenta? Entrá" onPress={() => go('signin')} />
        ) : (
          <TextLink label="Crear una cuenta nueva" onPress={() => go('create')} />
        )}
        {mode === 'signin' && emailOn ? (
          <TextLink label="¿Olvidaste tu contraseña?" onPress={() => go('forgot')} />
        ) : null}
        {mode === 'forgot' ? (
          <TextLink label="Volver a entrar" onPress={() => go('signin')} />
        ) : null}
      </View>
    </Card>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Txt variant="small" tone="accent">
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm },
  or: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg },
  link: { minHeight: 44, justifyContent: 'center' },
});
