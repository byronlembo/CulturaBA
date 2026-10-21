import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assessPublishability,
  canonicalUrl,
  dedupKey,
  type NormalizedEvent,
  NormalizedEventSchema,
} from '@culturaba/shared';
import { DateTime } from 'luxon';
import type { FetchContext, RawRecord } from '../../core/connector';
import { sameAsKeys } from '../../core/matcher';
import { FixtureHttpClient } from '../../http/fixtureClient';
import { fixtureSetDir } from '../../http/fixtures';
import { silentLogger } from '../../logger';
import { derivedInstitution } from '../agenda-ba/institutions';
import { LindaEventSchema, pickTicketsUrl } from '../agenda-ba/parse';
import { resolvePlace } from '../agenda-ba/venues';
import { CONNECTORS } from '../index';
import { planetarioConnector as connector } from './connector';
import { parseSchedule, uploadMonthOf } from './dates';
import { mapDisciplines } from './disciplines';
import { parseAgendaSpecials, parseCards, pathOf, priceOf } from './parse';
import { PLANETARIO_VENUE, venueFromPlace } from './venues';

const FIXTURES = fixtureSetDir('planetario', '2026-10-21');
const NOW = DateTime.fromISO('2026-10-21T12:00:00', { zone: 'America/Argentina/Buenos_Aires' });
const fixture = (file: string) => readFileSync(join(FIXTURES, file), 'utf8');

function enrich(raw: RawRecord, ctx: FetchContext): Promise<RawRecord> {
  if (!connector.enrich) throw new Error('el conector no implementa enrich');
  return connector.enrich(raw, ctx);
}

interface Parsed {
  event: NormalizedEvent | null;
  warnings: string[];
  errors: string[];
  status: 'ok' | 'incomplete' | 'invalid';
  reasons: string[];
}

let raws: RawRecord[];
let discoverRequests: number;
let totalRequests: number;
const all = new Map<string, Parsed>();

/** discover + enrich + parse + zod + publicabilidad (con el venue seed del Planetario). */
beforeAll(async () => {
  const http = new FixtureHttpClient(FIXTURES);
  const ctx = { http, logger: silentLogger, now: () => NOW };
  raws = await connector.discover(ctx);
  discoverRequests = http.stats.requests;
  for (const raw0 of raws) {
    const raw = await enrich(raw0, ctx);
    const parsed = connector.parse(raw, ctx);
    if (!parsed.ok) {
      all.set(raw.externalId, {
        event: null,
        warnings: [],
        errors: parsed.errors,
        status: 'invalid',
        reasons: [],
      });
      continue;
    }
    const validated = NormalizedEventSchema.safeParse(parsed.event);
    if (!validated.success) {
      all.set(raw.externalId, {
        event: null,
        warnings: parsed.warnings,
        errors: validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        status: 'invalid',
        reasons: [],
      });
      continue;
    }
    const pub = assessPublishability(validated.data, {
      now: NOW.toMillis(),
      knownVenueSlugs: new Set(['planetario-galileo-galilei']),
    });
    all.set(raw.externalId, {
      event: validated.data,
      warnings: parsed.warnings,
      errors: [],
      status: pub.publishable ? 'ok' : 'incomplete',
      reasons: pub.reasons,
    });
  }
  totalRequests = http.stats.requests;
});

function eventOf(id: string): NormalizedEvent {
  const p = all.get(id);
  if (!p?.event) throw new Error(`${id}: ${p?.errors.join('; ') ?? 'no descubierto'}`);
  return p.event;
}

const SHOWS = [
  'alerta-espacial-noticias-bajo-la-lupa',
  'te-quiero-desde-el-mar-hasta-el-cielo',
  'agujeros-negros-supermasivos',
  'top-5-lo-mejor-del-universo',
  'vuelta-por-el-universo',
  'veo-veo',
];

describe('planetario · registro', () => {
  it('registrado antes de Linda, que sigue último; cortesía 1 en vuelo y ≥ 1,5 s', () => {
    const slugs = CONNECTORS.map((c) => c.slug);
    expect(slugs.at(-1)).toBe('agenda-ba');
    expect(slugs.indexOf('planetario')).toBe(slugs.length - 2);
    expect(connector.meta).toMatchObject({
      institutionSlug: 'planetario-galileo-galilei',
      kind: 'html',
      ready: true,
      politeness: { concurrency: 1, minDelayMs: 1500 },
    });
  });
});

