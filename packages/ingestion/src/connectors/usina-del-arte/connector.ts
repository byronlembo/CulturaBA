import type { DateTime } from 'luxon';
import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';
import { parseDateCell } from './dates';
import {
  API_URL,
  BASE_URL,
  buildEvent,
  INSTITUTION_SLUG,
  type ListingItem,
  SOURCE_SLUG,
  type TermRef,
} from './parse';

/**
 * Conector Usina del Arte (usinadelarte.ar — WordPress + Elementor, CPT `actividad`).
 * Fuente institucional (prioridad 100). Ver docs/research/usina-del-arte.md.
 *
 *  · discover: REST `/wp-json/wp/v2/actividad` (≈ 4 páginas de 100, solo los campos
 *    necesarios) + las taxonomías `funcion-fecha`, `funcion-hora`, `sala`, `estado` y
 *    `tipo-de-actividad` (≈ 6 páginas) para resolver los ids de término a nombre/slug.
 *    TODO o nada: una página que falla, que no es JSON o un total que no cierra con
 *    `X-WP-Total` ⇒ discover LANZA (un descubrimiento parcial marcaría ausencias falsas).
 *    De las ~356 actividades (casi todas "Pasadas") se quedan las VIGENTES: alguna
 *    `funcion-fecha` desde hace RECENT_DAYS días, estado "Programadas", o sin fecha legible
 *    y sin estado "Pasadas". Orden: lo próximo primero (así `--limit` toma lo próximo).
 *  · enrich: GET del detalle /actividad/<slug>/ (uno por actividad vigente, ~12–20 hoy):
 *    es el único lugar donde fecha y hora vienen emparejadas (`.function-item`).
 *  · parse: puro (parse.ts + dates.ts + venues.ts + disciplines.ts).
 *
 * robots.txt del sitio: vacío (200, 0 bytes: todo permitido, sin Crawl-delay); lo
 * verifica el cliente HTTP. Sin Cloudflare ni challenge (Hostinger CDN).
 */

/** Días hacia atrás que una actividad sigue "vigente" (el pipeline maneja pasado/futuro). */
export const RECENT_DAYS = 7;
const PER_PAGE = 100;
/** Tope de seguridad de páginas por colección (hoy: 4 de actividades, 2 de fechas). */
const MAX_PAGES = 30;
const REQUEST_TIMEOUT_MS = 30_000;
const JSON_HEADERS = { accept: 'application/json' };

const ACTIVITY_FIELDS = [
  'id',
  'slug',
  'link',
  'title',
  'modified',
  'featured_media',
  'funcion-fecha',
  'funcion-hora',
  'sala',
  'estado',
  'tipo-de-actividad',
].join(',');
const TERM_FIELDS = 'id,name,slug';

/** Taxonomías que se resuelven (la `espacio` no: su ruta REST la tapa el CPT `espacio`). */
export const TAXONOMIES = [
  'funcion-fecha',
  'funcion-hora',
  'sala',
  'estado',
  'tipo-de-actividad',
] as const;
type Taxonomy = (typeof TAXONOMIES)[number];

export function activitiesUrl(page: number): string {
  return `${API_URL}actividad?_fields=${ACTIVITY_FIELDS}&orderby=id&order=asc&per_page=${PER_PAGE}&page=${page}`;
}

export function termsUrl(taxonomy: Taxonomy, page: number): string {
  return `${API_URL}${taxonomy}?_fields=${TERM_FIELDS}&orderby=id&order=asc&per_page=${PER_PAGE}&page=${page}`;
}

function headerNumber(headers: Record<string, string>, name: string): number | null {
  const v = Number(headers[name]);
  return Number.isInteger(v) && v >= 0 ? v : null;
}

/**
 * Todas las páginas de una colección del REST. Con `X-WP-TotalPages` (en vivo) se piden
 * exactamente esas; sin cabeceras (fixtures grabados) se corta en la primera página corta.
 */
