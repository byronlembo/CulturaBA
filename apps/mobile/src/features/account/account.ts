import { env } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';

/** create: suma el email a la sesión de invitado (conserva lo guardado). signin: entra a una cuenta existente. */
export type AccountFlow = 'create' | 'signin';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function accountErrorMessage(e: { code?: string; message: string }): string {
  switch (e.code) {
    case 'email_exists':
      return 'Ese email ya tiene una cuenta: entrá con «Ya tengo cuenta».';
    case 'otp_disabled':
    case 'user_not_found':
      return 'No hay una cuenta con ese email.';
    case 'otp_expired':
      return 'El código es incorrecto o venció. Pedí uno nuevo.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Se pidieron demasiados códigos. Probá de nuevo en un rato.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Revisá el email.';
    case 'email_address_not_authorized':
      return 'Por ahora no podemos enviar emails a esa dirección. Probá más tarde.';
    default:
      return `No se pudo completar: ${e.message}`;
  }
}

function auth() {
  const sb = getSupabase();
  if (!sb) throw new Error('La app no está conectada al servidor.');
  return sb.auth;
}

/**
 * Envía el email de confirmación. Con las plantillas de Supabase por defecto trae un
 * enlace que vuelve a la web; con SMTP propio y supabase/templates trae un código.
 */
export async function sendEmail(flow: AccountFlow, email: string): Promise<void> {
  const emailRedirectTo = `${env.webBaseUrl}/perfil`;
  const { error } =
    flow === 'create'
      ? await auth().updateUser({ email }, { emailRedirectTo })
      : await auth().signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo },
        });
  if (error) throw new Error(accountErrorMessage(error));
}

/** Tras tocar el enlace en otro lado: el token nuevo trae el email confirmado. */
export async function refreshAccount(): Promise<void> {
  const { data, error } = await auth().refreshSession();
  if (error) throw new Error(accountErrorMessage(error));
  if (data.user?.is_anonymous) throw new Error('Todavía no se confirmó: tocá el enlace del email.');
}

export async function verifyCode(flow: AccountFlow, email: string, code: string): Promise<void> {
  const { error } = await auth().verifyOtp({
    email,
    token: code.replace(/\s/g, ''),
    type: flow === 'create' ? 'email_change' : 'email',
  });
  if (error) throw new Error(accountErrorMessage(error));
}

/** La app abre después una sesión de invitado nueva (ApiProvider). */
export async function signOut(): Promise<void> {
  const { error } = await auth().signOut();
  if (error) throw new Error(accountErrorMessage(error));
}
