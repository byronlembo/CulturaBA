/**
 * Integration tests: real Postgres (TEST_DATABASE_URL, schema applied with
 * `pnpm db:reset-test`). Fixture sets are generated per test with dates
 * relative to the real clock, so they never go stale.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BA_TZ } from '@culturaba/shared';
import { DateTime } from 'luxon';
import { sampleConnector } from '../connectors/sample/connector';
import { createSql, type Db } from '../db/sql';
import { FixtureHttpClient } from '../http/fixtureClient';
import { silentLogger } from '../logger';
import { type RunSummary, runSource } from './pipeline';

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error('TEST_DATABASE_URL no definida (ver .env.example y `pnpm db:reset-test`)');

let sql: Db;
let scratch: string;
let setCounter = 0;

const today = DateTime.now().setZone(BA_TZ).startOf('day');
const at = (days: number, hour: number, minute = 0) =>
  today.plus({ days }).set({ hour, minute }).toISO({ suppressMilliseconds: true }) as string;
const day = (days: number) => today.plus({ days }).toISODate() as string;

type Item = Record<string, unknown>;

function one<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('la consulta no devolvió filas');
  return row;
}

const SALA = { slug: 'sample-sala', room: 'Sala Principal' };

function baseItems(): Item[] {
  return [
    {
      id: 'traviata',
      title: 'La Traviata',
      url: 'https://sample.culturaba.test/eventos/traviata',
      discipline: 'opera_clasica',
      description: 'Ópera en tres actos de Giuseppe Verdi.',
      image: 'https://sample.culturaba.test/img/traviata.jpg',
      venue: SALA,
      dates: [{ start: at(4, 20) }, { start: at(7, 20) }],
      price: 'Desde $10.000',
    },
    {
      id: 'goya',
      title: 'Goya: grabados',
      url: 'https://sample.culturaba.test/eventos/goya',
      discipline: 'museos_exposiciones',
      venue: { slug: 'sample-sala' },
      range: { start: day(2), end: day(60), schedule: 'Martes a domingos de 11 a 20 h' },
      price: 'Entrada libre y gratuita',
      free: true,
    },
    {
      id: 'taller',
      title: 'Taller de grabado',
      url: 'https://sample.culturaba.test/eventos/taller',
      discipline: 'fotografia_artes_visuales',
      venue: { name: 'Anexo Sample', address: 'Calle Falsa 123' },
      dates: [
        { start: at(6, 15), end: at(6, 17) },
        { start: at(13, 15), end: at(13, 17) },
      ],
    },
    {
      id: 'misterio',
      title: 'Actividad sin disciplina',
      url: 'https://sample.culturaba.test/eventos/misterio',
      venue: { slug: 'sample-sala' },
      dates: [{ start: at(19, 18) }],
    },
    {
      id: 'pasado',
      title: 'Concierto ya realizado',
      url: 'https://sample.culturaba.test/eventos/pasado',
      discipline: 'musica_vivo_jazz',
      venue: { slug: 'sample-sala' },
      dates: [{ start: at(-40, 20) }],
    },
  ];
}

function writeSet(items: Item[]): string {
  setCounter += 1;
  const dir = join(scratch, `set-${String(setCounter).padStart(2, '0')}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'listing.json'), JSON.stringify({ items }));
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      source: 'sample',
      entries: [
        {
          url: 'https://sample.culturaba.test/listing.json',
          file: 'listing.json',
          contentType: 'application/json',
        },
      ],
    }),
  );
  return dir;
}

async function run(items: Item[], opts: { dryRun?: boolean } = {}): Promise<RunSummary> {
  const dir = writeSet(items);
  return runSource(
    sampleConnector,
    { sql, http: new FixtureHttpClient(dir), logger: silentLogger },
    { trigger: 'fixture', fixtureSet: dir, now: () => DateTime.now().setZone(BA_TZ), ...opts },
  );
}

/** Un agregador sintético: mismo formato que `sample`, otra fuente y prioridad baja. */
const aggregatorConnector = { ...sampleConnector, slug: 'sample-agg' };

