import {
  BA_TZ,
  baDateTime,
  localDateToParts,
  type NormalizedEventInput,
  type NormalizedOccurrenceInput,
  type Price,
  rangeBounds,
  toIsoInstant,
} from '@culturaba/shared';
import { contains, load } from 'cheerio';
import { z } from 'zod';
import {
  fail,
  ok,
  type ParseContext,
  type ParseResult,
  type RawRecord,
} from '../../core/connector';
import {
  extractDates,
  formatTime,
  normalizeText,
  parseSchedule,
  type Schedule,
  type ScheduleSpec,
  todayOf,
} from './dates';
import { mapDisciplines } from './disciplines';
import { isPlanetarioAddress, PLANETARIO_ADDRESS, venueFromPlace } from './venues';

/**
 * Parsers PUROS de planetario.buenosaires.gob.ar (Drupal 8+, HTML server-side, sin JSON API).
 * Ver docs/research/planetario.md para endpoints, selectores y ejemplos literales.
 */

export const SOURCE_SLUG = 'planetario';
/** Mismo slug que la institución derivada de Linda (slugify("Planetario Galileo Galilei")). */
export const INSTITUTION_SLUG = 'planetario-galileo-galilei';
export const ATTRIBUTION = 'Texto: Planetario Galileo Galilei';
export const ORIGIN = 'https://planetario.buenosaires.gob.ar';
export const BASE_URL = `${ORIGIN}/`;
const HOST = 'planetario.buenosaires.gob.ar';

const RAW_FRAGMENT_MAX = 20_000;
const DESCRIPTION_MAX = 4_000;
const SUBTITLE_MAX = 120;

// ── Utilidades ─────────────────────────────────────────────────────────────

