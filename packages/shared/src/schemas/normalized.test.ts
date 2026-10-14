import { BA_TZ } from '../constants/tz';
import {
  type NormalizedEventInput,
  NormalizedEventSchema,
  type NormalizedOccurrenceInput,
  NormalizedOccurrenceSchema,
} from './normalized';
import { assessPublishability } from './publishability';

const now = '2026-10-14T15:00:00Z';

function occurrence(overrides: Partial<NormalizedOccurrenceInput> = {}): NormalizedOccurrenceInput {
  return {
    kind: 'timed',
    startsAt: '2026-10-18T20:00:00-03:00',
    endsAt: null,
    startDate: '2026-10-18',
    endDate: '2026-10-18',
    timezone: BA_TZ,
    scheduleText: null,
    recurrenceRule: null,
    sourceDateText: 'Domingo 18 de octubre, 20:00',
    venue: { slug: 'teatro-colon', name: 'Teatro Colón', room: 'Sala Principal' },
    status: 'scheduled',
    ticketsUrl: null,
    price: null,
    ...overrides,
  };
}

function event(overrides: Partial<NormalizedEventInput> = {}): NormalizedEventInput {
  return {
    source: 'teatro-colon',
    externalId: 'les-contes-d-hoffmann',
    url: 'https://teatrocolon.org.ar/es/temporada-2026/les-contes-d-hoffmann',
    capturedAt: now,
    title: 'Les Contes d’Hoffmann',
    attribution: 'Texto: Teatro Colón',
    disciplines: ['opera_clasica'],
    institutionSlug: 'teatro-colon',
    officialUrl: 'https://teatrocolon.org.ar/es/temporada-2026/les-contes-d-hoffmann',
    occurrences: [occurrence()],
    ...overrides,
  };
}

describe('NormalizedOccurrenceSchema', () => {
  it('accepts a timed occurrence', () => {
    expect(NormalizedOccurrenceSchema.safeParse(occurrence()).success).toBe(true);
  });

  it('rejects inverted dates and instants', () => {
    expect(
      NormalizedOccurrenceSchema.safeParse(occurrence({ endDate: '2026-10-17' })).success,
    ).toBe(false);
    expect(
      NormalizedOccurrenceSchema.safeParse(occurrence({ endsAt: '2026-10-18T19:00:00-03:00' }))
        .success,
    ).toBe(false);
  });

  it('requires endsAt for ranges', () => {
    const range = occurrence({
      kind: 'range',
      startsAt: '2026-10-16T00:00:00-03:00',
      endsAt: null,
      startDate: '2026-10-16',
      endDate: '2026-12-13',
    });
    expect(NormalizedOccurrenceSchema.safeParse(range).success).toBe(false);
    expect(
      NormalizedOccurrenceSchema.safeParse({ ...range, endsAt: '2026-12-13T23:59:59-03:00' })
        .success,
    ).toBe(true);
  });

  it('rejects other timezones and naive instants', () => {
    expect(NormalizedOccurrenceSchema.safeParse({ ...occurrence(), timezone: 'UTC' }).success).toBe(
      false,
    );
    expect(
      NormalizedOccurrenceSchema.safeParse(occurrence({ startsAt: '2026-10-18T20:00:00' })).success,
    ).toBe(false);
  });

  it('validates prices', () => {
    expect(
      NormalizedOccurrenceSchema.safeParse(
        occurrence({ price: { text: 'Desde $5.000', min: 5000, max: 20000, verified: true } }),
      ).success,
    ).toBe(true);
    expect(
      NormalizedOccurrenceSchema.safeParse(
        occurrence({ price: { text: 'x', min: 20000, max: 5000, verified: true } }),
      ).success,
    ).toBe(false);
  });
});

describe('NormalizedEventSchema', () => {
  it('applies defaults', () => {
    const parsed = NormalizedEventSchema.parse(event());
    expect(parsed.tags).toEqual([]);
    expect(parsed.priceVerified).toBe(false);
  });

  it('rejects unknown disciplines, bad urls and empty titles', () => {
    expect(NormalizedEventSchema.safeParse(event({ disciplines: ['rock' as never] })).success).toBe(
      false,
    );
    expect(NormalizedEventSchema.safeParse(event({ officialUrl: 'colon' })).success).toBe(false);
    expect(NormalizedEventSchema.safeParse(event({ title: '   ' })).success).toBe(false);
  });
});

describe('assessPublishability', () => {
  const known = new Set(['teatro-colon', 'mnba']);

  it('publishes a complete event', () => {
    const parsed = NormalizedEventSchema.parse(event());
    expect(assessPublishability(parsed, { now, knownVenueSlugs: known })).toEqual({
      publishable: true,
      reasons: [],
    });
  });

  it('reports every missing requirement', () => {
    const parsed = NormalizedEventSchema.parse(
      event({ title: 'Ab', disciplines: [], occurrences: [] }),
    );
    expect(assessPublishability(parsed, { now, knownVenueSlugs: known }).reasons).toEqual([
      'missing:title',
      'missing:occurrences',
      'missing:discipline',
    ]);
  });

  it('requires a future occurrence', () => {
    const past = occurrence({
      startsAt: '2026-09-01T20:00:00-03:00',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    });
    const parsed = NormalizedEventSchema.parse(event({ occurrences: [past] }));
    expect(assessPublishability(parsed, { now, knownVenueSlugs: known }).reasons).toEqual([
      'missing:future_occurrence',
    ]);
  });

  it('treats an ongoing exhibition (started in the past, ends in the future) as current', () => {
    const range = occurrence({
      kind: 'range',
      startsAt: '2026-09-16T00:00:00-03:00',
      endsAt: '2026-12-13T23:59:59-03:00',
      startDate: '2026-09-16',
      endDate: '2026-12-13',
      venue: { slug: 'mnba', name: 'Museo Nacional de Bellas Artes' },
    });
    const parsed = NormalizedEventSchema.parse(
      event({ occurrences: [range], disciplines: ['museos_exposiciones'] }),
    );
    expect(assessPublishability(parsed, { now, knownVenueSlugs: known }).publishable).toBe(true);
  });

  it('requires a resolvable venue: known slug, or name + address from the source', () => {
    const unknownSlug = occurrence({ venue: { slug: 'colon-fabrica', name: 'Colón Fábrica' } });
    const parsedUnknown = NormalizedEventSchema.parse(event({ occurrences: [unknownSlug] }));
    expect(assessPublishability(parsedUnknown, { now, knownVenueSlugs: known }).reasons).toEqual([
      'missing:venue',
    ]);

    const withAddress = occurrence({
      venue: { name: 'Colón Fábrica', address: 'Av. Pedro de Mendoza 2163' },
    });
    const parsedAddr = NormalizedEventSchema.parse(event({ occurrences: [withAddress] }));
    expect(assessPublishability(parsedAddr, { now, knownVenueSlugs: known }).publishable).toBe(
      true,
    );

    const noVenue = occurrence({ venue: null });
    const parsedNone = NormalizedEventSchema.parse(event({ occurrences: [noVenue] }));
    expect(assessPublishability(parsedNone, { now, knownVenueSlugs: known }).reasons).toEqual([
      'missing:venue',
    ]);
  });
});
