/** Enlaces estables: compartir, deep link y "Cómo llegar". */

export const APP_SCHEME = 'culturaba';

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** https://<base>/event/<slug> — abre la ficha en la web o, con universal links, en la app. */
export function buildEventUrl(baseUrl: string, slug: string): string {
  return `${normalizeBaseUrl(baseUrl)}/event/${encodeURIComponent(slug)}`;
}

/** culturaba://event/<slug> */
export function buildEventDeepLink(slug: string): string {
  return `${APP_SCHEME}://event/${encodeURIComponent(slug)}`;
}

export interface MapTarget {
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/**
 * URL para "Cómo llegar". Solo se construye si hay dirección o coordenadas
 * verificadas; si no, devuelve null y la UI no muestra el botón.
 */
export function buildMapUrl(target: MapTarget, platform: 'ios' | 'android' | 'web'): string | null {
  const hasCoords = typeof target.lat === 'number' && typeof target.lng === 'number';
  const label = [target.name, target.address].filter(Boolean).join(', ');
  if (!hasCoords && !target.address) return null;

  const query = hasCoords ? `${target.lat},${target.lng}` : encodeURIComponent(label);

  if (platform === 'ios') {
    return hasCoords
      ? `maps:0,0?q=${encodeURIComponent(label || 'Destino')}&ll=${target.lat},${target.lng}`
      : `maps:0,0?q=${query}`;
  }
  if (platform === 'android') {
    return hasCoords
      ? `geo:${target.lat},${target.lng}?q=${target.lat},${target.lng}(${encodeURIComponent(label || 'Destino')})`
      : `geo:0,0?q=${query}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export interface ShareMessageInput {
  title: string;
  whenText?: string | null;
  venueName?: string | null;
  eventUrl: string;
  officialUrl?: string | null;
}

/** Texto para el menú nativo de compartir: útil incluso sin tener la app instalada. */
export function buildShareMessage(input: ShareMessageInput): string {
  const lines = [input.title];
  const details = [input.whenText, input.venueName].filter(Boolean).join(' · ');
  if (details) lines.push(details);
  lines.push(input.eventUrl);
  if (input.officialUrl && input.officialUrl !== input.eventUrl) {
    lines.push(`Fuente oficial: ${input.officialUrl}`);
  }
  return lines.join('\n');
}
