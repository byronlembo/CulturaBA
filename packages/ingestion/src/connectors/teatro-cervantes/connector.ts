import { BA_TZ } from '@culturaba/shared';
import { DateTime } from 'luxon';
import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';
import { canonicalUrl } from '../../http/client';
import {
  BASE_URL,
  buildEvent,
  CATEGORIES_URL,
  type CalendarEntry,
  calendarUrl,
  endOfMonth,
  INSTITUTION_SLUG,
  isDetailPage,
  type ListingItem,
  OBRAS_PER_PAGE,
  type Obra,
  obrasBySlugUrl,
  obrasUrl,
  parseCalendarPage,
  parseCategories,
  parseObrasPage,
  SOURCE_SLUG,
  selectCurrentObras,
} from './parse';

/**
 * Conector Teatro Nacional Cervantes (www.teatrocervantes.gob.ar — WordPress, tema `tnc`).
 * Ver docs/research/teatro-cervantes.md.
 *
 *  · discover:
 *      1. GET /wp-json/wp/v2/categories (28 términos: slugs para excluir giras y online, y
 *         para las disciplinas).
 *      2. GET /calendario/?mes=MM&a=AAAA del mes corriente y los MONTHS_AHEAD siguientes: una
 *         fila por función (día + hora). TODO o nada: si un mes falla, no es un calendario o
 *         trae otro mes, discover LANZA (un descubrimiento parcial dejaría funciones como
 *         `missing`).
 *      3. GET /wp-json/wp/v2/obra ordenado por modificación (100 por página; se pagina solo si
 *         la página entera es más nueva que MODIFIED_LOOKBACK_DAYS, hasta MAX_PAGES). Si el
 *         calendario lista una obra que no vino, se pide por slug (una petición).
 *      Se quedan las obras con `ultima_funcion` ≥ hoy, o sin última función pero listadas en el
 *      calendario; se descartan "En el país", giras, Tecnópolis y Cervantes Online.
 *  · enrich: GET /obra/<slug>/ → sala, etiqueta, texto de funciones, precio, entradas, imagen.
 *  · parse: puro (parse.ts / dates.ts).
 *
 * Presupuesto hoy: 1 + 3 + 1 + 5 detalles = 10 peticiones, ≥ 1,5 s entre cada una.
 * robots.txt: solo prohíbe /wp-admin/ (lo verifica el cliente HTTP); sin Crawl-delay.
 */

/** Meses del calendario además del corriente (3 páginas). */
export const MONTHS_AHEAD = 2;
/** Páginas del REST como máximo (hoy alcanza una: 1859 obras, la vigente más vieja es de abril). */
export const MAX_PAGES = 3;
/** Una obra vigente se editó (fechas, entradas) en el último año. */
export const MODIFIED_LOOKBACK_DAYS = 365;
const REQUEST_TIMEOUT_MS = 30_000;