async function runAggregator(items: Item[]): Promise<RunSummary> {
  const dir = writeSet(items);
  return runSource(
    aggregatorConnector,
    { sql, http: new FixtureHttpClient(dir), logger: silentLogger },
    { trigger: 'fixture', fixtureSet: dir, now: () => DateTime.now().setZone(BA_TZ) },
  );
}

async function resetCatalog(): Promise<void> {
  await sql`truncate public.events, public.occurrences, public.source_records, public.ingestion_runs,
    public.event_changes, public.event_duplicates, public.event_stats restart identity cascade`;
  await sql`delete from public.venues where slug like 'sample-%' and slug <> 'sample-sala'`;
}

const q = {
  event: (externalId: string) =>
    sql<
      {
        id: string;
        status: string;
        title: string;
        candidate_reasons: string[];
        dedup_key: string;
        slug: string;
        default_venue_id: string | null;
        first_published_at: string | null;
      }[]
    >`
      select e.id, e.status, e.title, e.candidate_reasons, e.dedup_key, e.slug, e.default_venue_id, e.first_published_at
      from public.events e join public.source_records r on r.event_id = e.id
      where r.external_id = ${externalId} limit 1`.then(one),
  occurrences: (eventId: string) =>
    sql<
      {
        id: string;
        status: string;
        starts_at: Date;
        previous_starts_at: Date | null;
        consecutive_misses: number;
        venue_id: string | null;
      }[]
    >`
      select id, status, starts_at, previous_starts_at, consecutive_misses, venue_id
      from public.occurrences where event_id = ${eventId} order by starts_at`,
  changes: (type?: string) =>
    sql<{ type: string; severity: string; field: string | null }[]>`
      select type::text, severity::text, field from public.event_changes
      where ${type ? sql`type = ${type}::public.change_type` : sql`true`} order by id`,
  count: (table: string) =>
    sql<{ n: number }[]>`select count(*)::int as n from ${sql(`public.${table}`)}`.then(
      (r) => one(r).n,
    ),
  publicEvents: () =>
    sql<
      {
        slug: string;
        upcoming_count: number;
        is_ongoing: boolean;
        disciplines: string[];
        venue_name: string | null;
      }[]
    >`
      select slug, upcoming_count, is_ongoing, disciplines, venue_name from public.v_events_public order by slug`,
};

beforeAll(async () => {
  sql = createSql(url, { max: 2 });
  scratch = mkdtempSync(join(tmpdir(), 'culturaba-fixtures-'));
  await sql`insert into public.institutions (slug, name, website_url)
    values ('sample', 'Institución sintética', 'https://sample.culturaba.test')
    on conflict (slug) do nothing`;
  await sql`insert into public.venues (slug, institution_id, name, address, address_source_url)
    values ('sample-sala', (select id from public.institutions where slug = 'sample'), 'Sala Sample', 'Calle Sample 1', 'https://sample.culturaba.test')
    on conflict (slug) do nothing`;
  await sql`insert into public.sources (slug, name, institution_id, base_url, kind, priority)
    values ('sample', 'Fuente sintética', (select id from public.institutions where slug = 'sample'), 'https://sample.culturaba.test/', 'json_api', 100)
    on conflict (slug) do nothing`;
  await sql`insert into public.sources (slug, name, institution_id, base_url, kind, priority)
    values ('sample-agg', 'Agregador sintético', null, 'https://sample.culturaba.test/', 'json_api', 10)
    on conflict (slug) do nothing`;
});

afterAll(async () => {
  await sql.end();
});

beforeEach(resetCatalog);

