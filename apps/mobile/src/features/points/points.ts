import { toBa } from '@culturaba/shared';
import { Platform } from 'react-native';
import type { Occurrence, Position } from '@/api/types';

export const POINTS_PER_CHECK_IN = 10;

const MESSAGES: Record<string, string> = {
  not_signed_in: 'Se cortó tu sesión. Recargá la página e intentá de nuevo.',
  account_required: 'Creá tu cuenta en Perfil para sumar puntos.',
  not_available: 'Esta función ya no está disponible.',
  outside_window: 'El check-in se hace en la sala, desde una hora antes de la función.',
  venue_without_location: 'Todavía no tenemos la ubicación de esta sala.',
  low_accuracy: 'Tu ubicación no es precisa. Probá de nuevo con el GPS activado.',
  too_far: 'Parece que no estás en la sala: el check-in funciona a menos de 300 m.',
  daily_limit: 'Ya hiciste 3 check-ins hoy, el máximo por día. Mañana podés sumar más.',
  already_checked_in: 'Ya hiciste check-in en esta función.',
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

/**
 * La función en la que se puede hacer check-in ahora (misma ventana que `check_in` en
 * la base: de 1 h antes a 30 min después del fin; muestras, el día que están abiertas).
 */
export function checkInCandidate(occurrences: Occurrence[], now = Date.now()): Occurrence | null {
  const today = toBa(now).toISODate() ?? '';
  const hour = 3_600_000;
  return (
    occurrences.find((o) => {
      if (o.status === 'cancelled' || o.status === 'postponed' || o.venueLat === null) return false;
      if (o.kind !== 'timed') return o.startDate <= today && today <= o.endDate;
      const start = Date.parse(o.startsAt);
      const end = o.endsAt ? Date.parse(o.endsAt) : start + 3 * hour;
      return start - hour <= now && now <= end + hour / 2;
    }) ?? null
  );
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
