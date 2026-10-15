import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assessPublishability,
  type NormalizedEvent,
  NormalizedEventSchema,
} from '@culturaba/shared';
import { load } from 'cheerio';
import { DateTime } from 'luxon';
import type { RawRecord } from '../../core/connector';
import { type HttpClient, type HttpResponse, newStats } from '../../http/client';
import { FixtureHttpClient } from '../../http/fixtureClient';
import { fixtureSetDir } from '../../http/fixtures';
import { silentLogger } from '../../logger';
import { agendaBaConnector as connector, LIST_URL, looksTruncated } from './connector';
import {
  buildOccurrences,
  extractOpeningHoursText,
  isExhibition,
  parseInstants,
  splitSentences,
} from './dates';
import { mapDisciplines, PERFORMING_ETIQUETAS } from './disciplines';
import {
  cleanTrackingUrl,
  eventPageUrl,
  extractPriceText,
  pickTicketsUrl,
  sameAsLinks,
  statusFromTitle,
  textContradiction,
} from './parse';
import { classifyPlace, resolvePlace } from './venues';

const FIXTURES = fixtureSetDir('agenda-ba', '2026-10-14');
const NOW = DateTime.fromISO('2026-10-14T12:00:00', { zone: 'America/Argentina/Buenos_Aires' });
const LINDA = (slug: string) => `https://linda.buenosaires.gob.ar/eventos/${slug}`;
const SEED_INSTITUTIONS = new Set(['teatro-colon', 'complejo-teatral', 'mnba', 'palacio-libertad']);
const SEED_VENUES = new Set(['teatro-colon', 'mnba', 'palacio-libertad']);

interface ApiEvent {
  id: string;
  slug: string;
  title: string;
  acceso: string;
  fechasDelEvento: string[];
}
function apiEvents(file: string): ApiEvent[] {
  return (JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as { events: ApiEvent[] }).events;
}
const PAGE1 = '021-linda-api-frontend-events-filter-limit200.json';
const PAGE2 = '022-linda-api-frontend-events-filter-limit200-page2.json';

interface Parsed {
  raw: RawRecord;
  api: ApiEvent;
  event: NormalizedEvent | null;
  warnings: string[];
  errors: string[];
  status: 'ok' | 'incomplete' | 'invalid';
  reasons: string[];
}

/** discover + parse + zod + publicabilidad (sin base: los slugs del seed se dan por conocidos). */
async function runAll(): Promise<Map<string, Parsed>> {
  const http = new FixtureHttpClient(FIXTURES);
  const ctx = { http, logger: silentLogger, now: () => NOW };
  const raws = await connector.discover(ctx);
  const out = new Map<string, Parsed>();
  for (const raw of raws) {
    const api = JSON.parse(raw.body) as ApiEvent;
    const parsed = connector.parse(raw, ctx);
    if (!parsed.ok) {
      out.set(api.slug, {
        raw,
        api,
        event: null,
        warnings: [],
        errors: parsed.errors,
        status: 'invalid',
        reasons: [],
      });
      continue;
    }
    const event = NormalizedEventSchema.parse(parsed.event);
    const pub = assessPublishability(event, { now: NOW.toMillis(), knownVenueSlugs: SEED_VENUES });
    out.set(api.slug, {
      raw,
      api,
      event,
      warnings: parsed.warnings,
      errors: [],
      status: pub.publishable ? 'ok' : 'incomplete',
      reasons: pub.reasons,
    });
  }
  return out;
}

let all: Map<string, Parsed>;
beforeAll(async () => {
  all = await runAll();
});

function eventOf(slug: string): NormalizedEvent {
  const p = all.get(slug);
  if (!p?.event) throw new Error(`${slug}: ${p?.errors.join('; ') ?? 'no descubierto'}`);
  return p.event;
}

/** Cliente en memoria para simular una API que sí pagina. */
class StubHttpClient implements HttpClient {
  readonly stats = newStats();
  readonly urls: string[] = [];
  constructor(private readonly routes: Record<string, string>) {}
  async get(url: string): Promise<HttpResponse> {
    this.stats.requests += 1;
    this.urls.push(url);
    const body = this.routes[url];
    if (body === undefined) throw new Error(`sin ruta para ${url}`);
    return { status: 200, url, body, headers: { 'content-type': 'application/json' } };
  }
}

