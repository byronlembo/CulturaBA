import {
  allDayBounds,
  BA_TZ,
  baDateTime,
  detectFreeEs,
  detectStatusEs,
  htmlToText,
  localDateToParts,
  type NormalizedEventInput,
  type NormalizedOccurrenceInput,
  type Price,
  rangeBounds,
  toIsoInstant,
  type VenueRef,
} from '@culturaba/shared';
import { load } from 'cheerio';
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
  type AgendaSchedule,
  exhibitionRange,
  formatTime,
  leadingTimes,
  normalizeLine,
  parseAgendaSchedule,
  parseDateLine,
  specEndDate,
  todayOf,
} from './dates';
import { mapAgendaDisciplines, mapExhibitionDisciplines } from './disciplines';
import { type PlaceResolution, placeFromLine, placeFromLocation } from './venues';

/**
 * Parsers PUROS de museomoderno.org (WordPress + Elementor + JetEngine + WPML).
 * Ver docs/research/museo-moderno.md para endpoints, selectores y ejemplos literales.
 */

export const SOURCE_SLUG = 'museo-moderno';
/** Mismo slug que la institución derivada de Linda (slugify("Museo Moderno")). */
export const INSTITUTION_SLUG = 'museo-moderno';
export const ATTRIBUTION = 'Texto: Museo de Arte Moderno de Buenos Aires';
export const BASE_URL = 'https://museomoderno.org/';
export const VISIT_URL = `${BASE_URL}planea-tu-visita/`;

const RAW_FRAGMENT_MAX = 20_000;
const DESCRIPTION_MAX = 4_000;
/** Bajadas cortas escritas a mano ("Ciclo de cine y video experimental") son el subtítulo. */
const SUBTITLE_MAX = 100;

// ── Ítems de la REST API ───────────────────────────────────────────────────

/** Ítem de /wp-json/wp/v2/{agenda,exposiciones} tal como llega (solo lo que se usa). */
export const RestItemSchema = z.object({
  id: z.number().int(),
  slug: z.string().min(1),
  link: z.string().url(),
  date: z.string(),
  modified: z.string(),
  title: z.object({ rendered: z.string() }),
  excerpt: z.object({ rendered: z.string() }).optional(),
  content: z.object({ rendered: z.string() }),
  _embedded: z
    .object({
      'wp:featuredmedia': z
        .array(
          z.looseObject({ source_url: z.string().optional(), media_type: z.string().optional() }),
        )
        .optional(),
    })
    .optional(),
});
export type RestItem = z.infer<typeof RestItemSchema>;

/** Ítem recortado que viaja en RawRecord (sin `_links` ni tamaños de imagen). */
export const ItemDataSchema = z.object({
  id: z.number().int(),
  slug: z.string().min(1),
  link: z.string().url(),
  /** Publicación y última modificación, hora local del sitio (Buenos Aires), sin zona. */
  date: z.string(),
  modified: z.string(),
  titleHtml: z.string(),
  excerptHtml: z.string(),
  contentHtml: z.string(),
  imageUrl: z.string().url().nullable(),
});
export type ItemData = z.infer<typeof ItemDataSchema>;

