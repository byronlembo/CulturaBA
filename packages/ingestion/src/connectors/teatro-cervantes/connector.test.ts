import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assessPublishability, BA_TZ, type NormalizedEvent } from '@culturaba/shared';
import { DateTime } from 'luxon';
import type { ParseResult, RawRecord } from '../../core/connector';
import { type HttpClient, HttpError } from '../../http/client';
import { FixtureHttpClient } from '../../http/fixtureClient';
import { fixtureSetDir } from '../../http/fixtures';
import { silentLogger } from '../../logger';
import { teatroCervantesConnector } from './connector';
import { mapDisciplines } from './disciplines';
import {
  buildEvent,
  type ListingItem,
  parseCalendarPage,
  parseCategories,
  parseDetail,
  parseObrasPage,
  priceFrom,
  selectCurrentObras,
} from './parse';
import { prettifyPlace, TEATRO_CERVANTES_VENUE, venueFor } from './venues';

const FIXTURE_DIR = fixtureSetDir('teatro-cervantes', '2026-10-18');
const NOW = DateTime.fromISO('2026-10-18T12:00:00', { zone: BA_TZ });
const KNOWN_VENUES = new Set(['teatro-colon', 'mnba', 'palacio-libertad', 'teatro-cervantes']);

function fixture(file: string): string {
  return readFileSync(join(FIXTURE_DIR, file), 'utf8');
}

function makeCtx(now = NOW) {
  return { http: new FixtureHttpClient(FIXTURE_DIR), logger: silentLogger, now: () => now };
}

interface Loaded {
  raw: RawRecord;
  result: ParseResult;
}

async function loadAll(): Promise<Map<string, Loaded>> {
  const ctx = makeCtx();
  const items = new Map<string, Loaded>();
  for (const raw0 of await teatroCervantesConnector.discover(ctx)) {
    const raw = await teatroCervantesConnector.enrich?.(raw0, ctx);
    if (!raw) throw new Error('enrich no definido');
    items.set(raw.externalId, { raw, result: teatroCervantesConnector.parse(raw, ctx) });
  }
  return items;
}

function okEvent(result: ParseResult | undefined): NormalizedEvent {
  if (!result) throw new Error('sin resultado');
  if (!result.ok) throw new Error(`inválido: ${result.errors.join('; ')}`);
  return result.event;
}

function keys(event: NormalizedEvent): string[] {
  return event.occurrences.map((o) =>
    o.kind === 'timed'
      ? `${o.startDate} ${o.startsAt.slice(11, 16)}`
      : `range ${o.startDate}…${o.endDate}`,
  );
}

function publishability(event: NormalizedEvent, now = NOW) {
  return assessPublishability(event, { now: now.toMillis(), knownVenueSlugs: KNOWN_VENUES });
}

// ── Fixtures reales del 18-oct-2026 ────────────────────────────────────────

