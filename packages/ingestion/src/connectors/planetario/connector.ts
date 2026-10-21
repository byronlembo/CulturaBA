import {
  type FetchContext,
  fail,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';
import { parseSchedule, specStart, todayOf, uploadMonthOf, windowOf } from './dates';
import {
  BASE_URL,
  buildEvent,
  INSTITUTION_SLUG,
  type ItemKind,
  isDetailPage,
  type Listing,
  type ListingCard,
  ORIGIN,
  pageUrl,
  parseAgendaSpecials,
  parseCards,
  parseDetail,
  SOURCE_SLUG,
} from './parse';

/**
 * Conector Planetario Galileo Galilei (planetario.buenosaires.gob.ar — Drupal, HTML server-side;
 * sin JSON API: /jsonapi da 404 y no hay /wp-json). Fuente institucional (prioridad 100).
 * Ver docs/research/planetario.md.
 *
 *  · discover (≈ 5 listados + 6 fichas de espectáculos):
 *     1. /encuentros-de-ciencia, /otras-actividades: grillas que ACUMULAN años (desde 2019).
 *        Cada tarjeta trae el "¿Cuándo?" literal; solo se quedan las que tienen alguna fecha
 *        desde hoy − 7 días (dates.ts, con el mes de carga de la imagen como control).
 *     2. /cursos: cursos con temporada publicada ("Inicio…" / "Última clase…").
 *     3. /agenda: el programa de la semana. Solo las líneas FECHADAS con enlace a una ficha
 *        ("Sábados 24 y 31 de octubre 10:00 h – El universo que no vemos"); las funciones del domo
 *        ("MARTES A VIERNES 12.30 h – …"), las visitas al museo y los telescopios son patrones
 *        semanales sin temporada: no se emiten (Linda trae algunas funciones del domo).
 *     4. /espectaculos-publico-general + la ficha de cada espectáculo: se emite SOLO si la ficha
 *        publica fechas o un rango ("Desde el … al …"). Hoy ninguna lo hace ("Horarios y
 *        localidades disponibles en web de compra", "De martes a viernes 12.30 h").
 *     TODO o nada: un listado que falla o cambió de markup ⇒ discover LANZA (un descubrimiento
 *     parcial marcaría ausencias falsas). Una ficha de espectáculo que da 404 se omite.
 *  · enrich: GET de la ficha (ya viene en los espectáculos).
 *  · parse: puro (parse.ts, dates.ts, venues.ts, disciplines.ts).
 *
 * robots.txt: el de Drupal por defecto (solo /admin, /search, /user/…, /core, /profiles); sin
 * Crawl-delay. Lo verifica el cliente HTTP. Sin Cloudflare ni challenge.
 */

const REQUEST_TIMEOUT_MS = 30_000;

export const ENCUENTROS_URL = `${ORIGIN}/encuentros-de-ciencia`;
export const ACTIVIDADES_URL = `${ORIGIN}/otras-actividades`;
export const CURSOS_URL = `${ORIGIN}/cursos`;
export const AGENDA_URL = `${ORIGIN}/agenda`;
export const ESPECTACULOS_URL = `${ORIGIN}/espectaculos-publico-general`;

interface ListingSource {
  kind: ItemKind;
  url: string;
  label: string;
  /** El listado acumula años: el mes de carga de la imagen controla la inferencia del año. */
  cumulative: boolean;
}

const CARD_LISTINGS: readonly ListingSource[] = [
  { kind: 'encuentro', url: ENCUENTROS_URL, label: 'encuentros-de-ciencia', cumulative: true },
  { kind: 'actividad', url: ACTIVIDADES_URL, label: 'otras-actividades', cumulative: true },
  { kind: 'curso', url: CURSOS_URL, label: 'cursos', cumulative: false },
];

/** Si una ficha aparece en varios listados, el más específico define el tipo. */
const KIND_RANK: Record<ItemKind, number> = {
  encuentro: 0,
  actividad: 1,
  curso: 2,
  espectaculo: 3,
  agenda: 4,
};

interface Found {
  path: string;
  listing: Listing;
  /** Primer día vigente (orden del descubrimiento: lo próximo primero). */
  first: string;
  body: string;
}

async function getPage(ctx: FetchContext, url: string): Promise<string> {
  try {
    return (await ctx.http.get(url, { timeoutMs: REQUEST_TIMEOUT_MS })).body;
  } catch (err) {
    throw new Error(`${url} no disponible: ${(err as Error).message}`);
  }
}

function cardsOrThrow(html: string, url: string): ListingCard[] {
  const cards = parseCards(html);
  if (!cards)
    throw new Error(`${url}: no se encontró la grilla de actividades (¿cambió el markup?)`);
  if (cards.length === 0) throw new Error(`${url}: la grilla no tiene tarjetas`);
  return cards;
}

export const planetarioConnector: SourceConnector = {
  slug: SOURCE_SLUG,
  meta: {
    name: 'Programación del Planetario Galileo Galilei',
    baseUrl: BASE_URL,
    institutionSlug: INSTITUTION_SLUG,
    kind: 'html',
    ready: true,
    politeness: { concurrency: 1, minDelayMs: 1500, timeoutMs: REQUEST_TIMEOUT_MS },
  },

  async discover(ctx: FetchContext): Promise<RawRecord[]> {
    const now = ctx.now();
    const fetchedAt = now.toISO() ?? new Date().toISOString();
    const found = new Map<string, Found>();

    const add = (
      path: string,
      kind: ItemKind,
      source: string,
      first: string,
      data: Partial<Pick<Listing, 'whenLines' | 'uploadMonth' | 'imageUrl' | 'agendaText'>> & {
        title: string;
        body?: string;
      },
    ) => {
      const prev = found.get(path);
      if (!prev) {
        found.set(path, {
          path,
          first,
          body: data.body ?? '',
          listing: {
            kind,
            sources: [source],
            title: data.title,
            whenLines: data.whenLines ?? [],
            uploadMonth: data.uploadMonth ?? null,
            imageUrl: data.imageUrl ?? null,
            agendaText: data.agendaText ?? null,
          },
        });
        return;
      }
      const l = prev.listing;
      if (!l.sources.includes(source)) l.sources.push(source);
      if (KIND_RANK[kind] < KIND_RANK[l.kind]) {
        l.kind = kind;
        l.title = data.title || l.title;
        if (data.whenLines?.length) l.whenLines = data.whenLines;
      }
      l.uploadMonth = l.uploadMonth ?? data.uploadMonth ?? null;
      l.imageUrl = l.imageUrl ?? data.imageUrl ?? null;
      l.agendaText = l.agendaText ?? data.agendaText ?? null;
      if (first < prev.first) prev.first = first;
      if (!prev.body && data.body) prev.body = data.body;
    };

    // 1-2. Listados con tarjetas fechadas.
    for (const src of CARD_LISTINGS) {
      const cards = cardsOrThrow(await getPage(ctx, src.url), src.url);
      let past = 0;
      let undated = 0;
      const unresolved: Array<{ path: string; when: string; warnings: string[] }> = [];
      for (const card of cards) {
        const uploadMonth = src.cumulative ? uploadMonthOf(card.imageUrl) : null;
        const schedule = parseSchedule({ lines: card.whenLines, now, uploadMonth });
        const firstSpec = schedule.specs[0];
        if (firstSpec) {
          add(card.path, src.kind, src.label, specStart(firstSpec), {
            title: card.title,
            whenLines: card.whenLines,
            uploadMonth,
            imageUrl: card.imageUrl,
          });
        } else if (schedule.unresolved > 0) {
          unresolved.push({
            path: card.path,
            when: card.whenLines.join(' / '),
            warnings: schedule.warnings,
          });
        } else if (schedule.past > 0) past += 1;
        else undated += 1;
      }
      ctx.logger.info(
        { listing: src.label, cards: cards.length, past, undated, unresolved: unresolved.length },
        'planetario: listado',
      );
      if (unresolved.length > 0) {
        // Un solo aviso por listado (los más nuevos primero): las tarjetas viejas sin año ni día
        // de semana no se pueden ubicar y se omiten siempre.
        ctx.logger.warn(
          { listing: src.label, count: unresolved.length, sample: unresolved.slice(0, 5) },
          'planetario: tarjetas con fechas que no se pueden ubicar (se omiten)',
        );
      }
    }

    // 3. /agenda: líneas fechadas con enlace a una ficha.
    const specials = parseAgendaSpecials(await getPage(ctx, AGENDA_URL));
    if (!specials) throw new Error(`${AGENDA_URL}: no se encontró el cuerpo de la agenda`);
    for (const special of specials) {
      const schedule = parseSchedule({ lines: [special.whenText], now, uploadMonth: null });
      const firstSpec = schedule.specs[0];
      if (!firstSpec) {
        ctx.logger.info(
          { path: special.path, when: special.whenText, warnings: schedule.warnings },
          'planetario: línea de /agenda sin fechas vigentes',
        );
        continue;
      }
      add(special.path, 'agenda', 'agenda', specStart(firstSpec), {
        title: special.title,
        agendaText: special.whenText,
      });
    }

    // 4. Espectáculos: solo los que publican fechas o un rango en su ficha.
    const shows = cardsOrThrow(await getPage(ctx, ESPECTACULOS_URL), ESPECTACULOS_URL);
    const skippedShows: string[] = [];
    for (const show of shows) {
      const url = pageUrl(show.path);
      const res = await ctx.http.get(url, { timeoutMs: REQUEST_TIMEOUT_MS, allowNotFound: true });
      if (res.status === 404 || !isDetailPage(res.body)) {
        ctx.logger.warn(
          { url, status: res.status },
          'planetario: ficha de espectáculo no disponible',
        );
        continue;
      }
      const detail = parseDetail(res.body);
      const schedule = parseSchedule({ lines: detail.whenLines ?? [], now, uploadMonth: null });
      const firstSpec = schedule.specs[0];
      if (!firstSpec) {
        skippedShows.push(show.title);
        continue;
      }
      add(show.path, 'espectaculo', 'espectaculos-publico-general', specStart(firstSpec), {
        title: show.title,
        whenLines: detail.whenLines ?? [],
        imageUrl: show.imageUrl,
        body: res.body,
      });
    }
    if (skippedShows.length > 0) {
      ctx.logger.info(
        { shows: skippedShows },
        'planetario: espectáculos sin fechas ni temporada publicadas (no se emiten; Linda trae algunas funciones)',
      );
    }

    const records: RawRecord[] = [...found.values()]
      .sort((a, b) => a.first.localeCompare(b.first) || a.path.localeCompare(b.path))
      .map((f) => ({
        externalId: f.path.slice(1),
        url: pageUrl(f.path),
        fetchedAt,
        contentType: 'html' as const,
        body: f.body,
        listing: f.listing,
      }));
    ctx.logger.info(
      { today: todayOf(now), window: windowOf(now), discovered: records.length },
      'planetario: descubrimiento',
    );
    return ctx.limit ? records.slice(0, ctx.limit) : records;
  },

  async enrich(raw: RawRecord, ctx: FetchContext): Promise<RawRecord> {
    if (raw.body) return raw;
    const res = await ctx.http.get(raw.url, { timeoutMs: REQUEST_TIMEOUT_MS });
    if (!isDetailPage(res.body)) {
      throw new Error(`${raw.url} no es la ficha de una actividad (sin field--name-title)`);
    }
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
