import {
  BA_TZ,
  baDateTime,
  detectFreeEs,
  htmlToText,
  type LocalTimeParts,
  localDateToParts,
  type NormalizedEventInput,
  type NormalizedOccurrenceInput,
  rangeBounds,
  stripDiacriticsLower,
  toIsoInstant,
} from '@culturaba/shared';
import { type CheerioAPI, load } from 'cheerio';
import { DateTime } from 'luxon';
import { z } from 'zod';
import {
  fail,
  ok,
  type ParseContext,
  type ParseResult,
  type RawRecord,
} from '../../core/connector';
import {
  type CalendarFunction,
  formatTime,
  parseDmy,
  planOccurrences,
  splitSentences,
} from './dates';
import { mapDisciplines } from './disciplines';
import { venueFor } from './venues';

/**
 * Parsers PUROS de www.teatrocervantes.gob.ar (WordPress, tema `tnc`): REST del CPT `obra`,
 * calendario mensual y página de detalle `/obra/<slug>/`.
 * Ver docs/research/teatro-cervantes.md para los selectores y ejemplos literales.
 */

export const SOURCE_SLUG = 'teatro-cervantes';
export const INSTITUTION_SLUG = 'teatro-cervantes';
export const ATTRIBUTION = 'Texto: Teatro Nacional Cervantes';
export const BASE_URL = 'https://www.teatrocervantes.gob.ar/';
export const CATEGORIES_URL = `${BASE_URL}wp-json/wp/v2/categories?per_page=100`;
export const OBRAS_PER_PAGE = 100;
const OBRA_FIELDS = 'id,slug,link,modified,title,fecha_estreno,ultima_funcion,categories';

/** Obras ordenadas por última modificación (una obra vigente se editó hace poco). */
export function obrasUrl(page: number): string {
  const base = `${BASE_URL}wp-json/wp/v2/obra?per_page=${OBRAS_PER_PAGE}&orderby=modified&order=desc&_fields=${OBRA_FIELDS}`;
  return page > 1 ? `${base}&page=${page}` : base;
}

/** Obras puntuales por slug (las que el calendario lista y la página de modificadas no trajo). */
export function obrasBySlugUrl(slugs: readonly string[]): string {
  return `${BASE_URL}wp-json/wp/v2/obra?per_page=${OBRAS_PER_PAGE}&slug=${slugs.join(',')}&_fields=${OBRA_FIELDS}`;
}

export function calendarUrl(year: number, month: number): string {
  return `${BASE_URL}calendario/?mes=${String(month).padStart(2, '0')}&a=${year}`;
}

/**
 * Categorías cuyo contenido no es un evento presencial en la Ciudad: CulturaBA cubre CABA.
 * "En el país"/"En gira" son giras por las provincias (General Roca, Lago Puelo…),
 * Tecnópolis está en Villa Martelli (provincia) y "Cervantes Online" (con sus hijas) es
 * programación por streaming. Se excluyen en discover; parse las rechaza si llegan igual.
 */
export const EXCLUDED_CATEGORY_SLUGS: Readonly<Record<string, string>> = {
  'en-el-pais': 'gira por el país (fuera de la Ciudad)',
  giras: 'gira (fuera de la Ciudad)',
  tecnopolis: 'Tecnópolis (fuera de la Ciudad)',
  'cervantes-online': 'programación online',
  'nuestro-teatro': 'programación online',
  'nuestro-teatro-federal': 'programación online',
  dialogos: 'programación online',
};

/** Mismas exclusiones según la etiqueta del detalle (`p.is-sala-single`). */
const EXCLUDED_LABELS: Readonly<Record<string, string>> = {
  'en el pais': 'gira por el país (fuera de la Ciudad)',
  'en gira': 'gira (fuera de la Ciudad)',
  'cervantes online': 'programación online',
};

function norm(text: string): string {
  return stripDiacriticsLower(text).replace(/\s+/g, ' ').trim();
}

function nullable(value: string | undefined | null): string | null {
  const v = (value ?? '').replace(/\s+/g, ' ').trim();
  return v.length > 0 ? v : null;
}

// ── REST ───────────────────────────────────────────────────────────────────

export const ObraSchema = z.object({
  id: z.number().int(),
  slug: z.string().min(1),
  link: z.url(),
  modified: z.string(),
  title: z.object({ rendered: z.string() }),
  fecha_estreno: z.string().nullish(),
  ultima_funcion: z.string().nullish(),
  categories: z.array(z.number().int()).default([]),
});
export type Obra = z.infer<typeof ObraSchema>;

