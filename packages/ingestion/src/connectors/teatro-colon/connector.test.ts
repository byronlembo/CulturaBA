import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assessPublishability, BA_TZ, type NormalizedEvent } from '@culturaba/shared';
import { DateTime } from 'luxon';
import type { ParseResult, RawRecord } from '../../core/connector';
import { type HttpClient, HttpError } from '../../http/client';
import { FixtureHttpClient } from '../../http/fixtureClient';
import { fixtureSetDir } from '../../http/fixtures';
import { silentLogger } from '../../logger';
import { teatroColonConnector } from './connector';
import {
  monthNumberEs,
  parseDayNumber,
  parseDetailDayText,
  parseListingHour,
  resolveYear,
} from './dates';
import { disciplinesFor } from './disciplines';
import {
  buildEvent,
  cleanTicketsUrl,
  parseCalendarPage,
  parseDetailPage,
  productionSlugFromUrl,
} from './parse';
import { CETC_VENUE, COLON_FABRICA_VENUE, TEATRO_COLON_VENUE, venueForPlace } from './venues';

const FIXTURE_DIR = fixtureSetDir('teatro-colon', '2026-10-14');
const NOW = DateTime.fromISO('2026-10-14T12:00:00', { zone: BA_TZ });
const KNOWN_VENUES = new Set(['teatro-colon', 'mnba', 'palacio-libertad']);

function makeCtx() {
  return { http: new FixtureHttpClient(FIXTURE_DIR), logger: silentLogger, now: () => NOW };
}

interface Loaded {
  raw: RawRecord;
  result: ParseResult;
}

/** Descubre, enriquece y parsea TODO el set de fixtures una sola vez. */
async function loadAll(): Promise<{ ctx: ReturnType<typeof makeCtx>; items: Map<string, Loaded> }> {
  const ctx = makeCtx();
  const raws = await teatroColonConnector.discover(ctx);
  const items = new Map<string, Loaded>();
  for (const raw0 of raws) {
    const raw = await teatroColonConnector.enrich?.(raw0, ctx);
    if (!raw) throw new Error('enrich no definido');
    items.set(raw.externalId, { raw, result: teatroColonConnector.parse(raw, ctx) });
  }
  return { ctx, items };
}

function eventOf(items: Map<string, Loaded>, slug: string): NormalizedEvent {
  const item = items.get(slug);
  if (!item) throw new Error(`no se descubrió ${slug}`);
  if (!item.result.ok) throw new Error(`${slug} inválido: ${item.result.errors.join('; ')}`);
  return item.result.event;
}

function warningsOf(items: Map<string, Loaded>, slug: string): string[] {
  const item = items.get(slug);
  return item?.result.ok ? item.result.warnings : [];
}

function publishability(event: NormalizedEvent) {
  return assessPublishability(event, { now: NOW.toMillis(), knownVenueSlugs: KNOWN_VENUES });
}

/** Snapshot legible: el rawFragment (HTML) se reemplaza por su longitud. */
function snapshotJson(event: NormalizedEvent): string {
  const { rawFragment, ...rest } = event;
  return `${JSON.stringify({ ...rest, rawFragment: `<${rawFragment?.length ?? 0} chars>` }, null, 2)}\n`;
}

// ── Fixtures reales ────────────────────────────────────────────────────────

