import { toBa } from '@culturaba/shared';
import { Platform } from 'react-native';
import type { Occurrence, Position } from '@/api/types';

export const POINTS_PER_CHECK_IN = 10;

const MESSAGES: Record<string, string> = {
  not_signed_in: 'Necesitás una sesión para sumar puntos.',
  account_required: 'Creá tu cuenta en Perfil para sumar puntos.',
  not_available: 'Esta función ya no está disponible.',
  outside_window: 'El check-in se hace en la sala, desde una hora antes de la función.',
  venue_without_location: 'Todavía no tenemos la ubicación de esta sala.',
  low_accuracy: 'Tu ubicación no es precisa. Probá de nuevo con el GPS activado.',
  too_far: 'Parece que no estás en la sala.',
  daily_limit: 'Llegaste al máximo de 3 check-ins por día.',
  already_checked_in: 'Ya hiciste check-in en esta función.',
  reward_unavailable: 'Esta recompensa ya no está disponible.',
  not_enough_points: 'Todavía no te alcanzan los puntos.',
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
    return Promise.reject(new Error('Por ahora el check-in se hace desde la web de CulturaBA.'));
  return new Promise((resolve, reject) =>
    geo.getCurrentPosition(
      (p) =>
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? 'Necesitamos permiso de ubicación para el check-in.'
              : 'No pudimos obtener tu ubicación.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    ),
  );
}