describe('planetario · discover (fixtures 2026-10-21)', () => {
  it('5 actividades vigentes, lo próximo primero, en 11 peticiones + 5 fichas', () => {
    expect(raws.map((r) => r.externalId)).toEqual([
      'descubrir-observar-y-disfrutar-el-cielo',
      'astronomia-general',
      'madre-noche',
      'el-universo-que-no-vemos',
      'el-telescopio-espacial-roman',
    ]);
    // 3 listados con tarjetas, /agenda, /espectaculos-publico-general y las 6 fichas de espectáculos.
    expect(discoverRequests).toBe(11);
    expect(totalRequests).toBe(16);
  });

  it('la misma ficha en /otras-actividades y en /agenda es UN registro', () => {
    const universo = raws.find((r) => r.externalId === 'el-universo-que-no-vemos');
    expect(universo?.url).toBe('https://planetario.buenosaires.gob.ar/el-universo-que-no-vemos');
    expect(universo?.listing).toEqual({
      kind: 'actividad',
      sources: ['otras-actividades', 'agenda'],
      title: 'El universo que no vemos',
      whenLines: ['Sábados 17, 24 y 31 de octubre de 2026', 'Horario: de 10 a 11:30 h'],
      uploadMonth: '2026-10',
      imageUrl:
        'https://planetario.buenosaires.gob.ar/sites/default/files/2026-10/Sin%20t%C3%ADtulo%20%287257%20x%202268%20px%29%20%281920%20x%20600%20px%29%20%2821%29.png',
      agendaText: 'Sábados 24 y 31 de octubre 10:00 h',
    });
  });

  it('los espectáculos del domo no publican temporada ni fechas: no se emiten', () => {
    const ids = raws.map((r) => r.externalId);
    for (const show of SHOWS) expect(ids).not.toContain(show);
  });

  it('/agenda: solo la línea fechada; las grillas semanales del domo, museo y telescopios no', () => {
    expect(parseAgendaSpecials(fixture('004-agenda.html'))).toEqual([
      {
        path: '/el-universo-que-no-vemos',
        title: 'El universo que no vemos',
        whenText: 'Sábados 24 y 31 de octubre 10:00 h',
      },
    ]);
  });

  it('charlas archivadas: pasadas aunque su día de semana se repita en la ventana', () => {
    const cards = parseCards(fixture('001-encuentros-de-ciencia.html')) ?? [];
    expect(cards).toHaveLength(129);
    const ids = raws.map((r) => r.externalId);
    for (const path of [
      '/la-ciencia-de-la-mision-perseverance',
      '/ultimo-encuentro-de-ciencia-2020',
    ]) {
      const card = cards.find((c) => c.path === path);
      if (!card) throw new Error(`${path} no está en el listado`);
      // Sin el mes de carga de la imagen, el día de semana caería en la ventana…
      expect(
        parseSchedule({ lines: card.whenLines, now: NOW, uploadMonth: null }).specs,
      ).toHaveLength(1);
      // …con él (2021-03 y 2020-12) se sabe que es de entonces.
      const s = parseSchedule({
        lines: card.whenLines,
        now: NOW,
        uploadMonth: uploadMonthOf(card.imageUrl),
      });
      expect([card.whenLines, uploadMonthOf(card.imageUrl), s.specs, s.past]).toEqual(
        path === '/la-ciencia-de-la-mision-perseverance'
          ? [['Jueves 18 de marzo 19 hs'], '2021-03', [], 1]
          : [['Jueves 10 de diciembre 19 hs'], '2020-12', [], 1],
      );
      expect(ids).not.toContain(path.slice(1));
    }
    // "IAFE + PLANETARIO II" (viernes 9 de octubre de 2026) quedó antes de hoy − 7 días.
    expect(ids).not.toContain('iafe-planetario-ii');
  });
});