describe('first run', () => {
  it('creates events, occurrences, venues and publishes only what is complete', async () => {
    const s = await run(baseItems());
    expect(s.status).toBe('succeeded');
    expect(s.stats).toMatchObject({
      discovered: 5,
      parsed_ok: 3,
      parsed_incomplete: 2,
      parsed_invalid: 0,
      events_created: 5,
      events_published: 3,
      occurrences_created: 7,
    });

    expect((await q.event('traviata')).status).toBe('published');
    expect((await q.event('goya')).status).toBe('published');
    expect((await q.event('taller')).status).toBe('published');
    expect(await q.event('misterio')).toMatchObject({
      status: 'candidate',
      candidate_reasons: ['missing:discipline'],
    });
    expect(await q.event('pasado')).toMatchObject({
      status: 'candidate',
      candidate_reasons: ['missing:future_occurrence'],
    });

    // Venue created from the source's own address, with provenance.
    const venues = await sql<{ slug: string; address: string; address_source_url: string }[]>`
      select slug, address, address_source_url from public.venues where slug = 'sample-anexo-sample'`;
    expect(venues[0]).toMatchObject({
      address: 'Calle Falsa 123',
      address_source_url: 'https://sample.culturaba.test/eventos/taller',
    });
    expect((await q.event('taller')).default_venue_id).not.toBeNull();

    // Slug is stable and derived from the title + id.
    expect((await q.event('traviata')).slug).toMatch(/^la-traviata-[0-9a-f]{6}$/);

    // Public read model.
    const pub = await q.publicEvents();
    expect(pub.map((p) => p.slug.replace(/-[0-9a-f]{6}$/, ''))).toEqual([
      'goya-grabados',
      'la-traviata',
      'taller-de-grabado',
    ]);
    expect(pub.find((p) => p.slug.startsWith('la-traviata'))).toMatchObject({
      upcoming_count: 2,
      disciplines: ['opera_clasica'],
      venue_name: 'Sala Sample',
    });

    expect((await q.changes('event_published')).length).toBe(3);
    expect(await q.count('ingestion_runs')).toBe(1);
  });

  it('keeps everything in a transaction that is rolled back on --dry-run', async () => {
    const s = await run(baseItems(), { dryRun: true });
    expect(s.dryRun).toBe(true);
    expect(s.stats.events_created).toBe(5);
    expect(await q.count('events')).toBe(0);
    expect(await q.count('ingestion_runs')).toBe(0);
    expect(await q.count('venues')).toBeGreaterThan(0); // seed venues untouched
  });
});

