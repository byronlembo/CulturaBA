import { z } from 'zod';
import { DISCIPLINE_SLUGS, type DisciplineSlug } from '../constants/disciplines';
import { BA_TZ } from '../constants/tz';

/**
 * Forma común que produce todo conector. Es el contrato entre los parsers (puros)
 * y el pipeline de ingestión, y también la forma que la app conoce para "raw".
 *
 * Reglas:
 *  · Nada se inventa: los campos opcionales se omiten cuando la fuente no los da.
 *  · Un evento tiene N ocurrencias (funciones, fechas de taller, rango de una muestra).
 *  · Instantes en ISO 8601 con offset; fechas locales en YYYY-MM-DD de Buenos Aires.
 */

export const SourceSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug de fuente inválido');

export const DisciplineSlugSchema = z.enum(
  DISCIPLINE_SLUGS as [DisciplineSlug, ...DisciplineSlug[]],
);

export const IsoInstantSchema = z.iso.datetime({ offset: true });
export const LocalDateSchema = z.iso.date();

export const OccurrenceKindSchema = z.enum(['timed', 'all_day', 'range']);
export type OccurrenceKind = z.infer<typeof OccurrenceKindSchema>;

/** Estados que un parser puede afirmar a partir del texto de la fuente. */
export const ParsedOccurrenceStatusSchema = z.enum([
  'scheduled',
  'cancelled',
  'postponed',
  'sold_out',
]);
export type ParsedOccurrenceStatus = z.infer<typeof ParsedOccurrenceStatusSchema>;

export const PriceSchema = z
  .object({
    /** Texto original, p. ej. "Desde $12.000" o "Entrada libre y gratuita". */
    text: z.string().trim().min(1),
    min: z.number().nonnegative().optional(),
    max: z.number().nonnegative().optional(),
    isFree: z.boolean().optional(),
    /** true solo cuando la fuente lo publica explícitamente para esta función. */
    verified: z.boolean(),
  })
  .refine((p) => p.min === undefined || p.max === undefined || p.max >= p.min, {
    message: 'price.max debe ser >= price.min',
    path: ['max'],
  });
export type Price = z.infer<typeof PriceSchema>;

export const VenueRefSchema = z.object({
  /** Slug de un venue conocido (tabla venues) cuando el conector lo mapea. */
  slug: z.string().optional(),
  name: z.string().trim().min(1),
  room: z.string().trim().min(1).optional(),
  /** Solo si la fuente publica la dirección; nunca inferida. */
  address: z.string().trim().min(1).optional(),
  addressSourceUrl: z.url().optional(),
});
export type VenueRef = z.infer<typeof VenueRefSchema>;

export const NormalizedOccurrenceSchema = z
  .object({
    /** Id de la función dentro de la fuente, si existe. */
    externalId: z.string().min(1).optional(),
    kind: OccurrenceKindSchema,
    startsAt: IsoInstantSchema,
    endsAt: IsoInstantSchema.nullable(),
    startDate: LocalDateSchema,
    endDate: LocalDateSchema,
    timezone: z.literal(BA_TZ),
    /** Texto humano original: "Martes a domingos de 11 a 20 h". */
    scheduleText: z.string().nullable(),
    /** RRULE (RFC 5545) cuando la fuente publica un patrón y no fechas. */
    recurrenceRule: z.string().nullable(),
    /** Texto crudo de fecha tal como apareció, para auditoría. */
    sourceDateText: z.string().nullable(),
    venue: VenueRefSchema.nullable(),
    status: ParsedOccurrenceStatusSchema,
    statusReason: z.string().optional(),
    ticketsUrl: z.url().nullable(),
    price: PriceSchema.nullable(),
  })
  .refine((o) => o.endDate >= o.startDate, {
    message: 'endDate debe ser >= startDate',
    path: ['endDate'],
  })
  .refine((o) => o.endsAt === null || Date.parse(o.endsAt) >= Date.parse(o.startsAt), {
    message: 'endsAt debe ser >= startsAt',
    path: ['endsAt'],
  })
  .refine((o) => o.kind !== 'range' || o.endsAt !== null, {
    message: 'una ocurrencia de tipo range necesita endsAt',
    path: ['endsAt'],
  });
export type NormalizedOccurrence = z.output<typeof NormalizedOccurrenceSchema>;
export type NormalizedOccurrenceInput = z.input<typeof NormalizedOccurrenceSchema>;

export const NormalizedEventSchema = z.object({
  source: SourceSlugSchema,
  /** Identificador estable dentro de la fuente (id, slug o URL canónica). */
  externalId: z.string().min(1),
  url: z.url(),
  capturedAt: IsoInstantSchema,

  title: z.string().trim().min(1).max(300),
  subtitle: z.string().trim().min(1).optional(),
  /** Texto original del organizador, en texto plano. */
  description: z.string().trim().min(1).optional(),
  descriptionHtml: z.string().optional(),
  /** P. ej. "Texto: Teatro Colón". */
  attribution: z.string().trim().min(1),

  disciplines: z.array(DisciplineSlugSchema).default([]),
  institutionSlug: z.string().min(1),
  officialUrl: z.url(),
  ticketsUrl: z.url().optional(),

  imageUrl: z.url().optional(),
  imageCredit: z.string().optional(),

  priceText: z.string().trim().min(1).optional(),
  isFree: z.boolean().optional(),
  priceVerified: z.boolean().default(false),

  tags: z.array(z.string().trim().min(1)).default([]),
  language: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  ageRating: z.string().optional(),

  occurrences: z.array(NormalizedOccurrenceSchema).default([]),

  /** Fragmento acotado del HTML/JSON de origen para depurar (va a raw_payload). */
  rawFragment: z.string().max(200_000).optional(),
});
export type NormalizedEvent = z.output<typeof NormalizedEventSchema>;
export type NormalizedEventInput = z.input<typeof NormalizedEventSchema>;