export const teatroCervantesConnector: SourceConnector = {
  slug: SOURCE_SLUG,
  meta: {
    name: 'Programación Teatro Nacional Cervantes',
    baseUrl: BASE_URL,
    institutionSlug: INSTITUTION_SLUG,
    kind: 'html',
    ready: true,
    politeness: { concurrency: 1, minDelayMs: 1500, timeoutMs: REQUEST_TIMEOUT_MS },
  },

  async discover(ctx: FetchContext): Promise<RawRecord[]> {
    const now = ctx.now().setZone(BA_TZ);
    const today = now.toISODate() ?? '';
    const get = (url: string) => ctx.http.get(url, { timeoutMs: REQUEST_TIMEOUT_MS });

    // 1) Categorías.
    const categories = parseCategories((await get(CATEGORIES_URL)).body);

    // 2) Calendario mensual (todo o nada).
    const calendarBySlug = new Map<string, CalendarEntry[]>();
    let windowEnd = today;
    for (let i = 0; i <= MONTHS_AHEAD; i += 1) {
      const month = now.startOf('month').plus({ months: i });
      const url = calendarUrl(month.year, month.month);
      let html: string;
      try {
        html = (await get(url)).body;
      } catch (err) {
        throw new Error(
          `calendario ${month.toFormat('yyyy-MM')} no disponible (${url}): ${(err as Error).message}`,
        );
      }
      const page = parseCalendarPage(html);
      if (!page.recognized) {
        throw new Error(`${url} no es una página de calendario (sin table#calendario ni título)`);
      }
      if (page.year !== month.year || page.month !== month.month) {
        throw new Error(
          `el calendario devolvió ${page.year}-${page.month} en lugar de ${month.toFormat('yyyy-M')} (${url})`,
        );
      }
      for (const w of page.warnings) ctx.logger.warn({ url, warning: w }, 'aviso del calendario');
      for (const e of page.entries) {
        calendarBySlug.set(e.slug, [...(calendarBySlug.get(e.slug) ?? []), e]);
      }
      windowEnd = endOfMonth(month.year, month.month);
      ctx.logger.info(
        { url, month: month.toFormat('yyyy-MM'), functions: page.entries.length },
        'calendario mensual',
      );
    }

    // 3) Obras del REST, las modificadas más recientemente primero.
    const obras: Obra[] = [];
    const cutoff = now.minus({ days: MODIFIED_LOOKBACK_DAYS });
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const batch = parseObrasPage((await get(obrasUrl(page))).body);
      obras.push(...batch.obras);
      if (batch.invalid > 0) {
        ctx.logger.warn({ page, invalid: batch.invalid }, 'obras del REST con forma inesperada');
      }
      const last = batch.lastModified
        ? DateTime.fromISO(batch.lastModified, { zone: BA_TZ })
        : null;
      if (batch.received < OBRAS_PER_PAGE || !last?.isValid || last < cutoff) break;
    }
    const known = new Set(obras.map((o) => o.slug));
    const missing = [...calendarBySlug.keys()].filter((s) => !known.has(s));
    if (missing.length > 0) {
      obras.push(...parseObrasPage((await get(obrasBySlugUrl(missing))).body).obras);
    }

    // 4) Selección: temporada vigente o listada en el calendario; fuera de la Ciudad no.
    const { selected, skipped } = selectCurrentObras(
      obras,
      categories,
      new Set(calendarBySlug.keys()),
      today,
    );
    for (const s of skipped) ctx.logger.info({ slug: s.slug, reason: s.reason }, 'obra descartada');
    ctx.logger.info({ obras: obras.length, selected: selected.length }, 'obras vigentes');

    const fetchedAt = now.toISO() ?? new Date().toISOString();
    const calendarWindow = { start: today, end: windowEnd };
    const records: RawRecord[] = selected.map(({ obra, categories: cats }) => {
      const listing: ListingItem = {
        postId: obra.id,
        slug: obra.slug,
        link: obra.link,
        title: obra.title.rendered,
        modified: obra.modified,
        fechaEstreno: obra.fecha_estreno?.trim() || null,
        ultimaFuncion: obra.ultima_funcion?.trim() || null,
        categories: cats,
        calendar: (calendarBySlug.get(obra.slug) ?? []).map((e) => ({
          date: e.date,
          time: e.time,
          hourText: e.hourText,
        })),
        calendarWindow,
      };
      return {
        externalId: obra.slug,
        url: obra.link,
        fetchedAt,
        contentType: 'html' as const,
        body: '',
        listing,
      };
    });
    return ctx.limit ? records.slice(0, ctx.limit) : records;
  },

  async enrich(raw: RawRecord, ctx: FetchContext): Promise<RawRecord> {
    const res = await ctx.http.get(raw.url, { timeoutMs: REQUEST_TIMEOUT_MS });
    if (!isDetailPage(res.body)) {
      const redirected = res.url && canonicalUrl(res.url) !== canonicalUrl(raw.url);
      throw new Error(
        redirected
          ? `el detalle redirige a ${res.url}`
          : 'la página de detalle no tiene el markup esperado (h3.obra-title / .sidebar-block)',
      );
    }
    return { ...raw, fetchedAt: ctx.now().toISO() ?? raw.fetchedAt, body: res.body };
  },

  parse(raw: RawRecord, ctx: ParseContext): ParseResult {
    try {
      return buildEvent(raw, ctx);
    } catch (err) {
      return fail([`parse: ${(err as Error).message}`]);
    }
  },
};