describe('idempotency and change detection', () => {
  it('a second identical run changes nothing', async () => {
    await run(baseItems());
    const s = await run(baseItems());
    expect(s.stats).toMatchObject({
      events_created: 0,
      events_updated: 0,
      events_unchanged: 5,
      occurrences_created: 0,
      changes_major: 0,
      changes_minor: 0,
      missing_marked: 0,
    });
    const hashes = await sql<{ content_hash: string; last_changed_at: Date; last_seen_at: Date }[]>`
      select content_hash, last_changed_at, last_seen_at from public.source_records where external_id = 'traviata'`;
    const h = one(hashes);
    expect(h.last_seen_at.getTime()).toBeGreaterThan(h.last_changed_at.getTime());
  });

  it('detects a rescheduled function (one gone, one new, same venue)', async () => {
    await run(baseItems());
    const items = baseItems();
    (items[0] as { dates: { start: string }[] }).dates = [
      { start: at(4, 20) },
      { start: at(8, 20) },
    ];
    const s = await run(items);
    expect(s.stats.changes_major).toBe(1);
    expect(s.stats.occurrences_created).toBe(0);
    const occ = await q.occurrences((await q.event('traviata')).id);
    expect(occ).toHaveLength(2);
    expect(occ[1]).toMatchObject({ status: 'rescheduled' });
    expect(occ[1]?.previous_starts_at?.toISOString()).toBe(new Date(at(7, 20)).toISOString());
    expect((await q.changes('occurrence_rescheduled')).length).toBe(1);
  });

  it('lets a past performance drop off the listing without a reschedule or a miss', async () => {
    const items = baseItems();
    (items[0] as { dates: { start: string }[] }).dates = [
      { start: at(-1, 20) },
      { start: at(4, 20) },
    ];
    await run(items);
    (items[0] as { dates: { start: string }[] }).dates = [
      { start: at(4, 20) },
      { start: at(8, 20) },
    ];
    const s = await run(items);
    expect(s.stats.occurrences_created).toBe(1);
    expect((await q.changes('occurrence_rescheduled')).length).toBe(0);
    expect((await q.changes('occurrence_missing')).length).toBe(0);
    const occ = await q.occurrences((await q.event('traviata')).id);
    expect(occ.map((o) => o.status)).toEqual(['scheduled', 'scheduled', 'scheduled']);
    expect(occ[0]?.consecutive_misses).toBe(0);
  });

  it('detects a cancelled function and hides it from upcoming counts', async () => {
    await run(baseItems());
    const items = baseItems();
    (items[0] as { dates: { start: string; status?: string }[] }).dates = [
      { start: at(4, 20), status: 'cancelled' },
      { start: at(7, 20) },
    ];
    const s = await run(items);
    expect((await q.changes('occurrence_cancelled')).length).toBe(1);
    expect(s.stats.changes_major).toBe(1);
    const pub = await q.publicEvents();
    expect(pub.find((p) => p.slug.startsWith('la-traviata'))?.upcoming_count).toBe(1);
  });

  it('records editorial field changes with severity', async () => {
    await run(baseItems());
    const items = baseItems();
    Object.assign(one(items), {
      title: 'La Traviata (nueva producción)',
      description: 'Texto actualizado.',
    });
    const s = await run(items);
    expect(s.stats.events_updated).toBe(1);
    const changes = await q.changes('field_changed');
    expect(changes.map((c) => `${c.field}:${c.severity}`).sort()).toEqual([
      'description:minor',
      'title:major',
    ]);
    const ev = await q.event('traviata');
    expect(ev.title).toBe('La Traviata (nueva producción)');
    expect(ev.dedup_key).toBe('traviata nueva produccion|sample');
    expect(ev.slug).toMatch(/^la-traviata-/); // never rotated
  });

  it('promotes a candidate to published once the missing data appears', async () => {
    await run(baseItems());
    const items = baseItems();
    Object.assign(items[3] ?? {}, { discipline: 'literatura_charlas' });
    const s = await run(items);
    expect(s.stats.events_published).toBe(1);
    const ev = await q.event('misterio');
    expect(ev).toMatchObject({ status: 'published', candidate_reasons: [] });
    expect(ev.first_published_at).not.toBeNull();
  });
});

describe('disappearance policy', () => {
  it('needs two consecutive misses, then suspends, then restores on reappearance', async () => {
    await run(baseItems());
    const without = baseItems().filter((i) => i.id !== 'goya');

    const first = await run(without);
    expect(first.stats.missing_marked).toBe(0);
    let goya = await q.event('goya');
    expect(goya.status).toBe('published');
    const rec1 = await sql<{ consecutive_misses: number; missing_since: Date | null }[]>`
      select consecutive_misses, missing_since from public.source_records where external_id = 'goya'`;
    expect(rec1[0]).toMatchObject({ consecutive_misses: 1, missing_since: null });

    const second = await run(without);
    expect(second.stats.missing_marked).toBeGreaterThanOrEqual(2); // record + occurrence
    goya = await q.event('goya');
    expect(goya.status).toBe('suspended');
    expect((await q.occurrences(goya.id))[0]?.status).toBe('missing');
    expect((await q.publicEvents()).some((p) => p.slug.startsWith('goya'))).toBe(false);
    expect((await q.changes('event_suspended')).length).toBe(1);

    const back = await run(baseItems());
    goya = await q.event('goya');
    expect(goya.status).toBe('published');
    expect((await q.occurrences(goya.id))[0]?.status).toBe('scheduled');
    expect((await q.changes('event_reappeared')).length).toBe(1);
    expect((await q.changes('occurrence_reappeared')).length).toBe(1);
    expect(back.stats.changes_major).toBeGreaterThanOrEqual(2);
  });

  it('never counts misses when a run discovers far fewer items than the previous one', async () => {
    const many = [
      ...baseItems(),
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `relleno-${i}`,
        title: `Relleno ${i}`,
        url: `https://sample.culturaba.test/eventos/relleno-${i}`,
        discipline: 'cine',
        venue: { slug: 'sample-sala' },
        dates: [{ start: at(10 + i, 19) }],
      })),
    ];
    await run(many);
    const s = await run([]);
    expect(s.status).toBe('partial');
    expect(s.warnings[0]).toMatch(/guardia/);
    expect(s.stats.missing_marked).toBe(0);
    const misses = await sql<
      { max: number }[]
    >`select max(consecutive_misses)::int as max from public.source_records`;
    expect(one(misses).max).toBe(0);
  });

  it('marks a single vanished function of a still-present record after two misses', async () => {
    await run(baseItems());
    const items = baseItems();
    (items[2] as { dates: unknown[] }).dates = [{ start: at(6, 15), end: at(6, 17) }];
    await run(items);
    await run(items);
    const occ = await q.occurrences((await q.event('taller')).id);
    expect(occ.map((o) => o.status)).toEqual(['scheduled', 'missing']);
    expect((await q.changes('occurrence_missing')).length).toBe(1);
  });
});

