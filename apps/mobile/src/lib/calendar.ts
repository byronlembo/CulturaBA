import { buildEventUrl, buildIcs, type CalendarEntry, googleCalendarUrl } from '@culturaba/shared';
import { Linking, Platform } from 'react-native';
import type { EventDetail, Occurrence } from '@/api/types';
import { env } from './env';

export function calendarEntry(event: EventDetail, o: Occurrence): CalendarEntry {
  const place = [o.venueName ?? event.venueName, o.room].filter(Boolean).join(' · ');
  const address = o.venueAddress ?? (o.venueName ? null : event.venueAddress);
  return {
    uid: o.id,
    title: event.title,
    kind: o.kind,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    startDate: o.startDate,
    endDate: o.endDate,
    location: [place, address].filter(Boolean).join(', ') || null,
    description: o.scheduleText,
    url: buildEventUrl(env.webBaseUrl, event.slug),
  };
}

/** Web: descarga el .ics (Google, Apple y Outlook lo importan; iOS lo agrega al tocarlo). */
export function addToCalendar(entry: CalendarEntry, fileName: string): void {
  if (Platform.OS !== 'web') {
    // shortcut: en el teléfono abre Google Calendar (sin avisos); pasar a expo-calendar con los builds nativos.
    void Linking.openURL(googleCalendarUrl(entry));
    return;
  }
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) return;
  const url = URL.createObjectURL(new Blob([buildIcs(entry)], { type: 'text/calendar' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = `${fileName}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
