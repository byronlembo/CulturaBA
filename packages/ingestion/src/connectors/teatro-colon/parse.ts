import {
  BA_TZ,
  baDateTime,
  detectFreeEs,
  detectStatusEs,
  htmlToText,
  type LocalTimeParts,
  type NormalizedEventInput,
  NormalizedEventSchema,
  type NormalizedOccurrenceInput,
  type ParsedOccurrenceStatus,
  partsToLocalDate,
  toIsoInstant,
  type VenueRef,
} from '@culturaba/shared';
import * as cheerio from 'cheerio';
import {
  fail,
  ok,
  type ParseContext,
  type ParseResult,
  type RawRecord,
} from '../../core/connector';
import {
  dayTimeKey,
  monthNumberEs,
  parseDayNumber,
  parseDetailDayText,
  parseListingHour,
  resolveYear,
  timeKey,
} from './dates';
import { disciplinesFor } from './disciplines';
import { venueForPlace } from './venues';

/**
 * Parser PURO de teatrocolon.org.ar (WordPress, HTML server-side):
 *   · listado mensual /calendario/?a=YYYY&mes=M → una fila por función
 *   · detalle /produccion/<slug>/ → funciones (section.dates .day), sala (h4#the_place),
 *     categoría, sinopsis, imagen
 * Sin red: todo entra como texto y sale como NormalizedEvent.
 */

export const BASE_URL = 'https://teatrocolon.org.ar/';
export const CALENDAR_URL = `${BASE_URL}calendario/`;
export const SOURCE_SLUG = 'teatro-colon';
export const INSTITUTION_SLUG = 'teatro-colon';
export const ATTRIBUTION = 'Texto: Teatro Colón';

const RAW_FRAGMENT_MAX = 60_000;

// ── Listado mensual ────────────────────────────────────────────────────────

export interface ListingRow {
  slug: string;
  detailUrl: string;
  title: string;
  category: string;
  /** `.data p` del ítem: compositor, abono, nota de preventa. */
  dataText: string;
  ticketsUrl: string | null;
  imageUrl: string | null;
  year: number;
  month: number;
  day: number;
  time: LocalTimeParts | null;
  /** Texto crudo: "14. mié_17.30 hs". */
  dateText: string;
}

export interface ListingPage {
  year: number;
  month: number;
  /**
   * La página trae los marcadores del calendario (`table#calendar-table` con
   * data-currentyear/month o `h1.month`). False = no es una página de calendario
   * (challenge, error, cambio de tema) y year/month son solo el respaldo pedido.
   */
  recognized: boolean;
  rows: ListingRow[];
  warnings: string[];
}

/** Datos del listado que viajan en RawRecord.listing hasta el parse. */
export interface ListingData {
  slug: string;
  rows: ListingRow[];
}

const PRODUCTION_PATH_RE = /^\/produccion\/([^/]+)\/?$/;