describe('deduplication', () => {
  it('links a second record with an equivalent title and dates to the same event', async () => {
    await run(baseItems());
    const items = [
      ...baseItems(),
      {
        id: 'traviata-bis',
        title: 'La traviata (Temporada 2026)',
        url: 'https://sample.culturaba.test/eventos/traviata-bis',
        discipline: 'opera_clasica',
        venue: SALA,
        dates: [{ start: at(4, 20) }, { start: at(7, 20) }],
      },
    ];
    const s = await run(items);
    expect(s.stats.events_created).toBe(0);
    const a = await q.event('traviata');
    const b = await q.event('traviata-bis');
    expect(b.id).toBe(a.id);
    expect(await q.occurrences(a.id)).toHaveLength(2);
    const records = await sql<
      { n: number }[]
    >`select count(*)::int as n from public.source_records where event_id = ${a.id}`;
    expect(records[0]?.n).toBe(2);
  });

  describe('across sources by declared page (sameAsUrls)', () => {
    const institutionItem = (): Item => ({
      id: 'hoffmann',
      title: "Les Contes d'Hoffmann",
      url: 'https://sample.culturaba.test/produccion/hoffmann/',
      discipline: 'opera_clasica',
      venue: SALA,
      dates: [{ start: at(5, 20) }, { start: at(9, 20) }],
    });
    const aggregatorItem = (over: Partial<Item> = {}): Item => ({
      id: 'agg-hoffmann',
      title: 'Los Cuentos de Hoffmann',
      url: 'https://agenda.sample.test/eventos/los-cuentos-de-hoffmann',
      sameAs: ['http://www.sample.culturaba.test/produccion/hoffmann?utm_source=agenda'],
      discipline: 'opera_clasica',
      venue: SALA,
      dates: [{ start: at(5, 20) }],
      ...over,
    });
    const recordsOf = async (eventId: string) =>
      (
        await sql<{ n: number }[]>`
          select count(*)::int as n from public.source_records where event_id = ${eventId}`
      )[0]?.n;

    it('attaches an aggregator record that links to the institution page', async () => {
      await run([institutionItem()]);
      const s = await runAggregator([aggregatorItem()]);
      expect(s.stats.events_created).toBe(0);
      const inst = await q.event('hoffmann');
      expect((await q.event('agg-hoffmann')).id).toBe(inst.id);
      expect(inst.title).toBe("Les Contes d'Hoffmann");
      expect(await recordsOf(inst.id)).toBe(2);
    });

    it('attaches the institution record when the aggregator arrived first, and its title wins', async () => {
      await runAggregator([aggregatorItem()]);
      const s = await run([institutionItem()]);
      expect(s.stats.events_created).toBe(0);
      const ev = await q.event('agg-hoffmann');
      expect((await q.event('hoffmann')).id).toBe(ev.id);
      expect(ev.title).toBe("Les Contes d'Hoffmann");
    });

    it('falls back to the title when two aggregator events claim the same institution page', async () => {
      // Linda: "Shohei Imamura bis" lleva como entradas la ficha de "Las furias…".
      await runAggregator([
        aggregatorItem({ title: "Les Contes d'Hoffmann" }),
        aggregatorItem({
          id: 'agg-ciclo',
          title: 'Ciclo de cine',
          url: 'https://agenda.sample.test/eventos/ciclo',
          sameAs: undefined,
          tickets: 'https://sample.culturaba.test/produccion/hoffmann/',
        }),
      ]);
      await run([institutionItem()]);
      const inst = await q.event('hoffmann');
      expect((await q.event('agg-hoffmann')).id).toBe(inst.id);
      expect((await q.event('agg-ciclo')).id).not.toBe(inst.id);
    });

    it('does not merge without the declared page (titles alone are too different)', async () => {
      await run([institutionItem()]);
      await runAggregator([aggregatorItem({ sameAs: undefined })]);
      expect((await q.event('agg-hoffmann')).id).not.toBe((await q.event('hoffmann')).id);
    });

    it('does not merge when the dates are incompatible', async () => {
      await run([institutionItem()]);
      await runAggregator([aggregatorItem({ dates: [{ start: at(60, 20) }] })]);
      expect((await q.event('agg-hoffmann')).id).not.toBe((await q.event('hoffmann')).id);
    });

    it('attaches by the City ticket page with an event id shared with an institution performance', async () => {
      const ticket = 'https://entradasba.buenosaires.gob.ar/evento/8df036b4-df44-49bf';
      await run([{ ...institutionItem(), tickets: ticket }]);
      await runAggregator([
        aggregatorItem({ sameAs: undefined, tickets: `${ticket}?utm_source=agenda` }),
      ]);
      expect((await q.event('agg-hoffmann')).id).toBe((await q.event('hoffmann')).id);
    });

    it('does not merge on a generic ticketing page shared by different shows', async () => {
      const venuePage = 'https://www.passline.com/sitio/sala-sample';
      await run([{ ...institutionItem(), tickets: venuePage }]);
      await runAggregator([aggregatorItem({ sameAs: undefined, tickets: venuePage })]);
      expect((await q.event('agg-hoffmann')).id).not.toBe((await q.event('hoffmann')).id);
    });

    it('is stable on a second run: the institution does not erase what the aggregator filled in', async () => {
      // La institución no publica gratuidad; el agregador sí (pago). Antes se pisaban en cada corrida.
      await run([institutionItem()]);
      await runAggregator([aggregatorItem({ free: false })]);
      const before = await q.event('hoffmann');
      const again = await run([institutionItem()]);
      const agg = await runAggregator([aggregatorItem({ free: false })]);
      expect(again.stats.changes_minor + again.stats.changes_major).toBe(0);
      expect(agg.stats.changes_minor + agg.stats.changes_major).toBe(0);
      const isFree = await sql<{ is_free: boolean | null }[]>`
        select is_free from public.events where id = ${before.id}`;
      expect(isFree[0]?.is_free).toBe(false);
    });

    it('two records of one source merged into one event do not overwrite each other every run', async () => {
      const a = aggregatorItem({
        id: 'dup-a',
        url: 'https://agenda.sample.test/eventos/a',
        sameAs: undefined,
        description: 'Texto A',
      });
      const b = aggregatorItem({
        id: 'dup-b',
        url: 'https://agenda.sample.test/eventos/b',
        sameAs: undefined,
        description: 'Texto B',
      });
      await runAggregator([a, b]);
      expect((await q.event('dup-a')).id).toBe((await q.event('dup-b')).id);
      const second = await runAggregator([a, b]);
      expect(second.stats.changes_minor + second.stats.changes_major).toBe(0);
      const desc = await sql<{ description: string }[]>`
        select description from public.events where id = ${(await q.event('dup-a')).id}`;
      expect(desc[0]?.description).toBe('Texto A');
    });

    it('does not merge two records of the same source that link to the same page', async () => {
      await runAggregator([
        aggregatorItem({
          id: 'film-a',
          title: 'Ciclo: primera película',
          url: 'https://agenda.sample.test/eventos/a',
        }),
        aggregatorItem({
          id: 'film-b',
          title: 'Ciclo: segunda película',
          url: 'https://agenda.sample.test/eventos/b',
        }),
      ]);
      expect((await q.event('film-a')).id).not.toBe((await q.event('film-b')).id);
    });
  });

  describe('across sources by title words', () => {
    const show = (over: Partial<Item> = {}): Item => ({
      id: 'charly',
      title: 'Mery Granados y Joaco Burgos: una noche para Charly',
      url: 'https://sample.culturaba.test/actividad/charly/',
      discipline: 'musica_vivo_jazz',
      venue: SALA,
      dates: [{ start: at(6, 20) }],
      ...over,
    });
    const linda = (over: Partial<Item> = {}): Item =>
      show({
        id: 'agg-charly',
        title: 'Mery Granados y Joaco Burgos le cantan a Charly',
        url: 'https://agenda.sample.test/eventos/charly',
        ...over,
      });

    it('attaches the aggregator record when the shorter title is almost all in the other', async () => {
      await run([show()]);
      const s = await runAggregator([linda()]);
      expect(s.stats.events_created).toBe(0);
      const ev = await q.event('charly');
      expect((await q.event('agg-charly')).id).toBe(ev.id);
      expect(ev.title).toBe('Mery Granados y Joaco Burgos: una noche para Charly');
    });

    it('does not merge two items of the same source, nor on other dates', async () => {
      await run([
        show(),
        show({ id: 'charly-2', title: 'Mery Granados y Joaco Burgos cantan a Charly' }),
      ]);
      expect((await q.event('charly-2')).id).not.toBe((await q.event('charly')).id);
      await runAggregator([linda({ dates: [{ start: at(40, 20) }] })]);
      expect((await q.event('agg-charly')).id).not.toBe((await q.event('charly')).id);
    });
  });

  it('does not merge a same-titled event on different dates (new season)', async () => {
    await run(baseItems());
    const items = [
      ...baseItems(),
      {
        id: 'traviata-2027',
        title: 'La Traviata',
        url: 'https://sample.culturaba.test/eventos/traviata-2027',
        discipline: 'opera_clasica',
        venue: SALA,
        dates: [{ start: at(200, 20) }],
      },
    ];
    const s = await run(items);
    expect(s.stats.events_created).toBe(1);
    expect((await q.event('traviata-2027')).id).not.toBe((await q.event('traviata')).id);
  });

  it('flags near-duplicates for review instead of merging', async () => {
    await run(baseItems());
    const items = [
      ...baseItems(),
      {
        id: 'traviata-ii',
        title: 'La Traviata II',
        url: 'https://sample.culturaba.test/eventos/traviata-ii',
        discipline: 'opera_clasica',
        venue: SALA,
        dates: [{ start: at(4, 20) }],
      },
    ];
    const s = await run(items);
    expect(s.stats.events_created).toBe(1);
    expect(s.stats.duplicates_flagged).toBe(1);
    const dup = await sql<
      { score: string; status: string }[]
    >`select score::text, status from public.event_duplicates`;
    expect(dup).toHaveLength(1);
    expect(Number(one(dup).score)).toBeGreaterThanOrEqual(0.7);
    expect(Number(one(dup).score)).toBeLessThan(0.85);
  });

  it('leaves an event as candidate when the venue cannot be resolved without inventing an address', async () => {
    const items = [
      {
        id: 'sin-venue',
        title: 'Charla itinerante',
        url: 'https://sample.culturaba.test/eventos/sin-venue',
        discipline: 'literatura_charlas',
        venue: { name: 'Lugar desconocido' },
        dates: [{ start: at(5, 19) }],
      },
    ];
    await run(items);
    expect(await q.event('sin-venue')).toMatchObject({
      status: 'candidate',
      candidate_reasons: ['missing:venue'],
    });
    expect((await q.occurrences((await q.event('sin-venue')).id))[0]?.venue_id).toBeNull();
    const notCreated = await sql<
      { n: number }[]
    >`select count(*)::int as n from public.venues where name = 'Lugar desconocido'`;
    expect(one(notCreated).n).toBe(0);
  });
});

