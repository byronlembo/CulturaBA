import * as Location from 'expo-location';
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
  if (Platform.OS !== 'web') return nativePosition();
  const geo = (globalThis as { navigator?: Navigator }).navigator?.geolocation;
  if (!geo) return Promise.reject(new Error('Este navegador no permite usar tu ubicación.'));
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

async function nativePosition(): Promise<Position> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted')
    throw new Error(
      'Para usar tu ubicación, permitila para CulturaBA en los ajustes del teléfono.',
    );
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? 0 };
  } catch {
    throw new Error(
      'No pudimos obtener tu ubicación. Revisá que esté activada e intentá de nuevo.',
    );
  }
}
