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

/** Envía por email un código de un solo uso. */
export async function sendCode(flow: AccountFlow, email: string): Promise<void> {
  const { error } =
    flow === 'create'
      ? await auth().updateUser({ email })
      : await auth().signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) throw new Error(accountErrorMessage(error));
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