export function cleanText(text: string): string {
  return text.replace(/[​-‍﻿]/g, '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Líneas de texto de un fragmento HTML (corta en <br> y en el cierre de bloques). */
export function htmlLines(html: string): string[] {
  const $ = load(html, null, false);
  $('script, style, noscript').remove();
  $('br').replaceWith('\n');
  $('p, div, li, h1, h2, h3, h4, h5, h6, tr').each((_, el) => {
    $(el).append('\n');
  });
  return $.root()
    .text()
    .split('\n')
    .map(cleanText)
    .filter((l) => l.length > 0);
}

/**
 * Ruta de una página del sitio: "/el-sueno", "/index.php/veo-veo" (el listado de espectáculos
 * enlaza así) o "https://planetario.buenosaires.gob.ar/madre-noche" → "/el-sueno", "/veo-veo"…
 * Null para anclas, otros sitios, archivos y rutas de sistema.
 */
export function pathOf(href: string | null | undefined): string | null {
  const h = (href ?? '').trim();
  if (!h || h.startsWith('#') || /^(?:javascript|mailto|tel):/i.test(h)) return null;
  let u: URL;
  try {
    u = new URL(h, BASE_URL);
  } catch {
    return null;
  }
  if (u.hostname.replace(/^www\./, '') !== HOST) return null;
  const path = u.pathname.replace(/^\/index\.php(?=\/)/, '').replace(/\/+$/, '');
  if (!/^\/[a-z0-9][a-z0-9-]*$/i.test(path)) return null;
  if (/^\/(?:node|user|admin|search|sites|themes|core)$/i.test(path)) return null;
  return path;
}

export function pageUrl(path: string): string {
  return `${ORIGIN}${path}`;
}

function absoluteUrl(value: string | null | undefined): string | null {
  const s = (value ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(s, BASE_URL);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function backgroundImage(style: string | undefined): string | null {
  const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(style ?? '');
  return absoluteUrl(m?.[1]);
}

// ── Listados (tarjetas) ────────────────────────────────────────────────────

export interface ListingCard {
  path: string;
  title: string;
  /** "¿Cuándo?" de la tarjeta, en líneas (mismo campo que la ficha). */
  whenLines: string[];
  imageUrl: string | null;
}

const WHEN_HEADING_RE = /^¿?\s*cu[aá]ndo\s*\??$/i;

/**
 * Tarjetas de un listado: grilla de /encuentros-de-ciencia y /otras-actividades
 * (`#grilla .item`: `h3 a`, `.datos` con `h4 "¿Cuándo?"` + texto, fondo `.bk-cuadricula`),
 * /cursos (`#cursos .evento`: `h4 a`, `.cuando h4 "Cuándo"` + `.dato`) y
 * /espectaculos-publico-general (`#multi-eventos .evento`: `h4 a`, sin fechas).
 * Null si la página no tiene ninguno de esos contenedores (¿cambió el markup?).
 */
export function parseCards(html: string): ListingCard[] | null {
  const $ = load(html);
  if ($('#grilla, #cursos, #multi-eventos').length === 0) return null;
  const cards: ListingCard[] = [];
  const seen = new Set<string>();
  $('#grilla .item, #cursos .evento, #multi-eventos .evento').each((_, el) => {
    const card = $(el);
    const link = card.find('h3 a[href], h4 a[href]').first();
    const path = pathOf(link.attr('href'));
    if (!path || seen.has(path)) return;
    seen.add(path);
    const heading = card
      .find('h4')
      .filter((__, h) => WHEN_HEADING_RE.test(cleanText($(h).text())))
      .first();
    const whenHtml = heading.length
      ? heading
          .nextUntil('h4')
          .toArray()
          .map((n) => $.html(n))
          .join('\n')
      : '';
    cards.push({
      path,
      title: cleanText(link.text()),
      whenLines: whenHtml ? htmlLines(whenHtml) : [],
      imageUrl: backgroundImage(card.find('[style*="background-image"]').first().attr('style')),
    });
  });
  return cards;
}

// ── /agenda ────────────────────────────────────────────────────────────────

export interface AgendaSpecial {
  path: string;
  title: string;
  /** Texto de fecha antes del enlace: "Sábados 24 y 31 de octubre 10:00 h". */
  whenText: string;
}

/**
 * Actividades fechadas de /agenda: párrafos del cuerpo que EMPIEZAN con una fecha (día + mes) y
 * enlazan a una ficha del sitio ("Sábados 24 y 31 de octubre 10:00 h <a>El universo que no
 * vemos</a> Curso a cargo…"). Las grillas semanales del domo, el museo y los telescopios
 * ("12.00 h – <a>Agujeros Negros</a>", "Sábados, domingos y lunes 12 de octubre") no son
 * fechas: no se devuelven. Null si la página no tiene el cuerpo de la agenda.
 */
export function parseAgendaSpecials(html: string): AgendaSpecial[] | null {
  const $ = load(html);
  const body = $('#block-planetario-content .field--name-body').first();
  if (body.length === 0) return null;
  const out: AgendaSpecial[] = [];
  body.find('p').each((_, el) => {
    const p = $(el);
    const link = p
      .find('a[href]')
      .filter((__, a) => pathOf($(a).attr('href')) !== null)
      .first();
    const linkEl = link.get(0);
    const path = pathOf(link.attr('href'));
    if (!linkEl || !path) return;
    let before = '';
    for (const node of p.contents().toArray()) {
      if (node === linkEl || ('children' in node && contains(node, linkEl))) break;
      before += $(node).text();
    }
    const whenText = cleanText(before).replace(/[\s–—-]+$/, '');
    const dates = extractDates(normalizeText(whenText));
    const first = dates.exprs[0];
    if (first?.start !== 0 || first.pattern) return;
    out.push({ path, title: cleanText(link.text()), whenText });
  });
  return out;
}

// ── Ficha ──────────────────────────────────────────────────────────────────

export interface Detail {
  title: string | null;
  canonicalUrl: string | null;
  nodeId: number | null;
  nodeUrl: string | null;
  imageUrl: string | null;
  subtitle: string | null;
  descriptionLines: string[];
  /** null si la ficha no tiene el campo "¿Cuándo?". */
  whenLines: string[] | null;
  priceLines: string[];
  place: string | null;
  audience: string | null;
  teacher: string | null;
  ticketsUrl: string | null;
  /** Dirección del pie de página ("Av. Sarmiento s/n, 1425 CABA"). */
  footerAddress: string | null;
  durationMinutes: number | null;
}

/** Ficha de una actividad: tiene título de nodo y el bloque de contenido principal. */
export function isDetailPage(html: string): boolean {
  if (!html) return false;
  const $ = load(html);
  return $('.field--name-title').length > 0 && $('#block-planetario-content').length > 0;
}

const GENERIC_HEADING_RE = /^(?:contenidos?|programa|descripcion|sobre (?:el|la|los|las) .*)$/;

/**
 * Campos Drupal del nodo `evento`: `field--name-title`, `field_evento_imagen`, `body`,
 * `field_evento_cuando`, `field_evento_precio`, `field_evento_lugar`, `field_evento_destinatarios`,
 * `field_evento_docente`, `field_evento_link_entrada`; `link[rel=canonical]` y
 * `link[rel=shortlink]` (/node/<id>).
 */
export function parseDetail(html: string): Detail {
  const $ = load(html);
  const main = $('#block-planetario-content');
  const field = (name: string) => main.find(`.field--name-field-evento-${name}`).first();
  const fieldText = (name: string): string | null => {
    const el = field(name);
    if (el.length === 0) return null;
    const text = htmlLines($.html(el)).join(' ');
    return text || null;
  };
  const fieldLines = (name: string): string[] | null => {
    const el = field(name);
    return el.length === 0 ? null : htmlLines($.html(el));
  };

  const body = main.find('.field--name-body').first();
  let subtitle: string | null = null;
  const firstChild = body.children().first();
  if (firstChild.length && /^h[2-5]$/i.test(firstChild.get(0)?.tagName ?? '')) {
    const text = cleanText(firstChild.text());
    if (text && text.length <= SUBTITLE_MAX && !GENERIC_HEADING_RE.test(normalizeText(text))) {
      subtitle = text;
    }
  }
  const bodyLines = body.length ? htmlLines($.html(body)) : [];
  const descriptionLines = subtitle && bodyLines[0] === subtitle ? bodyLines.slice(1) : bodyLines;

  const nodePath = /^\/node\/(\d+)$/.exec($('link[rel="shortlink"]').attr('href') ?? '');
  const ticketHref = field('link-entrada')
    .find('a[href]')
    .toArray()
    .map((a) => absoluteUrl($(a).attr('href')))
    .find((u): u is string => u !== null);
  const footer = $('a[href*="g.page/planetarioba"]').first();
  const allText = cleanText(main.text());
  const duration = /duraci[oó]n(?:\s+aproximada)?(?:\s+de)?\s*:?\s*(\d{2,3})\s*min/i.exec(allText);

  return {
    title: cleanText($('.field--name-title').first().text()) || null,
    canonicalUrl: absoluteUrl($('link[rel="canonical"]').attr('href')),
    nodeId: nodePath?.[1] ? Number(nodePath[1]) : null,
    nodeUrl: nodePath?.[1] ? `${ORIGIN}/node/${nodePath[1]}` : null,
    imageUrl: absoluteUrl(field('imagen').find('img[src]').first().attr('src')),
    subtitle,
    descriptionLines,
    whenLines: fieldLines('cuando'),
    priceLines: fieldLines('precio') ?? [],
    place: fieldText('lugar'),
    audience: fieldText('destinatarios'),
    teacher: fieldText('docente'),
    ticketsUrl: ticketHref ?? null,
    footerAddress: cleanText(footer.text()) || null,
    durationMinutes: duration?.[1] ? Number(duration[1]) : null,
  };
}

// ── Precio ─────────────────────────────────────────────────────────────────

export interface PriceInfo {
  text: string;
  isFree: boolean;
  min?: number;
  max?: number;
}

const AMOUNT_RE = /\$\s?(\d{1,3}(?:\.\d{3})+|\d+)/g;
/** "Gratis", "Actividad gratuita", "Sin costo", "Libre y por orden de llegada" (campo Precio). */
const FREE_RE =
  /\b(?:gratis|gratuit[oa]s?|sin costo|sin cargo|entrada libre|ingreso libre|acceso libre)\b|^libre\b/;
const PAID_RE = /\barancelad[oa]s?\b/;
/** Líneas que explican el importe ("Este es el valor por la totalidad del curso (12 clases)"). */
const PRICE_CONTEXT_RE = /\bvalor\b/;

/**
 * Precio SOLO si el campo "Precio" lo dice: importes ("$ 1.500.-", "$48.000.-"), gratuidad
 * literal ("Gratis", "Sin costo", "Actividad gratuita…", "Libre y por orden de llegada") o
 * "Actividad arancelada" (paga, sin importe). Las líneas sin precio ("Únicamente venta online.",
 * "DESCARGÁ TUS ENTRADAS…") no se copian. Null si no hay nada de eso.
 */
export function priceOf(lines: readonly string[]): PriceInfo | null {
  const kept: string[] = [];
  const amounts: number[] = [];
  let free = false;
  let paid = false;
  for (const line of lines) {
    const cleaned = normalizeText(line);
    const lineAmounts = [...line.matchAll(AMOUNT_RE)].map((m) =>
      Number((m[1] ?? '').replace(/\./g, '')),
    );
    const lineFree = FREE_RE.test(cleaned);
    const linePaid = PAID_RE.test(cleaned);
    if (lineAmounts.length > 0 || lineFree || linePaid) {
      kept.push(line);
      amounts.push(...lineAmounts);
      free ||= lineFree;
      paid ||= linePaid;
    } else if (kept.length > 0 && PRICE_CONTEXT_RE.test(cleaned)) {
      kept.push(line);
    }
  }
  if (kept.length === 0) return null;
  const text = kept.join(' · ');
  if (amounts.length > 0) {
    return { text, isFree: false, min: Math.min(...amounts), max: Math.max(...amounts) };
  }
  return { text, isFree: free && !paid };
}

function toPrice(info: PriceInfo | null): Price | null {
  if (!info) return null;
  return {
    text: info.text,
    verified: true,
    isFree: info.isFree,
    ...(info.min !== undefined ? { min: info.min } : {}),
    ...(info.max !== undefined ? { max: info.max } : {}),
  };
}

// ── Listing (RawRecord.listing) ────────────────────────────────────────────

export const ITEM_KINDS = ['encuentro', 'actividad', 'curso', 'espectaculo', 'agenda'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ListingSchema = z.object({
  /** De dónde salió primero: Encuentros de Ciencia, Otras actividades, Cursos, Espectáculos o /agenda. */
  kind: z.enum(ITEM_KINDS),
  /** Todas las páginas que lo listan ("encuentros-de-ciencia", "agenda"…). */
  sources: z.array(z.string()).min(1),
  title: z.string(),
  /** "¿Cuándo?" de la tarjeta (respaldo si la ficha no lo tiene). */
  whenLines: z.array(z.string()),
  /** Mes de carga de la imagen de la tarjeta, solo en los listados que acumulan años. */
  uploadMonth: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** Línea de /agenda ("Sábados 24 y 31 de octubre 10:00 h"), si figura ahí. */
  agendaText: z.string().nullable(),
});
export type Listing = z.infer<typeof ListingSchema>;

// ── Evento ─────────────────────────────────────────────────────────────────

const CHILDREN_RE = /\b(?:ninos?|ninas?|infancias?|familias?|chicos y chicas)\b/;
const AGE_RE = /\b(?:\d{1,2}\s*anos|atp|mayores|menores)\b/;

function occurrenceOf(
  spec: ScheduleSpec,
  base: Omit<
    NormalizedOccurrenceInput,
    | 'externalId'
    | 'kind'
    | 'startsAt'
    | 'endsAt'
    | 'startDate'
    | 'endDate'
    | 'scheduleText'
    | 'sourceDateText'
    | 'status'
  >,
  externalId: string,
): NormalizedOccurrenceInput {
  if (spec.kind === 'timed') {
    const date = localDateToParts(spec.date);
    return {
      ...base,
      externalId: `${externalId}|${spec.date}|${formatTime(spec.start)}`,
      kind: 'timed',
      startsAt: toIsoInstant(baDateTime(date, spec.start)),
      endsAt: spec.end ? toIsoInstant(baDateTime(date, spec.end)) : null,
      startDate: spec.date,
      endDate: spec.date,
      scheduleText: null,
      sourceDateText: spec.sourceText,
      status: spec.status,
    };
  }
  if (spec.kind === 'day') {
    // Fecha sin hora: range de un día con el texto literal. `all_day` la app lo muestra como
    // "todo el día", y el sitio no dice eso.
    const bounds = rangeBounds(spec.date, spec.date);
    return {
      ...base,
      externalId: `${externalId}|${spec.date}|dia`,
      kind: 'range',
      startsAt: bounds.startsAt,
      endsAt: bounds.endsAt,
      startDate: spec.date,
      endDate: spec.date,
      scheduleText: spec.sourceText,
      sourceDateText: spec.sourceText,
      status: spec.status,
    };
  }
  const bounds = rangeBounds(spec.start, spec.end);
  return {
    ...base,
    // Sin las fechas: una prórroga actualiza la misma ocurrencia.
    externalId: `${externalId}|range`,
    kind: 'range',
    startsAt: bounds.startsAt,
    endsAt: bounds.endsAt,
    startDate: spec.start,
    endDate: spec.end,
    scheduleText: spec.scheduleText ?? spec.sourceText,
    sourceDateText: spec.sourceText,
    status: spec.status,
  };
}

export function buildEvent(raw: RawRecord, ctx: ParseContext): ParseResult {
  const parsedListing = ListingSchema.safeParse(raw.listing);
  if (!parsedListing.success) {
    return fail(parsedListing.error.issues.map((i) => `listing.${i.path.join('.')}: ${i.message}`));
  }
  const listing = parsedListing.data;
  if (raw.contentType !== 'html' || !isDetailPage(raw.body)) {
    return fail([`${raw.url} no es la ficha de una actividad (sin field--name-title)`]);
  }
  const detail = parseDetail(raw.body);
  const warnings: string[] = [];
  const now = ctx.now();
  const officialUrl = detail.canonicalUrl ?? raw.url;
  const title = detail.title ?? listing.title;
  if (!title) return fail(['sin título'], { url: officialUrl });

  // Fechas: el "¿Cuándo?" de la ficha manda; la tarjeta y la línea de /agenda son respaldo.
  let whenLines = detail.whenLines;
  if (!whenLines || whenLines.length === 0) {
    whenLines = listing.whenLines;
    if (whenLines.length > 0) {
      warnings.push('la ficha no publica "¿Cuándo?": se usan las fechas de la tarjeta');
    }
  }
  let schedule: Schedule = parseSchedule({
    lines: whenLines,
    now,
    uploadMonth: listing.uploadMonth,
  });
  warnings.push(...schedule.warnings);
  if (schedule.specs.length === 0 && listing.agendaText) {
    const fromAgenda = parseSchedule({ lines: [listing.agendaText], now, uploadMonth: null });
    if (fromAgenda.specs.length > 0) {
      warnings.push(`fechas tomadas de /agenda ("${listing.agendaText}")`);
      warnings.push(...fromAgenda.warnings);
      schedule = fromAgenda;
    }
  }

  const place = venueFromPlace(detail.place);
  warnings.push(...place.warnings);
  if (detail.footerAddress && !isPlanetarioAddress(detail.footerAddress)) {
    warnings.push(
      `el pie publica "${detail.footerAddress}", distinto de "${PLANETARIO_ADDRESS}": revisar la sede`,
    );
  }

  const priceInfo = priceOf(detail.priceLines);
  const price = toPrice(priceInfo);
  const base = {
    timezone: BA_TZ,
    recurrenceRule: null,
    venue: place.venue,
    ticketsUrl: detail.ticketsUrl,
    price,
  };
  const occurrences: NormalizedOccurrenceInput[] = [];
  if (place.virtual) {
    warnings.push('actividad virtual: no se emiten funciones en un lugar');
  } else {
    for (const spec of schedule.specs) occurrences.push(occurrenceOf(spec, base, raw.externalId));
  }
  if (occurrences.length === 0) warnings.push('sin funciones vigentes con fecha: candidato');
  const today = todayOf(now);
  if (occurrences.length > 0 && occurrences.every((o) => o.endDate < today)) {
    warnings.push('todas las funciones ya pasaron (dentro de los 7 días de gracia)');
  }

  const disciplines = mapDisciplines({ title, subtitle: detail.subtitle });
  const audienceKey = normalizeText(detail.audience ?? '');
  const tags = CHILDREN_RE.test(audienceKey) ? ['infantil'] : [];
  const ageRating = detail.audience && AGE_RE.test(audienceKey) ? detail.audience : null;
  const description = detail.descriptionLines.join('\n').slice(0, DESCRIPTION_MAX).trim();
  const sameAsUrls = [
    ...new Set([officialUrl, detail.nodeUrl].filter((u): u is string => typeof u === 'string')),
  ];
  const imageUrl = detail.imageUrl ?? listing.imageUrl;

  const rawFragment = JSON.stringify({
    path: raw.externalId,
    nodeId: detail.nodeId,
    kind: listing.kind,
    sources: listing.sources,
    when: whenLines,
    agenda: listing.agendaText,
    price: detail.priceLines,
    place: detail.place,
    audience: detail.audience,
    teacher: detail.teacher,
  }).slice(0, RAW_FRAGMENT_MAX);

  const event: NormalizedEventInput = {
    source: SOURCE_SLUG,
    externalId: raw.externalId,
    url: officialUrl,
    capturedAt: raw.fetchedAt,
    title,
    ...(detail.subtitle && detail.subtitle !== title ? { subtitle: detail.subtitle } : {}),
    ...(description ? { description } : {}),
    attribution: ATTRIBUTION,
    disciplines,
    institutionSlug: INSTITUTION_SLUG,
    officialUrl,
    sameAsUrls,
    ...(detail.ticketsUrl ? { ticketsUrl: detail.ticketsUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(priceInfo
      ? { priceText: priceInfo.text, isFree: priceInfo.isFree, priceVerified: true }
      : {}),
    tags,
    language: 'es',
    ...(detail.durationMinutes ? { durationMinutes: detail.durationMinutes } : {}),
    ...(ageRating ? { ageRating } : {}),
    occurrences,
    rawFragment,
  };
  return ok(event as never, warnings);
}