describe('teatro-colon · fixtures 2026-10-14', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let items: Map<string, Loaded>;

  beforeAll(async () => {
    ({ ctx, items } = await loadAll());
  });

  it('discover: 3 páginas mensuales → 71 funciones agrupadas en 30 producciones', async () => {
    const fresh = makeCtx();
    const raws = await teatroColonConnector.discover(fresh);
    expect(fresh.http.stats.requests).toBe(3);
    expect(raws).toHaveLength(30);
    const rows = raws.reduce((n, r) => n + (r.listing as { rows: unknown[] }).rows.length, 0);
    expect(rows).toBe(71);
    for (const r of raws) {
      expect(r.url).toBe(`https://teatrocolon.org.ar/produccion/${r.externalId}/`);
      expect(r.contentType).toBe('html');
      expect(r.body).toBe('');
    }
    expect(raws.map((r) => r.externalId)).toEqual(
      expect.arrayContaining([
        'les-contes-dhoffmann',
        'las-ruinas',
        'la-intimidad-de-la-voz',
        'die-walkure',
        'el-cascanueces-2',
        'un-sueno-navideno',
      ]),
    );
  });

  describe('discover es todo o nada (no entrega descubrimientos parciales)', () => {
    /** Cliente de fixtures con una regla de reemplazo por URL. */
    function patchedCtx(patch: (url: string, real: HttpClient) => Promise<string> | null) {
      const real = new FixtureHttpClient(FIXTURE_DIR);
      const http: HttpClient = {
        stats: real.stats,
        get: async (url, options) => {
          const body = patch(url, real);
          if (body === null) return real.get(url, options);
          return { status: 200, url, body: await body, headers: {} };
        },
      };
      return { http, logger: silentLogger, now: () => NOW };
    }
    const fixture = (name: string) => readFileSync(join(FIXTURE_DIR, name), 'utf8');

    it('lanza si falla un mes futuro (antes: 16 de 30 producciones y un warn)', async () => {
      const ctx503 = patchedCtx((url) =>
        url.includes('mes=') ? Promise.reject(new HttpError(url, 503)) : null,
      );
      await expect(teatroColonConnector.discover(ctx503)).rejects.toThrow(
        /calendario 2026-11 no disponible .*HTTP 503/,
      );
    });

    it('lanza si falla el mes corriente', async () => {
      const ctx = patchedCtx((url) =>
        url.endsWith('/calendario/') ? Promise.reject(new HttpError(url, 500)) : null,
      );
      await expect(teatroColonConnector.discover(ctx)).rejects.toThrow(/calendario 2026-10/);
    });

    it('lanza si una página trae otro mes (p. ej. HTML cacheado)', async () => {
      // /calendario/ responde el HTML de noviembre: data-currentmonth=11 ≠ 10.
      const stale = patchedCtx((url) =>
        url.endsWith('/calendario/')
          ? Promise.resolve(fixture('007-calendario-2026-11.html'))
          : null,
      );
      await expect(teatroColonConnector.discover(stale)).rejects.toThrow(
        /devolvió 2026-11 en lugar de 2026-10/,
      );
      const wrongFuture = patchedCtx((url) =>
        url.includes('mes=12') ? Promise.resolve(fixture('007-calendario-2026-11.html')) : null,
      );
      await expect(teatroColonConnector.discover(wrongFuture)).rejects.toThrow(
        /devolvió 2026-11 en lugar de 2026-12/,
      );
    });

    it('lanza si la respuesta no es una página de calendario (challenge, error 200)', async () => {
      const ctx = patchedCtx((url) =>
        url.includes('mes=11')
          ? Promise.resolve('<html><body><h1>Just a moment...</h1></body></html>')
          : null,
      );
      await expect(teatroColonConnector.discover(ctx)).rejects.toThrow(
        /no es una página de calendario/,
      );
    });
  });

  it('discover respeta ctx.limit sin pedir meses de más', async () => {
    const fresh = makeCtx();
    const raws = await teatroColonConnector.discover({ ...fresh, limit: 5 });
    expect(fresh.http.stats.requests).toBe(1);
    expect(raws.length).toBeGreaterThanOrEqual(5);
  });

  it('parse de TODOS los ítems: 30 ok · 0 incomplete · 0 invalid', () => {
    expect(ctx.http.stats.requests).toBe(33); // 3 listados + 30 detalles
    const counts = { ok: 0, incomplete: 0, invalid: 0 };
    const incomplete: Record<string, string[]> = {};
    for (const [slug, { result }] of items) {
      if (!result.ok) {
        counts.invalid += 1;
        continue;
      }
      const pub = publishability(result.event);
      if (pub.publishable) counts.ok += 1;
      else {
        counts.incomplete += 1;
        incomplete[slug] = pub.reasons;
      }
    }
    expect(counts).toEqual({ ok: 30, incomplete: 0, invalid: 0 });
    expect(incomplete).toEqual({});
  });

  it('ningún estado distinto de scheduled en los fixtures (no hay marcas de estado ese día)', () => {
    for (const [, { result }] of items) {
      if (!result.ok) continue;
      for (const o of result.event.occurrences) expect(o.status).toBe('scheduled');
    }
  });

  it('reglas de datos: nunca precios inventados, instantes -03:00, venues resolubles o nulos', () => {
    for (const [, { result }] of items) {
      if (!result.ok) continue;
      const e = result.event;
      expect(e.attribution).toBe('Texto: Teatro Colón');
      expect(e.officialUrl).toBe(e.url);
      if (e.priceText) expect(e.priceVerified).toBe(true);
      if (e.imageUrl) expect(e.imageUrl).toMatch(/^https:\/\/teatrocolon\.org\.ar\//);
      for (const o of e.occurrences) {
        expect(o.kind).toBe('timed');
        expect(o.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-03:00$/);
        expect(o.startDate).toBe(o.startsAt.slice(0, 10));
        expect(o.endDate).toBe(o.startDate);
        expect(o.externalId).toBe(`${e.externalId}|${o.startDate}|${o.startsAt.slice(11, 16)}`);
        // Nada anterior a hoy: las funciones pasadas (div.day.inactive) se omiten.
        expect(o.startDate >= '2026-10-14').toBe(true);
        if (o.price) {
          expect(o.price.isFree).toBe(true);
          expect(o.price.verified).toBe(true);
        }
        if (o.venue?.address) expect(o.venue.addressSourceUrl).toMatch(/^https:\/\/teatrocolon/);
      }
    }
  });

  // Valores cotejados a mano contra 015-produccion-les-contes-dhoffmann.html
  it('Les Contes d’Hoffmann: 3 funciones vigentes de 7, Sala principal, ópera', () => {
    const e = eventOf(items, 'les-contes-dhoffmann');
    expect(e.title).toBe('Les Contes d’Hoffmann');
    expect(e.subtitle).toBeUndefined();
    expect(e.disciplines).toEqual(['opera_clasica']);
    expect(e.tags).toEqual(['Ópera']);
    expect(e.priceVerified).toBe(false);
    expect(e.isFree).toBeUndefined();
    expect(e.priceText).toBeUndefined();
    expect(e.imageUrl).toBe(
      'https://teatrocolon.org.ar/wp-content/uploads/2025/12/Opera_Hoffmann_redes-web.png',
    );
    expect(e.ticketsUrl).toBe(
      'https://entradasba.buenosaires.gob.ar/evento/8df036b4-df44-49bf-aafb-2402f5ea675e',
    );
    expect(e.description?.startsWith('La célebre ópera de Jacques Offenbach')).toBe(true);
    expect(e.description).toContain('Ópera en tres actos con prólogo y epílogo.');
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-14T20:00:00-03:00',
      '2026-10-15T20:00:00-03:00',
      '2026-10-16T20:00:00-03:00',
    ]);
    expect(e.occurrences[0]).toMatchObject({
      externalId: 'les-contes-dhoffmann|2026-10-14|20:00',
      kind: 'timed',
      startDate: '2026-10-14',
      endDate: '2026-10-14',
      endsAt: null,
      timezone: BA_TZ,
      sourceDateText: 'miércoles 14/10, 20:00 hs (octubre)',
      venue: { slug: 'teatro-colon', name: 'Teatro Colón', room: 'Sala principal' },
      status: 'scheduled',
      ticketsUrl:
        'https://entradasba.buenosaires.gob.ar/evento/8df036b4-df44-49bf-aafb-2402f5ea675e',
      price: null,
    });
    expect(e.occurrences[2]?.ticketsUrl).toBe(
      'https://entradasba.buenosaires.gob.ar/evento/3e3e97d8-3443-4fb8-bdfe-d975d2963c0f',
    );
    expect(warningsOf(items, 'les-contes-dhoffmann')).toContain(
      '4 funciones pasadas (div.day.inactive) omitidas',
    );
    expect(publishability(e)).toEqual({ publishable: true, reasons: [] });
  });

  // Cotejado contra 016-produccion-las-ruinas.html y 029-cetc.html
  it('Las ruinas: 9 funciones que cruzan oct→nov, CETC con dirección publicada', () => {
    const e = eventOf(items, 'las-ruinas');
    expect(e.title).toBe('Las ruinas');
    expect(e.disciplines).toEqual(['teatro_escenicas', 'opera_clasica']);
    expect(e.durationMinutes).toBe(70);
    expect(e.occurrences).toHaveLength(9);
    expect(e.occurrences[0]?.startsAt).toBe('2026-10-22T20:30:00-03:00');
    expect(e.occurrences[3]?.startsAt).toBe('2026-10-25T18:00:00-03:00');
    expect(e.occurrences[8]).toMatchObject({
      externalId: 'las-ruinas|2026-11-01|18:00',
      startsAt: '2026-11-01T18:00:00-03:00',
      startDate: '2026-11-01',
      sourceDateText: 'domingo 01/11, 18:00 hs (noviembre)',
      status: 'scheduled',
      price: null,
    });
    for (const o of e.occurrences) {
      expect(o.venue).toEqual({
        name: 'Centro de Experimentación del Teatro Colón (CETC)',
        address: 'Viamonte 1168',
        addressSourceUrl: 'https://teatrocolon.org.ar/centro-de-experimentacion-del-teatro-colon/',
      });
      expect(o.ticketsUrl).toBe(
        'https://entradasba.buenosaires.gob.ar/evento/38b60696-e27a-425b-9752-ecc76ce5a6e0',
      );
    }
    expect(publishability(e)).toEqual({ publishable: true, reasons: [] });
  });

  // Cotejado contra 022-produccion-la-intimidad-de-la-voz.html (botón "Gratuita")
  it('La intimidad de la voz: función gratuita en el Salón Dorado', () => {
    const e = eventOf(items, 'la-intimidad-de-la-voz');
    expect(e.title).toBe('La intimidad de la voz');
    expect(e.disciplines).toEqual(['opera_clasica']);
    expect(e.tags).toEqual(['Clásica Joven']);
    expect(e.isFree).toBe(true);
    expect(e.priceText).toBe('Gratuita');
    expect(e.priceVerified).toBe(true);
    expect(e.occurrences).toHaveLength(1);
    expect(e.occurrences[0]).toMatchObject({
      externalId: 'la-intimidad-de-la-voz|2026-10-15|13:00',
      startsAt: '2026-10-15T13:00:00-03:00',
      startDate: '2026-10-15',
      venue: { slug: 'teatro-colon', name: 'Teatro Colón', room: 'Salón Dorado' },
      status: 'scheduled',
      ticketsUrl:
        'https://entradasba.buenosaires.gob.ar/evento/d0f693c8-0873-4b14-86f0-9a121c334424',
      price: { text: 'Gratuita', isFree: true, verified: true },
    });
  });

  // Cotejado contra 023 (coming_soon, título con <br>) y 027 (nov→dic)
  it('Monteverdi Choir: "Próximamente" ⇒ scheduled sin ticketsUrl; título y subtítulo', () => {
    const e = eventOf(items, 'monteverdi-choir-english-baroque-soloists');
    expect(e.title).toBe('Monteverdi Choir');
    expect(e.subtitle).toBe('English Baroque Soloists');
    expect(e.disciplines).toEqual(['opera_clasica']); // Mozarteum
    expect(e.ticketsUrl).toBeUndefined();
    expect(e.occurrences).toHaveLength(1);
    expect(e.occurrences[0]).toMatchObject({
      startsAt: '2026-11-02T20:00:00-03:00',
      status: 'scheduled',
      ticketsUrl: null,
      venue: { slug: 'teatro-colon', room: 'Sala principal' },
    });
  });

  it('Die Walküre: 6 funciones que cruzan noviembre→diciembre con el año del listado', () => {
    const e = eventOf(items, 'die-walkure');
    expect(e.disciplines).toEqual(['opera_clasica']);
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-11-29T17:00:00-03:00',
      '2026-12-01T20:00:00-03:00',
      '2026-12-02T20:00:00-03:00',
      '2026-12-03T20:00:00-03:00',
      '2026-12-05T20:00:00-03:00',
      '2026-12-06T17:00:00-03:00',
    ]);
  });

  // Cotejado contra 041 (2 pasadas, 1 a la venta, 3 "Próximamente")
  it('Concierto entre almohadones: infantil, subtítulo tras <br>, funciones futuras sin link', () => {
    const e = eventOf(
      items,
      'concierto-entre-almohadones-cartas-que-cantan-aventuras-liricas-en-el-altillo',
    );
    expect(e.title).toBe('Concierto entre almohadones');
    expect(e.subtitle).toBe('Cartas que cantan, aventuras líricas en el altillo');
    expect(e.disciplines).toEqual(['opera_clasica']);
    expect(e.tags).toEqual(['Colón para niños', 'infantil']);
    expect(e.durationMinutes).toBe(55);
    expect(e.ageRating).toBe('a partir de los 5 años');
    expect(e.occurrences.map((o) => [o.startsAt, o.ticketsUrl])).toEqual([
      [
        '2026-10-25T11:00:00-03:00',
        'https://entradasba.buenosaires.gob.ar/evento/528674bb-90c7-4902-b77f-b0e8c4ae2ecb',
      ],
      ['2026-11-15T11:00:00-03:00', null],
      ['2026-11-29T11:00:00-03:00', null],
      ['2026-12-13T11:00:00-03:00', null],
    ]);
  });

  // Cotejado contra 020/039 (solo "Temporada 2026": disciplina por señales de la fuente)
  // y 018 (sala vacía, gclid)
  it('visitas con solo temporada: disciplina por señales; sala vacía ⇒ sede sin room', () => {
    const visita = eventOf(items, 'historias-secretas-del-teatro-colon');
    // entradasba /visitas/115 + "experiencia teatral itinerante" (meta description)
    expect(visita.disciplines).toEqual(['historia_patrimonio', 'teatro_escenicas']);
    expect(visita.tags).toEqual(['Temporada 2026']);
    expect(visita.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-18T17:00:00-03:00',
      '2026-10-18T18:00:00-03:00',
      '2026-10-31T17:00:00-03:00',
      '2026-10-31T18:00:00-03:00',
    ]);
    expect(visita.occurrences[0]?.venue).toEqual({
      slug: 'teatro-colon',
      name: 'Teatro Colón',
      room: 'Plaza Vaticano y Teatro Colón',
    });
    expect(visita.ticketsUrl).toBe('https://entradasba.buenosaires.gob.ar/visitas/115');
    expect(publishability(visita)).toEqual({ publishable: true, reasons: [] });
    expect(warningsOf(items, 'historias-secretas-del-teatro-colon')).toContain(
      'sin categoría informativa (solo temporada o ninguna): disciplina por señales de la fuente (historia_patrimonio, teatro_escenicas)',
    );

    // "visita guiada privada … historia y valor patrimonial … música clásica en vivo"
    const atardecer = eventOf(items, 'atardecer-en-el-teatro-colon');
    expect(atardecer.disciplines).toEqual(['historia_patrimonio', 'opera_clasica']);
    expect(atardecer.ticketsUrl).toBe('https://entradasba.buenosaires.gob.ar/visitas/120');
    expect(atardecer.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-18T20:00:00-03:00',
      '2026-10-25T20:00:00-03:00',
    ]);
    expect(publishability(atardecer)).toEqual({ publishable: true, reasons: [] });

    const berliner = eventOf(items, 'berliner-philharmoniker');
    expect(berliner.occurrences).toHaveLength(3);
    expect(berliner.occurrences[0]?.venue).toEqual({ slug: 'teatro-colon', name: 'Teatro Colón' });
    expect(berliner.ticketsUrl).toBe('https://www.tuentrada.com/filarmonica-de-berlin-tc');
    expect(warningsOf(items, 'berliner-philharmoniker')).toContain(
      'sala no publicada: sede Teatro Colón según el microdato location de la página',
    );
  });

  // Extensión .json.txt a propósito: Biome reformatea .json y rompería el snapshot.
  it('snapshot del normalizado de dos eventos', async () => {
    await expect(snapshotJson(eventOf(items, 'les-contes-dhoffmann'))).toMatchFileSnapshot(
      '__snapshots__/les-contes-dhoffmann.normalized.json.txt',
    );
    await expect(snapshotJson(eventOf(items, 'la-intimidad-de-la-voz'))).toMatchFileSnapshot(
      '__snapshots__/la-intimidad-de-la-voz.normalized.json.txt',
    );
  });
});