describe('agenda-ba · discover (fixtures 2026-10-14)', () => {
  it('una sola petición a la API devuelve los 268 eventos con id UUID y URL pública', async () => {
    const http = new FixtureHttpClient(FIXTURES);
    const raws = await connector.discover({ http, logger: silentLogger, now: () => NOW });
    expect(http.stats.requests).toBe(1);
    expect(http.stats.failures).toBe(0);
    expect(raws).toHaveLength(268);
    expect(new Set(raws.map((r) => r.externalId)).size).toBe(268);
    for (const r of raws) {
      expect(r.externalId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(r.url).toMatch(/^https:\/\/linda\.buenosaires\.gob\.ar\/eventos\/[a-z0-9-]+$/);
      expect(r.contentType).toBe('json');
      expect(r.fetchedAt).toBe('2026-10-14T12:00:00.000-03:00');
      expect((JSON.parse(r.body) as ApiEvent).id).toBe(r.externalId);
    }
    expect(raws[0]).toMatchObject({
      externalId: '9a565d18-ebb5-4de1-b5a5-b84048921540',
      url: LINDA('jorge-lavelli-el-gesto-incoformista'),
    });
  });

  it('respeta --limit sin pedir más', async () => {
    const http = new FixtureHttpClient(FIXTURES);
    const raws = await connector.discover({ http, logger: silentLogger, now: () => NOW, limit: 3 });
    expect(raws).toHaveLength(3);
    expect(http.stats.requests).toBe(1);
  });

  it('limit/page no paginan hoy: la respuesta trae el total completo (no se pide page=2)', () => {
    const page1 = JSON.parse(readFileSync(join(FIXTURES, PAGE1), 'utf8'));
    const page2 = JSON.parse(readFileSync(join(FIXTURES, PAGE2), 'utf8'));
    expect(page1.pagination).toEqual({ page: 1, limit: 200, total: 268, totalPages: 2 });
    expect(looksTruncated(page1)).toBe(false);
    expect(looksTruncated(page2)).toBe(false);
  });

  it('si la API llegara a paginar: pide page=2 (máximo 2 peticiones) y une por id', async () => {
    const full = apiEvents(PAGE1);
    const truncated = {
      filters: {},
      events: full.slice(0, 200),
      // total = lo que efectivamente cubren las dos páginas (si no, discover lanza: ver abajo).
      pagination: { page: 1, limit: 200, total: 266, totalPages: 2 },
    };
    const http = new StubHttpClient({
      [LIST_URL]: JSON.stringify(truncated),
      [`${LIST_URL}&page=2`]: readFileSync(join(FIXTURES, PAGE2), 'utf8'),
    });
    const raws = await connector.discover({ http, logger: silentLogger, now: () => NOW });
    expect(http.urls).toEqual([LIST_URL, `${LIST_URL}&page=2`]);
    // 200 de la primera + 66 de page=2 que no estaban; los 186 repetidos se descartan.
    expect(raws).toHaveLength(266);
    expect(new Set(raws.map((r) => r.externalId)).size).toBe(266);
    // Mismo id con slug distinto en page=2 ("homenaje-al-rock-nacional"): gana la primera aparición.
    const clasicos = raws.find((r) => r.externalId === 'dbacb4a9-f334-47d5-9a6b-66dc13fa4972');
    expect(clasicos?.url).toBe(
      LINDA('clasicos-del-rock-nacional-por-la-banda-sinfonica-de-la-ciudad-0'),
    );
  });

  it('si las dos páginas no cubren el total anunciado, falla en vez de devolver un descubrimiento parcial', async () => {
    const full = apiEvents(PAGE1);
    const truncated = {
      filters: {},
      events: full.slice(0, 200),
      pagination: { page: 1, limit: 200, total: 268, totalPages: 2 },
    };
    const http = new StubHttpClient({
      [LIST_URL]: JSON.stringify(truncated),
      [`${LIST_URL}&page=2`]: readFileSync(join(FIXTURES, PAGE2), 'utf8'),
    });
    await expect(
      connector.discover({ http, logger: silentLogger, now: () => NOW }),
    ).rejects.toThrow('la API anuncia 268 eventos y se obtuvieron 266 en 2 petición(es)');
  });

  it('falla con claridad si la API no trae eventos', async () => {
    const http = new StubHttpClient({ [LIST_URL]: JSON.stringify({ events: [], pagination: {} }) });
    await expect(
      connector.discover({ http, logger: silentLogger, now: () => NOW }),
    ).rejects.toThrow(/ningún evento/);
    const html = new StubHttpClient({ [LIST_URL]: '<!DOCTYPE html><html>error</html>' });
    await expect(
      connector.discover({ http: html, logger: silentLogger, now: () => NOW }),
    ).rejects.toThrow(/no devolvió JSON/);
  });
});

describe('agenda-ba · URL pública verificada contra los detalles 025–030', () => {
  const slugs = [
    'jorge-lavelli-el-gesto-incoformista',
    'la-lluvia-de-fuego',
    'babasonicos',
    'noche-de-cupulas-presenta-get-back',
    'el-barbero-de-sevilla-1',
    'frank-borzage-un-romantico-en-hollywood-parte-1',
  ];
  it.each(slugs)('%s: /eventos/<slug> sirve el h1 y el acceso del JSON', async (slug) => {
    const api = apiEvents(PAGE1).find((e) => e.slug === slug);
    expect(api).toBeDefined();
    const http = new FixtureHttpClient(FIXTURES);
    const res = await http.get(eventPageUrl(slug));
    const $ = load(res.body);
    expect($('h1').first().text().trim()).toBe(api?.title.trim());
    const label = api?.acceso === 'sin_costo' ? 'Libre y gratuita' : 'Con entrada paga';
    expect(res.body).toContain(label);
  });
});

describe('agenda-ba · parse de TODOS los ítems', () => {
  it('ninguno inválido; 230 publicables y 38 candidatos con motivo', () => {
    const counts = { ok: 0, incomplete: 0, invalid: 0 };
    for (const p of all.values()) counts[p.status] += 1;
    expect(counts).toEqual({ ok: 230, incomplete: 38, invalid: 0 });

    const byReason: Record<string, string[]> = {};
    for (const [slug, p] of all) {
      if (p.status !== 'incomplete') continue;
      const key = p.reasons.join(',');
      byReason[key] = [...(byReason[key] ?? []), slug];
    }
    // Varias sedes / sin ubicación: la dirección no se atribuye → missing:venue.
    expect(byReason['missing:venue']?.sort()).toEqual([
      'circuitos-del-diseno-mes-del-diseno-y-la-arquitectura',
      'jornadas-de-adopcion',
      'las-tres-ecologias-solaroid',
      'mubi-fest-2026-buenos-aires',
      'xx-bienal-internacional-de-arquitectura-de-buenos-aires',
    ]);
    expect(byReason['missing:venue,missing:discipline']).toEqual([
      'acceleration-week-foodrise-2026',
    ]);
    // El texto del ítem publica horas o fechas que no coinciden con fechasDelEvento: no se
    // sabe cuál es la verdadera, no se emiten funciones (ver 'contradicción texto ↔ estructura').
    expect(byReason['missing:occurrences']?.sort()).toEqual([
      'camila',
      'daniela-milagros-0',
      'invasiones-i',
      'la-verdadera-historia-de-ricardo-iii',
    ]);
    expect(byReason['missing:occurrences,missing:discipline']?.sort()).toEqual([
      'mundial-de-powerchair-football',
      'saucony-baires-15-y-5k',
    ]);
    // Solo etiquetas no culturales (Tecweek y Deporte).
    expect(byReason['missing:discipline']).toHaveLength(26);
    for (const slug of byReason['missing:discipline'] ?? []) {
      const tags = eventOf(slug).tags;
      expect(tags.every((t) => t === 'Tecweek' || t === 'Deporte')).toBe(true);
    }
  });

  it('nunca inventa: horas, fechas, direcciones, precios, gratuidad e imágenes salen del JSON', () => {
    let timed = 0;
    let ranges = 0;
    let totalInstants = 0;
    for (const p of all.values()) {
      const e = p.event;
      if (!e) continue;
      totalInstants += p.api.fechasDelEvento.length;
      expect(e.source).toBe('agenda-ba');
      expect(e.externalId).toBe(p.api.id);
      expect(e.url).toBe(LINDA(p.api.slug));
      expect(e.officialUrl).toBe(e.url);
      expect(e.attribution).toBe('Texto: Linda, agenda oficial de la Ciudad de Buenos Aires');
      // Institución: del seed o con nombre para crearla.
      if (!SEED_INSTITUTIONS.has(e.institutionSlug)) expect(e.institutionName).toBeTruthy();
      if (e.imageUrl)
        expect(e.imageUrl).toMatch(/^https:\/\/buenosaires\.gob\.ar\/sites\/default\/files\//);
      // Gratuidad = acceso, salvo que las entradas se vendan en una ticketera comercial.
      const commercial = p.warnings.some((w) => w.includes('se venden en una ticketera'));
      if (commercial) expect(e.isFree).toBeUndefined();
      else expect(e.isFree).toBe(p.api.acceso === 'sin_costo');
      if (e.priceVerified) {
        expect(e.priceText).toEqual(
          e.isFree ? 'Libre y gratuita' : expect.stringMatching(/\$\s?\d/),
        );
      }
      expect(e.description ?? '').not.toMatch(/Este es un espacio de difusión abierto/);
      for (const o of e.occurrences) {
        expect(o.timezone).toBe('America/Argentina/Buenos_Aires');
        expect(o.startsAt).toMatch(/-03:00$/);
        expect(o.kind).not.toBe('all_day');
        if (o.venue?.address) expect(o.venue.addressSourceUrl).toBe(e.officialUrl);
        if (o.venue?.slug) expect(SEED_VENUES.has(o.venue.slug)).toBe(true);
        if (o.price) expect(o.price.verified).toBe(true);
        if (o.kind === 'timed') {
          timed += 1;
          expect(o.endsAt).toBeNull();
          expect(p.api.fechasDelEvento).toContain(o.sourceDateText);
          // Mismo instante que publica la API, expresado en -03:00.
          expect(Date.parse(o.startsAt)).toBe(Date.parse(o.sourceDateText ?? ''));
          expect(o.startsAt).not.toMatch(/T00:00:00-03:00$/);
          const utc = DateTime.fromISO(o.sourceDateText ?? '', { zone: 'utc' });
          expect(o.externalId).toBe(`${e.externalId}|${utc.toISO({ suppressMilliseconds: true })}`);
        } else {
          ranges += 1;
          const published = new Set(
            p.api.fechasDelEvento.map((iso) =>
              DateTime.fromISO(iso).setZone('America/Argentina/Buenos_Aires').toISODate(),
            ),
          );
          // Cada día dentro del rango es un día que Linda publica: no se afirman días cerrados.
          for (
            let d = DateTime.fromISO(o.startDate);
            (d.toISODate() ?? '') <= o.endDate;
            d = d.plus({ days: 1 })
          ) {
            expect(published.has(d.toISODate())).toBe(true);
          }
          expect(o.endsAt).toMatch(/T23:59:59-03:00$/);
          expect(o.externalId).toBe(`${e.externalId}|tramo|${o.endDate}`);
        }
      }
    }
    expect(ranges).toBe(81);
    expect(timed).toBe(684);
    // Los instantes que no van como función están en un rango de muestra o en un ítem cuyo
    // texto los contradice (o son a medianoche, que no se emiten).
    expect(totalInstants).toBe(1179);
    let accounted = 0;
    for (const p of all.values()) {
      const e = p.event;
      if (!e) continue;
      const dropped = p.warnings.some((w) => w.includes('no se emiten funciones'));
      const exhibition = e.occurrences.some((o) => o.kind === 'range');
      if (dropped || exhibition) accounted += p.api.fechasDelEvento.length;
    }
    expect(timed).toBeLessThanOrEqual(totalInstants - accounted);
  });

  it('muestras detectadas (tramos range de días publicados)', () => {
    const exhibitions = [...all.entries()]
      .filter(([, p]) => p.event?.occurrences.some((o) => o.kind === 'range'))
      .map(([slug]) => slug)
      .sort();
    expect(exhibitions).toEqual([
      'casa-foa-2026-buenos-aires-edicion-palacio-molina',
      // Tecweek "Exposición y conferencia": muestra por E1; queda candidato por disciplina.
      'crossing-over-biotech',
      'el-otro-perotta-en-el-museo-de-la-ciudad',
      'exposicion-fotografica-entre-retratos',
      'jorge-lavelli-el-gesto-incoformista',
      'la-isla-el-teatro-san-martin-en-dictaduras',
      'la-riqueza-del-monte-museo-de-arte-popular',
      'thomas-demand-el-tartamudeo-de-la-historia',
      'viva-frida',
      'xx-bienal-internacional-de-arquitectura-de-buenos-aires',
    ]);
  });

  it('instituciones del seed: Colón (enlace o sala, incl. CETC) y Complejo Teatral (enlace o sala)', () => {
    const bySlug = (inst: string) =>
      [...all.entries()]
        .filter(([, p]) => p.event?.institutionSlug === inst)
        .map(([slug]) => slug)
        .sort();
    expect(bySlug('teatro-colon')).toEqual([
      'berliner-philharmoniker',
      'ciclo-grandes-interpretes-del-teatro-colon',
      'concierto-entre-almohadones',
      'die-walkure-richard-wagner',
      'el-barbero-de-sevilla-1',
      'freddie-de-tommaso-y-nadine-sierra',
      'las-ruinas-delirios-sobre-la-argentina',
      'los-cuentos-de-hoffmann',
      'manon',
      'vida-de-heroe-la-orquesta-filarmonica-de-buenos-aires',
    ]);
    expect(bySlug('complejo-teatral')).toHaveLength(23);
    expect(bySlug('mnba')).toEqual([]);
    expect(bySlug('palacio-libertad')).toEqual([]);
    // Ballets y obras coreográficas del Colón (el resumen lo dice) son danza; el resto, ópera/clásica.
    const dance = new Set(['manon', 'las-ruinas-delirios-sobre-la-argentina']);
    for (const slug of bySlug('teatro-colon')) {
      expect(eventOf(slug).disciplines).toEqual([dance.has(slug) ? 'danza' : 'opera_clasica']);
    }
  });
});

describe('agenda-ba · eventos verificados a mano contra el JSON (fixture 021)', () => {
  it('EL BARBERO DE SEVILLA: institución del seed por enlace teatrocolon.org.ar, venue seed', () => {
    const e = eventOf('el-barbero-de-sevilla-1');
    expect(e.externalId).toBe('ede41966-e6d9-4f2d-b2fc-98c8e3d9200b');
    expect(e.title).toBe('El Barbero De Sevilla');
    expect(e.institutionSlug).toBe('teatro-colon');
    expect(e.institutionName).toBeUndefined();
    expect(e.disciplines).toEqual(['opera_clasica']);
    expect(e.ticketsUrl).toBe('https://teatrocolon.org.ar/produccion/el-barbero-de-sevilla/');
    expect(e.isFree).toBe(false);
    expect(e.priceText).toBeUndefined();
    expect(e.description).toMatch(
      /^Ópera en un acto, adaptada en versión libre, en el Teatro Colón\./,
    );
    // <details><summary>Reparto</summary><p>… → líneas separadas.
    expect(e.description).toContain(
      '\n\nReparto\nAlumnos y exalumnos de la Carrera de Canto Lírico',
    );
    // "fechasDelEvento":["2026-10-11T14:00:00.000Z","2026-10-16T18:00:00.000Z"]
    // = "domingo 11 de octubre a las 11:00, y el viernes 16 a las 15:00 horas".
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-11T11:00:00-03:00',
      '2026-10-16T15:00:00-03:00',
    ]);
    // Venue del seed: no se copia "Tucumán 1171" (boletería) de Linda; su punto sí, que cae
    // en la misma manzana y alcanza para validar check-ins.
    expect(e.occurrences[0]?.venue).toEqual({
      slug: 'teatro-colon',
      name: 'Teatro Colón',
      coords: { lat: -34.60136047, lng: -58.38316734 },
    });
  });

  it('FRANK BORZAGE: Complejo Teatral por enlace complejoteatral.gob.ar; sala con dirección publicada', () => {
    const e = eventOf('frank-borzage-un-romantico-en-hollywood-parte-1');
    expect(e.institutionSlug).toBe('complejo-teatral');
    expect(e.disciplines).toEqual(['cine']);
    expect(e.ticketsUrl).toBe(
      'https://complejoteatral.gob.ar/ver/Frank-Borzage,-un-rom%C3%A1ntico-en-Hollywood%20%E2%80%93%20Parte-1',
    );
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-13T15:00:00-03:00',
      '2026-10-14T15:00:00-03:00',
    ]);
    expect(e.occurrences[0]?.venue).toEqual({
      name: 'Teatro San Martín',
      address: 'Avenida Corrientes 1530, C1042AAO Buenos Aires AR, Argentina',
      addressSourceUrl: LINDA('frank-borzage-un-romantico-en-hollywood-parte-1'),
      coords: { lat: -34.6042656, lng: -58.38851565 },
    });
  });

  it('BABASÓNICOS: institución nueva (Movistar Arena) con sitio publicado; texto viejo de "agotada" ignorado', () => {
    const e = eventOf('babasonicos');
    expect(e.institutionSlug).toBe('movistar-arena');
    expect(e.institutionName).toBe('Movistar Arena');
    expect(e.institutionUrl).toBe('https://www.movistararena.com.ar/');
    expect(e.disciplines).toEqual(['musica_vivo_jazz']);
    expect(e.ticketsUrl).toBe(
      'https://www.movistararena.com.ar/show/5e9d16cc-6d19-40a3-9727-b736284efae3',
    );
    expect(e.imageUrl).toBe(
      'https://buenosaires.gob.ar/sites/default/files/2026-05/Babasonicos.jpg',
    );
    expect(e.isFree).toBe(false);
    // ["2026-10-17T00:00:00.000Z","2026-10-18T00:00:00.000Z"] = vie 16 y sáb 17, 21:00 BA.
    expect(e.occurrences).toEqual([
      expect.objectContaining({
        externalId: 'f2272184-c107-40fb-8d23-b8e8c3bd8346|2026-10-17T00:00:00Z',
        kind: 'timed',
        startsAt: '2026-10-16T21:00:00-03:00',
        startDate: '2026-10-16',
        status: 'scheduled',
        venue: {
          name: 'Movistar Arena',
          address: 'Humboldt 450',
          addressSourceUrl: LINDA('babasonicos'),
          coords: { lat: -34.59500952, lng: -58.44820854 },
        },
        price: null,
      }),
      expect.objectContaining({ startsAt: '2026-10-17T21:00:00-03:00', status: 'scheduled' }),
    ]);
    // "La primera fecha, el 25 de junio, ya se encuentra agotada" (texto heredado) no es estado.
    expect(e.description).toContain('ya se encuentra agotada');
  });

  it('LA RIQUEZA DEL MONTE: muestra de 97 días → un rango con el horario literal; institución nueva', () => {
    const e = eventOf('la-riqueza-del-monte-museo-de-arte-popular');
    expect(e.institutionSlug).toBe('museo-de-arte-popular-jose-hernandez');
    expect(e.institutionName).toBe('Museo de Arte Popular José Hernández');
    expect(e.institutionUrl).toBeUndefined();
    expect(e.disciplines).toEqual(['museos_exposiciones']);
    expect(e.isFree).toBe(false);
    // Cerrado los martes: Linda no publica esos días, así que salen 19 tramos continuos.
    expect(e.occurrences).toHaveLength(19);
    expect(e.occurrences[0]).toEqual({
      externalId: 'b2c37d40-a4a7-4044-b8fa-2fdbf86c4272|tramo|2026-10-12',
      kind: 'range',
      startsAt: '2026-10-09T00:00:00-03:00',
      endsAt: '2026-10-12T23:59:59-03:00',
      startDate: '2026-10-09',
      endDate: '2026-10-12',
      timezone: 'America/Argentina/Buenos_Aires',
      scheduleText:
        'Horario: lunes, miércoles, jueves y viernes de 11 a 19 h. Sábados, domingos y feriados de 11 a 20 h.',
      recurrenceRule: null,
      sourceDateText: '2026-10-09T14:00:00.000Z … 2026-10-12T14:00:00.000Z (4 fechas publicadas)',
      venue: {
        name: 'Museo de Arte Popular José Hernández',
        address: 'Av. del Libertador 2373',
        addressSourceUrl: LINDA('la-riqueza-del-monte-museo-de-arte-popular'),
        coords: { lat: -34.57969565, lng: -58.40503706 },
      },
      status: 'scheduled',
      ticketsUrl: null,
      price: null,
    });
    expect(e.occurrences[1]).toMatchObject({ startDate: '2026-10-14', endDate: '2026-10-18' });
    expect(e.occurrences.at(-1)).toMatchObject({ startDate: '2027-01-27', endDate: '2027-02-01' });
  });

  it('JORGE LAVELLI: muestra gratuita del Complejo Teatral por sala (sin enlace)', () => {
    const e = eventOf('jorge-lavelli-el-gesto-incoformista');
    expect(e.institutionSlug).toBe('complejo-teatral');
    expect(e.isFree).toBe(true);
    expect(e.priceText).toBe('Libre y gratuita');
    expect(e.priceVerified).toBe(true);
    expect(e.ticketsUrl).toBeUndefined();
    expect(e.disciplines).toEqual(['museos_exposiciones']);
    // Cerrado los lunes: cuatro tramos de días publicados, del 9/10 al 1/11.
    expect(e.occurrences.map((o) => `${o.startDate}..${o.endDate}`)).toEqual([
      '2026-10-09..2026-10-11',
      '2026-10-13..2026-10-18',
      '2026-10-20..2026-10-25',
      '2026-10-27..2026-11-01',
    ]);
    expect(e.occurrences[0]).toMatchObject({
      kind: 'range',
      startDate: '2026-10-09',
      endDate: '2026-10-11',
      scheduleText:
        'La muestra estará abierta al público de martes a viernes, de 14 a 21 horas, y los sábados y domingos de 13 a 20 horas, con entrada sin costo.',
      price: { text: 'Libre y gratuita', isFree: true, verified: true },
      venue: { name: 'Teatro San Martín', address: 'Av. Corrientes 1530' },
    });
  });

  it('SABE LA TIERRA EN BALVANERA: gratuito, barrio como ubicación → institución genérica', () => {
    const e = eventOf('sabe-la-tierra-en-balvanera');
    expect(e.isFree).toBe(true);
    expect(e.priceText).toBe('Libre y gratuita');
    expect(e.institutionSlug).toBe('agenda-ba');
    expect(e.institutionName).toBe('Agenda oficial de la Ciudad (Linda)');
    expect(e.institutionUrl).toBe('https://linda.buenosaires.gob.ar/');
    expect(e.disciplines).toEqual(['otros']);
    expect(e.tags).toEqual(['Ferias y exposiciones', 'Gastronomía']);
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-13T11:00:00-03:00',
      '2026-10-20T11:00:00-03:00',
      '2026-10-27T11:00:00-03:00',
    ]);
    // ubicacion {titulo: "Balvanera", direccion: "Pasaje Santos Discépolo y Corrientes"}.
    expect(e.occurrences[0]?.venue).toEqual({
      name: 'Pasaje Santos Discépolo y Corrientes',
      address: 'Pasaje Santos Discépolo y Corrientes',
      addressSourceUrl: LINDA('sabe-la-tierra-en-balvanera'),
      coords: { lat: -34.60445602, lng: -58.39357953 },
    });
    expect(e.occurrences[0]?.price).toEqual({
      text: 'Libre y gratuita',
      isFree: true,
      verified: true,
    });
  });

  it('NOCHE DE CÚPULAS: 6 funciones en 2 días, precio literal "$58.000", "reprogramada" condicional ignorado', () => {
    const e = eventOf('noche-de-cupulas-presenta-get-back');
    expect(e.title).toBe('Noche de Cúpulas presenta Get Back!');
    expect(e.institutionSlug).toBe('edificio-bencich');
    expect(e.institutionName).toBe('Edificio Bencich');
    expect(e.priceText).toBe('Entrada: $58.000');
    expect(e.priceVerified).toBe(true);
    expect(e.isFree).toBe(false);
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-24T17:00:00-03:00',
      '2026-10-24T19:00:00-03:00',
      '2026-10-24T21:00:00-03:00',
      '2026-10-25T17:00:00-03:00',
      '2026-10-25T19:00:00-03:00',
      '2026-10-25T21:00:00-03:00',
    ]);
    expect(e.occurrences.every((o) => o.status === 'scheduled')).toBe(true);
    expect(e.occurrences[0]?.price).toEqual({ text: 'Entrada: $58.000', verified: true });
    expect(e.occurrences[0]?.venue).toEqual({
      name: 'Edificio Bencich',
      address: 'SAENZ PEÑA, ROQUE, PRES. DIAGONAL NORTE AV. 615',
      addressSourceUrl: LINDA('noche-de-cupulas-presenta-get-back'),
      coords: { lat: -34.60677403, lng: -58.37551536 },
    });
  });

  it('VIVA FRIDA: 132 instantes con horas mezcladas (12, 11, 23 y 00 h) → tramos sin horario, sin los martes', () => {
    const e = eventOf('viva-frida');
    expect(e.institutionSlug).toBe('malba');
    expect(e.institutionName).toBe('MALBA');
    expect(e.occurrences).toHaveLength(25);
    for (const o of e.occurrences) {
      for (
        let d = DateTime.fromISO(o.startDate);
        (d.toISODate() ?? '') <= o.endDate;
        d = d.plus({ days: 1 })
      ) {
        expect(d.weekday).not.toBe(2); // martes: cerrado (Linda no los publica)
      }
    }
    expect(e.occurrences.at(-1)).toMatchObject({ endDate: '2027-03-15' });
    expect(e.occurrences[0]).toMatchObject({
      kind: 'range',
      startDate: '2026-10-09',
      endDate: '2026-10-12',
      scheduleText: null,
      ticketsUrl: 'https://malba.liit.com.ar/decidir/',
    });
    expect(all.get('viva-frida')?.warnings).toContain(
      'muestra sin horario de apertura en el texto',
    );
  });

  it('XX BIENAL ("Varias Sedes") y CAMPUS PARTY (Tecweek) quedan candidatos sin inventar', () => {
    const bienal = eventOf('xx-bienal-internacional-de-arquitectura-de-buenos-aires');
    // La dirección publicada (Av. del Libertador 1473) es de UNA de las seis sedes.
    expect(bienal.occurrences[0]?.venue).toEqual({ name: 'Varias Sedes' });
    expect(bienal.institutionSlug).toBe('agenda-ba');
    expect(all.get('xx-bienal-internacional-de-arquitectura-de-buenos-aires')?.reasons).toEqual([
      'missing:venue',
    ]);

    const campus = eventOf('campus-party');
    expect(campus.disciplines).toEqual([]);
    expect(campus.institutionSlug).toBe('ba-ferial-ex-costa-salguero');
    expect(campus.institutionName).toBe('BA ferial (ex Costa Salguero)');
    expect(all.get('campus-party')?.reasons).toEqual(['missing:discipline']);
  });

  it('LAS RUINAS (CETC): Colón por sala, venue con el nombre del conector institucional', () => {
    const e = eventOf('las-ruinas-delirios-sobre-la-argentina');
    expect(e.institutionSlug).toBe('teatro-colon');
    expect(e.occurrences[0]?.venue).toEqual({
      name: 'Centro de Experimentación del Teatro Colón (CETC)',
      address: 'Viamonte 1168',
      addressSourceUrl: LINDA('las-ruinas-delirios-sobre-la-argentina'),
      coords: { lat: -34.60046778, lng: -58.38343092 },
    });
    expect(eventOf('los-cuentos-de-hoffmann').ticketsUrl).toBe(
      'https://entradasba.buenosaires.gob.ar/evento/8df036b4-df44-49bf-aafb-2402f5ea675e',
    );
  });

  // Extensión .json.txt a propósito: Biome reformatea .json y rompería el snapshot.
  it('snapshot del normalizado de dos eventos', async () => {
    const strip = (e: NormalizedEvent) => {
      const { rawFragment: _raw, ...rest } = e;
      return rest;
    };
    const snapshot = JSON.stringify(
      [
        strip(eventOf('el-barbero-de-sevilla-1')),
        strip(eventOf('jorge-lavelli-el-gesto-incoformista')),
      ],
      null,
      2,
    );
    await expect(snapshot).toMatchFileSnapshot(
      './__snapshots__/barbero-lavelli.normalized.json.txt',
    );
  });
});