export function productionSlugFromUrl(url: string): string | null {
  try {
    const u = new URL(url, BASE_URL);
    if (u.host !== new URL(BASE_URL).host) return null;
    const m = PRODUCTION_PATH_RE.exec(u.pathname);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function canonicalProductionUrl(slug: string): string {
  return `${BASE_URL}produccion/${slug}/`;
}

const TRACKING_PARAM_RE = /^(?:utm_|gad_|gclid$|gbraid$|wbraid$|fbclid$|mc_cid$|mc_eid$|dclid$)/i;

/** URL de ticketera sin parámetros de campaña (gclid, gad_*, utm_*…). Null si no es http(s). */
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

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function absoluteImageUrl(src: string | null | undefined): string | null {
  const s = clean(src);
  return /^https?:\/\//i.test(s) ? s : null;
}

/** Título del sitio: `<i>` se ignora, `<br>` separa título y subtítulo. */
function splitTitleHtml(html: string | null): { title: string; subtitle: string | null } {
  const parts = (html ?? '')
    .split(/<\s*\/?\s*br\s*\/?\s*>/i)
    .map((p) => clean(htmlToText(p)))
    .filter((p) => p.length > 0);
  return { title: parts[0] ?? '', subtitle: parts.length > 1 ? parts.slice(1).join(' · ') : null };
}

export function parseCalendarPage(
  html: string,
  fallback: { year: number; month: number },
): ListingPage {
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  const table = $('table#calendar-table').first();
  const yearAttr = Number(table.attr('data-currentyear'));
  const monthAttr = Number(table.attr('data-currentmonth'));
  const monthFromHeading = monthNumberEs($('h1.month').first().text());
  const yearOk = Number.isInteger(yearAttr) && yearAttr > 2000;
  const monthOk = Number.isInteger(monthAttr) && monthAttr >= 1 && monthAttr <= 12;
  const year = yearOk ? yearAttr : fallback.year;
  const month = monthOk ? monthAttr : (monthFromHeading ?? fallback.month);
  const recognized = (yearOk && monthOk) || monthFromHeading !== null;
  if (monthFromHeading !== null && monthFromHeading !== month) {
    warnings.push(`h1.month (${monthFromHeading}) no coincide con data-currentmonth (${month})`);
  }

  const rows: ListingRow[] = [];
  $('div.calendar-item').each((_, el) => {
    const $el = $(el);
    const detailHref = $el.find('.buttons a.button.grey').first().attr('href');
    const slug = productionSlugFromUrl(detailHref ?? '');
    if (!slug || !detailHref) {
      warnings.push('calendar-item sin enlace de detalle /produccion/');
      return;
    }
    const dayText = clean($el.find('.head .day-number').first().text());
    const hourText = clean($el.find('.head .day-hour').first().text());
    const day = parseDayNumber(dayText);
    if (day === null) {
      warnings.push(`calendar-item ${slug} sin día legible ('${dayText}')`);
      return;
    }
    rows.push({
      slug,
      detailUrl: canonicalProductionUrl(slug),
      ...splitTitleHtmlForListing($el.find('.event-content h1').first().html()),
      category: clean($el.find('.event-content .category').first().text()),
      dataText: clean(htmlToText($el.find('.event-content .data').first().html() ?? '')),
      ticketsUrl: cleanTicketsUrl($el.find('.buttons a.button.red').first().attr('href')),
      imageUrl: absoluteImageUrl($el.find('figure img').first().attr('src')),
      year,
      month,
      day,
      time: parseListingHour(hourText),
      dateText: `${dayText} ${hourText}`.trim(),
    });
  });

  return { year, month, recognized, rows, warnings };
}

function splitTitleHtmlForListing(html: string | null): { title: string } {
  const { title, subtitle } = splitTitleHtml(html);
  return { title: subtitle ? `${title} · ${subtitle}` : title };
}

// ── Detalle de producción ──────────────────────────────────────────────────

export interface DetailFunction {
  /** Texto crudo: "viernes 09/10, 20:00 hs". */
  text: string;
  monthHeading: string;
  month: number | null;
  day: number | null;
  year: number | null;
  time: LocalTimeParts | null;
  /**
   * `div.day.inactive` (sin venta online). Sin `coming_soon` es, en los fixtures,
   * una función pasada; pero la clase no garantiza que lo sea (una agotada o con la
   * venta cerrada podría venir igual): buildEvent compara la fecha con `now`.
   */
  inactive: boolean;
  /** `div.day.inactive.coming_soon` + "Próximamente" = aún no a la venta. */
  comingSoon: boolean;
  /** `.day.sold_out` / `button.sold_out` (definido en el CSS del tema). */
  soldOut: boolean;
  ticketsUrl: string | null;
  buttonText: string;
  performanceType: string;
  featuredDetail: string;
  /** Todo el texto del bloque, para detectStatusEs. */
  nearText: string;
}

export interface DetailPage {
  title: string;
  subtitle: string | null;
  categoryLabel: string;
  /** Slugs `production-category-*` del CMS presentes en la página. */
  categorySlugs: string[];
  /** Slug `places-*` del CMS, si está. */
  placeSlug: string | null;
  /** `h4#the_place`: "Sala principal", "Salón Dorado", "CETC", … o vacío. */
  placeText: string;
  locationName: string | null;
  imageUrl: string | null;
  metaDescription: string;
  /**
   * `.production-info-switch .data p`: compositor, rango de fechas, abono o nota
   * ("9 al 16 de octubre", "Funciones del 21, 22 y 23 de octubre de 2026"). Es texto
   * libre de la producción: ahí aparecería un aviso de suspensión o cancelación.
   */
  dataText: string;
  synopsisText: string;
  functions: DetailFunction[];
  durationMinutes: number | null;
  /** "Edad sugerida: a partir de los 5 años" (texto literal del sitio). */
  ageRating: string | null;
  rawFragment: string;
  warnings: string[];
}

const DURATION_RE = /duraci[oó]n[^.\n\d]{0,40}?(\d{2,3})\s*(?:min\b|minutos\b)/i;
const AGE_RE =
  /edad sugerida:?\s*((?:a partir de (?:los )?\d{1,2} a[ñn]os)|(?:para toda la familia))/i;

export function parseDetailPage(html: string): DetailPage {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const main = $('main').first();

  const { title, subtitle } = splitTitleHtml(main.find('h1[itemprop="name"]').first().html());

  const categoryLabel = clean(
    main
      .find('section.card-ballet .content .category, section.hero-module .content .category')
      .first()
      .text(),
  );

  const taxonomyClasses = (
    main.find('[class*="production-category-"], [class*="places-"]').first().attr('class') ?? ''
  ).split(/\s+/);
  const categorySlugs = taxonomyClasses
    .filter((c) => c.startsWith('production-category-'))
    .map((c) => c.slice('production-category-'.length));
  const placeSlug = taxonomyClasses.find((c) => c.startsWith('places-'))?.slice(7) ?? null;

  const placeText = clean($('h4#the_place').first().text());
  const locationName = clean(
    $('[itemprop="location"] [itemprop="name"]').first().attr('content') ??
      $('[itemprop="location"] [itemprop="name"]').first().text(),
  );

  const imageUrl =
    absoluteImageUrl(
      main
        .find(
          'section.card-ballet img[itemprop="image"], section.hero-module img[itemprop="image"]',
        )
        .first()
        .attr('src'),
    ) ?? absoluteImageUrl($('meta[property="og:image"]').attr('content'));

  const metaDescription = clean(htmlToText($('meta[name="description"]').attr('content') ?? ''));
  const dataText = clean(
    main
      .find('.production-info-switch .data p')
      .map((_, p) => clean($(p).text()))
      .get()
      .filter((t) => t.length > 0)
      .join(' '),
  );
  const synopsis = $('section#sinopsis').first().clone();
  synopsis.find('h4#the_place').remove();
  const synopsisText = htmlToText(synopsis.html() ?? '');

  const durationMatch = DURATION_RE.exec(synopsisText);
  const durationMinutes = durationMatch ? Number(durationMatch[1]) : null;
  const ageMatch = AGE_RE.exec(synopsisText);
  const ageRating = ageMatch?.[1] ? clean(ageMatch[1]).toLowerCase() : null;

  const functions: DetailFunction[] = [];
  const months = $('section.dates .months').first();
  let monthHeading = '';
  let monthNumber: number | null = null;
  months.children().each((_, el) => {
    const $el = $(el);
    if ($el.hasClass('head')) {
      monthHeading = clean($el.find('h4').first().text());
      monthNumber = monthNumberEs(monthHeading);
      if (monthNumber === null)
        warnings.push(`mes no reconocido en section.dates: '${monthHeading}'`);
      return;
    }
    if (!$el.hasClass('month-days')) return;
    $el.children('.day').each((__, dayEl) => {
      const $d = $(dayEl);
      const classes = ($d.attr('class') ?? '').split(/\s+/);
      const text = clean($d.find('span.hide-desktop > p').first().text());
      const parsed = parseDetailDayText(text);
      const dayNumber = parseDayNumber($d.find('p.day-number').first().text());
      const hourText = clean($d.find('p.day-hour').first().text());
      const time = parsed?.time ?? (hourText ? parseListingHour(hourText) : null);
      const month = parsed?.month ?? monthNumber;
      if (parsed && monthNumber !== null && parsed.month !== monthNumber) {
        warnings.push(`función '${text}' bajo el mes '${monthHeading}': se usa el mes del texto`);
      }
      functions.push({
        text: text || `${dayNumber ?? '?'} ${hourText}`.trim(),
        monthHeading,
        month,
        day: parsed?.day ?? dayNumber,
        year: parsed?.year ?? null,
        time,
        inactive: classes.includes('inactive'),
        comingSoon: classes.includes('coming_soon'),
        soldOut:
          classes.includes('sold_out') || $d.find('button.sold_out, .is_sold_out').length > 0,
        ticketsUrl: cleanTicketsUrl($d.find('a[itemprop="url"]').first().attr('href')),
        buttonText: clean($d.find('button').first().text()),
        performanceType: clean($d.find('p.performance-type').first().text()),
        featuredDetail: clean($d.find('p.featured-detail').first().text()),
        // Texto de cada <p>/<button> separado por espacios (concatenar text() pegaría palabras).
        nearText: clean(
          [
            ...new Set(
              $d
                .find('p, button')
                .map((___, node) => clean($(node).text()))
                .get()
                .filter((t) => t.length > 0),
            ),
          ].join(' '),
        ),
      });
    });
  });

  const hero = main.find('section.card-ballet, section.hero-module').first().clone();
  hero.find('style, script').remove();
  const rawFragment = `${$.html(hero)}\n${$.html($('section.dates').first())}`.slice(
    0,
    RAW_FRAGMENT_MAX,
  );

  return {
    title,
    subtitle,
    categoryLabel,
    categorySlugs,
    placeSlug,
    placeText,
    locationName: locationName || null,
    imageUrl,
    metaDescription,
    dataText,
    synopsisText,
    functions,
    durationMinutes,
    ageRating,
    rawFragment,
    warnings,
  };
}

// ── Normalización ──────────────────────────────────────────────────────────

function statusFromText(text: string): ParsedOccurrenceStatus | null {
  const detected = detectStatusEs(text);
  if (detected === 'cancelled' || detected === 'postponed' || detected === 'sold_out') {
    return detected;
  }
  return null;
}

/** Estado afirmado por la fuente + texto literal que lo afirma (statusReason). */
interface StatusClaim {
  status: ParsedOccurrenceStatus;
  reason: string;
}

const STATUS_RANK: Record<ParsedOccurrenceStatus, number> = {
  scheduled: 0,
  sold_out: 1,
  postponed: 2,
  cancelled: 3,
};

function claimFromText(text: string | null | undefined): StatusClaim | null {
  const t = clean(text);
  const status = t ? statusFromText(t) : null;
  return status ? { status, reason: t } : null;
}

/** El estado más grave entre todas las marcas (cancelada > postergada > agotada). */
function strongestClaim(claims: readonly (StatusClaim | null)[]): StatusClaim | null {
  let best: StatusClaim | null = null;
  for (const c of claims) {
    if (c && (!best || STATUS_RANK[c.status] > STATUS_RANK[best.status])) best = c;
  }
  return best;
}

function listingDataOf(raw: RawRecord): ListingData | null {
  const l = raw.listing as Partial<ListingData> | undefined;
  if (!l || typeof l !== 'object' || !Array.isArray(l.rows)) return null;
  return { slug: typeof l.slug === 'string' ? l.slug : raw.externalId, rows: l.rows };
}

export function buildEvent(raw: RawRecord, ctx: ParseContext): ParseResult {
  const listing = listingDataOf(raw);
  const listingRows = listing?.rows ?? [];
  const slug = raw.externalId;
  const url = canonicalProductionUrl(slug);

  if (!raw.body.trim()) {
    return fail(['sin HTML de detalle (enrich no corrió o falló)'], {
      title: listingRows[0]?.title,
      url,
    });
  }

  const detail = parseDetailPage(raw.body);
  const warnings = [...detail.warnings];
  const now = ctx.now();

  const title = detail.title || listingRows[0]?.title || '';
  if (!title) return fail(['sin título en el detalle ni en el listado'], { url });

  // Sala → venue (igual para todas las funciones de la producción).
  const venueRes = venueForPlace(detail.placeText, {
    placeSlug: detail.placeSlug,
    locationName: detail.locationName,
  });
  if (venueRes.warning) warnings.push(venueRes.warning);
  const venue: VenueRef | null = venueRes.venue;

  // Año de cada función: el listado mensual lo conoce; el detalle solo trae dd/mm.
  const listingYears = new Map<string, number>();
  // Filas del listado por (mes, día, hora): su `.data` es texto libre POR FUNCIÓN.
  const rowsByKey = new Map<string, ListingRow[]>();
  for (const row of listingRows) {
    const key = dayTimeKey(row.month, row.day, row.time);
    listingYears.set(key, row.year);
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row]);
  }

  // Marcas de estado de TODA la producción: título/subtítulo, `.data` y categoría del
  // detalle (el relevamiento §11: una cancelación solo aparecería como texto libre).
  const productionClaim = strongestClaim([
    claimFromText(title),
    claimFromText(detail.subtitle),
    claimFromText(detail.dataText),
    claimFromText(detail.categoryLabel),
  ]);
  if (productionClaim) {
    warnings.push(
      `estado '${productionClaim.status}' de toda la producción por texto de la fuente: '${productionClaim.reason}'`,
    );
  }
  const rowClaimsOf = (key: string): (StatusClaim | null)[] =>
    (rowsByKey.get(key) ?? []).flatMap((row) => [
      claimFromText(row.dataText),
      claimFromText(row.title),
    ]);

  interface Candidate {
    f: DetailFunction;
    time: LocalTimeParts;
    key: string;
    /** Año explícito en el texto o confirmado por una fila del listado mensual. */
    yearConfirmed: boolean;
    startsAt: string;
    startDate: string;
    startMs: number;
  }
  const candidates: Candidate[] = [];
  for (const f of detail.functions) {
    if (f.month === null || f.day === null) {
      warnings.push(`función sin fecha legible: '${f.text}'`);
      continue;
    }
    if (!f.time) {
      warnings.push(`función sin hora confirmada, se omite: '${f.text}'`);
      continue;
    }
    const key = dayTimeKey(f.month, f.day, f.time);
    const year = f.year ?? resolveYear(f.month, f.day, f.time, listingYears, now);
    if (year === null) {
      warnings.push(`función fuera de la ventana de inferencia de año, se omite: '${f.text}'`);
      continue;
    }
    try {
      const startsAt = toIsoInstant(baDateTime({ year, month: f.month, day: f.day }, f.time));
      candidates.push({
        f,
        time: f.time,
        key,
        yearConfirmed: f.year !== null || listingYears.has(key),
        startsAt,
        startDate: partsToLocalDate({ year, month: f.month, day: f.day }),
        startMs: Date.parse(startsAt),
      });
    } catch (err) {
      warnings.push(`fecha inválida '${f.text}': ${(err as Error).message}`);
    }
  }

  const occurrences: NormalizedOccurrenceInput[] = [];
  const seen = new Set<string>();
  const nowMs = now.toMillis();
  let skippedPast = 0;
  const outOfOrder: string[] = [];
  const inactiveFuture: string[] = [];

  candidates.forEach((c, i) => {
    const { f } = c;
    // `div.day.inactive` (sin coming_soon) = sin venta online. Se omite SOLO si ya pasó.
    if (f.inactive && !f.comingSoon) {
      if (c.startMs < nowMs) {
        skippedPast += 1;
        return;
      }
      // section.dates es cronológica: una inactive con año inferido que queda DESPUÉS
      // de una función posterior en la página es una fecha vieja (> 60 días) que
      // inferYear pasó al año siguiente. Publicarla sería inventar el año.
      if (!c.yearConfirmed && candidates.slice(i + 1).some((n) => n.startMs < c.startMs)) {
        outOfOrder.push(f.text);
        return;
      }
      inactiveFuture.push(f.text);
    }

    const externalId = `${slug}|${c.startDate}|${timeKey(c.time)}`;
    if (seen.has(externalId)) return;
    seen.add(externalId);

    const claim = strongestClaim([
      f.soldOut ? { status: 'sold_out', reason: 'marcada como agotada en el sitio' } : null,
      claimFromText(f.nearText),
      ...rowClaimsOf(c.key),
      productionClaim,
    ]);
    const status: ParsedOccurrenceStatus = claim?.status ?? 'scheduled';
    const isFree = detectFreeEs(f.buttonText) === true;
    const occurrence: NormalizedOccurrenceInput = {
      externalId,
      kind: 'timed',
      startsAt: c.startsAt,
      endsAt: null,
      startDate: c.startDate,
      endDate: c.startDate,
      timezone: BA_TZ,
      scheduleText: null,
      recurrenceRule: null,
      sourceDateText: f.monthHeading ? `${f.text} (${f.monthHeading})` : f.text,
      venue,
      status,
      // Sin link si el sitio no la vende online (próximamente o inactive).
      ticketsUrl: f.comingSoon || f.inactive ? null : f.ticketsUrl,
      price: isFree ? { text: f.buttonText, isFree: true, verified: true } : null,
    };
    if (claim) occurrence.statusReason = claim.reason;
    occurrences.push(occurrence);
  });
  if (skippedPast) warnings.push(`${skippedPast} funciones pasadas (div.day.inactive) omitidas`);
  if (outOfOrder.length) {
    warnings.push(
      `funciones inactive fuera de orden cronológico (año no confirmado), se toman como pasadas: ${outOfOrder.map((t) => `'${t}'`).join(', ')}`,
    );
  }
  if (inactiveFuture.length) {
    warnings.push(
      `funciones futuras marcadas inactive (sin venta online), se publican sin link de entradas: ${inactiveFuture.map((t) => `'${t}'`).join(', ')}`,
    );
  }

  // Respaldo: detalle sin sección de funciones pero listado con fecha y hora publicadas.
  if (detail.functions.length === 0 && listingRows.length > 0) {
    warnings.push('detalle sin section.dates: funciones tomadas del listado mensual');
    for (const row of listingRows) {
      if (!row.time) continue;
      let startsAt: string;
      let startDate: string;
      try {
        startsAt = toIsoInstant(
          baDateTime({ year: row.year, month: row.month, day: row.day }, row.time),
        );
        startDate = partsToLocalDate({ year: row.year, month: row.month, day: row.day });
      } catch {
        continue;
      }
      const externalId = `${slug}|${startDate}|${timeKey(row.time)}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);
      const claim = strongestClaim([
        claimFromText(row.dataText),
        claimFromText(row.title),
        productionClaim,
      ]);
      const status: ParsedOccurrenceStatus = claim?.status ?? 'scheduled';
      occurrences.push({
        externalId,
        kind: 'timed',
        startsAt,
        endsAt: null,
        startDate,
        endDate: startDate,
        timezone: BA_TZ,
        scheduleText: null,
        recurrenceRule: null,
        sourceDateText: row.dateText,
        venue,
        status,
        ticketsUrl: row.ticketsUrl,
        price: null,
        ...(claim ? { statusReason: claim.reason } : {}),
      });
    }
  }

  // Entradas a nivel evento: la URL común de las funciones o, si no, la del listado.
  const ticketUrls = [...new Set(occurrences.map((o) => o.ticketsUrl).filter(Boolean))] as string[];
  const ticketsUrl = ticketUrls[0] ?? listingRows.find((r) => r.ticketsUrl)?.ticketsUrl ?? null;

  // Disciplinas: categoría del detalle, taxonomía del CMS y, como respaldo, la del listado.
  // Si solo hay temporada ("Temporada 2026"), señales deterministas de la propia fuente.
  const listingCategory = listingRows.find((r) => r.category)?.category ?? null;
  const mapping = disciplinesFor([detail.categoryLabel, ...detail.categorySlugs, listingCategory], {
    ticketUrls: [
      ...ticketUrls,
      ...listingRows.map((r) => r.ticketsUrl),
      ...detail.functions.map((f) => f.ticketsUrl),
    ],
    text: [title, detail.subtitle ?? '', detail.metaDescription, detail.synopsisText].join('\n'),
  });
  if (mapping.basis === 'signals') {
    warnings.push(
      `sin categoría informativa (solo temporada o ninguna): disciplina por señales de la fuente (${mapping.disciplines.join(', ')})`,
    );
  } else if (mapping.basis === 'season-only') {
    warnings.push('categoría solo de temporada y sin señales: disciplina otros');
  } else if (mapping.disciplines.length === 0) {
    warnings.push('sin categoría mapeable a disciplina');
  }

  const tags = [
    ...new Set([detail.categoryLabel || listingCategory || '', ...mapping.tags]),
  ].filter((t) => t.length > 0);

  const allFree = occurrences.length > 0 && occurrences.every((o) => o.price?.isFree === true);

  const descriptionParts = [detail.metaDescription, detail.synopsisText].filter(
    (p) => p.length > 0,
  );
  const description =
    descriptionParts.length === 2 && detail.synopsisText.includes(detail.metaDescription)
      ? detail.synopsisText
      : descriptionParts.join('\n\n');
  const imageUrl = detail.imageUrl ?? listingRows.find((r) => r.imageUrl)?.imageUrl ?? null;

  const event: NormalizedEventInput = {
    source: SOURCE_SLUG,
    externalId: slug,
    url,
    capturedAt: raw.fetchedAt,
    title,
    ...(detail.subtitle ? { subtitle: detail.subtitle } : {}),
    ...(description ? { description } : {}),
    attribution: ATTRIBUTION,
    disciplines: mapping.disciplines,
    institutionSlug: INSTITUTION_SLUG,
    officialUrl: url,
    ...(ticketsUrl ? { ticketsUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(allFree ? { priceText: 'Gratuita', isFree: true, priceVerified: true } : {}),
    tags,
    ...(detail.durationMinutes ? { durationMinutes: detail.durationMinutes } : {}),
    ...(detail.ageRating ? { ageRating: detail.ageRating } : {}),
    occurrences,
    rawFragment: detail.rawFragment,
  };

  const validated = NormalizedEventSchema.safeParse(event);
  if (!validated.success) {
    return fail(
      validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      event as Partial<NormalizedEventInput> as never,
    );
  }
  return ok(validated.data, warnings);
}
