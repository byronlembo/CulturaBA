import { DateTime } from 'luxon';
import { sampleConnector } from '../connectors/sample/connector';
import { silentLogger } from '../logger';
import { FixtureMissingError } from './client';
import { FixtureHttpClient } from './fixtureClient';
import { fixtureSetDir, listFixtureSets, resolveFixtureSet } from './fixtures';

const base = fixtureSetDir('sample', '2026-10-14-base');

describe('FixtureHttpClient', () => {
  it('serves recorded responses and normalises trailing slashes', async () => {
    const c = new FixtureHttpClient(base);
    const res = await c.get('https://sample.culturaba.test/listing.json');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).items).toHaveLength(5);
    expect(c.stats.requests).toBe(1);
  });

  it('fails loudly for unknown urls', async () => {
    const c = new FixtureHttpClient(base);
    await expect(c.get('https://sample.culturaba.test/other.json')).rejects.toBeInstanceOf(
      FixtureMissingError,
    );
  });

  it('lists and resolves sets', () => {
    expect(listFixtureSets('sample')).toContain('2026-10-14-base');
    expect(resolveFixtureSet('sample', 'latest')).toMatch(/fixtures\/sample\//);
    expect(() => resolveFixtureSet('sample', 'nope')).toThrow(/No existe/);
    expect(listFixtureSets('unknown-source')).toEqual([]);
  });
});

describe('sample connector parse (static fixture)', () => {
  const ctx = {
    http: new FixtureHttpClient(base),
    logger: silentLogger,
    now: () => DateTime.fromISO('2026-10-14T12:00:00', { zone: 'America/Argentina/Buenos_Aires' }),
  };

  it('discovers every item and parses them into normalized events', async () => {
    const raws = await sampleConnector.discover(ctx);
    expect(raws.map((r) => r.externalId)).toEqual([
      'traviata',
      'goya',
      'taller',
      'misterio',
      'pasado',
    ]);

    const traviata = sampleConnector.parse(raws[0] as never, ctx);
    expect(traviata.ok).toBe(true);
    if (!traviata.ok) return;
    expect(traviata.event.occurrences).toHaveLength(2);
    expect(traviata.event.occurrences[0]).toMatchObject({
      kind: 'timed',
      startsAt: '2026-10-18T20:00:00-03:00',
      startDate: '2026-10-18',
      venue: { slug: 'sample-sala', room: 'Sala Principal' },
      price: { text: 'Desde $10.000', verified: true },
    });

    const goya = sampleConnector.parse(raws[1] as never, ctx);
    expect(goya.ok && goya.event.occurrences[0]).toMatchObject({
      kind: 'range',
      startsAt: '2026-10-16T00:00:00-03:00',
      endsAt: '2026-12-13T23:59:59-03:00',
      scheduleText: 'Martes a domingos de 11 a 20 h',
    });
  });
});
