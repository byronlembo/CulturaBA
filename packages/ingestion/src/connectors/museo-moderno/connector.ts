import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';
import { HttpError } from '../../http/client';
import { publishedDay, todayOf } from './dates';
import {
  agendaScheduleOf,
  BASE_URL,
  buildEvent,
  type ExhibitionCard,
  hasCurrentDates,
  INSTITUTION_SLUG,
  type ItemData,
  isExhibitionDetail,
  type Listing,
  parseExhibitionListing,
  parseVisitHours,
  RestItemSchema,
  SOURCE_SLUG,
  spanishOnly,
  toItemData,
  VISIT_URL,
} from './parse';

/**
 * Conector Museo Moderno (museomoderno.org — WordPress + Elementor + JetEngine + WPML, detrás de
 * Cloudflare sin challenge). Ver docs/research/museo-moderno.md.
 *
 *  · discover:
 *     1. GET /exposiciones/ → pestañas "Presentes" y "Futuras" (las fechas de las muestras son
 *        campos de JetEngine que la REST NO expone; "Pasadas" se ignora).
 *     2. GET /wp-json/wp/v2/exposiciones?include=<ids> → título, "Ubicación:", texto e imagen.
 *     3. GET /planea-tu-visita/ → horario de la sede (scheduleText de las muestras en la sede;
 *        si falla, las muestras quedan sin horario y la corrida sigue).
 *     4. GET /wp-json/wp/v2/agenda?per_page=100&page=N → TODA la agenda (el sitio reutiliza
 *        entradas viejas: "caja-de-sorpresas" es de 2025 y anuncia funciones de octubre de 2026);
 *        solo se emiten los ítems con alguna fecha de hoy en adelante (dates.ts).
 *     ≈ 5 peticiones. Las muestras van primero porque son las únicas que necesitan enrich.
 *  · enrich: solo muestras → GET de la ficha (bloque "Fecha": "Inicio: …" / "Fin: …").
 *  · parse: puro (parse.ts, dates.ts).
 *
 * WPML: la REST sin prefijo de idioma devuelve el español; las traducciones viven en /en/ y se
 * descartan igual (spanishOnly). robots.txt solo prohíbe /wp-admin/ (lo verifica el cliente).
 */

const PER_PAGE = 100;
/** Tope defensivo: hoy la agenda tiene 104 ítems (2 páginas). */
const MAX_AGENDA_PAGES = 5;
const REQUEST_TIMEOUT_MS = 30_000;

export const EXHIBITIONS_URL = `${BASE_URL}exposiciones/`;
export const AGENDA_API = `${BASE_URL}wp-json/wp/v2/agenda`;
export const EXHIBITIONS_API = `${BASE_URL}wp-json/wp/v2/exposiciones`;
/** Campos de la REST que se usan (+ imagen destacada embebida). */
const REST_FIELDS = 'id,slug,link,date,modified,title,excerpt,content,_links,_embedded';
const REST_QUERY = `lang=es&_embed=wp:featuredmedia&_fields=${REST_FIELDS}`;

export function agendaPageUrl(page: number): string {
  return `${AGENDA_API}?${REST_QUERY}&per_page=${PER_PAGE}&page=${page}`;
}

export function exhibitionsApiUrl(ids: readonly number[]): string {
  return `${EXHIBITIONS_API}?${REST_QUERY}&per_page=${PER_PAGE}&include=${ids.join(',')}`;
}