/** Página del REST: lanza si no es un arreglo (otro markup, error del servidor). */
export function parseObrasPage(body: string): {
  obras: Obra[];
  received: number;
  invalid: number;
  lastModified: string | null;
} {
  const json: unknown = JSON.parse(body);
  if (!Array.isArray(json)) throw new Error('el REST de obras no devolvió un arreglo');
  const obras: Obra[] = [];
  let invalid = 0;
  for (const item of json) {
    const parsed = ObraSchema.safeParse(item);
    if (parsed.success) obras.push(parsed.data);
    else invalid += 1;
  }
  const last: unknown = json.at(-1);
  const lastModified =
    last && typeof last === 'object' && 'modified' in last && typeof last.modified === 'string'
      ? last.modified
      : null;
  return { obras, received: json.length, invalid, lastModified };
}

export const CategorySchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
});
export type Category = z.infer<typeof CategorySchema>;

export function parseCategories(body: string): Map<number, Category> {
  const json: unknown = JSON.parse(body);
  const parsed = z.array(CategorySchema).safeParse(json);
  if (!parsed.success || parsed.data.length === 0) {
    throw new Error('el REST de categorías no devolvió la lista esperada');
  }
  return new Map(parsed.data.map((c) => [c.id, { ...c, name: htmlToText(c.name) }]));
}

export interface SelectedObra {
  obra: Obra;
  categories: Category[];
  reason: string;
}

/**
 * Obras que importan hoy: temporada con `ultima_funcion` ≥ hoy, o sin última función publicada
 * pero listadas en el calendario del sitio (ciclos y visitas abiertas). Las de fuera de la
 * Ciudad u online se descartan con el motivo.
 */
export function selectCurrentObras(
  obras: readonly Obra[],
  categories: ReadonlyMap<number, Category>,
  calendarSlugs: ReadonlySet<string>,
  today: string,
): { selected: SelectedObra[]; skipped: Array<{ slug: string; reason: string }> } {
  const selected: SelectedObra[] = [];
  const skipped: Array<{ slug: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const obra of obras) {
    if (seen.has(obra.slug)) continue;
    seen.add(obra.slug);
    const cats = obra.categories
      .map((id) => categories.get(id))
      .filter((c): c is Category => c !== undefined);
    const end = parseDmy(obra.ultima_funcion);
    const listed = calendarSlugs.has(obra.slug);
    const current = end ? end >= today : listed;
    if (!current) continue;
    const excluded = cats.find((c) => EXCLUDED_CATEGORY_SLUGS[c.slug]);
    if (excluded) {
      skipped.push({ slug: obra.slug, reason: EXCLUDED_CATEGORY_SLUGS[excluded.slug] ?? '' });
      continue;
    }
    selected.push({
      obra,
      categories: cats,
      reason: end
        ? `última función ${end}`
        : 'sin última función publicada; listada en el calendario',
    });
  }
  return { selected, skipped };
}

// ── Calendario (/calendario/?mes=MM&a=AAAA) ────────────────────────────────

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export interface CalendarEntry {
  /** YYYY-MM-DD (de `td#li-YYYY-MM-DD`). */
  date: string;
  /** HH:mm */
  time: string;
  /** Texto literal de la hora ("18:00hs."). */
  hourText: string;
  slug: string;
  url: string;
  title: string;
  /** Categoría que encabeza el bloque del día ("En el teatro"). */
  label: string | null;
}

export interface CalendarPage {
  recognized: boolean;
  year: number | null;
  month: number | null;
  entries: CalendarEntry[];
  warnings: string[];
}

/** Slug de /obra/<slug>/ (null si no es una URL de obra). */
export function slugFromObraUrl(url: string): string | null {
  try {
    const segments = new URL(url, BASE_URL).pathname.split('/').filter(Boolean);
    return segments[0] === 'obra' && segments[1] ? segments[1] : null;
  } catch {
    return null;
  }
}

/**
 * `table#calendario td#li-YYYY-MM-DD ul.eventos`: un `li` con `a.category-calendario` abre un
 * bloque de categoría; cada `li` siguiente es una función (`div.calendar-hora` + enlace a la obra).
 */