describe('planetario · eventos normalizados', () => {
  it('todos validan; las charlas de la última semana quedan candidatas (sin función futura)', () => {
    expect([...all.entries()].map(([id, p]) => [id, p.status, p.reasons, p.errors])).toEqual([
      ['descubrir-observar-y-disfrutar-el-cielo', 'ok', [], []],
      ['astronomia-general', 'ok', [], []],
      ['madre-noche', 'incomplete', ['missing:future_occurrence'], []],
      ['el-universo-que-no-vemos', 'ok', [], []],
      ['el-telescopio-espacial-roman', 'incomplete', ['missing:future_occurrence'], []],
    ]);
  });

  it('Encuentro de Ciencia "El telescopio espacial Roman": domingo 18 de octubre 18 h, gratis, Domo', () => {
    const { description, rawFragment, ...e } = eventOf('el-telescopio-espacial-roman');
    expect(e).toEqual({
      source: 'planetario',
      externalId: 'el-telescopio-espacial-roman',
      url: 'https://planetario.buenosaires.gob.ar/el-telescopio-espacial-roman',
      capturedAt: '2026-10-21T12:00:00.000-03:00',
      title: 'El telescopio espacial Roman',
      subtitle: 'Una nueva ventana al universo',
      attribution: 'Texto: Planetario Galileo Galilei',
      disciplines: ['ciencia'],
      institutionSlug: 'planetario-galileo-galilei',
      officialUrl: 'https://planetario.buenosaires.gob.ar/el-telescopio-espacial-roman',
      sameAsUrls: [
        'https://planetario.buenosaires.gob.ar/el-telescopio-espacial-roman',
        'https://planetario.buenosaires.gob.ar/node/2156',
      ],
      imageUrl:
        'https://planetario.buenosaires.gob.ar/sites/default/files/2026-10/Sin%20t%C3%ADtulo%20%287257%20x%202268%20px%29%20%281920%20x%20600%20px%29%20%2822%29.png',
      priceText: 'Libre y por orden de llegada',
      isFree: true,
      priceVerified: true,
      tags: [],
      language: 'es',
      occurrences: [
        {
          externalId: 'el-telescopio-espacial-roman|2026-10-18|18:00',
          kind: 'timed',
          startsAt: '2026-10-18T18:00:00-03:00',
          endsAt: null,
          startDate: '2026-10-18',
          endDate: '2026-10-18',
          timezone: 'America/Argentina/Buenos_Aires',
          scheduleText: null,
          recurrenceRule: null,
          sourceDateText: 'Domingo 18 de octubre 18 h',
          venue: { ...PLANETARIO_VENUE, room: 'Domo' },
          status: 'scheduled',
          ticketsUrl: null,
          price: { text: 'Libre y por orden de llegada', isFree: true, verified: true },
        },
      ],
    });
    expect(description?.split('\n')[0]).toBe('Encuentros de Ciencia junto a Lucas Paganini');
    expect(JSON.parse(rawFragment ?? '{}')).toMatchObject({
      nodeId: 2156,
      kind: 'encuentro',
      when: ['Domingo 18 de octubre 18 h'],
      place: 'Domo del Planetario de Buenos Aires',
    });
    expect(all.get('el-telescopio-espacial-roman')?.warnings).toEqual([
      'todas las funciones ya pasaron (dentro de los 7 días de gracia)',
    ]);
  });

  it('"El universo que no vemos": tres sábados 10–11:30 h (de la ficha, con año), gratis con inscripción', () => {
    const e = eventOf('el-universo-que-no-vemos');
    expect(
      e.occurrences.map((o) => [o.kind, o.startsAt, o.endsAt, o.venue?.room ?? null, o.status]),
    ).toEqual([
      ['timed', '2026-10-17T10:00:00-03:00', '2026-10-17T11:30:00-03:00', null, 'scheduled'],
      ['timed', '2026-10-24T10:00:00-03:00', '2026-10-24T11:30:00-03:00', null, 'scheduled'],
      ['timed', '2026-10-31T10:00:00-03:00', '2026-10-31T11:30:00-03:00', null, 'scheduled'],
    ]);
    expect(e.occurrences[0]?.sourceDateText).toBe(
      'Sábados 17, 24 y 31 de octubre de 2026 · Horario: de 10 a 11:30 h',
    );
    expect([e.isFree, e.priceVerified, e.priceText, e.ticketsUrl, e.ageRating]).toEqual([
      true,
      true,
      'Actividad gratuita con inscripción previa. Reservá tu vacante a partir del miércoles 7 de octubre.',
      'https://www.eventbrite.com.ar/e/el-universo-que-no-vemos-tickets-2003059037502',
      'Público general a partir de los 15 años',
    ]);
    expect(e.subtitle).toBe('Curso de astronomía: observar el cosmos más allá de la luz visible');
  });

  it('"Madre Noche": funciones 16 y 17 (las del 2 y 3 ya pasaron), $10.000, música + ciencia', () => {
    const e = eventOf('madre-noche');
    expect(e.occurrences.map((o) => [o.startsAt, o.endsAt])).toEqual([
      ['2026-10-16T19:00:00-03:00', '2026-10-16T20:30:00-03:00'],
      ['2026-10-17T19:00:00-03:00', '2026-10-17T20:30:00-03:00'],
    ]);
    expect(e.occurrences[0]?.venue).toEqual({
      ...PLANETARIO_VENUE,
      room: 'Sala de Espectáculos / Domo',
    });
    expect(e.occurrences[0]?.price).toEqual({
      text: 'Actividad arancelada $10.000.-',
      min: 10000,
      max: 10000,
      isFree: false,
      verified: true,
    });
    expect([e.disciplines, e.isFree, e.ticketsUrl, e.ageRating]).toEqual([
      ['ciencia', 'musica_vivo_jazz'],
      false,
      'https://entradasba.buenosaires.gob.ar/evento/af27d45a-cfe0-43a2-84d5-229a79765463',
      'Musical y ciencia para mayores de 16 años',
    ]);
  });

  it('cursos con temporada publicada → un range con el horario literal, sin lugar (Cupo completo)', () => {
    const general = eventOf('astronomia-general');
    expect(general.occurrences).toEqual([
      {
        externalId: 'astronomia-general|range',
        kind: 'range',
        startsAt: '2026-09-02T00:00:00-03:00',
        endsAt: '2026-11-18T23:59:59-03:00',
        startDate: '2026-09-02',
        endDate: '2026-11-18',
        timezone: 'America/Argentina/Buenos_Aires',
        scheduleText: 'Horario: miércoles 19 h a 21.45 h.',
        recurrenceRule: null,
        sourceDateText:
          'Inicio del curso: miércoles 2 de septiembre de 2026 · Última clase: miércoles 18 de noviembre de 2026',
        venue: PLANETARIO_VENUE,
        status: 'sold_out',
        ticketsUrl: null,
        price: {
          text: 'Residentes $48.000.- · No residentes $ 96.000.- · Este es el valor por la totalidad del curso (12 clases)',
          min: 48000,
          max: 96000,
          isFree: false,
          verified: true,
        },
      },
    ]);
    const observar = eventOf('descubrir-observar-y-disfrutar-el-cielo');
    expect(
      observar.occurrences.map((o) => [o.kind, o.startDate, o.endDate, o.scheduleText, o.status]),
    ).toEqual([
      ['range', '2026-09-01', '2026-11-17', 'Horario: martes de 19 h a 21 h.', 'sold_out'],
    ]);
  });

  it('nunca all_day; toda fecha conserva su texto literal; sameAs = canónica + /node/<id>', () => {
    for (const p of all.values()) {
      const e = p.event;
      if (!e) continue;
      for (const o of e.occurrences) {
        expect(o.kind).not.toBe('all_day');
        expect(o.sourceDateText).toBeTruthy();
      }
      expect(e.sameAsUrls[0]).toBe(e.officialUrl);
      expect(e.sameAsUrls[1]).toMatch(/^https:\/\/planetario\.buenosaires\.gob\.ar\/node\/\d+$/);
    }
  });
});

