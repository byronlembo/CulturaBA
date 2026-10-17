import { Platform } from 'react-native';
import type { Position } from '@/api/types';

export const POINTS_PER_CHECK_IN = 10;
/** Días después de una función en los que todavía suma puntos (igual que `check_in` en la base). */
export const POINTS_WINDOW_DAYS = 7;

const MESSAGES: Record<string, string> = {
  not_signed_in: 'Se cortó tu sesión. Recargá la página e intentá de nuevo.',
  account_required: 'Creá tu cuenta en Perfil para canjear.',
  not_available: 'Esta función ya no está disponible.',
  outside_window: 'Los puntos se suman desde que empieza la función hasta 7 días después.',
  daily_limit: 'Ya anotaste 3 funciones ese día, el máximo. Quedó en tu diario, sin puntos.',
  already_checked_in: 'Ya sumaste los puntos de esta función.',
  reward_unavailable: 'Esta recompensa ya no está disponible.',
  not_enough_points: 'Todavía no te alcanzan los puntos.',
  username_required: 'Elegí tu @usuario en Perfil para sumar amigos.',
  user_not_found: 'No encontramos ese @usuario.',
  self: 'Ese @usuario sos vos.',
  too_many_requests: 'Tenés demasiadas solicitudes pendientes.',
  no_request: 'Esa solicitud ya no está: puede que la hayan cancelado.',
};

export function pointsErrorMessage(key: string): string {
  return MESSAGES[key] ?? `No se pudo completar: ${key}`;
}

export function currentPosition(): Promise<Position> {
  const geo = (globalThis as { navigator?: Navigator }).navigator?.geolocation;
  // shortcut: solo en la web; en la app nativa sumar expo-location con los builds nativos.
  if (Platform.OS !== 'web' || !geo)
    return Promise.reject(new Error('Por ahora la ubicación funciona desde la web de CulturaBA.'));
  return new Promise((resolve, reject) =>
    geo.getCurrentPosition(
      (p) =>
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? 'Para usar tu ubicación, permitila en la configuración del navegador.'
              : 'No pudimos obtener tu ubicación. Revisá que esté activada e intentá de nuevo.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    ),
  );
}