// ── Listado mensual (puro) ─────────────────────────────────────────────────

describe('parseCalendarPage', () => {
  it('lee año/mes de la tabla y una fila por función', () => {
    const html = readFileSync(join(FIXTURE_DIR, '006-calendario-2026-10.html'), 'utf8');
    const page = parseCalendarPage(html, { year: 2000, month: 1 });
    expect(page.year).toBe(2026);
    expect(page.month).toBe(10);
    expect(page.warnings).toEqual([]);
    expect(page.rows).toHaveLength(32);
    expect(page.rows[0]).toMatchObject({
      slug: 'festival-chopiniana-goran-filipec',
      detailUrl: 'https://teatrocolon.org.ar/produccion/festival-chopiniana-goran-filipec/',
      title: 'Festival Chopiniana – Goran Filipec',
      category: 'Salón Dorado',
      day: 14,
      time: { hour: 17, minute: 30 },
      dateText: '14. mié_17.30 hs',
      ticketsUrl:
        'https://entradasba.buenosaires.gob.ar/evento/042998ac-e58a-4dbb-8a78-f881f30fed83',
    });
    const almohadones = page.rows.find((r) => r.slug.startsWith('concierto-entre-almohadones'));
    expect(almohadones?.title).toBe(
      'Concierto entre almohadones · Cartas que cantan, aventuras líricas en el altillo',
    );
    expect(almohadones?.category).toBe('Colón para niños');
    const berliner = page.rows.find((r) => r.slug === 'berliner-philharmoniker');
    expect(berliner?.dataText).toBe('Funciones del 21, 22 y 23 de octubre de 2026');
  });
});