describe('agenda-ba · fechas (puro)', () => {
  it('parseInstants: ordena, deduplica, pasa a -03:00 y marca la medianoche local', () => {
    const r = parseInstants([
      '2026-10-18T00:00:00.000Z',
      '2026-10-17T03:00:00.000Z',
      '2026-10-18T00:00:00.000Z',
      'basura',
    ]);
    expect(r.instants.map((i) => [i.startsAt, i.localTime, i.midnight])).toEqual([
      ['2026-10-17T00:00:00-03:00', '00:00', true],
      ['2026-10-17T21:00:00-03:00', '21:00', false],
    ]);
    expect(r.warnings).toEqual(['instante ilegible en fechasDelEvento: "basura"']);
  });

  const ctx = {
    eventId: 'x',
    venue: { name: 'Sala' },
    ticketsUrl: null,
    price: null,
    status: 'scheduled' as const,
    bodyText: 'Abierta de martes a domingos de 11 a 20 h.',
  };

  it('función a medianoche local = fecha sin hora: no se emite', () => {
    const { instants } = parseInstants(['2026-10-17T03:00:00.000Z', '2026-10-18T00:00:00.000Z']);
    const r = buildOccurrences(instants, { ...ctx, exhibition: false });
    expect(r.occurrences.map((o) => o.startsAt)).toEqual(['2026-10-17T21:00:00-03:00']);
    expect(r.warnings).toEqual([
      '2026-10-17: instante a medianoche local (fecha sin hora), omitido',
    ]);
  });

  it('muestra: tramos de días publicados consecutivos (incluye días a medianoche) con horario literal', () => {
    const { instants } = parseInstants([
      '2026-10-17T03:00:00.000Z', // sáb 17 a medianoche: cuenta como día publicado
      '2026-10-18T14:00:00.000Z',
      '2026-10-20T14:00:00.000Z', // lun 19 sin fecha: corta el tramo
      '2026-10-21T15:00:00.000Z',
    ]);
    const r = buildOccurrences(instants, { ...ctx, exhibition: true });
    expect(r.occurrences).toEqual([
      expect.objectContaining({
        externalId: 'x|tramo|2026-10-18',
        kind: 'range',
        startDate: '2026-10-17',
        endDate: '2026-10-18',
        startsAt: '2026-10-17T00:00:00-03:00',
        endsAt: '2026-10-18T23:59:59-03:00',
        scheduleText: 'Abierta de martes a domingos de 11 a 20 h.',
      }),
      expect.objectContaining({
        externalId: 'x|tramo|2026-10-21',
        startDate: '2026-10-20',
        endDate: '2026-10-21',
      }),
    ]);
    // El id del tramo es su FIN: cuando Linda recorta el pasado, el tramo conserva su id.
    const trimmed = buildOccurrences(
      parseInstants([
        '2026-10-18T14:00:00.000Z',
        '2026-10-21T15:00:00.000Z',
        '2026-10-20T14:00:00.000Z',
      ]).instants,
      { ...ctx, exhibition: true },
    );
    expect(trimmed.occurrences.map((o) => o.externalId)).toEqual([
      'x|tramo|2026-10-18',
      'x|tramo|2026-10-21',
    ]);
    expect(buildOccurrences([], { ...ctx, exhibition: false }).occurrences).toEqual([]);
  });

  it('regla de muestra: E1 (se nombra así) + E2 (≥ 2 días) + E3 (no artes en vivo)', () => {
    const base = {
      title: 'La riqueza del monte',
      summary: 'Una muestra celebra 25 años de trabajo.',
      etiquetaKeys: ['arte y cultura'],
      lugar: 'museos_y',
      distinctDays: 30,
      performingEtiquetas: PERFORMING_ETIQUETAS,
    };
    expect(isExhibition(base)).toBe(true);
    // Linda recorta el pasado: una muestra en su última semana puede tener pocos días.
    expect(isExhibition({ ...base, distinctDays: 2 })).toBe(true);
    expect(isExhibition({ ...base, distinctDays: 1 })).toBe(false);
    expect(isExhibition({ ...base, etiquetaKeys: ['teatro y artes escenicas'] })).toBe(false);
    expect(
      isExhibition({
        ...base,
        etiquetaKeys: ['teatro y artes escenicas', 'ferias y exposiciones'],
      }),
    ).toBe(true);
    // Verbo "muestra" (hanguk-fest) y "exhibición" deportiva de un día no cuentan.
    expect(
      isExhibition({
        ...base,
        summary: 'Una experiencia que muestra por qué Corea es referencia.',
      }),
    ).toBe(false);
    expect(isExhibition({ ...base, summary: 'Una noche de exhibición', distinctDays: 1 })).toBe(
      false,
    );
    // Sin la palabra pero etiquetada "Ferias y exposiciones" en un museo (el-otro-perotta).
    expect(
      isExhibition({
        ...base,
        summary: 'Material inédito del archivo.',
        etiquetaKeys: ['arte y cultura', 'ferias y exposiciones'],
      }),
    ).toBe(true);
  });

  it('horario de apertura: oraciones literales, sin cortar en "Av." ni dentro de comillas', () => {
    const text =
      'En el subsuelo de la Casa de la Cultura. “La isla. El Teatro San Martín en dictaduras” permanecerá abierta entre el 15 de septiembre y el 28 de noviembre, de lunes a sábado de 11 a 20 horas, con entrada sin costo, en la Casa de la Cultura (Av. de Mayo 575).';
    expect(extractOpeningHoursText(text)).toBe(
      '“La isla. El Teatro San Martín en dictaduras” permanecerá abierta entre el 15 de septiembre y el 28 de noviembre, de lunes a sábado de 11 a 20 horas, con entrada sin costo, en la Casa de la Cultura (Av. de Mayo 575).',
    );
    expect(extractOpeningHoursText('Funciones a las 20 h. Duración 60 minutos.')).toBeNull();
    expect(splitSentences('Uno. Dos 11.30 h. Tres!')).toEqual(['Uno.', 'Dos 11.30 h.', 'Tres!']);
  });
});

