import {
  BA_TZ,
  baDateTime,
  detectFreeEs,
  htmlToText,
  localDateToParts,
  type NormalizedEventInput,
  type NormalizedOccurrenceInput,
  normalizeTitle,
  rangeBounds,
  toIsoInstant,
} from '@culturaba/shared';
import { type CheerioAPI, load } from 'cheerio';
import { z } from 'zod';
import {
  fail,
  ok,
  type ParseContext,
  type ParseResult,
  type RawRecord,
} from '../../core/connector';
import { canonicalUrl } from '../../http/client';
import { formatTime, parseSchedule } from './dates';
import { mapCategories } from './disciplines';
import { buildVenueRef, splitPlace } from './venues';

/**
 * Parsers PUROS del markup del tema `ctba` (WordPress) de complejoteatral.gob.ar.
 * Ver docs/research/complejo-teatral.md §3-§4 para los selectores y ejemplos.
 */

export const SOURCE_SLUG = 'complejo-teatral';
export const INSTITUTION_SLUG = 'complejo-teatral';
export const ATTRIBUTION = 'Texto: Complejo Teatral de Buenos Aires';

// ── Listado (home) ─────────────────────────────────────────────────────────

/** Datos de la tarjeta del listado que viajan en RawRecord.listing. */
export const ListingItemSchema = z.object({
  postId: z.string().nullable(),
  slug: z.string().min(1),
  detailUrl: z.string().url(),
  title: z.string(),
  subtitle: z.string().nullable(),
  category: z.string().nullable(),
  bajadaHtml: z.string().nullable(),
  dateText: z.string(),
  place: z.string().nullable(),
  ticketsUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** Días YYYY-MM-DD en los que /agenda/?fecha= listó la producción. */
  agendaDays: z.array(z.string()).default([]),
  agendaWindow: z
    .object({ from: z.string(), to: z.string(), fetchedDays: z.number(), failedDays: z.number() })
    .nullable()
    .default(null),
});
export type ListingItem = z.infer<typeof ListingItemSchema>;

function text($el: ReturnType<CheerioAPI>): string {
  return $el.text().replace(/\s+/g, ' ').trim();
}

function nullable(value: string | undefined | null): string | null {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : null;
}

/** Slug estable del sitio: último segmento de /produccion/<slug>/. */
export function slugFromDetailUrl(url: string): string | null {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    if (segments[0] !== 'produccion' || !segments[1]) return null;
    return segments[1];
  } catch {
    return null;
  }
}

/** div.search_results > div.list-item de la home. */
export function parseListing(html: string): Array<ListingItem & { cardHtml: string }> {
  const $ = load(html);
  const items: Array<ListingItem & { cardHtml: string }> = [];
  $('div.search_results > div.list-item').each((_, el) => {
    const card = $(el);
    const detailUrl = card.find(".buttons a.button[title='Más información']").attr('href');
    if (!detailUrl) return;
    const slug = slugFromDetailUrl(detailUrl);
    if (!slug) return;
    items.push({
      postId: nullable(card.attr('id')),
      slug,
      detailUrl,
      title: text(card.find('h2.mango-grotesque').first()),
      subtitle: nullable(text(card.find('h3.subtitle').first())),
      category: nullable(text(card.find('span.category').first())),
      bajadaHtml: nullable(card.find('span.bajada').first().html()),
      dateText: (card.find('.list-data span.date').first().text() ?? '').trim(),
      place: nullable(text(card.find('.list-data span.place').first())),
      ticketsUrl: nullable(card.find('.buttons a.button.buy').first().attr('href')),
      imageUrl: nullable(
        card.find('.background[data-background-image]').attr('data-background-image'),
      ),
      agendaDays: [],
      agendaWindow: null,
      cardHtml: $.html(card),
    });
  });
  return items;
}

/**
 * div.search_results > div.small_item de /agenda/?fecha=DD-MM-YYYY. null si la página no
 * tiene el contenedor de resultados (ni el aviso "no-results"): el markup cambió.
 */
