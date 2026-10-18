import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useApi } from '@/api/context';
import { Card, Txt } from '@/components/ui/Primitives';
import { AccountSettings } from '@/features/account/AccountSettings';
import { AuthPanel } from '@/features/account/AuthPanel';
import { redirectErrorMessage } from '@/features/account/account';
import { spacing, useColors } from '@/theme/tokens';

/** Cuenta y seguridad. Es también adonde vuelve el navegador después de Google. */
export default function AccountScreen() {
  const c = useColors();
  const { user, account, sessionPending, sessionError } = useApi();
  // Si Google volvió con un error (p. ej. esa cuenta ya existe), se muestra y se limpia la URL.
  const [redirect] = useState(() =>
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? redirectErrorMessage(window.location.href)
      : null,
  );
  useEffect(() => {
    if (redirect) window.history.replaceState(null, '', window.location.pathname);
  }, [redirect]);

  return (
    <ScrollView
      role="main"
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
    >
      {user.kind !== 'supabase' || !account ? (
        <View style={{ padding: spacing.lg }}>
          <Card style={{ padding: spacing.md, gap: spacing.xs }}>
            <Txt variant="heading">Solo en este dispositivo</Txt>
            <Txt tone="muted">
              {sessionPending ? 'Conectando…' : 'Tus intereses y guardados viven en este teléfono.'}
            </Txt>
            {sessionError ? (
              <Txt variant="caption" tone="danger">
                No se pudo iniciar la sesión: {sessionError}
              </Txt>
            ) : null}
          </Card>
        </View>
      ) : account.isAnonymous ? (
        <View style={{ padding: spacing.lg }}>
          <AuthPanel
            initialMode={redirect?.code === 'identity_already_exists' ? 'signin' : 'create'}
            initialError={redirect?.message ?? null}
          />
        </View>
      ) : (
        <AccountSettings account={account} />
      )}
    </ScrollView>
  );
}