async function fetchCollection(
  ctx: FetchContext,
  label: string,
  urlOf: (page: number) => string,
): Promise<{ id: number }[]> {
  const items = new Map<number, { id: number }>();
  let announced: number | null = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = urlOf(page);
    let body: string;
    let headers: Record<string, string>;
    try {
      const res = await ctx.http.get(url, { headers: JSON_HEADERS, timeoutMs: REQUEST_TIMEOUT_MS });
      body = res.body;
      headers = res.headers;
    } catch (err) {
      throw new Error(`${label}: página ${page} no disponible (${url}): ${(err as Error).message}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(
        `${label}: la página ${page} no es JSON (empieza con ${JSON.stringify(body.slice(0, 40))})`,
      );
    }
    if (!Array.isArray(json)) throw new Error(`${label}: la página ${page} no es una lista`);
    for (const it of json) {
      const id = (it as { id?: unknown } | null)?.id;
      if (typeof id === 'number') items.set(id, it as { id: number });
    }
    announced = headerNumber(headers, 'x-wp-total') ?? announced;
    const totalPages = headerNumber(headers, 'x-wp-totalpages');
    if (totalPages !== null ? page >= totalPages : json.length < PER_PAGE) {
      if (announced !== null && items.size !== announced) {
        throw new Error(`${label}: el REST anuncia ${announced} y se obtuvieron ${items.size}`);
      }
      return [...items.values()];
    }
  }
  throw new Error(`${label}: más de ${MAX_PAGES} páginas`);
}

interface RestTerm {
  id: number;
  name: string;
  slug: string;
}

interface RestActivity {
  id: number;
  slug?: unknown;
  link?: unknown;
  title?: { rendered?: unknown };
  modified?: unknown;
  featured_media?: unknown;
  [taxonomy: string]: unknown;
}

function termIds(a: RestActivity, taxonomy: Taxonomy): number[] {
  const v = a[taxonomy];
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

/** Ítem del REST + términos resueltos (lo que viaja en RawRecord.listing). */
export function toListingItem(
  a: RestActivity,
  terms: ReadonlyMap<Taxonomy, ReadonlyMap<number, RestTerm>>,
): ListingItem {
  const unresolved: string[] = [];
  const resolve = (taxonomy: Taxonomy): TermRef[] =>
    termIds(a, taxonomy).flatMap((id) => {
      const t = terms.get(taxonomy)?.get(id);
      if (!t) {
        unresolved.push(`${taxonomy}:${id}`);
        return [];
      }
      return [{ id: t.id, name: t.name, slug: t.slug }];
    });
  const item: ListingItem = {
    id: a.id,
    slug: typeof a.slug === 'string' ? a.slug : '',
    link: typeof a.link === 'string' ? a.link : `${BASE_URL}?p=${a.id}`,
    titleHtml: typeof a.title?.rendered === 'string' ? a.title.rendered : '',
    modified: typeof a.modified === 'string' ? a.modified : null,
    featuredMedia:
      typeof a.featured_media === 'number' && a.featured_media > 0 ? a.featured_media : null,
    fechas: resolve('funcion-fecha'),
    horas: resolve('funcion-hora'),
    salas: resolve('sala'),
    estados: resolve('estado'),
    tipos: resolve('tipo-de-actividad'),
    unresolvedTerms: [],
  };
  item.unresolvedTerms = unresolved;
  return item;
}

/** Fechas legibles (YYYY-MM-DD) de los términos `funcion-fecha`. */
function termDates(item: ListingItem): string[] {
  return item.fechas
    .map((t) => parseDateCell(t.name))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`)
    .sort();
}

/**
 * Actividad vigente: alguna fecha desde `cutoff`, o estado "Programadas"/"programado", o
 * sin fecha legible y sin estado "Pasadas" (no se puede descartar sin mirar el detalle).
 */
export function isCurrent(item: ListingItem, cutoff: string): boolean {
  const dates = termDates(item);
  if (dates.some((d) => d >= cutoff)) return true;
  const estados = item.estados.map((t) => t.slug);
  if (estados.some((s) => s.startsWith('programad'))) return true;
  return dates.length === 0 && !estados.includes('pasadas');
}

/**
 * Clave de orden: primero las que tienen fecha desde hoy (la más próxima primero), después
 * las de la última semana y al final las que no tienen fecha legible. Así `--limit` toma
 * lo próximo.
 */
function sortKey(item: ListingItem, today: string, cutoff: string): string {
  const dates = termDates(item);
  const next = dates.find((d) => d >= today);
  if (next) return `0|${next}`;
  const recent = dates.find((d) => d >= cutoff);
  return recent ? `1|${recent}` : '2|';
}

export function cutoffDate(now: DateTime): string {
  return now.minus({ days: RECENT_DAYS }).toISODate() ?? '';
}

export const usinaDelArteConnector: SourceConnector = {
  slug: SOURCE_SLUG,
  meta: {
    name: 'Programación Usina del Arte',
    baseUrl: BASE_URL,
    institutionSlug: INSTITUTION_SLUG,
    kind: 'json_api',
    ready: true,
    politeness: { concurrency: 1, minDelayMs: 1500, timeoutMs: REQUEST_TIMEOUT_MS },
  },

  async discover(ctx: FetchContext): Promise<RawRecord[]> {
    const activities = (await fetchCollection(ctx, 'actividad', activitiesUrl)) as RestActivity[];
    const terms = new Map<Taxonomy, Map<number, RestTerm>>();
    for (const taxonomy of TAXONOMIES) {
      const list = (await fetchCollection(ctx, taxonomy, (p) =>
        termsUrl(taxonomy, p),
      )) as RestTerm[];
      terms.set(taxonomy, new Map(list.map((t) => [t.id, t])));
    }

    const now = ctx.now();
    const cutoff = cutoffDate(now);
    const today = now.toISODate() ?? cutoff;
    const items = activities.map((a) => toListingItem(a, terms));
    const current = items
      .filter((it) => isCurrent(it, cutoff))
      .sort(
        (a, b) => sortKey(a, today, cutoff).localeCompare(sortKey(b, today, cutoff)) || a.id - b.id,
      );
    const unresolved = items.flatMap((it) => it.unresolvedTerms);
    if (unresolved.length > 0) {
      ctx.logger.warn({ unresolved: unresolved.slice(0, 20) }, 'términos sin resolver en el REST');
    }
    ctx.logger.info(
      { activities: items.length, current: current.length, cutoff },
      'actividades en el REST de la Usina',
    );

    const fetchedAt = now.toISO() ?? new Date().toISOString();
    const records: RawRecord[] = current.map((item) => ({
      externalId: String(item.id),
      url: item.link,
      fetchedAt,
      contentType: 'html' as const,
      body: '',
      listing: item,
    }));
    return ctx.limit ? records.slice(0, ctx.limit) : records;
  },

  async enrich(raw: RawRecord, ctx: FetchContext): Promise<RawRecord> {
    const res = await ctx.http.get(raw.url, { timeoutMs: REQUEST_TIMEOUT_MS });
    return { ...raw, body: res.body, fetchedAt: ctx.now().toISO() ?? raw.fetchedAt };
  },

  parse(raw: RawRecord, ctx: ParseContext): ParseResult {
    try {
      return buildEvent(raw, ctx);
    } catch (err) {
      return fail([`parse: ${(err as Error).message}`]);
    }
  },
};