describe('teatro-cervantes · discover sobre fixtures 2026-10-18', () => {
  it('categorías + 3 calendarios + 1 página del REST → 5 obras vigentes en la Ciudad', async () => {
    const ctx = makeCtx();
    const raws = await teatroCervantesConnector.discover(ctx);
    expect(ctx.http.stats.requests).toBe(5);
    expect(raws.map((r) => r.externalId)).toEqual([
      'el-movimiento',
      'visitas-guiadas-del-cervantes',
      'ciclo-de-musica-2',
      'lo-mucho-que-te-ame',
      'santos-vega',
    ]);
    for (const r of raws) {
      expect(r.url).toBe(`https://www.teatrocervantes.gob.ar/obra/${r.externalId}/`);
      expect(r.body).toBe('');
    }
    const listing = (slug: string) =>
      raws.find((r) => r.externalId === slug)?.listing as ListingItem;
    expect(listing('el-movimiento')).toMatchObject({
      postId: 36035,
      fechaEstreno: '29/10/2026',
      ultimaFuncion: '13/12/2026',
      categories: [{ id: 11, slug: 'en-el-teatro', name: 'En el teatro' }],
      calendar: [],
      calendarWindow: { start: '2026-10-18', end: '2026-12-31' },
    });
    expect(listing('visitas-guiadas-del-cervantes').ultimaFuncion).toBeNull();
    // El calendario trae el día completo del mes corriente (también los días pasados).
    expect(listing('santos-vega').calendar).toHaveLength(44); // 19 + 17 + 8
    expect(listing('ciclo-de-musica-2').calendar).toEqual([
      { date: '2026-11-18', time: '20:30', hourText: '20:30hs.' },
    ]);
  });

  it('limit recorta después de seleccionar', async () => {
    const raws = await teatroCervantesConnector.discover({ ...makeCtx(), limit: 2 });
    expect(raws.map((r) => r.externalId)).toEqual([
      'el-movimiento',
      'visitas-guiadas-del-cervantes',
    ]);
  });

  describe('discover es todo o nada', () => {
    function patchedCtx(patch: (url: string) => string | null) {
      const real = new FixtureHttpClient(FIXTURE_DIR);
      const http: HttpClient = {
        stats: real.stats,
        get: async (url, options) => {
          const body = patch(url);
          if (body === null) return real.get(url, options);
          if (body === 'HTTP500') throw new HttpError(url, 500);
          return { status: 200, url, body, headers: {} };
        },
      };
      return { http, logger: silentLogger, now: () => NOW };
    }

    it('un mes del calendario caído → lanza', async () => {
      const ctx = patchedCtx((u) => (u.includes('mes=11') ? 'HTTP500' : null));
      await expect(teatroCervantesConnector.discover(ctx)).rejects.toThrow(
        /calendario 2026-11 no disponible/,
      );
    });

    it('un calendario que devuelve otro mes → lanza', async () => {
      const october = fixture('002-calendario.html');
      const ctx = patchedCtx((u) => (u.includes('mes=12') ? october : null));
      await expect(teatroCervantesConnector.discover(ctx)).rejects.toThrow(
        /devolvió 2026-10 en lugar de 2026-12/,
      );
    });

    it('una página que no es calendario → lanza', async () => {
      const ctx = patchedCtx((u) =>
        u.includes('mes=10') ? '<html><body>mantenimiento</body></html>' : null,
      );
      await expect(teatroCervantesConnector.discover(ctx)).rejects.toThrow(
        /no es una página de calendario/,
      );
    });
  });
});

describe('teatro-cervantes · selección de obras (REST)', () => {
  it('temporada vigente o listada en el calendario; giras fuera', () => {
    const categories = parseCategories(fixture('001-wp-json-wp-v2-categories.json'));
    expect(categories.size).toBe(28);
    const page = parseObrasPage(fixture('005-wp-json-wp-v2-obra.json'));
    expect(page).toMatchObject({ received: 100, invalid: 0, lastModified: '2025-01-23T17:25:45' });
    const sel = selectCurrentObras(
      page.obras,
      categories,
      new Set(['santos-vega', 'visitas-guiadas-del-cervantes', 'ciclo-de-musica-2']),
      '2026-10-18',
    );
    expect(sel.selected.map((s) => [s.obra.slug, s.reason])).toEqual([
      ['el-movimiento', 'última función 2026-12-13'],
      ['visitas-guiadas-del-cervantes', 'sin última función publicada; listada en el calendario'],
      ['ciclo-de-musica-2', 'sin última función publicada; listada en el calendario'],
      ['lo-mucho-que-te-ame', 'última función 2026-10-25'],
      ['santos-vega', 'última función 2026-12-13'],
    ]);
    expect(sel.skipped).toEqual([
      { slug: 'villa-california', reason: 'gira por el país (fuera de la Ciudad)' },
      { slug: 'y-los-perros-se-reiran', reason: 'gira por el país (fuera de la Ciudad)' },
    ]);
    // Sin el calendario, las abiertas (sin última función) no se eligen.
    const noCal = selectCurrentObras(page.obras, categories, new Set(), '2026-10-18');
    expect(noCal.selected.map((s) => s.obra.slug)).toEqual([
      'el-movimiento',
      'lo-mucho-que-te-ame',
      'santos-vega',
    ]);
  });
});