function parseRestList(body: string, url: string): ItemData[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (err) {
    throw new Error(`${url} no devolvió JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(json)) throw new Error(`${url} no devolvió una lista`);
  const items: ItemData[] = [];
  for (const entry of json) {
    const parsed = RestItemSchema.safeParse(entry);
    if (parsed.success) items.push(toItemData(parsed.data));
  }
  return items;
}

async function fetchAgenda(ctx: FetchContext): Promise<ItemData[]> {
  const items: ItemData[] = [];
  for (let page = 1; page <= MAX_AGENDA_PAGES; page += 1) {
    const url = agendaPageUrl(page);
    let body: string;
    try {
      body = (await ctx.http.get(url, { timeoutMs: REQUEST_TIMEOUT_MS })).body;
    } catch (err) {
      // WordPress responde 400 (rest_post_invalid_page_number) después de la última página.
      if (page > 1 && err instanceof HttpError && err.status === 400) break;
      throw new Error(`agenda (página ${page}) no disponible: ${(err as Error).message}`);
    }
    const pageItems = parseRestList(body, url);
    items.push(...pageItems);
    if (pageItems.length < PER_PAGE) break;
  }
  return spanishOnly(items);
}

async function fetchExhibitionCards(ctx: FetchContext): Promise<ExhibitionCard[]> {
  const res = await ctx.http.get(EXHIBITIONS_URL, { timeoutMs: REQUEST_TIMEOUT_MS });
  const cards = parseExhibitionListing(res.body);
  if (!cards) {
    throw new Error(
      `${EXHIBITIONS_URL} no tiene las pestañas de JetTabs (Pasadas/Presentes/Futuras): ¿cambió el markup?`,
    );
  }
  return cards;
}

export const museoModernoConnector: SourceConnector = {
  slug: SOURCE_SLUG,
  meta: {
    name: 'Agenda y exposiciones del Museo Moderno',
    baseUrl: BASE_URL,
    institutionSlug: INSTITUTION_SLUG,
    kind: 'json_api',
    ready: true,
    politeness: { concurrency: 1, minDelayMs: 1500, timeoutMs: REQUEST_TIMEOUT_MS },
  },

  async discover(ctx: FetchContext): Promise<RawRecord[]> {
    const now = ctx.now();
    const today = todayOf(now);
    const fetchedAt = now.toISO() ?? new Date().toISOString();

    // 1-2. Muestras en cartel y próximas.
    const cards: ExhibitionCard[] = [];
    const seen = new Set<number>();
    for (const card of await fetchExhibitionCards(ctx)) {
      if (card.tab === 'pasadas' || seen.has(card.postId)) continue;
      seen.add(card.postId);
      // Una tarjeta "Hasta el …" ya vencida no se pide (el sitio tarda en moverla a "Pasadas").
      const until = /^\s*hasta/i.test(card.dateText ?? '') ? publishedDay(card.dateText) : null;
      if (until !== null && until < today) {
        ctx.logger.info({ url: card.url, dateText: card.dateText }, 'muestra ya cerrada: se omite');
        continue;
      }
      cards.push(card);
    }
    const exhibitionItems = new Map<number, ItemData>();
    if (cards.length > 0) {
      const url = exhibitionsApiUrl(cards.map((c) => c.postId));
      const res = await ctx.http.get(url, { timeoutMs: REQUEST_TIMEOUT_MS });
      for (const item of spanishOnly(parseRestList(res.body, url))) {
        exhibitionItems.set(item.id, item);
      }
    }

    // 3. Horario de la sede (no crítico).
    let visitHours: string | null = null;
    if (cards.length > 0) {
      try {
        const res = await ctx.http.get(VISIT_URL, { timeoutMs: REQUEST_TIMEOUT_MS });
        visitHours = parseVisitHours(res.body);
        if (!visitHours) ctx.logger.warn({ url: VISIT_URL }, 'no se encontró el bloque HORARIO');
      } catch (err) {
        ctx.logger.warn({ url: VISIT_URL, err: (err as Error).message }, 'horario no disponible');
      }
    }

    const records: RawRecord[] = [];
    for (const card of cards) {
      const item = exhibitionItems.get(card.postId) ?? null;
      if (!item) ctx.logger.warn({ postId: card.postId }, 'la REST no devolvió la muestra');
      const url = item?.link ?? card.url;
      if (card.tab === 'pasadas') continue;
      const listing: Listing = {
        kind: 'exposicion',
        tab: card.tab,
        dateText: card.dateText,
        listingTitle: card.title,
        item,
        visitHours,
      };
      records.push({
        externalId: `exposiciones/${card.postId}`,
        url,
        fetchedAt,
        contentType: 'html',
        body: '',
        listing,
      });
    }

    // 4. Agenda: solo ítems con alguna fecha de hoy en adelante.
    const agenda = await fetchAgenda(ctx);
    let withoutDates = 0;
    let pastOnly = 0;
    for (const item of agenda) {
      const schedule = agendaScheduleOf(item, now);
      if (schedule.specs.length === 0) {
        withoutDates += 1;
        continue;
      }
      if (!hasCurrentDates(schedule, now)) {
        pastOnly += 1;
        continue;
      }
      const listing: Listing = { kind: 'agenda' };
      records.push({
        externalId: `agenda/${item.id}`,
        url: item.link,
        fetchedAt,
        contentType: 'json',
        body: JSON.stringify(item),
        listing,
      });
    }
    ctx.logger.info(
      {
        today,
        exhibitions: cards.length,
        agendaItems: agenda.length,
        agendaCurrent: records.length - cards.length,
        agendaPastOnly: pastOnly,
        agendaWithoutDates: withoutDates,
      },
      'museo moderno: descubrimiento',
    );
    return ctx.limit ? records.slice(0, ctx.limit) : records;
  },

  async enrich(raw: RawRecord, ctx: FetchContext): Promise<RawRecord> {
    if ((raw.listing as { kind?: string } | undefined)?.kind !== 'exposicion') return raw;
    const res = await ctx.http.get(raw.url, { timeoutMs: REQUEST_TIMEOUT_MS });
    if (!isExhibitionDetail(res.body)) {
      throw new Error(`${raw.url} no es la ficha de una exposición (body.single-exposiciones)`);
    }
    return {
      ...raw,
      contentType: 'html',
      body: res.body,
      fetchedAt: ctx.now().toISO() ?? raw.fetchedAt,
    };
  },

  parse(raw: RawRecord, ctx: ParseContext): ParseResult {
    try {
      return buildEvent(raw, ctx);
    } catch (err) {
      return fail([`parse: ${(err as Error).message}`]);
    }
  },
};