// ── Casos de borde con HTML sintético (puro) ───────────────────────────────

interface DayOpts {
  text: string;
  classes?: string;
  href?: string | null;
  button?: string;
  featured?: string;
}

function dayHtml({
  text,
  classes = '',
  href = 'https://tix.example/x',
  button = 'Comprar',
  featured = '',
}: DayOpts) {
  const inner = `<span class="hide-mobile"><div class="day-container"><p class="day-number">00</p><p class="day-hour"></p><p class="performance-type"></p><p class="featured-detail">${featured}</p><button class="button c-red">${button}</button></div></span>
    <span class="hide-desktop"><p>${text}</p><p class="performance-type"></p><p class="featured-detail">${featured}</p><button class="button c-red">${button}</button></span>`;
  return `<div class="day ${classes}" data-abono="">${href ? `<a itemprop="url" href="${href}">${inner}</a>` : inner}</div>`;
}

function detailHtml(opts: {
  title?: string;
  place?: string;
  category?: string;
  /** Texto de `.production-info-switch .data p`. */
  data?: string;
  months?: { name: string; days: string[] }[];
  withDates?: boolean;
}) {
  const months = (opts.months ?? [])
    .map(
      (m) =>
        `<div class="head"><h4>${m.name}</h4></div><div class="month-days">${m.days.join('')}</div>`,
    )
    .join('');
  const dates =
    opts.withDates === false
      ? ''
      : `<section class="dates" id="calendar"><div class="months">${months}</div></section>`;
  return `<html><head><meta name="description" content="Resumen."/></head><body><main>
    <section class="hero-module"><div class="content"><div class="category">${opts.category ?? 'Ópera'}</div>
    <h1 itemprop="name">${opts.title ?? 'Obra <i>X</i>'}</h1></div></section>
    <div itemprop="location"><meta itemprop="name" content="Teatro Colón"/></div>
    <section class="production-details"><div class="production-info-switch"><div class="data hide-mobile"><h2>Obra</h2><p>${opts.data ?? ''}</p></div></div></section>
    ${dates}
    <section class="sinopsis" id="sinopsis"><h4 id="the_place">${opts.place ?? 'Sala principal'}</h4><p>Texto.</p></section>
  </main></body></html>`;
}