export function parseAgendaPage(
  html: string,
): Array<{ detailUrl: string | null; title: string }> | null {
  const $ = load(html);
  if ($('div.search_results, .no-results').length === 0) return null;
  const cards: Array<{ detailUrl: string | null; title: string }> = [];
  $('div.search_results > div.small_item').each((_, el) => {
    const card = $(el);
    cards.push({
      detailUrl: nullable(card.find("a.button[title='Más información']").attr('href')),
      title: text(card.find('h2.mango-grotesque').first()),
    });
  });
  return cards;
}

/** Clave para cruzar tarjetas de la agenda con producciones de la home. */
export function agendaKey(detailUrl: string | null, title: string): string {
  if (detailUrl) {
    try {
      return `url:${canonicalUrl(detailUrl)}`;
    } catch {
      // URL rota: cae al título
    }
  }
  return `title:${normalizeTitle(title)}`;
}

// ── Detalle (/produccion/<slug>/) ──────────────────────────────────────────

export interface DetailData {
  postId: string | null;
  title: string | null;
  subtitle: string | null;
  category: string | null;
  bajadaHtml: string | null;
  synopsisHtml: string | null;
  /** Párrafos iniciales de .details (antes del primer h2 "elenco"/"equipo"): sinopsis de muestras. */
  detailsLeadHtml: string | null;
  /** Avisos en rojo de la sinopsis (texto plano). */
  notes: string[];
  functionsText: string | null;
  durationMinutes: number | null;
  priceText: string | null;
  theatre: string | null;
  room: string | null;
  address: string | null;
  ticketsUrl: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  /** Líneas de .details en orden (párrafos y títulos, cortados en <br>): grilla de ciclos de cine. */
  gridLines: string[];
  infoText: string;
}

export function isDetailPage(html: string): boolean {
  if (!html) return false;
  const $ = load(html);
  return $('body').hasClass('single-produccion') && $('section.post .info').length > 0;
}

const TRACKING_PARAMS = /^(_gl|_ga|utm_[a-z]+|gclid|fbclid|mc_[a-z]+)$/i;

/** Quita parámetros de tracking; null si no es una URL absoluta válida. */
export function cleanTicketsUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return null;
  }
}

function absoluteImage(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : null;
}

function infoValue($: CheerioAPI, prefix: string): ReturnType<CheerioAPI> | null {
  const li = $('section.post .info ul li')
    .filter((_, el) => $(el).text().trim().toLowerCase().startsWith(prefix.toLowerCase()))
    .first();
  return li.length ? li : null;
}