describe('agenda-ba · disciplinas (tabla explícita)', () => {
  const map = (over: Partial<Parameters<typeof mapDisciplines>[0]>) =>
    mapDisciplines({
      etiquetas: [],
      title: 'Título',
      institutionSlug: 'otra',
      isExhibition: false,
      ...over,
    });

  it('etiquetas con U+200B y combinaciones', () => {
    expect(
      map({ etiquetas: ['Teatro\u200B y artes escénicas', 'Arte y cultura'] }).disciplines,
    ).toEqual(['teatro_escenicas']);
    expect(map({ etiquetas: ['\u200BRecorridos y visitas guiadas'] }).disciplines).toEqual([
      'historia_patrimonio',
    ]);
    expect(map({ etiquetas: ['Charlas\u200B y encuentros'] }).disciplines).toEqual([
      'literatura_charlas',
    ]);
    expect(map({ etiquetas: ['Cine', 'Arte y cultura'] }).disciplines).toEqual(['cine']);
    expect(map({ etiquetas: ['Música y Shows', 'Entretenimiento'] }).disciplines).toEqual([
      'musica_vivo_jazz',
    ]);
    expect(map({ etiquetas: ['Arte y cultura'], lugar: 'museos_y' }).disciplines).toEqual([
      'museos_exposiciones',
    ]);
    expect(
      map({ tipoEvento: 'descubrir_la_ciudad', etiquetas: ['Arte y cultura'] }).disciplines,
    ).toEqual(['historia_patrimonio']);
  });

  it('cultural no mapeable → otros; no cultural o sin datos → [] con aviso', () => {
    expect(map({ etiquetas: ['Arte y cultura'] }).disciplines).toEqual(['otros']);
    expect(map({ etiquetas: ['Entretenimiento'] }).disciplines).toEqual(['otros']);
    expect(map({ etiquetas: ['Ferias y exposiciones', 'Gastronomía'] }).disciplines).toEqual([
      'otros',
    ]);
    const tec = map({ etiquetas: ['Tecweek'] });
    expect(tec.disciplines).toEqual([]);
    expect(tec.warnings).toEqual(['sin disciplina cultural: etiquetas [Tecweek]']);
    expect(map({ etiquetas: ['Deporte'] }).disciplines).toEqual([]);
    expect(map({}).disciplines).toEqual([]);
    const unknown = map({ etiquetas: ['Circo'] });
    expect(unknown.disciplines).toEqual(['otros']);
    expect(unknown.warnings).toEqual(['categoría sin mapeo: "circo" → otros']);
  });

  it('ajustes: muestra, Colón, títulos inequívocos', () => {
    expect(map({ etiquetas: ['Ferias y exposiciones'], isExhibition: true }).disciplines).toEqual([
      'museos_exposiciones',
    ]);
    expect(
      map({ etiquetas: ['Teatro y artes escénicas'], institutionSlug: 'teatro-colon' }).disciplines,
    ).toEqual(['opera_clasica']);
    expect(
      map({ etiquetas: ['Música y Shows'], title: 'José Luis Juri | Recital de piano' })
        .disciplines,
    ).toEqual(['opera_clasica']);
    expect(
      map({ etiquetas: ['Música y Shows'], title: 'Bianca Del Rio en el Teatro Ópera' })
        .disciplines,
    ).toEqual(['musica_vivo_jazz']);
    expect(
      map({ etiquetas: ['Teatro y artes escénicas'], title: 'Paisajes coreográficos' }).disciplines,
    ).toEqual(['danza']);
    expect(
      map({
        etiquetas: ['Ferias y exposiciones'],
        title: 'Exposición fotográfica | Entre Retratos',
        isExhibition: true,
      }).disciplines,
    ).toEqual(['museos_exposiciones', 'fotografia_artes_visuales']);
  });
});