describe('venue coordinates', () => {
  it('stores published coordinates on new venues and fills, never overwrites, existing ones', async () => {
    await sql`update public.venues set lat = null, lng = null where slug = 'sample-sala'`;
    const item = (id: string, venue: Item) => ({
      id,
      title: `Concierto ${id}`,
      url: `https://sample.culturaba.test/eventos/${id}`,
      discipline: 'musica_vivo_jazz',
      venue,
      dates: [{ start: at(5, 20) }],
    });
    await run([
      item('a', { slug: 'sample-sala', coords: { lat: -34.6, lng: -58.38 } }),
      item('b', { name: 'Club Nuevo', address: 'Calle 2', coords: { lat: -34.59, lng: -58.44 } }),
    ]);
    await run([
      item('a', { slug: 'sample-sala', coords: { lat: -34.7, lng: -58.5 } }),
      item('b', { name: 'Club Nuevo', address: 'Calle 2', coords: { lat: -34.7, lng: -58.5 } }),
    ]);
    const rows = await sql<{ name: string; lat: number; lng: number }[]>`
      select name, lat, lng from public.venues where name in ('Sala Sample', 'Club Nuevo') order by name`;
    expect(rows).toEqual([
      { name: 'Club Nuevo', lat: -34.59, lng: -58.44 },
      { name: 'Sala Sample', lat: -34.6, lng: -58.38 },
    ]);
  });
});