function rawOf(body: string, rows: unknown[] = []): RawRecord {
  return {
    externalId: 'obra-x',
    url: 'https://teatrocolon.org.ar/produccion/obra-x/',
    fetchedAt: '2026-10-14T12:00:00-03:00',
    contentType: 'html',
    body,
    listing: { slug: 'obra-x', rows },
  };
}

const parseCtx = { now: () => NOW, logger: silentLogger };

function listingRowOf(o: {
  month: number;
  day: number;
  time: { hour: number; minute: number };
  dataText?: string;
}) {
  return {
    slug: 'obra-x',
    detailUrl: 'https://teatrocolon.org.ar/produccion/obra-x/',
    title: 'Obra X',
    category: 'Ópera',
    dataText: o.dataText ?? '',
    ticketsUrl: null,
    imageUrl: null,
    year: 2026,
    month: o.month,
    day: o.day,
    time: o.time,
    dateText: `${o.day}.`,
  };
}

describe('buildEvent · estados y marcadores', () => {
  it('sold_out por clase, cancelada/postergada por texto, pasada omitida, próximamente sin link', () => {
    const html = detailHtml({
      months: [
        {
          name: 'octubre',
          days: [
            dayHtml({
              text: 'martes 13/10, 20:00 hs',
              classes: 'inactive',
              href: null,
              button: '-',
            }),
            dayHtml({ text: 'viernes 16/10, 20:00 hs', classes: 'sold_out' }),
            dayHtml({ text: 'sábado 17/10, 20:00 hs', featured: 'Función cancelada' }),
            dayHtml({ text: 'domingo 18/10, 17:00 hs', featured: 'Postergada' }),
            dayHtml({
              text: 'lunes 19/10, 20:00 hs',
              classes: 'inactive coming_soon',
              href: null,
              button: 'Próximamente',
            }),
          ],
        },
      ],
    });
    const res = buildEvent(rawOf(html), parseCtx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.event.title).toBe('Obra X');
    expect(res.event.occurrences.map((o) => [o.startDate, o.status, o.ticketsUrl])).toEqual([
      ['2026-10-16', 'sold_out', 'https://tix.example/x'],
      ['2026-10-17', 'cancelled', 'https://tix.example/x'],
      ['2026-10-18', 'postponed', 'https://tix.example/x'],
      ['2026-10-19', 'scheduled', null],
    ]);
    expect(res.warnings).toContain('1 funciones pasadas (div.day.inactive) omitidas');
  });

  it('inactive con fecha futura NO se descarta: sold_out o scheduled sin link, con aviso', () => {
    const html = detailHtml({
      months: [
        {
          name: 'octubre',
          days: [
            // Hoy a las 11 (now = 12:00): ya pasó ⇒ se omite.
            dayHtml({ text: 'miércoles 14/10, 11:00 hs', classes: 'inactive', href: null }),
            dayHtml({
              text: 'viernes 16/10, 20:00 hs',
              classes: 'inactive sold_out',
              href: null,
              button: '-',
            }),
            dayHtml({ text: 'viernes 30/10, 20:00 hs', classes: 'inactive', button: '-' }),
          ],
        },
      ],
    });
    const res = buildEvent(rawOf(html), parseCtx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(
      res.event.occurrences.map((o) => [o.startsAt, o.status, o.ticketsUrl, o.statusReason]),
    ).toEqual([
      ['2026-10-16T20:00:00-03:00', 'sold_out', null, 'marcada como agotada en el sitio'],
      ['2026-10-30T20:00:00-03:00', 'scheduled', null, undefined],
    ]);
    expect(res.warnings).toContain('1 funciones pasadas (div.day.inactive) omitidas');
    expect(res.warnings).toContain(
      "funciones futuras marcadas inactive (sin venta online), se publican sin link de entradas: 'viernes 16/10, 20:00 hs', 'viernes 30/10, 20:00 hs'",
    );
  });

  it('inactive con año inferido fuera de orden cronológico se toma como pasada', () => {
    // 20/07 (86 días atrás) ⇒ inferYear lo lleva a 2027, pero la página lo lista ANTES
    // del 18/10/2026: es una función vieja. Sin fila del listado que confirme el año.
    const html = detailHtml({
      months: [
        { name: 'julio', days: [dayHtml({ text: 'lunes 20/07, 20:00 hs', classes: 'inactive' })] },
        { name: 'octubre', days: [dayHtml({ text: 'domingo 18/10, 20:00 hs' })] },
      ],
    });
    const res = buildEvent(rawOf(html), parseCtx);
    expect(res.ok && res.event.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-18T20:00:00-03:00',
    ]);
    expect(res.ok && res.warnings.join(' ')).toMatch(/fuera de orden cronológico.*20\/07/);

    // Con una fila del listado que confirma el año, una inactive futura se publica.
    const row = listingRowOf({ month: 10, day: 30, time: { hour: 20, minute: 0 } });
    const confirmed = buildEvent(
      rawOf(
        detailHtml({
          months: [
            {
              name: 'octubre',
              days: [
                dayHtml({ text: 'viernes 30/10, 20:00 hs', classes: 'inactive' }),
                dayHtml({ text: 'sábado 17/10, 20:00 hs' }),
              ],
            },
          ],
        }),
        [row],
      ),
      parseCtx,
    );
    expect(confirmed.ok && confirmed.event.occurrences.map((o) => o.startDate)).toEqual([
      '2026-10-30',
      '2026-10-17',
    ]);
  });

  it('estado por texto de la producción (título, .data) y del .data del listado por función', () => {
    const days = [
      dayHtml({ text: 'viernes 16/10, 20:00 hs' }),
      dayHtml({ text: 'sábado 17/10, 20:00 hs' }),
    ];
    const months = [{ name: 'octubre', days }];

    const suspendido = buildEvent(
      rawOf(detailHtml({ title: 'Recital X – SUSPENDIDO', months })),
      parseCtx,
    );
    expect(suspendido.ok).toBe(true);
    if (!suspendido.ok) return;
    expect(suspendido.event.occurrences.map((o) => [o.status, o.statusReason])).toEqual([
      ['cancelled', 'Recital X – SUSPENDIDO'],
      ['cancelled', 'Recital X – SUSPENDIDO'],
    ]);
    expect(suspendido.warnings).toContain(
      "estado 'cancelled' de toda la producción por texto de la fuente: 'Recital X – SUSPENDIDO'",
    );

    const postergada = buildEvent(
      rawOf(detailHtml({ data: 'Funciones postergadas hasta nuevo aviso', months })),
      parseCtx,
    );
    expect(postergada.ok && postergada.event.occurrences.map((o) => o.status)).toEqual([
      'postponed',
      'postponed',
    ]);

    // `.data` de UNA fila del listado ⇒ solo esa función (misma fecha y hora).
    const cancelRow = listingRowOf({
      month: 10,
      day: 16,
      time: { hour: 20, minute: 0 },
      dataText: 'FUNCIÓN CANCELADA',
    });
    const okRow = listingRowOf({ month: 10, day: 17, time: { hour: 20, minute: 0 } });
    const porFila = buildEvent(rawOf(detailHtml({ months }), [cancelRow, okRow]), parseCtx);
    expect(
      porFila.ok && porFila.event.occurrences.map((o) => [o.startDate, o.status, o.statusReason]),
    ).toEqual([
      ['2026-10-16', 'cancelled', 'FUNCIÓN CANCELADA'],
      ['2026-10-17', 'scheduled', undefined],
    ]);

    // Gana la marca más grave: agotada (clase) + producción postergada ⇒ postponed.
    const mixta = buildEvent(
      rawOf(
        detailHtml({
          data: 'Postergada',
          months: [
            {
              name: 'octubre',
              days: [dayHtml({ text: 'viernes 16/10, 20:00 hs', classes: 'sold_out' })],
            },
          ],
        }),
      ),
      parseCtx,
    );
    expect(mixta.ok && mixta.event.occurrences.map((o) => o.status)).toEqual(['postponed']);
  });

  it('sin hora confirmada no hay ocurrencia; sin detalle falla; sin fechas usa el listado', () => {
    const sinHora = buildEvent(
      rawOf(
        detailHtml({ months: [{ name: 'octubre', days: [dayHtml({ text: 'viernes 16/10' })] }] }),
      ),
      parseCtx,
    );
    expect(sinHora.ok && sinHora.event.occurrences).toEqual([]);
    expect(sinHora.ok && sinHora.warnings.join(' ')).toMatch(/sin hora confirmada/);

    expect(buildEvent(rawOf(''), parseCtx).ok).toBe(false);

    const listingRow = {
      slug: 'obra-x',
      detailUrl: 'https://teatrocolon.org.ar/produccion/obra-x/',
      title: 'Obra X',
      category: 'Ballet',
      dataText: '',
      ticketsUrl: 'https://tix.example/listado',
      imageUrl: null,
      year: 2026,
      month: 11,
      day: 3,
      time: { hour: 20, minute: 30 },
      dateText: '03. mar_20.30 hs',
    };
    const desdeListado = buildEvent(
      rawOf(detailHtml({ withDates: false }), [listingRow]),
      parseCtx,
    );
    expect(desdeListado.ok && desdeListado.event.occurrences[0]).toMatchObject({
      externalId: 'obra-x|2026-11-03|20:30',
      startsAt: '2026-11-03T20:30:00-03:00',
      sourceDateText: '03. mar_20.30 hs',
      ticketsUrl: 'https://tix.example/listado',
      venue: { slug: 'teatro-colon', room: 'Sala principal' },
    });
    expect(desdeListado.ok && desdeListado.warnings.join(' ')).toMatch(/tomadas del listado/);
  });

  it('año: diciembre→enero se infiere respecto de now; el listado tiene prioridad', () => {
    const html = detailHtml({
      months: [
        { name: 'diciembre', days: [dayHtml({ text: 'lunes 28/12, 20:00 hs' })] },
        { name: 'enero', days: [dayHtml({ text: 'domingo 10/01, 20:00 hs' })] },
      ],
    });
    const december = {
      ...parseCtx,
      now: () => DateTime.fromISO('2026-12-20T12:00:00', { zone: BA_TZ }),
    };
    const res = buildEvent(rawOf(html), december);
    expect(res.ok && res.event.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-12-28T20:00:00-03:00',
      '2027-01-10T20:00:00-03:00',
    ]);
    const years = new Map([['01-10|20:00', 2028]]);
    expect(resolveYear(1, 10, { hour: 20, minute: 0 }, years, december.now())).toBe(2028);
    expect(resolveYear(1, 10, { hour: 21, minute: 0 }, years, december.now())).toBe(2027);
  });

  it('venue desconocido queda sin dirección; Colón Fábrica usa la dirección publicada', () => {
    const usina = buildEvent(
      rawOf(
        detailHtml({
          place: 'Usina del Arte',
          months: [{ name: 'octubre', days: [dayHtml({ text: 'viernes 16/10, 20:00 hs' })] }],
        }),
      ),
      parseCtx,
    );
    expect(usina.ok && usina.event.occurrences[0]?.venue).toEqual({ name: 'Usina del Arte' });
    expect(usina.ok && publishability(usina.event).reasons).toEqual(['missing:venue']);

    const fabrica = buildEvent(
      rawOf(
        detailHtml({
          place: 'Teatro Colón Fábrica',
          months: [{ name: 'octubre', days: [dayHtml({ text: 'viernes 16/10, 20:00 hs' })] }],
        }),
      ),
      parseCtx,
    );
    expect(fabrica.ok && fabrica.event.occurrences[0]?.venue).toEqual(COLON_FABRICA_VENUE);
  });

  it('parseDetailPage expone sala, taxonomía e imagen solo si es absoluta', () => {
    const d = parseDetailPage(
      `<main><div class="background production-category-cetc places-cetc"><img itemprop="image" src="/relativa.png"></div>
       <section class="hero-module"><div class="content"><div class="category">CETC</div><h1 itemprop="name">A</h1></div></section>
       <section class="sinopsis" id="sinopsis"><h4 id="the_place"></h4></section></main>`,
    );
    expect(d.categorySlugs).toEqual(['cetc']);
    expect(d.placeSlug).toBe('cetc');
    expect(d.placeText).toBe('');
    expect(d.imageUrl).toBeNull();
    expect(d.functions).toEqual([]);
  });
});