describe('agenda-ba · lugares, enlaces, precio y estado (puro)', () => {
  const officialUrl = LINDA('x');

  it('clasificación de ubicaciones', () => {
    expect(classifyPlace('Teatro Colón', 'Tucumán 1171', 'san_nicolas')).toBe('known');
    expect(classifyPlace('Palermo', 'Avenida Figueroa Alcorta y Dorrego', 'palermo')).toBe('area');
    expect(classifyPlace('Microcentro', 'Av. Saenz Peña y Florida', 'san_nicolas')).toBe('area');
    expect(
      classifyPlace(
        'Avenida de Mayo 575',
        'Avenida de Mayo 575, C1084AAA Buenos Aires AR, Argentina',
        'san_nicolas',
      ),
    ).toBe('address');
    expect(classifyPlace('Dumont 4040', 'Santos Dumont 4040', 'chacarita')).toBe('space');
    expect(classifyPlace('Varias Sedes', 'Av. del Libertador 1473', 'recoleta')).toBe('multi_site');
    expect(classifyPlace(null, null, null)).toBe('none');
  });

  it('el enlace institucional manda sobre la sala; seed sin dirección; alias de espacios', () => {
    const linked = resolvePlace({
      title: 'Casa de la Cultura',
      address: 'Av. de Mayo 575',
      barrio: 'san_nicolas',
      links: ['https://complejoteatral.gob.ar/ver/La-isla'],
      officialUrl,
    });
    expect(linked.institution).toEqual({ slug: 'complejo-teatral', via: 'link' });
    expect(linked.venue).toEqual({
      name: 'Casa de la Cultura',
      address: 'Av. de Mayo 575',
      addressSourceUrl: officialUrl,
    });

    const palacio = resolvePlace({
      title: 'Palacio Libertad Domingo F. Sarmiento',
      address: 'Sarmiento 151',
      barrio: 'san_nicolas',
      links: [],
      officialUrl,
    });
    expect(palacio.institution).toEqual({ slug: 'palacio-libertad', via: 'place' });
    expect(palacio.venue).toEqual({ slug: 'palacio-libertad', name: 'Palacio Libertad' });

    const mnba = resolvePlace({
      title: 'Feria',
      address: null,
      barrio: null,
      links: ['https://www.bellasartes.gob.ar/agenda/x'],
      officialUrl,
    });
    expect(mnba.institution.slug).toBe('mnba');
    expect(mnba.venue).toEqual({ name: 'Feria' });

    const salguero = resolvePlace({
      title: 'BAferial (ex Costa Salguero)',
      address: 'Av. Costanera Rafael Obligado 1221',
      barrio: 'palermo',
      links: [],
      officialUrl,
    });
    expect(salguero.institution).toEqual({
      slug: 'ba-ferial-ex-costa-salguero',
      name: 'BA ferial (ex Costa Salguero)',
      via: 'derived',
    });

    const none = resolvePlace({ title: null, address: null, barrio: null, links: [], officialUrl });
    expect(none.venue).toBeNull();
    expect(none.institution.slug).toBe('agenda-ba');
  });

  it('coordenadas solo para un lugar identificado y dentro de CABA', () => {
    const at = (title: string, address: string | null, lat: number, lng: number) =>
      resolvePlace({ title, address, barrio: null, links: [], officialUrl, lat, lng });
    expect(
      at('Usina del Arte', 'Agustín R. Caffarena 1', -34.6289, -58.3563).venue?.coords,
    ).toEqual({ lat: -34.6289, lng: -58.3563 });
    expect(at('Teatro Colón', 'Tucumán 1171', -34.6014, -58.3832).venue).toEqual({
      slug: 'teatro-colon',
      name: 'Teatro Colón',
      coords: { lat: -34.6014, lng: -58.3832 },
    });
    // Linda ubica La Trastienda en Santiago del Estero.
    const far = at('La Trastienda', 'Balcarce 460', -27.798349, -64.246901);
    expect(far.venue?.coords).toBeUndefined();
    expect(far.warnings.join()).toContain('fuera de CABA');
    expect(at('Varias Sedes', 'Av. del Libertador 1473', -34.5841, -58.3932).venue).toEqual({
      name: 'Varias Sedes',
    });
  });

  it('URLs de entradas sin parámetros de campaña ni fragmento; query original intacta', () => {
    expect(
      cleanTrackingUrl(
        'https://www.tuentrada.com/filarmonica-de-berlin-tc?gad_source=1&gad_campaignid=2&gbraid=x&gclid=y',
      ),
    ).toBe('https://www.tuentrada.com/filarmonica-de-berlin-tc');
    expect(
      cleanTrackingUrl(
        'https://www.plateanet.com/obra/35372?obra=LA%20ZARANDA%20-%20TODOS&paso=inicio&utm_source=x',
      ),
    ).toBe('https://www.plateanet.com/obra/35372?obra=LA%20ZARANDA%20-%20TODOS&paso=inicio');
    expect(
      cleanTrackingUrl(
        'https://www.ticketek.com.ar/invasiones-i/teatro-san-martin#chunk-collapse-main-0',
      ),
    ).toBe('https://www.ticketek.com.ar/invasiones-i/teatro-san-martin');
    expect(cleanTrackingUrl('mailto:info@x.com')).toBeNull();
    expect(
      pickTicketsUrl([
        { uri: 'https://www.alianzafrancesa.org.ar/cultura/x', title: 'Más información' },
        {
          uri: 'https://docs.google.com/forms/d/abc/viewform?usp=sf_link',
          title: 'Inscribite acá',
        },
      ]),
    ).toBe('https://docs.google.com/forms/d/abc/viewform?usp=sf_link');
    expect(
      pickTicketsUrl([{ uri: 'https://www.alianzafrancesa.org.ar/x', title: 'Más información' }]),
    ).toBeNull();
  });

  it('precio: solo una línea que empieza con la etiqueta y trae monto', () => {
    expect(extractPriceText('Texto.\n🎟️ Entrada: $58.000\nOtra cosa')).toBe('Entrada: $58.000');
    expect(
      extractPriceText(
        'Valor de las localidades: Entrada general $ 9.000 Estudiantes y jubilados $ 5.000',
      ),
    ).toBe('Valor de las localidades: Entrada general $ 9.000 Estudiantes y jubilados $ 5.000');
    expect(extractPriceText('🎟️ Entrada libre y gratuita')).toBeNull();
    expect(extractPriceText('La gira recaudó más de $300 millones.')).toBeNull();
  });

  it('estado solo desde el título', () => {
    expect(statusFromTitle('Concierto SUSPENDIDO')).toBe('cancelled');
    expect(statusFromTitle('Hamlet (función postergada)')).toBe('postponed');
    expect(statusFromTitle('Karol G – Agotado')).toBe('sold_out');
    expect(statusFromTitle('Obra reprogramada')).toBe('scheduled');
    expect(statusFromTitle('Ty Segall')).toBe('scheduled');
  });
});