function absoluteHttpUrl(value: string | null | undefined): string | null {
  const s = (value ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

export function toItemData(item: RestItem): ItemData {
  const media = item._embedded?.['wp:featuredmedia']?.[0];
  const imageUrl =
    media && (media.media_type === undefined || media.media_type === 'image')
      ? absoluteHttpUrl(media.source_url)
      : null;
  return {
    id: item.id,
    slug: item.slug,
    link: item.link,
    date: item.date,
    modified: item.modified,
    titleHtml: item.title.rendered,
    excerptHtml: item.excerpt?.rendered ?? '',
    contentHtml: item.content.rendered,
    imageUrl,
  };
}

/** Página en inglés de WPML ("/en/…"): no se ingiere. */
export function isEnglishUrl(url: string): boolean {
  try {
    return /^\/en(?:\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * WPML: la REST sin prefijo devuelve el idioma por defecto (español), pero por las dudas se
 * descartan traducciones ("/en/exhibitions/…", "/en/agenda/…") y duplicados por id o slug
 * (la traducción inglesa de una muestra es otro post, con OTRO id y el MISMO slug).
 */
export function spanishOnly<T extends { id: number; slug: string; link: string }>(
  items: readonly T[],
): T[] {
  const ids = new Set<number>();
  const slugs = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (isEnglishUrl(item.link) || ids.has(item.id) || slugs.has(item.slug)) continue;
    ids.add(item.id);
    slugs.add(item.slug);
    out.push(item);
  }
  return out;
}

// ── Texto del contenido (Elementor) ────────────────────────────────────────

export interface ContentLink {
  href: string;
  text: string;
  /** Botón de Elementor ("¡INSCRIBITE!", "¡Conseguí tus entradas!"). */
  button: boolean;
}

export interface ContentLine {
  text: string;
  links: ContentLink[];
}

const LINK_MARK_RE = /\uE000(\d+)\uE001/g;

function cleanText(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto plano de un fragmento HTML simple (título, bajada). */
export function plainText(html: string): string {
  return cleanText(htmlToText(html));
}

/**
 * Contenido Elementor → líneas de texto en orden (cortadas en </p>, </div>, <br>…), cada una
 * con los enlaces que contiene. Los botones quedan como su propia línea.
 */
export function contentLines(html: string): ContentLine[] {
  const $ = load(html, null, false);
  $('script, style, noscript, iframe, img, svg').remove();
  const links: ContentLink[] = [];
  $('a').each((i, el) => {
    const a = $(el);
    links.push({
      href: (a.attr('href') ?? '').trim(),
      text: cleanText(a.text()),
      button: (a.attr('class') ?? '').includes('elementor-button'),
    });
    a.replaceWith(`${a.html() ?? ''}\uE000${i}\uE001`);
  });
  const out: ContentLine[] = [];
  for (const rawLine of htmlToText($.html()).split('\n')) {
    const lineLinks: ContentLink[] = [];
    const text = cleanText(
      rawLine.replace(LINK_MARK_RE, (_, i: string) => {
        const link = links[Number(i)];
        if (link) lineLinks.push(link);
        return '';
      }),
    );
    if (text || lineLinks.length) out.push({ text, links: lineLinks });
  }
  return out;
}

/** Parámetros de campaña; `usp` es el de Google Forms ("?usp=publish-editor", "?usp=header"). */
const TRACKING_PARAMS = /^(?:_gl|_ga|utm_[a-z]+|gclid|fbclid|mc_[a-z]+|usp)$/i;

export function cleanLinkUrl(href: string | null | undefined): string | null {
  const url = absoluteHttpUrl(href);
  if (!url) return null;
  const u = new URL(url);
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  return u.toString();
}

const TICKET_BUTTON_RE = /inscrib|entradas?|conseg|reserv|postul|compr/i;
const INSCRIPTION_LINE_RE = /inscripci|postulaci|entradas/i;

/**
 * Enlace para conseguir lugar: primero el botón de inscripción/entradas ("¡INSCRIBITE!",
 * "¡Conseguí tus entradas!"); si no hay, el "AQUÍ" de la línea de inscripción.
 */
export function ticketsUrlOf(lines: readonly ContentLine[]): string | null {
  const links = lines.flatMap((line) => line.links.map((link) => ({ line, link })));
  const button = links.find(({ link }) => link.button && TICKET_BUTTON_RE.test(link.text));
  const inline = links.find(
    ({ line, link }) =>
      !link.button && /^aqu[ií]$/i.test(link.text) && INSCRIPTION_LINE_RE.test(line.text),
  );
  return cleanLinkUrl(button?.link.href) ?? cleanLinkUrl(inline?.link.href);
}

// ── Precio ─────────────────────────────────────────────────────────────────

const PRICE_LINE_RE = /^(?:actividad|entrada|entradas|acceso|ingreso)\b/;
const AMOUNT_RE = /\$\s?(\d{1,3}(?:\.\d{3})+|\d+)/g;

export interface PriceInfo {
  text: string;
  isFree?: boolean;
  min?: number;
  max?: number;
}

/**
 * Precio SOLO si la actividad lo publica: "Actividad gratuita con inscripción previa AQUÍ",
 * "Entrada libre y gratuita" (gratis), "Actividad arancelada con inscripción previa" (paga, sin
 * importe) o una línea con importes. "Actividad presencial sin inscripción previa" o "Entradas a
 * la venta en boletería y EntradasBA" no dicen precio → null.
 */
export function priceOf(lines: readonly ContentLine[]): PriceInfo | null {
  for (const line of lines) {
    const cleaned = normalizeLine(line.text);
    if (!PRICE_LINE_RE.test(cleaned)) continue;
    const amounts = [...line.text.matchAll(AMOUNT_RE)].map((m) =>
      Number((m[1] ?? '').replace(/\./g, '')),
    );
    const free = detectFreeEs(cleaned) === true;
    const paid = /\barancelad[oa]s?\b/.test(cleaned);
    if (!free && !paid && amounts.length === 0) continue;
    const text = line.text.replace(/\s*aqu[ií]\s*[.!]?\s*$/i, '').replace(/[\s.,;:]+$/, '');
    if (amounts.length > 0) {
      return { text, isFree: false, min: Math.min(...amounts), max: Math.max(...amounts) };
    }
    return { text, isFree: free && !paid };
  }
  return null;
}

// ── Exposiciones: listado, ficha y página de visita ────────────────────────

export type ExhibitionTab = 'presentes' | 'futuras' | 'pasadas';

export interface ExhibitionCard {
  postId: number;
  url: string;
  title: string;
  tab: ExhibitionTab;
  /** Texto de fecha de la tarjeta: "Hasta el 28 de Febrero de 2027" (presentes) u "Octubre 2026". */
  dateText: string | null;
}

function tabKey(label: string): ExhibitionTab | null {
  const k = normalizeLine(label);
  if (k.startsWith('presente') || k.startsWith('actual')) return 'presentes';
  if (k.startsWith('futura') || k.startsWith('proxima')) return 'futuras';
  if (k.startsWith('pasada') || k.startsWith('anterior')) return 'pasadas';
  return null;
}

/**
 * /exposiciones/: pestañas JetTabs "Pasadas" / "Presentes" / "Futuras"
 * (`.jet-tabs__control[aria-controls]` → `#jet-tabs-content-*`), cada una con grillas JetEngine
 * de `.jet-listing-grid__item[data-post-id]` (título en `h2 a`, fecha en
 * `.jet-listing-dynamic-field__content`). Null si la página no tiene esas pestañas.
 */
export function parseExhibitionListing(html: string): ExhibitionCard[] | null {
  const $ = load(html);
  const controls = $('.jet-tabs__control[aria-controls]');
  if (controls.length === 0) return null;
  const cards: ExhibitionCard[] = [];
  let recognized = 0;
  controls.each((_, el) => {
    const control = $(el);
    const tab = tabKey(control.find('.jet-tabs__label-text').first().text());
    const panelId = control.attr('aria-controls');
    if (!tab || !panelId) return;
    recognized += 1;
    $(`#${panelId}`)
      .find('.jet-listing-grid__item[data-post-id]')
      .each((__, item) => {
        const card = $(item);
        const postId = Number(card.attr('data-post-id'));
        const link = card.find('h2 a[href], h3 a[href]').first();
        const url = absoluteHttpUrl(link.attr('href'));
        if (!Number.isInteger(postId) || !url) return;
        const dateText = cleanText(card.find('.jet-listing-dynamic-field__content').first().text());
        cards.push({ postId, url, title: cleanText(link.text()), tab, dateText: dateText || null });
      });
  });
  return recognized > 0 ? cards : null;
}

export interface ExhibitionDetail {
  postId: number | null;
  /** "Inicio: 20 de Agosto de 2026" tal cual. */
  startText: string | null;
  /** "Fin: 30 de Abril de 2027" tal cual. */
  endText: string | null;
  canonicalUrl: string | null;
  /** Traducciones que el propio sitio declara (hreflang ≠ es). */
  translations: string[];
  title: string | null;
  imageUrl: string | null;
}

export function isExhibitionDetail(html: string): boolean {
  if (!html) return false;
  return load(html)('body').hasClass('single-exposiciones');
}

/** Ficha /exposiciones/<slug>/: bloque "Fecha" de JetEngine, canonical y hreflang. */
export function parseExhibitionDetail(html: string): ExhibitionDetail {
  const $ = load(html);
  const postId = /\bpostid-(\d+)\b/.exec($('body').attr('class') ?? '')?.[1];
  const fields = $('.jet-listing-dynamic-field__content')
    .map((_, el) => cleanText($(el).text()))
    .get();
  const translations = $('link[rel="alternate"][hreflang]')
    .filter((_, el) => {
      const lang = ($(el).attr('hreflang') ?? '').toLowerCase();
      return lang !== '' && lang !== 'es' && lang !== 'x-default';
    })
    .map((_, el) => absoluteHttpUrl($(el).attr('href')))
    .get()
    .filter((u): u is string => typeof u === 'string');
  const ogTitle = cleanText($('meta[property="og:title"]').attr('content') ?? '').replace(
    /\s+-\s+Museo Moderno$/,
    '',
  );
  return {
    postId: postId ? Number(postId) : null,
    startText: fields.find((f) => /^inicio\s*:/i.test(f)) ?? null,
    endText: fields.find((f) => /^fin\s*:/i.test(f)) ?? null,
    canonicalUrl: absoluteHttpUrl($('link[rel="canonical"]').attr('href')),
    translations: [...new Set(translations)],
    title: ogTitle || null,
    imageUrl: absoluteHttpUrl($('meta[property="og:image"]').attr('content')),
  };
}

/** Líneas de texto visibles de una página completa (sin scripts ni estilos). */
function pageLines(html: string): string[] {
  const $ = load(html);
  $('script, style, noscript, iframe, svg, head').remove();
  return htmlToText($('body').html() ?? '')
    .split('\n')
    .map(cleanText)
    .filter((l) => l.length > 0);
}

/**
 * Horario publicado en /planea-tu-visita/ (bloque "HORARIO" hasta "ENTRADAS"), sin la línea de
 * recorridos públicos: "Lunes, miércoles, jueves y viernes: 11:00 a 19:00 h · Sábados, domingos
 * y feriados: 11:00 a 20:00 h · (Martes cerrado excepto feriados)". Null si no está.
 */
export function parseVisitHours(html: string): string | null {
  const lines = pageLines(html);
  const start = lines.findIndex((l) => normalizeLine(l) === 'horario');
  if (start === -1) return null;
  const hours: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const k = normalizeLine(line);
    if (k === 'entradas' || hours.length >= 6) break;
    if (k.startsWith('recorridos')) continue;
    hours.push(line);
  }
  return hours.length > 0 ? hours.join(' · ') : null;
}

// ── Listing (RawRecord.listing) ────────────────────────────────────────────

export const ListingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agenda') }),
  z.object({
    kind: z.literal('exposicion'),
    tab: z.enum(['presentes', 'futuras']),
    /** Texto de la tarjeta del listado ("Hasta el 28 de Febrero de 2027"). */
    dateText: z.string().nullable(),
    listingTitle: z.string(),
    item: ItemDataSchema.nullable(),
    /** Horario de /planea-tu-visita/ (solo para muestras en la sede). */
    visitHours: z.string().nullable(),
  }),
]);
export type Listing = z.infer<typeof ListingSchema>;
export type ExhibitionListing = Extract<Listing, { kind: 'exposicion' }>;

// ── Agenda ─────────────────────────────────────────────────────────────────

/**
 * Ancla del año para fechas sin año ni día de semana: la PUBLICACIÓN del ítem (un anuncio se
 * publica antes de la actividad). La modificación no sirve: el sitio retoca entradas viejas
 * ("semana-aniversario", publicada en marzo, dice "17 de abril" y anclada en octubre daría 2027).
 */
function publishedOf(item: ItemData): DateTime {
  const dt = DateTime.fromISO(item.date, { zone: BA_TZ });
  return dt.isValid ? dt : DateTime.fromISO(item.modified, { zone: BA_TZ });
}

/** Funciones de un ítem de agenda (lo usan discover, para filtrar, y parse). */
export function agendaScheduleOf(item: ItemData, now: DateTime): AgendaSchedule {
  return parseAgendaSchedule({
    lines: contentLines(item.contentHtml).map((l) => l.text),
    now,
    anchor: publishedOf(item),
  });
}

/** ¿Tiene alguna función de hoy en adelante? */
export function hasCurrentDates(schedule: AgendaSchedule, now: DateTime): boolean {
  const today = todayOf(now);
  return schedule.specs.some((s) => specEndDate(s) >= today);
}

/** Bajada escrita a mano (corta, sin "[…]") → subtítulo; la automática es el inicio del texto. */
function manualExcerpt(excerpt: string): string | null {
  if (!excerpt || excerpt.length > SUBTITLE_MAX || /(?:\[…\]|\[\.\.\.\]|…)$/.test(excerpt))
    return null;
  return excerpt;
}

function statusFromTitle(title: string): 'cancelled' | 'postponed' | null {
  const segments = title.split(/\s[-–—|]\s|:\s|[()[\]]/).slice(1);
  for (const s of segments) {
    const status = detectStatusEs(s);
    if (status === 'cancelled' || status === 'postponed') return status;
  }
  return null;
}

/** ¿Línea de fecha u hora suelta ("19 h", "16.30 h – Performance")? */
function isScheduleLine(text: string): boolean {
  return parseDateLine(text) !== null || leadingTimes(text).length > 0;
}

const BLOCK_MAX_LINES = 8;

/**
 * Bloque de una línea de fecha: lo que sigue al grupo de líneas de fecha/hora consecutivas,
 * hasta el botón de inscripción, la próxima línea de fecha o BLOCK_MAX_LINES líneas. Ahí el
 * sitio publica lugar, público, precio e inscripción de ESAS funciones: "SPAA 2026" tiene un
 * módulo en el Auditorio, uno en el Parque de la Memoria y tres virtuales, cada uno con lo suyo.
 */
export function blockAfter(lines: readonly ContentLine[], lineIndex: number): ContentLine[] {
  let start = lineIndex + 1;
  while (start < lines.length && isScheduleLine(lines[start]?.text ?? '')) start += 1;
  const block: ContentLine[] = [];
  for (let i = start; i < lines.length && block.length < BLOCK_MAX_LINES; i += 1) {
    const line = lines[i];
    if (!line || parseDateLine(line.text) !== null) break;
    block.push(line);
    if (line.links.some((l) => l.button)) break;
  }
  return block;
}

const VIRTUAL_RE =
  /\b(?:virtual(?:es)?|google meet|zoom|asincronic[oa]|google classroom|en linea|online)\b/;

/** "Actividad virtual – Plataforma Google Meet": no es una función en un lugar de la Ciudad. */
export function isVirtualBlock(block: readonly ContentLine[]): boolean {
  return block.some((l) => VIRTUAL_RE.test(normalizeLine(l.text)));
}

function toPrice(info: PriceInfo | null): Price | null {
  if (!info) return null;
  return {
    text: info.text,
    verified: true,
    ...(info.isFree !== undefined ? { isFree: info.isFree } : {}),
    ...(info.min !== undefined ? { min: info.min } : {}),
    ...(info.max !== undefined ? { max: info.max } : {}),
  };
}

/** El único valor distinto (comparado como JSON), o null si hay cero o varios. */
function single<T>(values: readonly T[]): T | null {
  const distinct = new Map(values.map((v) => [JSON.stringify(v), v]));
  return distinct.size === 1 ? ([...distinct.values()][0] ?? null) : null;
}

const AUDIENCE_RE = /^orientad[oa]s?\s+a\b/;
const CHILDREN_RE = /\b(?:ninos?|ninas?|familias?|infancias?|primera infancia)\b/;

function buildAgendaEvent(raw: RawRecord, ctx: ParseContext): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw.body);
  } catch (err) {
    return fail([`JSON inválido: ${(err as Error).message}`]);
  }
  const parsed = ItemDataSchema.safeParse(json);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const item = parsed.data;
  const warnings: string[] = [];
  const title = plainText(item.titleHtml);
  if (!title) return fail(['sin título'], { url: item.link });

  const now = ctx.now();
  const today = todayOf(now);
  const lines = contentLines(item.contentHtml);
  const texts = lines.map((l) => l.text);
  const schedule = parseAgendaSchedule({ lines: texts, now, anchor: publishedOf(item) });
  warnings.push(...schedule.warnings);

  const excerpt = plainText(item.excerptHtml);
  const firstDate = texts.findIndex((t) => parseDateLine(t) !== null);
  const descriptionLines = (firstDate === -1 ? texts : texts.slice(0, firstDate)).filter(
    (t, i) => t.length > 0 && !(lines[i]?.links.some((l) => l.button) && t.length < 40),
  );
  let description = descriptionLines.join('\n').slice(0, DESCRIPTION_MAX).trim();
  if (!description) description = excerpt;

  const mapping = mapAgendaDisciplines({ title, excerpt, description });
  warnings.push(...mapping.warnings);

  // Lugar y precio de cada función: los de su bloque. Solo si NINGÚN bloque publica uno, vale el
  // único del ítem (publicado una vez, p. ej. antes de las fechas); nunca el de otro módulo.
  const blocks = schedule.specs.map((spec) => blockAfter(lines, spec.lineIndex));
  const blockPlaces = blocks.map(
    (block) => block.map((l) => placeFromLine(l.text, item.link)).find((p) => p !== null) ?? null,
  );
  const blockPrices = blocks.map((block) => priceOf(block));
  const itemPlace = blockPlaces.some((p) => p !== null)
    ? null
    : single(
        texts
          .map((t) => placeFromLine(t, item.link))
          .filter((p): p is PlaceResolution => p !== null),
      );
  const itemPrice = blockPrices.some((p) => p !== null)
    ? null
    : single(lines.map((l) => priceOf([l])).filter((p): p is PriceInfo => p !== null));
  const itemTickets = ticketsUrlOf(lines);
  const titleStatus = statusFromTitle(title);

  const occurrences: NormalizedOccurrenceInput[] = [];
  const unplaced = new Set<string>();
  const virtual = new Set<string>();
  for (const [index, spec] of schedule.specs.entries()) {
    const block = blocks[index] ?? [];
    if (isVirtualBlock(block)) {
      virtual.add(spec.sourceText);
      continue;
    }
    const place = blockPlaces[index] ?? itemPlace;
    const venue: VenueRef | null = place?.venue ?? null;
    if (!venue) unplaced.add(spec.sourceText);
    else if (!venue.slug && !venue.address) {
      warnings.push(`lugar sin dirección en la Ciudad ("${venue.name}"): candidato por venue`);
    }
    const common = {
      timezone: BA_TZ,
      recurrenceRule: null,
      sourceDateText: spec.sourceText,
      venue,
      ticketsUrl: ticketsUrlOf(block) ?? itemTickets,
      price: toPrice(blockPrices[index] ?? itemPrice),
    };
    if (spec.kind === 'timed') {
      const date = localDateToParts(spec.date);
      occurrences.push({
        ...common,
        externalId: `${raw.externalId}|${spec.date}|${formatTime(spec.start)}`,
        kind: 'timed',
        startsAt: toIsoInstant(baDateTime(date, spec.start)),
        endsAt: spec.end ? toIsoInstant(baDateTime(date, spec.end)) : null,
        startDate: spec.date,
        endDate: spec.date,
        scheduleText: null,
        status: titleStatus ?? spec.status,
      });
    } else if (spec.kind === 'all_day') {
      const bounds = allDayBounds(spec.date);
      occurrences.push({
        ...common,
        externalId: `${raw.externalId}|${spec.date}|dia`,
        kind: 'all_day',
        startsAt: bounds.startsAt,
        endsAt: bounds.endsAt,
        startDate: spec.date,
        endDate: spec.date,
        scheduleText: null,
        status: titleStatus ?? spec.status,
      });
    } else {
      const bounds = rangeBounds(spec.start, spec.end);
      occurrences.push({
        ...common,
        externalId: `${raw.externalId}|range`,
        kind: 'range',
        startsAt: bounds.startsAt,
        endsAt: bounds.endsAt,
        startDate: spec.start,
        endDate: spec.end,
        scheduleText: spec.sourceText,
        status: titleStatus ?? 'scheduled',
      });
    }
  }
  for (const text of virtual) {
    warnings.push(`actividad virtual ("${text}"): no se emite como función en un lugar`);
  }
  for (const text of unplaced) {
    warnings.push(`sin lugar publicado para "${text}": candidato por venue`);
  }
  if (occurrences.length === 0) warnings.push('sin funciones presenciales con fecha: candidato');

  // Nivel evento: precio y entradas de las funciones que vienen (si coinciden entre sí).
  const upcoming = occurrences.filter((o) => o.endDate >= today);
  const reference = upcoming.length > 0 ? upcoming : occurrences;
  const price = single(reference.map((o) => o.price ?? null));
  if (price === null && new Set(reference.map((o) => JSON.stringify(o.price))).size > 1) {
    warnings.push('precio distinto según la función: queda solo en cada función');
  }
  const ticketsUrl = reference.find((o) => o.ticketsUrl)?.ticketsUrl ?? itemTickets;

  const audience = texts.find((t) => AUDIENCE_RE.test(normalizeLine(t))) ?? null;
  const tags = audience && CHILDREN_RE.test(normalizeLine(audience)) ? ['infantil'] : [];
  const subtitle = manualExcerpt(excerpt);

  const rawFragment = JSON.stringify({
    id: item.id,
    link: item.link,
    date: item.date,
    modified: item.modified,
    excerpt,
    lines: texts.slice(0, 200),
  }).slice(0, RAW_FRAGMENT_MAX);

  const event: NormalizedEventInput = {
    source: SOURCE_SLUG,
    externalId: raw.externalId,
    url: item.link,
    capturedAt: raw.fetchedAt,
    title,
    ...(subtitle && subtitle !== title ? { subtitle } : {}),
    ...(description ? { description } : {}),
    attribution: ATTRIBUTION,
    disciplines: mapping.disciplines,
    institutionSlug: INSTITUTION_SLUG,
    officialUrl: item.link,
    sameAsUrls: [item.link],
    ...(ticketsUrl ? { ticketsUrl } : {}),
    ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    ...(price ? { priceText: price.text, priceVerified: true } : {}),
    ...(price?.isFree !== undefined ? { isFree: price.isFree } : {}),
    tags,
    language: 'es',
    occurrences,
    rawFragment,
  };
  return ok(event as never, warnings);
}