// ── Mapeos y helpers (puros) ───────────────────────────────────────────────

describe('dates', () => {
  it('listado', () => {
    expect(parseDayNumber('14.')).toBe(14);
    expect(parseDayNumber('x')).toBeNull();
    expect(parseListingHour('mié_17.30 hs')).toEqual({ hour: 17, minute: 30 });
    expect(parseListingHour('dom_11.00 hs')).toEqual({ hour: 11, minute: 0 });
    expect(monthNumberEs('octubre')).toBe(10);
    expect(monthNumberEs('octubre/26')).toBe(10);
    expect(monthNumberEs('Septiembre')).toBe(9);
    expect(monthNumberEs('')).toBeNull();
  });
  it('detalle', () => {
    expect(parseDetailDayText('viernes 09/10, 20:00 hs')).toEqual({
      day: 9,
      month: 10,
      time: { hour: 20, minute: 0 },
    });
    expect(parseDetailDayText('martes 22/12, 15:00 hs')).toEqual({
      day: 22,
      month: 12,
      time: { hour: 15, minute: 0 },
    });
    expect(parseDetailDayText('viernes 09/10')).toEqual({ day: 9, month: 10, time: null });
    expect(parseDetailDayText('sin fecha')).toBeNull();
  });
});

describe('venues', () => {
  it('mapea salas del edificio a room del venue seed y espacios externos a su dirección', () => {
    expect(venueForPlace('Sala principal').venue).toEqual({
      ...TEATRO_COLON_VENUE,
      room: 'Sala principal',
    });
    expect(venueForPlace('Salón Dorado').venue).toEqual({
      ...TEATRO_COLON_VENUE,
      room: 'Salón Dorado',
    });
    expect(venueForPlace('Plaza Vaticano y Teatro Colón').venue?.room).toBe(
      'Plaza Vaticano y Teatro Colón',
    );
    expect(venueForPlace('CETC').venue).toEqual(CETC_VENUE);
    expect(venueForPlace('Colón Fábrica').venue).toEqual(COLON_FABRICA_VENUE);
    expect(venueForPlace('Teatro Colón').venue).toEqual(TEATRO_COLON_VENUE);
    expect(venueForPlace('Sala Samsung')).toMatchObject({ venue: { name: 'Sala Samsung' } });
    expect(venueForPlace('', { placeSlug: 'salon-dorado' }).venue?.room).toBe('Salón Dorado');
    expect(venueForPlace('', { locationName: 'Teatro Colón' }).venue).toEqual(TEATRO_COLON_VENUE);
    expect(venueForPlace('').venue).toBeNull();
  });
});

