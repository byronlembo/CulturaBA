import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { env } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';

/**
 * Cuentas: Google o email + contraseña. Todo arranca como invitado (sesión anónima):
 *  · crear cuenta suma Google (linkIdentity) o un email confirmado con código + contraseña
 *    a ESA sesión, así lo guardado queda;
 *  · entrar con una cuenta existente reemplaza la sesión de invitado.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Usá al menos ${PASSWORD_MIN} caracteres.`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Mezclá letras y números.';
  return null;
}

export function accountErrorMessage(e: { code?: string; message: string }): string {
  switch (e.code) {
    case 'email_exists':
    case 'user_already_exists':
      return 'Ese email ya tiene una cuenta: entrá con «Ya tengo cuenta».';
    case 'identity_already_exists':
      return 'Esa cuenta de Google ya está registrada en CulturaBA. Entrá con ella desde «Ya tengo cuenta».';
    case 'invalid_credentials':
      return 'Email o contraseña incorrectos.';
    case 'email_not_confirmed':
      return 'Todavía no confirmaste tu email. Buscá el código que te mandamos.';
    case 'user_not_found':
      return 'No hay una cuenta con ese email.';
    case 'otp_expired':
      return 'El código es incorrecto o venció. Pedí uno nuevo.';
    case 'weak_password':
      return `Esa contraseña es muy fácil de adivinar: usá al menos ${PASSWORD_MIN} caracteres con letras y números.`;
    case 'same_password':
      return 'La contraseña nueva tiene que ser distinta de la actual.';
    case 'reauthentication_needed':
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'Tu sesión venció. Entrá de nuevo y repetí el cambio.';
    case 'manual_linking_disabled':
    case 'provider_disabled':
      return 'Esta forma de entrar todavía no está habilitada.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Se pidieron demasiados códigos. Probá de nuevo en un rato.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Ese email no parece válido. Revisalo e intentá de nuevo.';
    case 'email_address_not_authorized':
      return 'Por ahora no podemos enviar emails a esa dirección. Probá con Google o más tarde.';
    default:
      return `No se pudo completar: ${e.message}`;
  }
}

function auth() {
  const sb = getSupabase();
  if (!sb) throw new Error('No hay conexión con CulturaBA. Revisá tu internet e intentá de nuevo.');
  return sb.auth;
}

async function must<T extends { error: { code?: string; message: string } | null }>(
  p: Promise<T>,
): Promise<T> {
  const res = await p;
  if (res.error) throw new Error(accountErrorMessage(res.error));
  return res;
}

// ── Qué formas de entrar hay ──────────────────────────────────────────────────

export interface AuthMethods {
  google: boolean;
  email: boolean;
}

/**
 * Google aparece cuando el proyecto lo tiene habilitado (ajuste público de Supabase).
 * Email + contraseña se puede apagar con EXPO_PUBLIC_EMAIL_AUTH=off: sin SMTP propio,
 * Supabase solo manda emails a las direcciones del equipo.
 */
export async function authMethods(): Promise<AuthMethods> {
  const email = process.env.EXPO_PUBLIC_EMAIL_AUTH !== 'off';
  if (!env.supabaseUrl) return { google: false, email: false };
  try {
    const res = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: env.supabaseAnonKey },
    });
    const body = (await res.json()) as { external?: { google?: boolean; email?: boolean } };
    return {
      google: Boolean(body.external?.google),
      email: email && body.external?.email !== false,
    };
  } catch {
    return { google: false, email };
  }
}

// ── Google ────────────────────────────────────────────────────────────────────

/** Adónde vuelve el navegador después de Google: la pantalla de cuenta. */
export function authRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const basePath = Constants.expoConfig?.experiments?.baseUrl ?? '';
    return `${window.location.origin}${basePath}/cuenta`;
  }
  return Linking.createURL('cuenta');
}

export interface AuthRedirect {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

/** Tokens, código o error que trae la URL de vuelta (en la query o en el fragmento). */
export function parseAuthRedirect(url: string): AuthRedirect {
  const hash = url.indexOf('#');
  const q = url.indexOf('?');
  const query =
    q >= 0 && (hash < 0 || q < hash) ? url.slice(q + 1, hash < 0 ? undefined : hash) : '';
  const params = new URLSearchParams(query);
  if (hash >= 0) for (const [k, v] of new URLSearchParams(url.slice(hash + 1))) params.set(k, v);
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    code: params.get('code'),
    errorCode: params.get('error_code') ?? params.get('error'),
    errorDescription: params.get('error_description'),
  };
}