// ── Exposiciones ───────────────────────────────────────────────────────────

/** "<p><b>Ubicación:</b> Segundo piso (Sala G)</p>" → "Segundo piso (Sala G)". */
export function locationOf(excerptHtml: string): string | null {
  for (const line of htmlToText(excerptHtml).split('\n')) {
    const m = /^\s*ubicaci[oó]n\s*:\s*(.+)$/i.exec(cleanText(line));
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

/** Párrafos del contenido antes del primer título (fichas de artistas, glosario, playlist). */
export function exhibitionDescription(contentHtml: string): string {
  const $ = load(contentHtml, null, false);
  const parts: string[] = [];
  for (const el of $('p, h1, h2, h3, h4, h5, h6').toArray()) {
    if (/^h[1-6]$/.test(el.tagName)) {
      if (parts.length > 0) break;
      continue;
    }
    const text = plainText($(el).html() ?? '');
    if (text) parts.push(text);
  }
  return parts.join('\n').slice(0, DESCRIPTION_MAX).trim();
}

function buildExhibitionEvent(
  raw: RawRecord,
  listing: ExhibitionListing,
  ctx: ParseContext,
): ParseResult {
  const warnings: string[] = [];
  const detail =
    raw.contentType === 'html' && isExhibitionDetail(raw.body)
      ? parseExhibitionDetail(raw.body)
      : null;
  if (!detail) return fail(['sin ficha de la exposición (body.single-exposiciones)']);
  const item = listing.item;
  if (!item) warnings.push('la REST no devolvió el ítem: se usan el listado y la ficha');
  if (item && detail.postId !== null && detail.postId !== item.id) {
    return fail([`la ficha es del post ${detail.postId}, no del ${item.id}`]);
  }

  const officialUrl = item?.link ?? detail.canonicalUrl ?? raw.url;
  const title = (item ? plainText(item.titleHtml) : '') || detail.title || listing.listingTitle;
  if (!title) return fail(['sin título'], { url: officialUrl });

  const excerptHtml = item?.excerptHtml ?? '';
  const location = locationOf(excerptHtml);
  const place = placeFromLocation(location, officialUrl);
  const venue: VenueRef | null = place?.venue ?? null;
  if (!venue) warnings.push('sin "Ubicación:" publicada: candidato por venue');
  else if (!venue.slug && !venue.address) {
    warnings.push(
      `ubicación fuera de la sede sin dirección en la Ciudad ("${venue.name}"): candidato por venue`,
    );
  }

  const dates = exhibitionRange({
    startText: detail.startText,
    endText: detail.endText,
    untilText: listing.dateText,
    current: listing.tab === 'presentes',
    now: ctx.now(),
  });
  warnings.push(...dates.warnings);

  const description = item ? exhibitionDescription(item.contentHtml) : '';
  const lead = description.split('\n')[0] ?? '';
  const excerpt = plainText(excerptHtml);
  const disciplines = mapExhibitionDisciplines({ title, excerpt, lead });

  // Horario de la sede: solo para muestras dentro del museo (no para el Parque de la Memoria).
  const scheduleText = place?.kind === 'museum' ? listing.visitHours : null;

  const occurrences: NormalizedOccurrenceInput[] = [];
  if (dates.range) {
    const bounds = rangeBounds(dates.range.start, dates.range.end);
    occurrences.push({
      // Sin el inicio: una prórroga (o el "hoy" de una muestra en cartel) actualiza la misma ocurrencia.
      externalId: `${raw.externalId}|range`,
      kind: 'range',
      startsAt: bounds.startsAt,
      endsAt: bounds.endsAt,
      startDate: dates.range.start,
      endDate: dates.range.end,
      timezone: BA_TZ,
      scheduleText,
      recurrenceRule: null,
      sourceDateText: dates.sourceText || null,
      venue,
      status: 'scheduled',
      ticketsUrl: null,
      price: null,
    });
  }

  const sameAsUrls = [
    ...new Set(
      [officialUrl, detail.canonicalUrl, ...detail.translations].filter(
        (u): u is string => typeof u === 'string',
      ),
    ),
  ];
  const imageUrl = item?.imageUrl ?? detail.imageUrl;
  const rawFragment = JSON.stringify({
    id: item?.id ?? detail.postId,
    tab: listing.tab,
    dateText: listing.dateText,
    startText: detail.startText,
    endText: detail.endText,
    location,
    visitHours: listing.visitHours,
  }).slice(0, RAW_FRAGMENT_MAX);

  const event: NormalizedEventInput = {
    source: SOURCE_SLUG,
    externalId: raw.externalId,
    url: officialUrl,
    capturedAt: raw.fetchedAt,
    title,
    ...(description ? { description } : {}),
    attribution: ATTRIBUTION,
    disciplines,
    institutionSlug: INSTITUTION_SLUG,
    officialUrl,
    sameAsUrls,
    ...(imageUrl ? { imageUrl } : {}),
    tags: [],
    language: 'es',
    occurrences,
    rawFragment,
  };
  return ok(event as never, warnings);
}

// ── Entrada ────────────────────────────────────────────────────────────────

export function buildEvent(raw: RawRecord, ctx: ParseContext): ParseResult {
  const listing = ListingSchema.safeParse(raw.listing);
  if (!listing.success) {
    return fail(listing.error.issues.map((i) => `listing.${i.path.join('.')}: ${i.message}`));
  }
  if (listing.data.kind === 'agenda') return buildAgendaEvent(raw, ctx);
  return buildExhibitionEvent(raw, listing.data, ctx);
}