describe('agenda-ba · sameAsUrls para deduplicar con la fuente institucional', () => {
  it('EL BARBERO DE SEVILLA declara la ficha del Colón (Linda la rotula "Entradas")', () => {
    expect(eventOf('el-barbero-de-sevilla-1').sameAsUrls).toEqual([
      'https://teatrocolon.org.ar/produccion/el-barbero-de-sevilla/',
    ]);
  });

  it('LOS CUENTOS DE HOFFMANN declara la página de entradasba con id de evento', () => {
    expect(eventOf('los-cuentos-de-hoffmann').sameAsUrls).toEqual([
      'https://entradasba.buenosaires.gob.ar/evento/8df036b4-df44-49bf-aafb-2402f5ea675e',
    ]);
  });

  it('BABASÓNICOS no declara nada: Movistar Arena no tiene conector y es una ticketera', () => {
    expect(eventOf('babasonicos').sameAsUrls).toEqual([]);
  });

  it('descarta portadas, ticketeras genéricas y páginas de entradasba sin id; limpia el tracking', () => {
    expect(
      sameAsLinks([
        { uri: 'https://teatrocolon.org.ar/', title: 'Sitio' },
        { uri: 'https://www.passline.com/eventos/algo', title: 'Entradas' },
        { uri: 'https://entradasba.buenosaires.gob.ar/', title: 'Entradas' },
        { uri: 'https://complejoteatral.gob.ar/ver/El-tren-fluvial?gclid=abc', title: 'Entradas' },
        { uri: 'https://complejoteatral.gob.ar/ver/El-tren-fluvial', title: 'Más info' },
      ]),
    ).toEqual(['https://complejoteatral.gob.ar/ver/El-tren-fluvial']);
  });
});