export function parseCalendarPage(html: string): CalendarPage {
  const $ = load(html);
  const out: CalendarPage = {
    recognized: false,
    year: null,
    month: null,
    entries: [],
    warnings: [],
  };
  const table = $('table#calendario');
  const title = norm($('#calendar .header .title').first().text());
  const tm = /^([a-z]+)\s+(\d{4})$/.exec(title);
  if (table.length === 0 || !tm) return out;
  out.recognized = true;
  out.month = MONTHS[tm[1] ?? ''] ?? null;
  out.year = Number(tm[2]);
  const prefix =
    out.month !== null ? `${out.year}-${String(out.month).padStart(2, '0')}-` : 'sin-mes';

  table.find('td[id^="li-"]').each((_, td) => {
    const date = /^li-(\d{4}-\d{2}-\d{2})$/.exec($(td).attr('id') ?? '')?.[1];
    if (!date) return; // celdas de relleno (id="li-")
    if (!date.startsWith(prefix)) {
      out.warnings.push(`día ${date} fuera del mes del calendario (${title}), se ignora`);
      return;
    }
    let label: string | null = null;
    $(td)
      .find('ul.eventos > li')
      .each((__, li) => {
        const cat = $(li).find('a.category-calendario').first();
        if (cat.length > 0) {
          label = nullable(cat.text());
          return;
        }
        const hourText = nullable($(li).find('.calendar-hora').first().text()) ?? '';
        const link = $(li).find('a[href]').first();
        const url = link.attr('href') ?? '';
        const slug = slugFromObraUrl(url);
        const name = nullable(link.text()) ?? '';
        const hm = /^(\d{1,2})[:.](\d{2})\s*(?:hs?\.?)?$/i.exec(hourText);
        const hour = Number(hm?.[1]);
        const minute = Number(hm?.[2]);
        if (!slug || !hm || hour > 23 || minute > 59) {
          out.warnings.push(`fila del ${date} ilegible ("${hourText}" ${url}), se ignora`);
          return;
        }
        out.entries.push({
          date,
          time: formatTime({ hour, minute }),
          hourText,
          slug,
          url,
          title: name,
          label,
        });
      });
  });
  return out;
}

// ── Detalle (/obra/<slug>/) ────────────────────────────────────────────────

export interface DetailData {
  title: string | null;
  subtitle: string | null;
  /** Etiqueta de contexto (`p.is-sala-single`): "EN EL TEATRO", "VISITA GUIADA", "EN EL PAÍS". */
  label: string | null;
  /** Sala (`p.sala-single b`): "SALA ORESTES CAVIGLIA"; vacía en visitas guiadas. */
  sala: string | null;
  ticketsUrl: string | null;
  imageUrl: string | null;
  description: string | null;
  /** Texto del bloque lateral (`.sidebar-block > b`), con saltos de línea. */
  scheduleText: string;
  fechaEstrenoText: string | null;
  ultimaFuncionText: string | null;
  /** "Localidades:" del bloque lateral. */
  priceText: string | null;
  canonicalUrl: string | null;
}

export function isDetailPage(html: string): boolean {
  if (!html) return false;
  const $ = load(html);
  return $('h3.obra-title').length > 0 && $('.sidebar-block').length > 0;
}

function absoluteUrl(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    return new URL(u).toString();
  } catch {
    return null;
  }
}

function sidebarValue($: CheerioAPI, prefix: string): string | null {
  const p = $('.sidebar-block')
    .first()
    .find('p')
    .filter((_, el) => norm($(el).text()).startsWith(norm(prefix)))
    .first();
  return p.length ? nullable(p.find('b').first().text()) : null;
}

