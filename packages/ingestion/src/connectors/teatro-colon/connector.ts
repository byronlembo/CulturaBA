import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';
import {
  buildEvent,
  CALENDAR_URL,
  INSTITUTION_SLUG,
  type ListingData,
  type ListingRow,
  parseCalendarPage,
  SOURCE_SLUG,
} from './parse';

/**
 * Conector Teatro Colón (teatrocolon.org.ar — WordPress, HTML server-side).
 *
 *  discover: GET /calendario/ (mes corriente, que el sitio lista desde hoy) y
 *            /calendario/?a=YYYY&mes=M para los MONTHS_AHEAD meses siguientes.
 *            Una fila `div.calendar-item` por función; se agrupan por producción
 *            (`externalId` = slug de /produccion/<slug>/). IO acotado: ≤ 3 páginas.
 *  enrich:   GET /produccion/<slug>/ (una por producción, ~30 hoy).
 *  parse:    puro, sobre el HTML de detalle + las filas del listado (ver parse.ts).
 *
 * robots.txt del sitio: `User-agent: * / Disallow:` (todo permitido); lo verifica el
 * cliente HTTP. Sin precios publicados; "Gratuita" en el botón ⇒ isFree.
 */

/** Meses futuros además del corriente: 3 páginas de listado como máximo. */
const MONTHS_AHEAD = 2;
const REQUEST_TIMEOUT_MS = 30_000;

export const teatroColonConnector: SourceConnector = {
  slug: SOURCE_SLUG,
  meta: {
    name: 'Agenda Teatro Colón',
    baseUrl: CALENDAR_URL,
    institutionSlug: INSTITUTION_SLUG,
    kind: 'html',
    ready: true,
    politeness: { concurrency: 1, minDelayMs: 1500, timeoutMs: REQUEST_TIMEOUT_MS },
  },

  async discover(ctx: FetchContext): Promise<RawRecord[]> {
    const now = ctx.now();
    const fetchedAt = now.toISO() ?? new Date().toISOString();
    const grouped = new Map<string, { url: string; rows: ListingRow[] }>();

    for (let i = 0; i <= MONTHS_AHEAD; i += 1) {
      const month = now.startOf('month').plus({ months: i });
      const url = i === 0 ? CALENDAR_URL : `${CALENDAR_URL}?a=${month.year}&mes=${month.month}`;
      let html: string;
      try {
        html = (await ctx.http.get(url, { timeoutMs: REQUEST_TIMEOUT_MS })).body;
      } catch (err) {
        // El mes corriente es obligatorio; un mes futuro que falle no tira la corrida.
        if (i === 0) throw err;
        ctx.logger.warn({ url, err: (err as Error).message }, 'mes del calendario no disponible');
        continue;
      }
      const page = parseCalendarPage(html, { year: month.year, month: month.month });
      if (page.year !== month.year || page.month !== month.month) {
        ctx.logger.warn(
          { url, expected: `${month.year}-${month.month}`, got: `${page.year}-${page.month}` },
          'el calendario devolvió otro mes',
        );
      }
      for (const w of page.warnings) ctx.logger.warn({ url, warning: w }, 'aviso del listado');
      for (const row of page.rows) {
        const g = grouped.get(row.slug) ?? { url: row.detailUrl, rows: [] };
        g.rows.push(row);
        grouped.set(row.slug, g);
      }
      ctx.logger.info(
        {
          url,
          month: `${page.year}-${page.month}`,
          rows: page.rows.length,
          productions: grouped.size,
        },
        'calendario mensual',
      );
      if (ctx.limit && grouped.size >= ctx.limit) break;
    }

    return [...grouped.entries()].map(([slug, g]) => {
      const listing: ListingData = { slug, rows: g.rows };
      return {
        externalId: slug,
        url: g.url,
        fetchedAt,
        contentType: 'html' as const,
        body: '',
        listing,
      };
    });
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
