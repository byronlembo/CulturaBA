import {
  BA_TZ,
  baDateTime,
  detectFreeEs,
  detectStatusEs,
  htmlToText,
  localDateToParts,
  type NormalizedEventInput,
  NormalizedEventSchema,
  type NormalizedOccurrenceInput,
  type ParsedOccurrenceStatus,
  type Price,
  rangeBounds,
  toIsoInstant,
} from '@culturaba/shared';
import * as cheerio from 'cheerio';
import {
  fail,
  ok,
  type ParseContext,
  type ParseResult,
  type RawRecord,
} from '../../core/connector';
import { buildSchedule, type FunctionRow, type ScheduleSpec, timeKey } from './dates';
import { disciplinesFor } from './disciplines';
import { venueFor } from './venues';

/**
 * Parser PURO de usinadelarte.ar (WordPress + Elementor):
 *   · RawRecord.listing = el ítem del REST `/wp-json/wp/v2/actividad` con sus términos ya
 *     resueltos a nombre/slug (funcion-fecha, funcion-hora, sala, estado, tipo-de-actividad);
 *   · RawRecord.body = HTML del detalle /actividad/<slug>/: tipo, título, texto, funciones
 *     (`.function-item`: fecha + hora emparejadas), "Espacio", "Dirección", imagen.
 * Sin red: todo entra como texto y sale como NormalizedEvent.
 */

export const BASE_URL = 'https://usinadelarte.ar/';
export const API_URL = `${BASE_URL}wp-json/wp/v2/`;
export const SOURCE_SLUG = 'usina-del-arte';
export const INSTITUTION_SLUG = 'usina-del-arte';
export const ATTRIBUTION = 'Texto: Usina del Arte';

const RAW_FRAGMENT_MAX = 20_000;

/**
 * Imágenes destacadas que no muestran la actividad: media 258 es una captura de pantalla
 * de un documento de Google ("2024-06-28-16_01_42-Historia-de-la-Usina-del-Arte-
 * Documentos-de-Google.png") que el sitio usa de relleno en 6 actividades. Se omite.
 */
export const PLACEHOLDER_MEDIA_IDS: ReadonlySet<number> = new Set([258]);

// ── Ítem del REST (viaja en RawRecord.listing) ─────────────────────────────

export interface TermRef {
  id: number;
  name: string;
  slug: string;
}

export interface ListingItem {
  id: number;
  slug: string;
  link: string;
  /** `title.rendered`: HTML, con `<br>` entre título y bajada y entidades (&#8211;). */
  titleHtml: string;
  modified: string | null;
  featuredMedia: number | null;
  fechas: TermRef[];
  horas: TermRef[];
  salas: TermRef[];
  estados: TermRef[];
  tipos: TermRef[];
  /** "taxonomía:id" de términos que el REST no devolvió (no debería pasar). */
  unresolvedTerms: string[];
}

function isTermArray(v: unknown): v is TermRef[] {
  return Array.isArray(v) && v.every((t) => t && typeof (t as TermRef).name === 'string');
}

function listingOf(raw: RawRecord): ListingItem | null {
  const l = raw.listing as Partial<ListingItem> | undefined;
  if (!l || typeof l !== 'object' || typeof l.id !== 'number') return null;
  const terms = (v: unknown): TermRef[] => (isTermArray(v) ? v : []);
  return {
    id: l.id,
    slug: typeof l.slug === 'string' ? l.slug : '',
    link: typeof l.link === 'string' ? l.link : raw.url,
    titleHtml: typeof l.titleHtml === 'string' ? l.titleHtml : '',
    modified: typeof l.modified === 'string' ? l.modified : null,
    featuredMedia: typeof l.featuredMedia === 'number' ? l.featuredMedia : null,
    fechas: terms(l.fechas),
    horas: terms(l.horas),
    salas: terms(l.salas),
    estados: terms(l.estados),
    tipos: terms(l.tipos),
    unresolvedTerms: Array.isArray(l.unresolvedTerms) ? l.unresolvedTerms : [],
  };
}

