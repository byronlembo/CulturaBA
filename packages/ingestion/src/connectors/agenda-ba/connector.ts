import { canonicalUrl } from '@culturaba/shared';
import { z } from 'zod';
import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';
import { isSharedTicketKey } from '../../core/matcher';
import { buildEvent, eventPageUrl, LINDA_BASE_URL, SOURCE_SLUG } from './parse';

/**
 * Conector agenda-ba: Linda, agenda oficial de la Ciudad de Buenos Aires (agregador
 * multi-institución, prioridad 10). Ver docs/research/agenda-ba.md.
 *
 *  · discover: GET /api/frontend/events/filter?limit=200 (JSON, sin auth). `limit` y
 *    `page` se devuelven en `pagination` pero NO paginan (268 eventos con limit=200;
 *    page=2 repitió el conjunto): una sola petición por corrida. Solo si algún día la
 *    respuesta viene recortada (events.length < pagination.total y totalPages > 1) se
 *    pide page=2 — máximo 2 peticiones — y se une por `id` (gana la primera aparición).
 *  · sin enrich: el cuerpo completo ya viene en `componentes`; el detalle HTML no aporta.
 *  · parse: puro (parse.ts). La institución sale de cada evento (institutionSlug por ítem;
 *    `meta.institutionSlug` = 'agenda-ba' no existe en la base: cada evento trae su
 *    institución o la genérica con institutionName para crearla).
 *  · robots.txt de linda.buenosaires.gob.ar: 404 (sin restricciones); cortesía igual.
 */

export const LIST_URL = `${LINDA_BASE_URL}api/frontend/events/filter?limit=200`;
const REQUEST_HEADERS = { accept: 'application/json', 'accept-language': 'es-AR' };

// Laxo a propósito: un ítem roto no tira la corrida; la validación completa es en parse().
const ListResponseSchema = z.object({
  events: z.array(z.unknown()),
  pagination: z
    .object({
      page: z.number().optional(),
      total: z.number().optional(),
      totalPages: z.number().optional(),
    })
    .nullish(),
});
const ListedEventSchema = z.looseObject({ id: z.string().min(1), slug: z.string().min(1) });
type ListedEvent = z.infer<typeof ListedEventSchema>;

function parseList(body: string): z.infer<typeof ListResponseSchema> {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(
      `la API de eventos no devolvió JSON (empieza con ${JSON.stringify(body.slice(0, 40))})`,
    );
  }
  const result = ListResponseSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `respuesta inesperada de la API de eventos: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return result.data;
}

/** true si la página trae menos eventos que el total anunciado y hay más páginas. */
export function looksTruncated(list: z.infer<typeof ListResponseSchema>): boolean {
  const total = list.pagination?.total;
  const pages = list.pagination?.totalPages;
  return typeof total === 'number' && typeof pages === 'number'
    ? pages > 1 && list.events.length < total
    : false;
}

/** Claves canónicas de las páginas de entradasba (con id) que enlaza un ítem. */
function ticketKeysOf(event: ListedEvent): string[] {
  const buttons = (event as { botonesSidebar?: unknown }).botonesSidebar;
  if (!Array.isArray(buttons)) return [];
  const keys = new Set<string>();
  for (const b of buttons) {
    const uri = (b as { uri?: unknown } | null)?.uri;
    if (typeof uri !== 'string') continue;
    const key = canonicalUrl(uri);
    if (isSharedTicketKey(key)) keys.add(key);
  }
  return [...keys];
}

/**
 * Páginas de entradasba que Linda usa en DOS O MÁS ítems distintos de la misma respuesta
 * (pasa: "Buscando a Shakespeare" y "Encuentro de Cine Europeo" comparten un id). Esas no
 * identifican una producción y no se declaran como `sameAsUrls`.
 */
export function sharedTicketUrls(events: readonly ListedEvent[]): Set<string> {
  const count = new Map<string, number>();
  for (const e of events) for (const k of ticketKeysOf(e)) count.set(k, (count.get(k) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n > 1).map(([k]) => k));
}

export const agendaBaConnector: SourceConnector = {
  slug: SOURCE_SLUG,
  meta: {
    name: 'Agenda oficial de la Ciudad (Linda)',
    baseUrl: LINDA_BASE_URL,
    // Agregador: la institución real sale de cada evento (institutionSlug por ítem).
    institutionSlug: 'agenda-ba',
    kind: 'json_api',
    ready: true,
    politeness: { concurrency: 1, minDelayMs: 1600, timeoutMs: 30_000 },
  },

  async discover(ctx: FetchContext): Promise<RawRecord[]> {
    const first = parseList((await ctx.http.get(LIST_URL, { headers: REQUEST_HEADERS })).body);
    const pages = [first];
    if (looksTruncated(first)) {
      // Máximo 2 peticiones por corrida.
      ctx.logger.info(
        { listed: first.events.length, total: first.pagination?.total },
        'la API paginó: se pide page=2',
      );
      const second = await ctx.http.get(`${LIST_URL}&page=2`, { headers: REQUEST_HEADERS });
      pages.push(parseList(second.body));
    }

    const byId = new Map<string, ListedEvent>();
    let skipped = 0;
    for (const page of pages) {
      for (const candidate of page.events) {
        const listed = ListedEventSchema.safeParse(candidate);
        if (!listed.success) {
          skipped += 1;
          continue;
        }
        if (!byId.has(listed.data.id)) byId.set(listed.data.id, listed.data);
      }
    }
    if (skipped > 0) ctx.logger.warn({ skipped }, 'eventos sin id/slug en la API: omitidos');
    if (byId.size === 0) throw new Error('la API de eventos no devolvió ningún evento');
    const total = first.pagination?.total;
    if (typeof total === 'number' && byId.size < total) {
      // Un descubrimiento parcial no puede pasar por completo: marcaría ausencias falsas.
      throw new Error(
        `la API anuncia ${total} eventos y se obtuvieron ${byId.size} en ${pages.length} petición(es)`,
      );
    }
    ctx.logger.info({ events: byId.size, requests: pages.length }, 'eventos en la API de Linda');

    const fetchedAt = ctx.now().toISO() ?? new Date().toISOString();
    const shared = sharedTicketUrls([...byId.values()]);
    const records: RawRecord[] = [...byId.values()].map((event) => {
      const mine = ticketKeysOf(event).filter((k) => shared.has(k));
      return {
        externalId: event.id,
        url: eventPageUrl(event.slug),
        fetchedAt,
        contentType: 'json' as const,
        body: JSON.stringify(event),
        ...(mine.length ? { listing: { sharedTicketKeys: mine } } : {}),
      };
    });
    return ctx.limit ? records.slice(0, ctx.limit) : records;
  },

  parse(raw: RawRecord, ctx: ParseContext): ParseResult {
    try {
      return buildEvent(raw, ctx);
    } catch (err) {
      return fail([`parse: ${(err as Error).message}`]);
    }
  },
};