describe('disciplines', () => {
  it('mapea categorías del sitio', () => {
    expect(disciplinesFor(['Ópera'])).toEqual({
      disciplines: ['opera_clasica'],
      tags: [],
      basis: 'categories',
    });
    expect(disciplinesFor(['Ballet']).disciplines).toEqual(['danza']);
    expect(disciplinesFor(['CETC']).disciplines).toEqual(['teatro_escenicas', 'opera_clasica']);
    expect(disciplinesFor(['Colón para niños'])).toMatchObject({
      disciplines: ['opera_clasica'],
      tags: ['infantil'],
    });
    expect(disciplinesFor(['production-category-ofba']).disciplines).toEqual(['opera_clasica']);
    expect(
      disciplinesFor(['Música de Cámara', 'production-category-musica-de-camara']).disciplines,
    ).toEqual(['opera_clasica']);
    expect(disciplinesFor(['jazz']).disciplines).toEqual(['musica_vivo_jazz']);
    expect(disciplinesFor(['cine-documental']).disciplines).toEqual(['cine']);
    expect(disciplinesFor(['talleres']).disciplines).toEqual(['otros']);
    expect(disciplinesFor(['Ciclo inédito']).disciplines).toEqual(['otros']);
    expect(disciplinesFor(['', null, undefined])).toEqual({
      disciplines: [],
      tags: [],
      basis: 'none',
    });
  });

  it('solo temporada: señales deterministas de la fuente o, sin ellas, otros', () => {
    // Sin señales: actividad de la programación no mapeable ⇒ otros (no candidato).
    expect(disciplinesFor(['Temporada 2026', 'production-category-temporada-2025'])).toEqual({
      disciplines: ['otros'],
      tags: [],
      basis: 'season-only',
    });
    expect(
      disciplinesFor(['Temporada 2026'], {
        ticketUrls: [null, 'https://entradasba.buenosaires.gob.ar/visitas/115'],
      }),
    ).toMatchObject({ disciplines: ['historia_patrimonio'], basis: 'signals' });
    expect(
      disciplinesFor(['Temporada 2026'], {
        text: 'La actividad incluye una visita guiada privada… y música clásica en vivo',
      }).disciplines,
    ).toEqual(['historia_patrimonio', 'opera_clasica']);
    expect(
      disciplinesFor(['Temporada 2026'], { text: 'Una EXPERIENCIA TEATRAL itinerante' })
        .disciplines,
    ).toEqual(['teatro_escenicas']);
    // Una categoría informativa manda: las señales no se miran.
    expect(
      disciplinesFor(['Ópera', 'Temporada 2026'], {
        ticketUrls: ['https://entradasba.buenosaires.gob.ar/visitas/115'],
      }).disciplines,
    ).toEqual(['opera_clasica']);
    // Señales sin ninguna categoría también cuentan; "recorrido" solo no es señal.
    expect(disciplinesFor([], { text: 'Visitas guiadas por el teatro' }).disciplines).toEqual([
      'historia_patrimonio',
    ]);
    expect(disciplinesFor([], { text: 'Un recorrido por Beethoven' }).disciplines).toEqual([]);
  });
});