// ── Utilidades de texto ────────────────────────────────────────────────────

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** "José Luis Juri<br>Recital de piano" → "José Luis Juri · Recital de piano". */
export function titleFromHtml(html: string | null | undefined): string {
  return (html ?? '')
    .split(/<\s*br\s*\/?\s*>|\n/i)
    .map((p) => clean(htmlToText(p)))
    .filter((p) => p.length > 0)
    .join(' · ');
}

const TRACKING_PARAM_RE = /^(?:utm_|gad_|gclid$|gbraid$|wbraid$|fbclid$|mc_cid$|mc_eid$|dclid$)/i;

/** URL de entradas sin parámetros de campaña. Null si no es http(s) ("#", vacío). */
export function cleanTicketsUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  let u: URL;
  try {
    u = new URL(href.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM_RE.test(key)) u.searchParams.delete(key);
  }
  u.hash = '';
  return u.toString();
}

function absoluteHttpUrl(value: string | null | undefined): string | null {
  const s = clean(value);
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

// ── Detalle ────────────────────────────────────────────────────────────────

export interface DetailPage {
  /** La página trae la plantilla de actividad de Elementor (`single-post`). */
  recognized: boolean;
  /** `h2 a[rel=tag]`: el tipo de actividad (texto y slug de /tipo-de-actividad/<slug>/). */
  category: { name: string; slug: string } | null;
  title: string;
  /** Texto de la actividad (widgets de texto antes de "Información de la actividad"). */
  description: string;
  descriptionLines: string[];
  /** Hay contenedor `.function-items` (aunque esté vacío). */
  hasFunctionList: boolean;
  rows: FunctionRow[];
  espacioText: string | null;
  addressText: string | null;
  image: { url: string; mediaId: number | null } | null;
}

function headingKey(text: string): string {
  return clean(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function parseDetailPage(html: string, featuredMedia: number | null = null): DetailPage {
  const $ = cheerio.load(html);
  const root = $('[data-elementor-type="single-post"]').first();
  const empty: DetailPage = {
    recognized: false,
    category: null,
    title: '',
    description: '',
    descriptionLines: [],
    hasFunctionList: false,
    rows: [],
    espacioText: null,
    addressText: null,
    image: null,
  };
  if (root.length === 0) return empty;

  const catLink = root.find('h2.elementor-heading-title a[rel="tag"]').first();
  const catSlug = /\/tipo-de-actividad\/([^/?#]+)/.exec(catLink.attr('href') ?? '')?.[1] ?? null;
  const category =
    catLink.length > 0 && catSlug
      ? { name: clean(catLink.text()), slug: decodeURIComponent(catSlug) }
      : null;

  const titleEl = root
    .find('h2.elementor-heading-title')
    .filter((_, el) => $(el).find('a').length === 0)
    .first();
  const title = titleFromHtml(titleEl.html());

  // Widgets en orden de documento: los títulos h4/h5 ("Información de la actividad",
  // "Días y horarios", "Espacio", "Dirección") abren cada bloque de datos.
  let section: string | null = null;
  const descriptionParts: string[] = [];
  let espacioText: string | null = null;
  let addressText: string | null = null;
  root.find('.elementor-widget').each((_, el) => {
    const $w = $(el);
    if ($w.hasClass('elementor-widget-heading')) {
      const h = $w.find('h4, h5').first();
      if (h.length > 0) section = headingKey(h.text());
      return;
    }
    if (!$w.hasClass('elementor-widget-text-editor')) return;
    const text = htmlToText($w.find('.elementor-widget-container').first().html() ?? '');
    if (!text) return;
    if (section === null) descriptionParts.push(text);
    else if (section === 'espacio' && espacioText === null) espacioText = clean(text);
    else if (section === 'direccion' && addressText === null) addressText = clean(text);
  });
  const description = descriptionParts.join('\n\n').trim();
  const descriptionLines = description
    .split('\n')
    .map(clean)
    .filter((l) => l.length > 0);

  const list = root.find('.function-items').first();
  const rows: FunctionRow[] = list
    .find('.function-item')
    .toArray()
    .map((el) => {
      const $f = $(el);
      return {
        dateText: clean($f.find('.date').first().text()),
        timeText: clean($f.find('.time').first().text()),
        notes: clean($f.find('.notes').first().text()),
        ticketsUrl: cleanTicketsUrl($f.find('a.button_entradas').first().attr('href')),
      };
    });

  const imgs = root.find('.elementor-widget-image img').toArray();
  const mediaIdOf = (el: (typeof imgs)[number]): number | null => {
    const m = /\bwp-image-(\d+)\b/.exec($(el).attr('class') ?? '');
    return m ? Number(m[1]) : null;
  };
  const featured =
    (featuredMedia !== null ? imgs.find((el) => mediaIdOf(el) === featuredMedia) : undefined) ??
    imgs[0];
  const imageUrl = featured ? absoluteHttpUrl($(featured).attr('src')) : null;

  return {
    recognized: true,
    category,
    title,
    description,
    descriptionLines,
    hasFunctionList: list.length > 0,
    rows,
    espacioText,
    addressText,
    image: featured && imageUrl ? { url: imageUrl, mediaId: mediaIdOf(featured) } : null,
  };
}

// ── Precio, edad, estado ───────────────────────────────────────────────────

const PRICE_AMOUNT_RE = /\$\s*\d/;
const FREE_PHRASE_RE =
  /entrada\s+libre\s+y\s+gratuita|entrada\s+(?:libre|gratuita|gratis)|libre\s+y\s+gratuita|sin\s+cargo|gratuit[oa]s?|gratis/i;
/** Una línea más larga que esto es narrativa, no el renglón de acceso. */
const PRICE_LINE_MAX = 160;

/**
 * Renglón de acceso del texto de la actividad. Solo lo que el sitio dice:
 *  · importes ("$") → priceText literal, sin afirmar gratuidad;
 *  · "Entrada libre y gratuita. Capacidad limitada" → gratis (texto literal del renglón; si
 *    la frase está en un párrafo largo, solo la frase).
 * "Con reserva" no dice nada del precio.
 */
export function priceFromLines(lines: readonly string[]): { text: string; isFree?: true } | null {
  const paid = lines.find((l) => PRICE_AMOUNT_RE.test(l) && l.length <= PRICE_LINE_MAX);
  if (paid) return { text: paid };
  for (const line of lines) {
    if (detectFreeEs(line) !== true) continue;
    if (line.length <= PRICE_LINE_MAX) return { text: line, isFree: true };
    const phrase = FREE_PHRASE_RE.exec(line)?.[0];
    if (phrase) return { text: phrase.charAt(0).toUpperCase() + phrase.slice(1), isFree: true };
  }
  return null;
}

const AGE_LINE_RE =
  /^(?:ATP|apto para todo p[uú]blico|mayores de \d{1,2}(?: a[ñn]os)?|(?:a partir de|desde) (?:los )?\d{1,2} a[ñn]os|\+ ?\d{1,2})\.?$/i;

/** Renglón de edad tal cual ("ATP", "Mayores de 18", "a partir de 6 años"). */
export function ageFromLines(lines: readonly string[]): string | null {
  const line = lines.find((l) => AGE_LINE_RE.test(l));
  return line ? line.replace(/\.$/, '') : null;
}

type ClaimStatus = Exclude<ParsedOccurrenceStatus, 'scheduled'>;
const STATUS_RANK: Record<ParsedOccurrenceStatus, number> = {
  scheduled: 0,
  sold_out: 1,
  postponed: 2,
  cancelled: 3,
};

/** Solo marcas claras ("Agotado", "Suspendido", "Cancelado", "Postergado"). */
export function statusFromText(text: string): ClaimStatus | null {
  const s = detectStatusEs(text);
  return s === 'cancelled' || s === 'postponed' || s === 'sold_out' ? s : null;
}

// ── Normalización ──────────────────────────────────────────────────────────

export function buildEvent(raw: RawRecord, _ctx: ParseContext): ParseResult {
  const item = listingOf(raw);
  const url = item?.link ?? raw.url;
  const listedTitle = titleFromHtml(item?.titleHtml);

  if (!raw.body.trim()) {
    return fail(['sin HTML de detalle (enrich no corrió o falló)'], {
      ...(listedTitle ? { title: listedTitle } : {}),
      url,
    });
  }
  const detail = parseDetailPage(raw.body, item?.featuredMedia ?? null);
  if (!detail.recognized) {
    // Otra plantilla, un error o un challenge: no se interpreta nada a ciegas.
    return fail(['el detalle no trae la plantilla de actividad (single-post de Elementor)'], {
      ...(listedTitle ? { title: listedTitle } : {}),
      url,
    });
  }

  const warnings: string[] = [];
  if (!item) warnings.push('sin ítem del REST: sin taxonomías (solo el detalle)');
  if (item?.unresolvedTerms.length) {
    warnings.push(`términos sin resolver en el REST: ${item.unresolvedTerms.join(', ')}`);
  }

  const title = listedTitle || detail.title;
  if (!title) return fail(['sin título en el REST ni en el detalle'], { url });

  // Funciones: el detalle empareja fecha y hora; la taxonomía es solo respaldo (dates.ts).
  const schedule = buildSchedule({
    rows: detail.rows,
    fechaTerms: (item?.fechas ?? []).map((t) => t.name),
    horaTerms: (item?.horas ?? []).map((t) => t.name),
  });
  warnings.push(...schedule.warnings);
  if (!detail.hasFunctionList) warnings.push('detalle sin bloque .function-items');

  const venueRes = venueFor({
    salas: item?.salas ?? [],
    espacioText: detail.espacioText,
    addressText: detail.addressText,
    detailUrl: url,
  });
  warnings.push(...venueRes.warnings);

  // Estado de la actividad: solo un término que lo diga claramente (hoy "Pasadas" y
  // "Programadas" son de agenda, no de estado) se aplica a todas las funciones.
  let eventClaim: { status: ClaimStatus; reason: string } | null = null;
  for (const t of item?.estados ?? []) {
    const name = clean(htmlToText(t.name));
    const s = statusFromText(name);
    if (s && (!eventClaim || STATUS_RANK[s] > STATUS_RANK[eventClaim.status])) {
      eventClaim = { status: s, reason: `estado '${name}' en el sitio` };
    }
  }

  const priceInfo = priceFromLines(detail.descriptionLines);
  const price: Price | null = priceInfo
    ? { text: priceInfo.text, verified: true, ...(priceInfo.isFree ? { isFree: true } : {}) }
    : null;

  const occurrences: NormalizedOccurrenceInput[] = [];
  const seen = new Set<string>();
  for (const spec of schedule.specs) {
    const occ = occurrenceOf(spec, item?.id ?? raw.externalId, eventClaim);
    if (!occ.externalId || seen.has(occ.externalId)) continue;
    seen.add(occ.externalId);
    occurrences.push({ ...occ, venue: venueRes.venue, price });
  }
  if (occurrences.length === 0) warnings.push('sin funciones: el evento queda candidato');

  // Disciplinas: términos del REST; respaldo, el tipo enlazado en el detalle.
  const tipos =
    item && item.tipos.length > 0 ? item.tipos : detail.category ? [detail.category] : [];
  const mapping = disciplinesFor(tipos);
  warnings.push(...mapping.warnings);

  const ticketUrls = [
    ...new Set(occurrences.map((o) => o.ticketsUrl).filter((u): u is string => Boolean(u))),
  ];
  const ticketsUrl = ticketUrls[0];

  let imageUrl: string | undefined;
  if (detail.image) {
    if (detail.image.mediaId !== null && PLACEHOLDER_MEDIA_IDS.has(detail.image.mediaId)) {
      warnings.push(`imagen de relleno (media ${detail.image.mediaId}): se omite`);
    } else {
      imageUrl = detail.image.url;
    }
  }

  const ageRating = ageFromLines(detail.descriptionLines);

  const rawFragment = JSON.stringify({
    listing: item,
    detail: {
      category: detail.category,
      title: detail.title,
      rows: detail.rows,
      espacio: detail.espacioText,
      address: detail.addressText,
      image: detail.image,
      description: detail.description.slice(0, 4000),
    },
  }).slice(0, RAW_FRAGMENT_MAX);

  const event: NormalizedEventInput = {
    source: SOURCE_SLUG,
    externalId: raw.externalId,
    url,
    capturedAt: raw.fetchedAt,
    title,
    ...(detail.description ? { description: detail.description } : {}),
    attribution: ATTRIBUTION,
    disciplines: mapping.disciplines,
    institutionSlug: INSTITUTION_SLUG,
    officialUrl: url,
    // Su propia ficha: Linda (agenda-ba) enlaza /actividad/<slug>/ y el matcher cruza por URL.
    sameAsUrls: [url],
    ...(ticketsUrl ? { ticketsUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(priceInfo ? { priceText: priceInfo.text } : {}),
    ...(priceInfo?.isFree ? { isFree: true } : {}),
    priceVerified: priceInfo !== null,
    tags: mapping.tags,
    ...(ageRating ? { ageRating } : {}),
    occurrences,
    rawFragment,
  };

  const validated = NormalizedEventSchema.safeParse(event);
  if (!validated.success) {
    return fail(
      validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      event as never,
    );
  }
  return ok(validated.data, warnings);
}

function occurrenceOf(
  spec: ScheduleSpec,
  postId: number | string,
  eventClaim: { status: ClaimStatus; reason: string } | null,
): Omit<NormalizedOccurrenceInput, 'venue' | 'price'> {
  // Estado: la marca más grave entre la nota de la función y el estado de la actividad.
  const noteStatus = spec.notes ? statusFromText(spec.notes) : null;
  let status: ParsedOccurrenceStatus = 'scheduled';
  let statusReason: string | undefined;
  if (noteStatus) {
    status = noteStatus;
    statusReason = `nota de la función: '${spec.notes}'`;
  }
  if (eventClaim && STATUS_RANK[eventClaim.status] > STATUS_RANK[status]) {
    status = eventClaim.status;
    statusReason = eventClaim.reason;
  }
  const sourceDateText = spec.notes ? `${spec.sourceText} · ${spec.notes}` : spec.sourceText;
  const date = localDateToParts(spec.date);
  const common = {
    startDate: spec.date,
    endDate: spec.date,
    timezone: BA_TZ,
    recurrenceRule: null,
    sourceDateText,
    status,
    ...(statusReason ? { statusReason } : {}),
    ticketsUrl: spec.ticketsUrl,
  };

  if (spec.time) {
    const start = baDateTime(date, spec.time.start);
    const end = spec.time.end ? baDateTime(date, spec.time.end) : null;
    return {
      externalId: `${postId}|${spec.date}|${timeKey(spec.time.start)}`,
      kind: 'timed',
      startsAt: toIsoInstant(start),
      endsAt: end ? toIsoInstant(end) : null,
      // Franja publicada ("de 16 a 20 h"): el texto literal acompaña a inicio y fin.
      scheduleText: end ? spec.timeText : null,
      ...common,
    };
  }
  // Fecha sin hora: un día entero como rango, sin afirmar "todo el día" ni una hora.
  const bounds = rangeBounds(spec.date, spec.date);
  return {
    externalId: `${postId}|${spec.date}|sin-hora`,
    kind: 'range',
    startsAt: bounds.startsAt,
    endsAt: bounds.endsAt,
    // Texto de hora que no es una hora ("a confirmar"): se muestra tal cual.
    scheduleText: spec.timeText,
    ...common,
  };
}
