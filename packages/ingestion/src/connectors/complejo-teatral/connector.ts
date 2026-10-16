import { BA_TZ } from '@culturaba/shared';
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
  agendaKey,
  buildEvent,
  INSTITUTION_SLUG,
  isDetailPage,
  type ListingItem,
  parseAgendaPage,
  parseListing,
  SOURCE_SLUG,
} from './parse';

/**
 * Conector complejo-teatral (HTML, WordPress tema `ctba`; sin REST para el CPT
 * `produccion`, sin JSON-LD). Ver docs/research/complejo-teatral.md.
 *
 *  · discover: GET home (33 producciones vigentes con texto de funciones, sala/teatro y
 *    URL de detalle) + GET /agenda/?fecha=DD-MM-YYYY para los próximos AGENDA_DAYS días,
 *    que es la única forma estructurada de saber QUÉ DÍAS tiene función cada producción.
 *    La agenda lista días fuera de temporada, así que un patrón semanal solo usa sus días
 *    dentro de una temporada publicada (inicio y fin); ver dates.ts. Si fallan más de
 *    MAX_FAILED_AGENDA_DAYS días, discover falla. ~29 peticiones.
 *  · enrich: GET /produccion/<slug>/ → dirección publicada, "Funciones:", precio,
 *    duración, avisos en rojo, crédito de foto. ~33 peticiones.
 *  · parse: puro (ver parse.ts / dates.ts). Presupuesto total ≈ 62 peticiones por corrida.
 */

export const BASE_URL = 'https://complejoteatral.gob.ar/';
/** Ventana de la agenda por día (acotada: 28 peticiones espaciadas ≥ 1,5 s). */
export const AGENDA_DAYS = 28;
/**
 * Más días de agenda caídos (o con otro markup) que esto abortan la corrida: sin agenda los
 * patrones semanales pierden sus funciones y la conciliación las marcaría ausentes.
 */
export const MAX_FAILED_AGENDA_DAYS = 2;

export const complejoTeatralConnector: SourceConnector = {
  slug: SOURCE_SLUG,
  meta: {
    name: 'Programación Complejo Teatral de Buenos Aires',
    baseUrl: BASE_URL,
    institutionSlug: INSTITUTION_SLUG,
    kind: 'html',
    // El parser está listo; lo que falla es la red: el sitio responde 403 a los runners de
    // GitHub Actions (IPs de datacenter) y no se elude. Fuera de `--all` hasta correrlo desde
    // otra IP (`pnpm ingest run --source complejo-teatral`), que sí funciona.
    ready: false,
    blockedReason:
      'complejoteatral.gob.ar responde 403 a los runners de GitHub Actions; correr con --source desde un equipo con IP no de datacenter.',
    politeness: { concurrency: 1, minDelayMs: 1500, timeoutMs: 30_000 },
  },

  async discover(ctx: FetchContext): Promise<RawRecord[]> {
    const home = await ctx.http.get(BASE_URL);
    const items = parseListing(home.body);
    if (items.length === 0) {
      throw new Error(
        'la home no lista producciones (div.search_results > div.list-item): ¿cambió el markup?',
      );
    }
    ctx.logger.info({ items: items.length }, 'producciones en la home');

    // Agenda por día: qué producciones tienen función cada día (clave = URL de detalle, o título).
    const daysByKey = new Map<string, Set<string>>();
    const today = ctx.now().setZone(BA_TZ).startOf('day');
    let fetchedDays = 0;
    let failedDays = 0;
    for (let i = 0; i < AGENDA_DAYS; i += 1) {
      const day = today.plus({ days: i });
      const localDate = day.toISODate() ?? '';
      const url = `${BASE_URL}agenda/?fecha=${day.toFormat('dd-MM-yyyy')}`;
      try {
        const res = await ctx.http.get(url);
        const cards = parseAgendaPage(res.body);
        if (!cards) throw new Error('sin div.search_results: ¿cambió el markup de la agenda?');
        for (const card of cards) {
          const key = agendaKey(card.detailUrl, card.title);
          const set = daysByKey.get(key) ?? new Set<string>();
          set.add(localDate);
          daysByKey.set(key, set);
        }
        fetchedDays += 1;
      } catch (err) {
        failedDays += 1;
        ctx.logger.warn({ url, err: (err as Error).message }, 'agenda del día no disponible');
      }
    }
    if (failedDays > MAX_FAILED_AGENDA_DAYS) {
      throw new Error(
        `agenda por día no disponible: ${failedDays} de ${AGENDA_DAYS} días con error (se aborta para no marcar funciones como ausentes)`,
      );
    }
    const agendaWindow = {
      from: today.toISODate() ?? '',
      to: today.plus({ days: AGENDA_DAYS - 1 }).toISODate() ?? '',
      fetchedDays,
      failedDays,
    };

    const fetchedAt = ctx.now().toISO() ?? new Date().toISOString();
    const records: RawRecord[] = items.map(({ cardHtml, ...item }) => {
      const days = new Set<string>([
        ...(daysByKey.get(agendaKey(item.detailUrl, item.title)) ?? []),
        ...(daysByKey.get(agendaKey(null, item.title)) ?? []),
      ]);
      const listing: ListingItem = { ...item, agendaDays: [...days].sort(), agendaWindow };
      return {
        externalId: item.slug,
        url: item.detailUrl,
        fetchedAt,
        contentType: 'html' as const,
        body: cardHtml,
        listing,
      };
    });
    return ctx.limit ? records.slice(0, ctx.limit) : records;
  },

  async enrich(raw: RawRecord, ctx: FetchContext): Promise<RawRecord> {
    const res = await ctx.http.get(raw.url);
    if (!isDetailPage(res.body)) {
      const redirected = res.url && canonicalUrl(res.url) !== canonicalUrl(raw.url);
      throw new Error(
        redirected
          ? `el detalle redirige a ${res.url} (producción archivada)`
          : 'la página de detalle no tiene el markup esperado (body.single-produccion / section.post .info)',
      );
    }
    // La URL del listado es la canónica (externalId estable); el cuerpo es el detalle.
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