describe('planetario · precio', () => {
  it('gratis solo cuando el campo Precio lo dice', () => {
    expect(priceOf(['Sin costo. Ingreso por orden de llegada.'])).toEqual({
      text: 'Sin costo. Ingreso por orden de llegada.',
      isFree: true,
    });
    expect(priceOf(['¡Gratis!'])?.isFree).toBe(true);
    expect(priceOf(['GRATIS'])?.isFree).toBe(true);
    expect(priceOf(['Libre y por orden de llegada'])?.isFree).toBe(true);
    expect(
      priceOf(['Actividad gratuita y sin reserva. Ingreso por orden de llegada'])?.isFree,
    ).toBe(true);
    expect(priceOf(['Ingreso gratuito con entrada previa.'])?.isFree).toBe(true);
    // Sin palabra de precio no se afirma nada.
    expect(priceOf(['Ingreso por orden de llegada'])).toBeNull();
    expect(priceOf([])).toBeNull();
  });

  it('importes y "arancelada" sin importe', () => {
    expect(
      priceOf([
        'Residentes en la República Argentina $ 1.500.-',
        'No residentes en la República Argentina $ 3.000.-',
        'Únicamente venta online.',
        'DESCARGÁ TUS ENTRADAS EN TU CELULAR PARA PODER INGRESAR.',
      ]),
    ).toEqual({
      text: 'Residentes en la República Argentina $ 1.500.- · No residentes en la República Argentina $ 3.000.-',
      isFree: false,
      min: 1500,
      max: 3000,
    });
    expect(priceOf(['Actividad arancelada'])).toEqual({
      text: 'Actividad arancelada',
      isFree: false,
    });
    expect(
      priceOf(['$6000.- Residentes de Argentina', '$12000.- No residentes de Argentina']),
    ).toEqual({
      text: '$6000.- Residentes de Argentina · $12000.- No residentes de Argentina',
      isFree: false,
      min: 6000,
      max: 12000,
    });
  });
});