describe('teatro-cervantes · calendario mensual', () => {
  it('octubre 2026: filas por función con la categoría del bloque', () => {
    const page = parseCalendarPage(fixture('002-calendario.html'));
    expect(page).toMatchObject({ recognized: true, year: 2026, month: 10, warnings: [] });
    expect(page.entries).toHaveLength(38);
    expect(page.entries[0]).toEqual({
      date: '2026-10-01',
      time: '18:00',
      hourText: '18:00hs.',
      slug: 'lo-mucho-que-te-ame',
      url: 'https://www.teatrocervantes.gob.ar/obra/lo-mucho-que-te-ame/',
      title: 'Lo mucho que te amé',
      label: 'En el teatro',
    });
    // El feriado del lunes 12/10 no tiene visita guiada.
    const visits = page.entries.filter((e) => e.slug === 'visitas-guiadas-del-cervantes');
    expect(visits.map((e) => e.date)).toEqual(['2026-10-05', '2026-10-19', '2026-10-26']);
  });
});

describe('teatro-cervantes · eventos normalizados (fixtures 2026-10-18)', () => {
  let items: Map<string, Loaded>;
  beforeAll(async () => {
    items = await loadAll();
  });
  const event = (slug: string) => okEvent(items.get(slug)?.result);
  const warnings = (slug: string) => {
    const r = items.get(slug)?.result;
    return r?.ok ? r.warnings : [];
  };

  it('las 5 obras parsean y son publicables', () => {
    expect([...items.keys()]).toHaveLength(5);
    for (const slug of items.keys()) {
      expect(publishability(event(slug))).toEqual({ publishable: true, reasons: [] });
    }
  });

  it('El movimiento: sin filas en el calendario → jueves a domingo 21 h del 29/10 al 13/12', () => {
    const e = event('el-movimiento');
    expect(e).toMatchObject({
      source: 'teatro-cervantes',
      externalId: 'el-movimiento',
      title: 'El movimiento',
      subtitle: 'EL PASADO NO SE DETIENE · ESCRITA Y DIRIGIDA POR JAVIER DAULTE',
      attribution: 'Texto: Teatro Nacional Cervantes',
      disciplines: ['teatro_escenicas'],
      institutionSlug: 'teatro-cervantes',
      officialUrl: 'https://www.teatrocervantes.gob.ar/obra/el-movimiento/',
      sameAsUrls: ['https://www.teatrocervantes.gob.ar/obra/el-movimiento/'],
      ticketsUrl:
        'https://ventas.teatrocervantes.gob.ar/landing/el-movimiento-el-pasado-no-se-detiene?idEspectaculoCartel=17597&cHashValidacion=720deddf80c1ae9934bddaba5db595e69efacdc2',
      imageUrl:
        'https://www.teatrocervantes.gob.ar/wp-content/uploads/2026/10/El-movimiento_WEB_2.png',
      priceVerified: false,
      tags: ['en el teatro'],
    });
    expect(e.priceText).toBeUndefined();
    expect(e.isFree).toBeUndefined();
    expect(e.description?.startsWith('Una agencia de publicidad prepara una campaña')).toBe(true);
    const k = keys(e);
    expect(k).toHaveLength(28);
    expect(k[0]).toBe('2026-10-29 21:00');
    expect(k.at(-1)).toBe('2026-12-13 21:00');
    expect(e.occurrences[0]).toEqual({
      externalId: 'el-movimiento|2026-10-29|21:00',
      kind: 'timed',
      startsAt: '2026-10-29T21:00:00-03:00',
      endsAt: null,
      startDate: '2026-10-29',
      endDate: '2026-10-29',
      timezone: BA_TZ,
      scheduleText: null,
      recurrenceRule: null,
      sourceDateText: 'De jueves a domingo a las 21 h',
      venue: { ...TEATRO_CERVANTES_VENUE, room: 'Sala Orestes Caviglia' },
      status: 'scheduled',
      ticketsUrl: e.ticketsUrl,
      price: null,
    });
    expect(warnings('el-movimiento')).toEqual([
      'el calendario del sitio (2026-10-18 – 2026-12-31) no lista la obra: se usa el texto publicado',
    ]);
  });

  it('Santos Vega: funciones del calendario (jueves a domingo 20 h, desde hoy hasta el 13/12)', () => {
    const e = event('santos-vega');
    const k = keys(e);
    expect(k).toHaveLength(33);
    expect(k.slice(0, 3)).toEqual(['2026-10-18 20:00', '2026-10-22 20:00', '2026-10-23 20:00']);
    expect(k.at(-1)).toBe('2026-12-13 20:00');
    expect(e.occurrences[0]?.sourceDateText).toBe('Calendario 2026-10-18 · 20:00hs.');
    expect(e.occurrences[0]?.venue).toEqual({
      ...TEATRO_CERVANTES_VENUE,
      room: 'Sala María Guerrero',
    });
    expect(warnings('santos-vega')).toEqual([]);
  });

  it('Lo mucho que te amé: 5 funciones a las 18 h hasta la última función (25/10)', () => {
    const e = event('lo-mucho-que-te-ame');
    expect(keys(e)).toEqual([
      '2026-10-18 18:00',
      '2026-10-22 18:00',
      '2026-10-23 18:00',
      '2026-10-24 18:00',
      '2026-10-25 18:00',
    ]);
    expect(e.occurrences[0]?.venue?.room).toBe('Sala Luisa Vehil');
  });

  it('Visitas guiadas: lunes 11 h del calendario, sin sala (edificio), precio y patrimonio', () => {
    const e = event('visitas-guiadas-del-cervantes');
    expect(keys(e)).toEqual([
      '2026-10-19 11:00',
      '2026-10-26 11:00',
      '2026-11-02 11:00',
      '2026-11-09 11:00',
      '2026-11-16 11:00',
      '2026-11-30 11:00',
    ]);
    expect(e).toMatchObject({
      disciplines: ['historia_patrimonio'],
      priceText: '$15.000',
      priceVerified: true,
      tags: ['visita guiada'],
    });
    expect(e.isFree).toBeUndefined();
    expect(e.occurrences[0]?.venue).toEqual(TEATRO_CERVANTES_VENUE);
    expect(e.occurrences[0]?.price).toEqual({ text: '$15.000', verified: true });
    expect(warnings('visitas-guiadas-del-cervantes')).toEqual([
      '"Grupos de instituciones educativas de niveles medio y superior y comunidades, a partir de los 16 años: lunes 14 h": función para grupos con inscripción: no se publica',
    ]);
  });

  it('Ciclo de música: el concierto del 18/11 a las 20.30 (solo el calendario da la hora), gratuito', () => {
    const e = event('ciclo-de-musica-2');
    expect(keys(e)).toEqual(['2026-11-18 20:30']);
    expect(e).toMatchObject({
      title: 'Ciclo de música',
      disciplines: ['musica_vivo_jazz'],
      priceText: 'Entradas gratuitas.',
      isFree: true,
      priceVerified: true,
      ticketsUrl: 'https://ventas.teatrocervantes.gob.ar/',
    });
    expect(e.occurrences[0]?.venue?.room).toBe('Sala Orestes Caviglia');
    // La descripción sale de la pestaña "Información" y no arrastra el JSON del reproductor.
    expect(e.description).toContain('18 de noviembre – Música Contemporánea, Concierto V');
    expect(e.description).not.toContain('tracklist');
  });
});