/** Error que dejó Google en la URL al volver (web): mensaje para mostrar, o null. */
export function redirectErrorMessage(url: string): { code: string; message: string } | null {
  const r = parseAuthRedirect(url);
  if (!r.errorCode) return null;
  return {
    code: r.errorCode,
    message: accountErrorMessage({
      code: r.errorCode,
      message: r.errorDescription ?? r.errorCode,
    }),
  };
}

async function completeFromUrl(url: string): Promise<void> {
  const r = parseAuthRedirect(url);
  if (r.errorCode) {
    throw new Error(
      accountErrorMessage({ code: r.errorCode, message: r.errorDescription ?? r.errorCode }),
    );
  }
  if (r.code) {
    await must(auth().exchangeCodeForSession(r.code));
  } else if (r.accessToken && r.refreshToken) {
    await must(auth().setSession({ access_token: r.accessToken, refresh_token: r.refreshToken }));
  }
}

/**
 * Invitado (`link`): suma Google a su sesión y conserva lo guardado. `signin`: entra a la
 * cuenta de Google (reemplaza al invitado). En web el navegador se va a Google y vuelve a
 * /cuenta, donde supabase-js toma la sesión de la URL.
 */
export async function continueWithGoogle(mode: 'link' | 'signin'): Promise<void> {
  const native = Platform.OS !== 'web';
  const options = { redirectTo: authRedirectUrl(), skipBrowserRedirect: native };
  const { data } = await must(
    mode === 'link'
      ? auth().linkIdentity({ provider: 'google', options })
      : auth().signInWithOAuth({ provider: 'google', options }),
  );
  if (!native || !data.url) return;
  const result = await WebBrowser.openAuthSessionAsync(data.url, options.redirectTo);
  if (result.type === 'success') await completeFromUrl(result.url);
}

// ── Email + contraseña ────────────────────────────────────────────────────────

/** Invitado → cuenta: manda el código para confirmar el email (paso 1 de 2). */
export async function startEmailAccount(email: string): Promise<void> {
  await must(auth().updateUser({ email }, { emailRedirectTo: authRedirectUrl() }));
}

/** Paso 2: confirma el email con el código y guarda la contraseña. */
export async function finishEmailAccount(
  email: string,
  code: string,
  password: string,
): Promise<void> {
  await must(auth().verifyOtp({ email, token: code.replace(/\s/g, ''), type: 'email_change' }));
  await must(auth().updateUser({ password }));
}

/** Si el email trajo un enlace en vez de código y ya se tocó: guarda la contraseña. */
export async function finishEmailAccountByLink(password: string): Promise<void> {
  const { data } = await must(auth().refreshSession());
  if (data.user?.is_anonymous) throw new Error('Todavía no se confirmó: tocá el enlace del email.');
  await must(auth().updateUser({ password }));
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  await must(auth().signInWithPassword({ email, password }));
}

/** Olvidé mi contraseña: manda un código al email (paso 1 de 2). */
export async function sendPasswordReset(email: string): Promise<void> {
  await must(auth().resetPasswordForEmail(email, { redirectTo: authRedirectUrl() }));
}

/** Paso 2: el código abre la sesión de esa cuenta y se guarda la contraseña nueva. */
export async function resetPasswordWithCode(
  email: string,
  code: string,
  password: string,
): Promise<void> {
  await must(auth().verifyOtp({ email, token: code.replace(/\s/g, ''), type: 'recovery' }));
  await must(auth().updateUser({ password }));
}

/** Pone o cambia la contraseña de la cuenta abierta. */
export async function changePassword(password: string): Promise<void> {
  await must(auth().updateUser({ password }));
}

// ── Sesión ────────────────────────────────────────────────────────────────────

/** La app abre después una sesión de invitado nueva (ApiProvider). */
export async function signOut(): Promise<void> {
  await must(auth().signOut());
}

/** Borra la cuenta y todo lo suyo (diario, puntos, amigos, guardados) y vuelve a invitado. */
export async function deleteAccount(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('No hay conexión con CulturaBA. Revisá tu internet e intentá de nuevo.');
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw new Error(`No se pudo eliminar la cuenta: ${error.message}`);
  // El usuario ya no existe: cerrar solo esta sesión local.
  await sb.auth.signOut({ scope: 'local' });
}