describe('planetario · lugar y disciplinas', () => {
  it('"Lugar" → sede con sala; otro lugar sin dirección; sin "Lugar" no se asume la sede', () => {
    expect(venueFromPlace('Sala de espectáculos del Planetario Bs. As.').venue).toEqual({
      ...PLANETARIO_VENUE,
      room: 'Sala de Espectáculos',
    });
    expect(venueFromPlace('Planetario Galileo Galilei').venue).toEqual(PLANETARIO_VENUE);
    expect(venueFromPlace('Sala de Espectáculos, museo y explanada de acceso').venue?.room).toBe(
      'Sala de Espectáculos / Museo / Explanada de acceso',
    );
    expect(venueFromPlace('Centro Cultural 25 de Mayo')).toEqual({
      venue: { name: 'Centro Cultural 25 de Mayo' },
      virtual: false,
      warnings: [
        'lugar fuera de la sede sin dirección publicada ("Centro Cultural 25 de Mayo"): candidato por venue',
      ],
    });
    expect(venueFromPlace(null)).toEqual({
      venue: null,
      virtual: false,
      warnings: ['sin "Lugar" publicado: candidato por venue'],
    });
    expect(venueFromPlace('Canal de YouTube del Planetario').virtual).toBe(true);
  });

  it('ciencia siempre; una segunda solo con señal literal en título o subtítulo', () => {
    expect(mapDisciplines({ title: 'El telescopio espacial Roman' })).toEqual(['ciencia']);
    expect(
      mapDisciplines({ title: 'Madre Noche', subtitle: 'Música y ciencia bajo la cúpula' }),
    ).toEqual(['ciencia', 'musica_vivo_jazz']);
    expect(mapDisciplines({ title: 'Ciclo de cine: Contacto' })).toEqual(['ciencia', 'cine']);
    expect(
      mapDisciplines({
        title: 'Freddie en las estrellas',
        subtitle: 'Charla astronómica con Ezequiel Brahim*',
      }),
    ).toEqual(['ciencia']);
  });

  it('rutas del sitio: /index.php/<slug> es la misma ficha; otros sitios y anclas no', () => {
    expect(pathOf('/index.php/veo-veo')).toBe('/veo-veo');
    expect(pathOf('https://planetario.buenosaires.gob.ar/madre-noche')).toBe('/madre-noche');
    expect(pathOf('https://www.eventbrite.com.ar/e/x')).toBeNull();
    expect(pathOf('#')).toBeNull();
    expect(pathOf('/node/2156')).toBeNull();
  });
});

describe('planetario · deduplicación con Linda (agenda-ba)', () => {
  const lindaEvent = (slug: string) => {
    const linda = JSON.parse(
      readFileSync(
        join(
          fixtureSetDir('agenda-ba', '2026-10-14'),
          '021-linda-api-frontend-events-filter-limit200.json',
        ),
        'utf8',
      ),
    ) as { events: unknown[] };
    const item = linda.events
      .map((x) => LindaEventSchema.safeParse(x))
      .find((r) => r.success && r.data.slug === slug);
    if (!item?.success) throw new Error(`${slug} no está en el fixture de Linda`);
    return item.data;
  };

  it('misma institución y mismo nombre de venue que deriva Linda', () => {
    expect(
      derivedInstitution('Planetario Galileo Galilei', 'planetario galileo galilei', []).slug,
    ).toBe(connector.meta.institutionSlug);
    const place = resolvePlace({
      title: 'Planetario Galileo Galilei',
      address: 'Av. Sarmiento s/n, C1425',
      barrio: null,
      links: [],
      officialUrl: 'https://linda.buenosaires.gob.ar/eventos/madre-noche',
    });
    expect(place.institution.slug).toBe('planetario-galileo-galilei');
    expect(place.venue?.name).toBe(PLANETARIO_VENUE.name);
  });

  it('"Madre Noche": Linda y el Planetario comparten la entrada de EntradasBA y el título', () => {
    const linda = lindaEvent('madre-noche');
    const ticket = pickTicketsUrl(linda.botonesSidebar);
    expect(ticket).toBe(
      'https://entradasba.buenosaires.gob.ar/evento/af27d45a-cfe0-43a2-84d5-229a79765463',
    );
    const planetario = eventOf('madre-noche');
    expect(sameAsKeys(planetario)).toContain(canonicalUrl(ticket ?? ''));
    expect(dedupKey(planetario.title, planetario.institutionSlug)).toBe(
      dedupKey(linda.title, 'planetario-galileo-galilei'),
    );
  });
});