describe('robustness', () => {
  it('refuses to run when the source is disabled unless forced', async () => {
    await sql`update public.sources set enabled = false where slug = 'sample'`;
    try {
      await expect(run(baseItems())).rejects.toThrow(/deshabilitada/);
      const dir = writeSet(baseItems());
      const s = await runSource(
        sampleConnector,
        { sql, http: new FixtureHttpClient(dir), logger: silentLogger },
        { trigger: 'fixture', force: true },
      );
      expect(s.status).toBe('succeeded');
    } finally {
      await sql`update public.sources set enabled = true where slug = 'sample'`;
    }
  });

  it('records a failed run when discovery breaks and marks nothing missing', async () => {
    await run(baseItems());
    const dir = writeSet([]);
    writeFileSync(join(dir, 'listing.json'), 'not json');
    const s = await runSource(
      sampleConnector,
      { sql, http: new FixtureHttpClient(dir), logger: silentLogger },
      { trigger: 'fixture' },
    );
    expect(s.status).toBe('failed');
    expect(s.errorMessage).toMatch(/discover/);
    const misses = await sql<
      { max: number }[]
    >`select max(consecutive_misses)::int as max from public.source_records`;
    expect(one(misses).max).toBe(0);
    const runs = await sql<
      { status: string }[]
    >`select status::text from public.ingestion_runs order by started_at desc limit 1`;
    expect(one(runs).status).toBe('failed');
  });

  it('isolates a broken item: the rest of the run still succeeds', async () => {
    const items = baseItems();
    items.push({
      id: 'roto',
      title: 'Roto',
      url: 'not-a-url',
      venue: SALA,
      dates: [{ start: 'ayer' }],
    });
    const s = await run(items);
    expect(s.status).toBe('succeeded');
    expect(s.stats.parsed_invalid).toBe(1);
    expect(s.stats.events_created).toBe(5);
    const rec = await sql<{ parse_status: string; event_id: string | null }[]>`
      select parse_status::text, event_id from public.source_records where external_id = 'roto'`;
    expect(one(rec)).toMatchObject({ parse_status: 'invalid', event_id: null });
  });
});