// ── Páginas del relevamiento (giras y archivadas) ──────────────────────────

function researchRecord(
  slug: string,
  file: string,
  listing: Partial<ListingItem> & Pick<ListingItem, 'fechaEstreno' | 'ultimaFuncion'>,
): RawRecord {
  const full: ListingItem = {
    postId: 1,
    slug,
    link: `https://www.teatrocervantes.gob.ar/obra/${slug}/`,
    title: slug,
    modified: '2026-10-05T12:00:00',
    categories: [
      { id: 13, slug: 'archivo', name: 'Archivo' },
      { id: 11, slug: 'en-el-teatro', name: 'En el teatro' },
    ],
    calendar: [],
    calendarWindow: null,
    ...listing,
  };
  return {
    externalId: slug,
    url: full.link,
    fetchedAt: '2026-10-18T13:39:00-03:00',
    contentType: 'html',
    body: fixture(file),
    listing: full,
  };
}

function parseAt(raw: RawRecord, iso: string): ParseResult {
  const now = DateTime.fromISO(iso, { zone: BA_TZ });
  return buildEvent(raw, { logger: silentLogger, now: () => now });
}

describe('teatro-cervantes · páginas del relevamiento', () => {
  it('giras ("EN EL PAÍS") nunca se publican, aunque lleguen a parse', () => {
    const villa = researchRecord('villa-california', '101-obra-villa-california.html', {
      title: 'Villa California',
      fechaEstreno: '02/10/2026',
      ultimaFuncion: '26/11/2026',
      categories: [{ id: 27, slug: 'en-el-pais', name: 'En el país' }],
    });
    expect(parseAt(villa, '2026-10-18T12:00')).toEqual({
      ok: false,
      errors: [
        'fuera del alcance de CulturaBA: gira por el país (fuera de la Ciudad) (GENERAL ROCA, RÍO NEGRO)',
      ],
    });
    // Sin categorías (p. ej. REST incompleto): la etiqueta del detalle alcanza.
    const perros = researchRecord(
      'y-los-perros-se-reiran',
      '102-obra-y-los-perros-se-reiran.html',
      {
        fechaEstreno: '04/09/2026',
        ultimaFuncion: '24/10/2026',
        categories: [],
      },
    );
    const r = parseAt(perros, '2026-10-18T12:00');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toMatch(/^fuera del alcance de CulturaBA: gira por el país/);
  });

  it('Sanctum Quixote: fechas enumeradas en dos meses, foyer del teatro, "GRATIS"', () => {
    const raw = researchRecord('sanctum-quixote', '103-obra-sanctum-quixote.html', {
      title: 'Sanctum Quixote',
      fechaEstreno: '25/04/2026',
      ultimaFuncion: '03/05/2026',
    });
    const e = okEvent(parseAt(raw, '2026-04-20T12:00'));
    expect(keys(e)).toEqual([
      '2026-04-25 15:00',
      '2026-04-26 15:00',
      '2026-05-02 15:00',
      '2026-05-03 15:00',
    ]);
    expect(e.occurrences[0]?.sourceDateText).toBe(
      'Sábado 25 y domingo 26 de abril y sábado 2 y domingo 3 de mayo a las 15 h',
    );
    expect(e.occurrences[0]?.venue).toEqual({
      ...TEATRO_CERVANTES_VENUE,
      room: 'Foyer del Teatro',
    });
    expect(e).toMatchObject({ priceText: 'GRATIS', isFree: true, priceVerified: true });
    expect(publishability(e, DateTime.fromISO('2026-04-20T12:00', { zone: BA_TZ }))).toEqual({
      publishable: true,
      reasons: [],
    });
  });

  it('Borges, el eco infinito: "Miércoles 17 y 24 de junio a las 20 h", sala "LUISA VEHIL"', () => {
    const raw = researchRecord('borges-el-eco-infinito', '104-obra-borges-el-eco-infinito.html', {
      fechaEstreno: '17/06/2026',
      ultimaFuncion: '24/06/2026',
    });
    const e = okEvent(parseAt(raw, '2026-06-10T12:00'));
    expect(keys(e)).toEqual(['2026-06-17 20:00', '2026-06-24 20:00']);
    expect(e.occurrences[0]?.venue?.room).toBe('Sala Luisa Vehil');
  });

  it('El Mago de Oz: "luego de vacaciones" no es legible → la temporada como rango', () => {
    const raw = researchRecord('el-mago-de-oz', '105-obra-el-mago-de-oz.html', {
      fechaEstreno: '16/07/2026',
      ultimaFuncion: '27/09/2026',
    });
    const r = parseAt(raw, '2026-07-10T12:00');
    const e = okEvent(r);
    expect(e.occurrences).toHaveLength(1);
    expect(e.occurrences[0]).toMatchObject({
      externalId: 'el-mago-de-oz|range|2026-07-16',
      kind: 'range',
      startsAt: '2026-07-16T00:00:00-03:00',
      endsAt: '2026-09-27T23:59:59-03:00',
      scheduleText:
        'Vacaciones de invierno del jueves 16 de julio al 2 de agosto de miércoles a domingo a las 14:30 h. · Para público general luego de vacaciones de invierno: sábados y domingos a las 14:30 h.',
      sourceDateText: 'Fecha estreno 16/07/2026 · Última función 27/09/2026',
    });
    expect(r.ok && r.warnings).toContain(
      'sin funciones con hora: se publica la temporada como rango',
    );
  });

  it('Cervantes Electroacústico: fechas sin hora → rango; "Sala Piso 11"; entrada gratuita', () => {
    const raw = researchRecord(
      'cervantes-electroacustico-2',
      '106-obra-cervantes-electroacustico-2.html',
      { fechaEstreno: '28/08/2026', ultimaFuncion: '30/08/2026' },
    );
    const e = okEvent(parseAt(raw, '2026-08-20T12:00'));
    expect(keys(e)).toEqual(['range 2026-08-28…2026-08-30']);
    expect(e.occurrences[0]?.venue).toEqual({ ...TEATRO_CERVANTES_VENUE, room: 'Sala Piso 11' });
    expect(e.isFree).toBe(true);
    expect(e.priceText).toBe(
      'La entrada a los conciertos es gratuita, retirando la entrada en la boletería del TNC y/o reservando en la web, el mismo día del concierto a partir de las 10 h.',
    );
  });

  it('Ciclo Teatro del país: viernes a domingo 21 h × temporada; "Las entradas son GRATUITAS."', () => {
    const raw = researchRecord('ciclo-teatro-del-pais', '107-obra-ciclo-teatro-del-pais.html', {
      fechaEstreno: '11/09/2026',
      ultimaFuncion: '04/10/2026',
    });
    const e = okEvent(parseAt(raw, '2026-09-05T12:00'));
    const k = keys(e);
    expect(k).toHaveLength(12);
    expect(k.slice(0, 3)).toEqual(['2026-09-11 21:00', '2026-09-12 21:00', '2026-09-13 21:00']);
    expect(k.at(-1)).toBe('2026-10-04 21:00');
    expect(e).toMatchObject({ priceText: 'Las entradas son GRATUITAS.', isFree: true });
  });

  it('sin página de detalle: REST + calendario, venue del edificio por la categoría', () => {
    const raw: RawRecord = {
      ...researchRecord('santos-vega', '010-obra-santos-vega.html', {
        title: 'Santos Vega',
        fechaEstreno: '03/09/2026',
        ultimaFuncion: '13/12/2026',
        categories: [{ id: 11, slug: 'en-el-teatro', name: 'En el teatro' }],
        calendar: [{ date: '2026-10-22', time: '20:00', hourText: '20:00hs.' }],
      }),
      body: '',
    };
    const r = parseAt(raw, '2026-10-18T12:00');
    const e = okEvent(r);
    expect(keys(e)).toEqual(['2026-10-22 20:00']);
    expect(e.occurrences[0]?.venue).toEqual(TEATRO_CERVANTES_VENUE);
    expect(r.ok && r.warnings).toContain(
      'sin página de detalle: se usan solo el REST y el calendario',
    );
  });
});

