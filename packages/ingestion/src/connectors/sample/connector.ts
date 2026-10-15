import {
  BA_TZ,
  DisciplineSlugSchema,
  localDateOf,
  type NormalizedEventInput,
  type NormalizedOccurrenceInput,
  rangeBounds,
} from '@culturaba/shared';
import { z } from 'zod';
import {
  type FetchContext,
  fail,
  ok,
  type ParseContext,
  type ParseResult,
  type RawRecord,
  type SourceConnector,
} from '../../core/connector';

/**
 * Fuente sintética con formato JSON "ideal". No representa ninguna institución
 * real: existe para probar el pipeline (dedup, cambios, ausencias, candidatos)
 * sin red y con datos controlados en fixtures/sample/<set>/listing.json.
 */

const ItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.url(),
  sameAs: z.array(z.url()).optional(),
  discipline: DisciplineSlugSchema.optional(),
  disciplines: z.array(DisciplineSlugSchema).optional(),
  description: z.string().optional(),
  image: z.url().optional(),
  venue: z
    .object({
      slug: z.string().optional(),
      name: z.string().optional(),
      address: z.string().optional(),
      room: z.string().optional(),
      coords: z.object({ lat: z.number(), lng: z.number() }).optional(),
    })
    .optional(),
  dates: z
    .array(
      z.object({
        id: z.string().optional(),
        start: z.string(),
        end: z.string().optional(),
        status: z.enum(['scheduled', 'cancelled', 'postponed', 'sold_out']).optional(),
        tickets: z.url().optional(),
      }),
    )
    .optional(),
  range: z
    .object({ start: z.string(), end: z.string(), schedule: z.string().optional() })
    .optional(),
  price: z.string().optional(),
  free: z.boolean().optional(),
  tickets: z.url().optional(),
});

// El descubrimiento es laxo a propósito: un ítem roto no debe tirar abajo la corrida;
// la validación completa ocurre en parse(), ítem por ítem.
const ListingSchema = z.object({
  items: z.array(z.looseObject({ id: z.string(), url: z.string() })),
});

export const BASE_URL = 'https://sample.culturaba.test/';

export const sampleConnector: SourceConnector = {
  slug: 'sample',
  meta: {
    name: 'Fuente sintética de prueba',
    baseUrl: BASE_URL,
    institutionSlug: 'sample',
    kind: 'json_api',
    ready: true,
    politeness: { concurrency: 2, minDelayMs: 0, timeoutMs: 5_000 },
  },

  async discover(ctx: FetchContext): Promise<RawRecord[]> {
    const res = await ctx.http.get(`${BASE_URL}listing.json`);
    const listing = ListingSchema.parse(JSON.parse(res.body));
    const fetchedAt = ctx.now().toISO() ?? new Date().toISOString();
    return listing.items.map((item) => ({
      externalId: item.id,
      url: item.url,
      fetchedAt,
      contentType: 'json' as const,
      body: JSON.stringify(item),
    }));
  },

  parse(raw: RawRecord, _ctx: ParseContext): ParseResult {
    try {
      return parseItem(raw);
    } catch (err) {
      return fail([`parse: ${(err as Error).message}`]);
    }
  },
};

function parseItem(raw: RawRecord): ParseResult {
  const parsed = ItemSchema.safeParse(JSON.parse(raw.body));
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message));
  const item = parsed.data;

  const venue = item.venue
    ? {
        ...(item.venue.slug ? { slug: item.venue.slug } : {}),
        name: item.venue.name ?? item.venue.slug ?? 'Sala',
        ...(item.venue.address ? { address: item.venue.address } : {}),
        ...(item.venue.room ? { room: item.venue.room } : {}),
        ...(item.venue.coords ? { coords: item.venue.coords } : {}),
      }
    : null;

  const occurrences: NormalizedOccurrenceInput[] = [];
  for (const d of item.dates ?? []) {
    occurrences.push({
      ...(d.id ? { externalId: d.id } : {}),
      kind: 'timed',
      startsAt: d.start,
      endsAt: d.end ?? null,
      startDate: localDateOf(d.start),
      endDate: localDateOf(d.end ?? d.start),
      timezone: BA_TZ,
      scheduleText: null,
      recurrenceRule: null,
      sourceDateText: d.start,
      venue,
      status: d.status ?? 'scheduled',
      ticketsUrl: d.tickets ?? item.tickets ?? null,
      price: item.price
        ? {
            text: item.price,
            verified: true,
            ...(item.free !== undefined ? { isFree: item.free } : {}),
          }
        : null,
    });
  }
  if (item.range) {
    const bounds = rangeBounds(item.range.start, item.range.end);
    occurrences.push({
      kind: 'range',
      startsAt: bounds.startsAt,
      endsAt: bounds.endsAt,
      startDate: item.range.start,
      endDate: item.range.end,
      timezone: BA_TZ,
      scheduleText: item.range.schedule ?? null,
      recurrenceRule: null,
      sourceDateText: `${item.range.start} – ${item.range.end}`,
      venue,
      status: 'scheduled',
      ticketsUrl: item.tickets ?? null,
      price: item.price ? { text: item.price, verified: true } : null,
    });
  }

  const disciplines = item.disciplines ?? (item.discipline ? [item.discipline] : []);
  const event: NormalizedEventInput = {
    source: 'sample',
    externalId: item.id,
    url: item.url,
    capturedAt: raw.fetchedAt,
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    attribution: 'Texto: Fuente sintética',
    disciplines,
    institutionSlug: 'sample',
    officialUrl: item.url,
    ...(item.sameAs ? { sameAsUrls: item.sameAs } : {}),
    ...(item.tickets ? { ticketsUrl: item.tickets } : {}),
    ...(item.image ? { imageUrl: item.image } : {}),
    ...(item.price ? { priceText: item.price, priceVerified: true } : {}),
    ...(item.free !== undefined ? { isFree: item.free } : {}),
    occurrences,
    rawFragment: raw.body,
  };
  // NormalizedEventSchema.parse aplica los defaults; el pipeline vuelve a validar.
  return ok(event as never);
}