describe('agenda-ba · contradicción texto ↔ estructura (no se emiten funciones)', () => {
  it('RICARDO III: el texto dice 20 y 19 h, la API 20:30 y 19:30 → candidato sin funciones', () => {
    const p = all.get('la-verdadera-historia-de-ricardo-iii');
    expect(p?.event?.occurrences).toEqual([]);
    expect(p?.reasons).toEqual(['missing:occurrences']);
    expect(p?.warnings).toContain(
      'el texto publica horarios (20:00, 19:00) que no coinciden con ninguno de fechasDelEvento: no se emiten funciones',
    );
  });

  it('CAMILA: el texto dice "jueves 15 de octubre", la API 30/03/2027 → candidato sin funciones', () => {
    expect(eventOf('camila').occurrences).toEqual([]);
  });

  it('no contradicen: fechas pasadas (estreno, temporada), franjas "de 19 a 20.30 h", "ingreso hasta 20 h", ventas', () => {
    // Hoffmann menciona "a partir del viernes 9 de octubre" (pasado): sus 3 funciones quedan.
    expect(eventOf('los-cuentos-de-hoffmann').occurrences).toHaveLength(3);
    // Babasónicos habla de funciones de junio sin día de semana: las de octubre quedan.
    expect(eventOf('babasonicos').occurrences).toHaveLength(2);
    // "Viernes 15 de octubre" (día de semana mal escrito) coincide por día y mes.
    expect(eventOf('teatros-de-ayer-y-hoy-recorrido-tematico').occurrences).toHaveLength(1);
    const instants = [{ localDate: '2026-10-16', localTime: '19:00' }];
    expect(
      textContradiction('Viernes 16 de octubre, de 19 a 20.30 h.', instants, '2026-10-14'),
    ).toBeNull();
    expect(textContradiction('Ingreso hasta 20:00 hs.', instants, '2026-10-14')).toBeNull();
    expect(
      textContradiction(
        'Entradas en venta a partir del jueves 25 de junio a las 12 h.',
        instants,
        '2026-10-14',
      ),
    ).toBeNull();
    expect(
      textContradiction(
        'Lunes 26 a miércoles 28 de octubre.',
        [{ localDate: '2026-10-26', localTime: '08:30' }],
        '2026-10-14',
      ),
    ).toBeNull();
    expect(textContradiction('El sábado 17 de octubre a las 21 h.', instants, '2026-10-14')).toBe(
      'el texto publica fechas (2026-10-17) que no coinciden con ninguna de fechasDelEvento',
    );
  });
});