describe('urls', () => {
  it('limpia parámetros de campaña y rechaza esquemas no http', () => {
    expect(
      cleanTicketsUrl(
        'https://www.tuentrada.com/filarmonica-de-berlin-tc?gad_source=1&gad_campaignid=2&gbraid=x&gclid=y',
      ),
    ).toBe('https://www.tuentrada.com/filarmonica-de-berlin-tc');
    expect(cleanTicketsUrl('http://tuentrada.com/egberto-gismonti-tc')).toBe(
      'http://tuentrada.com/egberto-gismonti-tc',
    );
    expect(cleanTicketsUrl('https://x.test/a?id=5&utm_source=n#frag')).toBe(
      'https://x.test/a?id=5',
    );
    expect(cleanTicketsUrl('javascript:void(0)')).toBeNull();
    expect(cleanTicketsUrl('')).toBeNull();
    expect(cleanTicketsUrl(undefined)).toBeNull();
  });
  it('extrae el slug de /produccion/<slug>/', () => {
    expect(productionSlugFromUrl('https://teatrocolon.org.ar/produccion/las-ruinas/')).toBe(
      'las-ruinas',
    );
    expect(productionSlugFromUrl('https://teatrocolon.org.ar/produccion/las-ruinas')).toBe(
      'las-ruinas',
    );
    expect(productionSlugFromUrl('https://teatrocolon.org.ar/visitas-guiadas/')).toBeNull();
    expect(productionSlugFromUrl('https://otro.test/produccion/x/')).toBeNull();
  });
});