export function parseDetail(html: string): DetailData {
  const $ = load(html);
  const post = $('section.post');

  const postId = /\bpostid-(\d+)\b/.exec($('body').attr('class') ?? '')?.[1] ?? null;
  // El título puede traer <br /> ("LA ISLA. <br /> EL TEATRO…"): una sola línea.
  const title = nullable(
    htmlToText(post.find('h1.mango-grotesque').first().html() ?? '').replace(/\s+/g, ' '),
  );
  const subtitle = nullable(text(post.find('h2.subtitle').first()));
  const category = nullable(text($('ul.breadcrumbs li.category').first()));
  const bajadaHtml = nullable(post.find('.data').first().html());

  const description = post.find('.description').first().clone();
  description.find('button').remove();
  const notes = description
    .find('span[style*="ff0000" i], span[style*="255, 0, 0"], span[style*="255,0,0"]')
    .map((_, el) =>
      htmlToText($(el).html() ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .get()
    .filter((n) => n.length > 0);
  const synopsisHtml = nullable(description.html());

  // Muestras (p. ej. LA ISLA) no tienen .description: el texto vive en .details antes de los h2.
  const leadParts: string[] = [];
  for (const el of post.find('.details > div').first().children().toArray()) {
    if (el.tagName === 'h2') break;
    leadParts.push($.html(el));
  }
  const detailsLeadHtml = nullable(leadParts.join('\n'));

  const functionsLi = infoValue($, 'Funciones:');
  const functionsText = functionsLi ? nullable(functionsLi.find('span.bold').first().text()) : null;

  const durationLi = infoValue($, 'Duración:');
  const durationMatch = durationLi ? /(\d{1,3})\s*min/i.exec(durationLi.text()) : null;
  const durationMinutes = durationMatch?.[1] ? Number(durationMatch[1]) : null;

  const priceLi = infoValue($, 'Valor de las localidades:');
  const priceText = priceLi
    ? nullable(
        (priceLi.find('span.bold').first().text() ?? '')
          .trim()
          .replace(/\s*\n+\s*/g, ' · ')
          .replace(/[ \t]+/g, ' '),
      )
    : null;

  const whereLi = infoValue($, 'Dónde:');
  let theatre: string | null = null;
  let room: string | null = null;
  if (whereLi) {
    const link = whereLi.find('a').first();
    theatre = nullable(text(link.find('span.bold').first()));
    const linkClone = link.clone();
    linkClone.find('span.bold').remove();
    room = nullable(text(linkClone).replace(/^[\s,]+|[\s,]+$/g, ''));
  }
  const address = nullable(text($('section.post .info li.address span.bold').first()));

  const ticketsUrl = cleanTicketsUrl(post.find('.buttons a.button.buy').first().attr('href'));

  const coverStyle = post.find('.cover').first().attr('style') ?? '';
  const coverUrl = /url\(['"]?([^'")]+)['"]?\)/.exec(coverStyle)?.[1] ?? null;
  const imageUrl =
    absoluteImage(coverUrl) ?? absoluteImage($('meta[property="og:image"]').attr('content'));
  const imageCredit = nullable(text(post.find('.cover .cover_credits').first()));

  // "<p><strong>Miércoles 28</strong></p><p>A las 18 horas</p>", "<h4>Sábado 31 de octubre, 21 horas<br>…".
  const gridLines = post
    .find('.details')
    .first()
    .find('p, h2, h3, h4, h5, h6')
    .map((_, el) => htmlToText($(el).html() ?? ''))
    .get()
    .flatMap((block) => block.split('\n'))
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const infoText = htmlToText(post.find('.info').first().html() ?? '');

  return {
    postId,
    title,
    subtitle,
    category,
    bajadaHtml,
    synopsisHtml,
    detailsLeadHtml,
    notes,
    functionsText,
    durationMinutes,
    priceText,
    theatre,
    room,
    address,
    ticketsUrl,
    imageUrl,
    imageCredit,
    gridLines,
    infoText,
  };
}

// ── Evento normalizado ─────────────────────────────────────────────────────

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
    return fail(['sin datos de listado ni página de detalle reconocible', ...issues]);
  }

  const warnings: string[] = [];
  if (!detail) warnings.push('sin página de detalle: se usa solo la tarjeta del listado');

  const slug = slugFromDetailUrl(raw.url) ?? listing?.slug ?? raw.externalId;
  const title = detail?.title ?? listing?.title ?? '';
  if (!title) return fail(['sin título']);

  const category = detail?.category ?? listing?.category ?? null;
  const mapping = mapCategories(category);
  warnings.push(...mapping.warnings);
  if (!category) warnings.push('sin categoría: el evento queda candidato por disciplina');

  // Descripción: bajada + sinopsis en texto plano (texto original del CTBA).
  const descriptionParts = [detail?.bajadaHtml ?? listing?.bajadaHtml, detail?.synopsisHtml]
    .filter((p): p is string => Boolean(p))
    .map((p) => htmlToText(p))
    .filter((p) => p.length > 0);
  let description = descriptionParts.join('\n\n').trim();
  if (!description && detail?.detailsLeadHtml) description = htmlToText(detail.detailsLeadHtml);

  // Precio: solo el texto literal de "Valor de las localidades:" (verified) o
  // gratuidad explícita en el subtítulo/bajada ("ENTRADA GRATUITA"). Con importes
  // ("Platea $26.000. Menores de 12 años: entrada gratuita") la gratuidad es parcial.
  let priceText = detail?.priceText ?? null;
  let isFree: boolean | undefined =
    priceText && !/\$\s*\d/.test(priceText) ? detectFreeEs(priceText) : undefined;
  if (!priceText) {
    const freeIn = [detail?.subtitle ?? listing?.subtitle ?? '', listing?.bajadaHtml ?? '']
      .map((t) => htmlToText(t))
      .find((t) => detectFreeEs(t) === true);
    if (freeIn) {
      const literal = /entrada\s+(?:libre\s+y\s+)?gratuita|entrada\s+libre|gratis/i.exec(
        freeIn,
      )?.[0];
      if (literal) {
        priceText = literal;
        isFree = true;
      }
    }
  }
  const priceVerified = priceText !== null;
  const price = priceText
    ? { text: priceText, verified: true, ...(isFree !== undefined ? { isFree } : {}) }
    : null;

  // Venue: teatro (nombre canónico) + sala + dirección publicada en el detalle.
  const fromPlace = splitPlace(listing?.place);
  const venue = buildVenueRef({
    theatre: detail?.theatre ?? fromPlace.theatre,
    room: detail?.room ?? fromPlace.room,
    address: detail?.address ?? null,
    addressSourceUrl: detail?.address ? raw.url : null,
  });
  if (!venue) warnings.push('sin teatro publicado: el evento queda candidato por venue');
  else if (!venue.address)
    warnings.push(`teatro sin dirección publicada (${venue.name}): candidato por venue`);

  const ticketsUrl = detail?.ticketsUrl ?? cleanTicketsUrl(listing?.ticketsUrl) ?? null;

  // Funciones.
  const functionsText = detail?.functionsText ?? listing?.dateText ?? '';
  const gridLines = mapping.disciplines.includes('cine') ? (detail?.gridLines ?? []) : [];
  const schedule = parseSchedule({
    functionsText,
    notes: detail?.notes ?? [],
    agendaDays: listing?.agendaDays ?? [],
    gridLines,
    now: ctx.now(),
  });
  warnings.push(...schedule.warnings);
  if (schedule.form === 'enumerated' && listing && listing.agendaDays.length > 0) {
    const emitted = new Set(schedule.specs.map((s) => (s.kind === 'timed' ? s.date : '')));
    const unconfirmed = [...emitted].filter((d) => d && !listing.agendaDays.includes(d));
    if (unconfirmed.length) {
      warnings.push(
        `fechas del texto no listadas por la agenda del sitio: ${unconfirmed.join(', ')}`,
      );
    }
  }

  const occurrences: NormalizedOccurrenceInput[] = [];
  for (const spec of schedule.specs) {
    if (spec.kind === 'timed') {
      const startsAt = toIsoInstant(baDateTime(localDateToParts(spec.date), spec.time));
      occurrences.push({
        externalId: `${slug}|${spec.date}|${formatTime(spec.time)}`,
        kind: 'timed',
        startsAt,
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
      });
    } else {
      const bounds = rangeBounds(spec.start, spec.end);
      occurrences.push({
        // Sin el fin: una prórroga de la muestra actualiza la ocurrencia en vez de reemplazarla.
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
      });
    }
  }
  if (occurrences.length === 0) warnings.push('sin ocurrencias: el evento queda candidato');

  const imageUrl = detail?.imageUrl ?? absoluteImage(listing?.imageUrl);
  const subtitle = detail?.subtitle ?? listing?.subtitle ?? null;

  const rawFragment = JSON.stringify({
    listing: listing ? { ...listing, bajadaHtml: undefined } : null,
    info: detail?.infoText ?? null,
    notes: detail?.notes ?? [],
    gridLines: gridLines.slice(0, 40),
  }).slice(0, 20_000);

  const event: NormalizedEventInput = {
    source: SOURCE_SLUG,
    externalId: slug,
    url: raw.url,
    capturedAt: raw.fetchedAt,
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(description ? { description } : {}),
    attribution: ATTRIBUTION,
    disciplines: mapping.disciplines,
    institutionSlug: INSTITUTION_SLUG,
    officialUrl: raw.url,
    ...(ticketsUrl ? { ticketsUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(detail?.imageCredit ? { imageCredit: detail.imageCredit } : {}),
    ...(priceText ? { priceText } : {}),
    ...(isFree !== undefined ? { isFree } : {}),
    priceVerified,
    tags: mapping.tags,
    ...(detail?.durationMinutes ? { durationMinutes: detail.durationMinutes } : {}),
    occurrences,
    rawFragment,
  };
  // NormalizedEventSchema.parse aplica los defaults; el pipeline vuelve a validar.
  return ok(event as never, warnings);
}