describe('agenda-ba · señales que no se afirman', () => {
  it('"sin_costo" con entradas en una ticketera comercial no es gratis (Ricardo III, Ticketek)', () => {
    const e = eventOf('la-verdadera-historia-de-ricardo-iii');
    expect(e.isFree).toBeUndefined();
    expect(e.priceText).toBeUndefined();
  });

  it('el estado del título solo cuenta separado del nombre', () => {
    expect(statusFromTitle('Suspendidos en el tiempo')).toBe('scheduled');
    expect(statusFromTitle('Los agotados de siempre')).toBe('scheduled');
    expect(statusFromTitle('Recital X – SUSPENDIDO')).toBe('cancelled');
    expect(statusFromTitle('Obra (agotada)')).toBe('sold_out');
    expect(statusFromTitle('Concierto AGOTADO')).toBe('sold_out');
  });

  it('una página de entradasba que Linda usa en dos ítems distintos no se declara como la misma producción', () => {
    // "Buscando a Shakespeare" y "Encuentro de Cine Europeo | CCR" comparten /evento/0820d3fe-….
    expect(eventOf('buscando-shakespeare').sameAsUrls).toEqual([]);
    expect(eventOf('encuentro-de-cine-europeo-ccr').sameAsUrls).toEqual([]);
    expect(eventOf('buscando-shakespeare').ticketsUrl).toContain('0820d3fe');
  });

  it('instantes sin zona horaria se descartan con aviso', () => {
    const r = parseInstants(['2026-10-17T21:00:00', '2026-10-18T00:00:00.000Z']);
    expect(r.instants.map((i) => i.startsAt)).toEqual(['2026-10-17T21:00:00-03:00']);
    expect(r.warnings).toEqual([
      'instante sin zona horaria en fechasDelEvento: "2026-10-17T21:00:00", omitido',
    ]);
  });

  it('limpia parámetros de seguimiento adicionales (srsltid, igshid, cp_landing*)', () => {
    expect(
      cleanTrackingUrl('https://ejemplo.com/e?id=7&srsltid=AfmB&igshid=x&cp_landing_term=y'),
    ).toBe('https://ejemplo.com/e?id=7');
  });
});