function tabText($: CheerioAPI, id: string): string | null {
  const pane = $(`#${id} > div`).first().clone();
  pane.find('script, style, noscript, audio, .wp-playlist').remove();
  const text = htmlToText(pane.html() ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
  return nullable(text) ? text : null;
}

export function parseDetail(html: string): DetailData {
  const $ = load(html);
  const head = $('h3.obra-title').first();
  const subtitle = head
    .nextAll('p')
    .first()
    .find('span')
    .map((_, el) => nullable($(el).text()))
    .get()
    .filter((s): s is string => Boolean(s))
    .join(' · ');
  const sidebar = $('.sidebar-block').first();
  const scheduleText = htmlToText(sidebar.children('b').first().html() ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n');
  return {
    title: nullable($('meta[property="og:title"]').attr('content')) ?? nullable(head.text()),
    subtitle: nullable(subtitle),
    label: nullable($('p.is-sala-single').first().text()),
    sala: nullable($('p.sala-single').first().text()),
    ticketsUrl: absoluteUrl($('p.comprar-entradas a[href]').first().attr('href')),
    imageUrl:
      absoluteUrl($('meta[property="og:image"]').attr('content')) ??
      absoluteUrl($('img#banner').attr('src')),
    description: tabText($, 'obra') ?? tabText($, 'informacion'),
    scheduleText,
    fechaEstrenoText: sidebarValue($, 'Fecha estreno'),
    ultimaFuncionText: sidebarValue($, 'Última función'),
    priceText: sidebarValue($, 'Localidades:'),
    canonicalUrl: absoluteUrl($('link[rel="canonical"]').attr('href')),
  };
}

// ── Evento normalizado ─────────────────────────────────────────────────────

/** Datos del REST + calendario que viajan en RawRecord.listing. */
export const ListingItemSchema = z.object({
  postId: z.number().int(),
  slug: z.string().min(1),
  link: z.url(),
  title: z.string(),
  modified: z.string(),
  fechaEstreno: z.string().nullable(),
  ultimaFuncion: z.string().nullable(),
  categories: z.array(CategorySchema),
  calendar: z.array(z.object({ date: z.string(), time: z.string(), hourText: z.string() })),
  /** Ventana del calendario leída en la corrida (desde hoy hasta fin del último mes). */
  calendarWindow: z.object({ start: z.string(), end: z.string() }).nullable(),
});
export type ListingItem = z.infer<typeof ListingItemSchema>;

function timeParts(hhmm: string): LocalTimeParts | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

/** Precio solo si la página lo dice: "Localidades:" o una frase de gratuidad del bloque lateral. */
export function priceFrom(detail: Pick<DetailData, 'priceText' | 'scheduleText'> | null): {
  priceText: string | null;
  isFree: boolean | undefined;
} {
  const localidades = detail?.priceText ?? null;
  if (localidades) {
    const isFree = /\$\s*\d/.test(localidades) ? undefined : detectFreeEs(localidades);
    return { priceText: localidades, isFree };
  }
  const sentence = splitSentences(detail?.scheduleText ?? '').find(
    (s) => detectFreeEs(s) === true && !/\$\s*\d/.test(s),
  );
  return sentence ? { priceText: sentence, isFree: true } : { priceText: null, isFree: undefined };
}

export function buildEvent(raw: RawRecord, ctx: ParseContext): ParseResult {
  const listingParsed = ListingItemSchema.safeParse(raw.listing);
  const listing = listingParsed.success ? listingParsed.data : null;
  const detail =
    raw.contentType === 'html' && isDetailPage(raw.body) ? parseDetail(raw.body) : null;
  if (!listing && !detail) {
    const issues =
      raw.listing !== undefined && !listingParsed.success
        ? listingParsed.error.issues.map((i) => `listado: ${i.path.join('.')}: ${i.message}`)
        : [];
    return fail(['sin datos del REST ni página de detalle reconocible', ...issues]);
  }
  const warnings: string[] = [];
  if (!detail) warnings.push('sin página de detalle: se usan solo el REST y el calendario');

  const slug = slugFromObraUrl(raw.url) ?? listing?.slug ?? raw.externalId;
  const title = listing ? htmlToText(listing.title) : (detail?.title ?? '');
  if (!title) return fail(['sin título']);

  // Fuera de la Ciudad u online: nunca se publica (discover ya debería haberla excluido).
  const categories = listing?.categories ?? [];
  const excludedCat = categories.find((c) => EXCLUDED_CATEGORY_SLUGS[c.slug]);
  const excludedLabel = detail?.label ? EXCLUDED_LABELS[norm(detail.label)] : undefined;
  if (excludedCat || excludedLabel) {
    const why = excludedCat ? EXCLUDED_CATEGORY_SLUGS[excludedCat.slug] : excludedLabel;
    return fail([`fuera del alcance de CulturaBA: ${why} (${detail?.sala ?? 'sin sede'})`]);
  }

  const categorySlugs = categories.map((c) => c.slug);
  const mapping = mapDisciplines({
    categorySlugs,
    label: detail?.label ?? null,
    title,
  });
  warnings.push(...mapping.warnings);

  // Temporada: campos del REST; el detalle repite los mismos textos.
  const estrenoText = listing?.fechaEstreno ?? detail?.fechaEstrenoText ?? null;
  const ultimaText = listing?.ultimaFuncion ?? detail?.ultimaFuncionText ?? null;
  const season = { start: parseDmy(estrenoText), end: parseDmy(ultimaText) };
  if (estrenoText && !season.start) warnings.push(`fecha de estreno ilegible "${estrenoText}"`);
  if (ultimaText && !season.end) warnings.push(`última función ilegible "${ultimaText}"`);
  if (
    detail?.ultimaFuncionText &&
    listing?.ultimaFuncion &&
    parseDmy(detail.ultimaFuncionText) !== season.end
  ) {
    warnings.push(
      `la última función del detalle (${detail.ultimaFuncionText}) difiere de la del REST (${listing.ultimaFuncion})`,
    );
  }
  const seasonText =
    [
      estrenoText ? `Fecha estreno ${estrenoText}` : null,
      ultimaText ? `Última función ${ultimaText}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null;

  // Venue: sala publicada; "En el teatro" = edificio de Libertad 815.
  const inBuilding =
    categorySlugs.includes('en-el-teatro') || norm(detail?.label ?? '') === 'en el teatro';
  const venueRes = venueFor(detail?.sala, inBuilding);
  if (venueRes.warning) warnings.push(venueRes.warning);
  const venue = venueRes.venue;

  // Funciones.
  const calendar: CalendarFunction[] = [];
  for (const c of listing?.calendar ?? []) {
    const time = timeParts(c.time);
    if (time)
      calendar.push({ date: c.date, time, sourceText: `Calendario ${c.date} · ${c.hourText}` });
  }
  const plan = planOccurrences({
    calendar,
    calendarWindow: listing?.calendarWindow ?? null,
    scheduleText: detail?.scheduleText ?? '',
    season,
    seasonText,
    now: ctx.now(),
  });
  warnings.push(...plan.warnings);

  const ticketsUrl = detail?.ticketsUrl ?? null;
  const { priceText, isFree } = priceFrom(detail);
  const price = priceText
    ? { text: priceText, verified: true, ...(isFree !== undefined ? { isFree } : {}) }
    : null;

  const occurrences: NormalizedOccurrenceInput[] = plan.specs.map((spec) => {
    if (spec.kind === 'timed') {
      return {
        externalId: `${slug}|${spec.date}|${formatTime(spec.time)}`,
        kind: 'timed',
        startsAt: toIsoInstant(baDateTime(localDateToParts(spec.date), spec.time)),
        endsAt: null,
        startDate: spec.date,
        endDate: spec.date,
        timezone: BA_TZ,
        scheduleText: null,
        recurrenceRule: null,
        sourceDateText: spec.sourceText,
        venue,
        status: spec.status,
        ...(spec.statusReason ? { statusReason: spec.statusReason } : {}),
        ticketsUrl,
        price,
      };
    }
    const bounds = rangeBounds(spec.start, spec.end);
    return {
      // Sin el fin: una prórroga actualiza la ocurrencia en vez de reemplazarla.
      externalId: `${slug}|range|${spec.start}`,
      kind: 'range',
      startsAt: bounds.startsAt,
      endsAt: bounds.endsAt,
      startDate: spec.start,
      endDate: spec.end,
      timezone: BA_TZ,
      scheduleText: spec.scheduleText,
      recurrenceRule: null,
      sourceDateText: spec.sourceText,
      venue,
      status: 'scheduled',
      ticketsUrl,
      price,
    };
  });

  const officialUrl = detail?.canonicalUrl ?? listing?.link ?? raw.url;
  const rawFragment = JSON.stringify({
    listing,
    label: detail?.label ?? null,
    sala: detail?.sala ?? null,
    scheduleText: detail?.scheduleText ?? null,
    priceText: detail?.priceText ?? null,
    form: plan.form,
  }).slice(0, 20_000);

  const event: NormalizedEventInput = {
    source: SOURCE_SLUG,
    externalId: slug,
    url: raw.url,
    capturedAt: raw.fetchedAt,
    title,
    ...(detail?.subtitle ? { subtitle: detail.subtitle } : {}),
    ...(detail?.description ? { description: detail.description } : {}),
    attribution: ATTRIBUTION,
    disciplines: mapping.disciplines,
    institutionSlug: INSTITUTION_SLUG,
    officialUrl,
    // La ficha canónica, para que un agregador (Linda) que la enlace se deduplique con esta fuente.
    sameAsUrls: [officialUrl],
    ...(ticketsUrl ? { ticketsUrl } : {}),
    ...(detail?.imageUrl ? { imageUrl: detail.imageUrl } : {}),
    ...(priceText ? { priceText } : {}),
    ...(isFree !== undefined ? { isFree } : {}),
    priceVerified: priceText !== null,
    tags: mapping.tags,
    occurrences,
    rawFragment,
  };
  // NormalizedEventSchema.parse aplica los defaults; el pipeline vuelve a validar.
  return ok(event as never, warnings);
}

/** Fin del último mes leído del calendario (YYYY-MM-DD). */
export function endOfMonth(year: number, month: number): string {
  return (
    DateTime.fromObject({ year, month, day: 1 }, { zone: BA_TZ }).endOf('month').toISODate() ?? ''
  );
}