describe('teatro-cervantes · detalle, precio, venues y disciplinas', () => {
  it('parseDetail lee etiqueta, sala, temporada y texto lateral', () => {
    const d = parseDetail(fixture('007-obra-visitas-guiadas-del-cervantes.html'));
    expect(d).toMatchObject({
      title: 'Visitas guiadas del Cervantes',
      subtitle: 'HISTORIA Y LEYENDA',
      label: 'VISITA GUIADA',
      sala: null,
      fechaEstrenoText: '04/05/2026',
      ultimaFuncionText: null,
      priceText: '$15.000',
      canonicalUrl: 'https://www.teatrocervantes.gob.ar/obra/visitas-guiadas-del-cervantes/',
    });
    expect(d.scheduleText.split('\n')[0]).toBe('Público general: lunes 11 h');
  });

  it('priceFrom: solo lo publicado', () => {
    expect(priceFrom({ priceText: '$10.000 Descuento jubilados', scheduleText: '' })).toEqual({
      priceText: '$10.000 Descuento jubilados',
      isFree: undefined,
    });
    expect(priceFrom({ priceText: null, scheduleText: 'De jueves a domingo a las 20 h' })).toEqual({
      priceText: null,
      isFree: undefined,
    });
    expect(priceFrom(null)).toEqual({ priceText: null, isFree: undefined });
  });

  it('venueFor', () => {
    expect(venueFor('SALA MARÍA GUERRERO', false).venue).toEqual({
      ...TEATRO_CERVANTES_VENUE,
      room: 'Sala María Guerrero',
    });
    expect(venueFor('', true).venue).toEqual(TEATRO_CERVANTES_VENUE);
    expect(venueFor('CENTRO CULTURAL BORGES', false)).toEqual({
      venue: { name: 'Centro Cultural Borges' },
      warning: 'espacio "CENTRO CULTURAL BORGES" sin dirección publicada: candidato por venue',
    });
    expect(venueFor(null, false)).toEqual({
      venue: null,
      warning: 'sin sala ni sede publicadas: candidato por venue',
    });
    expect(prettifyPlace('FOYER DEL TEATRO')).toBe('Foyer del Teatro');
  });

  it('mapDisciplines: tabla explícita', () => {
    const map = (categorySlugs: string[], label: string | null, title: string) =>
      mapDisciplines({ categorySlugs, label, title }).disciplines;
    expect(map(['en-el-teatro'], 'EN EL TEATRO', 'Santos Vega')).toEqual(['teatro_escenicas']);
    expect(map(['en-el-teatro'], 'EN EL TEATRO', 'Ciclo de música')).toEqual(['musica_vivo_jazz']);
    expect(map(['en-el-teatro'], 'VISITA GUIADA', 'Visitas guiadas del Cervantes')).toEqual([
      'historia_patrimonio',
    ]);
    expect(map(['ciclo-de-cine'], null, 'Ciclo')).toEqual(['cine']);
    expect(map(['escuelas'], null, 'Taller')).toEqual(['otros']);
    expect(map(['escuelas', 'en-el-teatro'], null, 'Función escolar')).toEqual([
      'teatro_escenicas',
    ]);
    // "La epidemia de la danza" es una obra: el título solo cuenta por su comienzo literal.
    expect(map(['en-el-teatro'], null, 'La epidemia de la danza')).toEqual(['teatro_escenicas']);
    const none = mapDisciplines({ categorySlugs: ['archivo'], label: null, title: 'X' });
    expect(none.disciplines).toEqual([]);
    expect(none.warnings).toHaveLength(1);
  });
});
