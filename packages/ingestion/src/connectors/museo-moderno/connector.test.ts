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
import { museoModernoConnector as connector } from './connector';
import { mapAgendaDisciplines, mapExhibitionDisciplines } from './disciplines';
import {
  isEnglishUrl,
  parseExhibitionDetail,
  parseExhibitionListing,
  parseVisitHours,
  priceOf,
  spanishOnly,
} from './parse';
import { MUSEUM_VENUE, placeFromLine, placeFromLocation } from './venues';

const FIXTURES = fixtureSetDir('museo-moderno', '2026-10-18');
const NOW = DateTime.fromISO('2026-10-18T13:00:00', { zone: 'America/Argentina/Buenos_Aires' });
const HOURS =
  'Lunes, miércoles, jueves y viernes: 11:00 a 19:00 h · Sábados, domingos y feriados: 11:00 a 20:00 h · (Martes cerrado excepto feriados)';

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
let requests: number;
const all = new Map<string, Parsed>();

/** discover + enrich + parse + zod + publicabilidad (con el venue seed `museo-moderno`). */
beforeAll(async () => {
  const http = new FixtureHttpClient(FIXTURES);
  const ctx = { http, logger: silentLogger, now: () => NOW };
  raws = await connector.discover(ctx);
  requests = http.stats.requests;
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
      knownVenueSlugs: new Set(['museo-moderno']),
    });
    all.set(raw.externalId, {
      event: validated.data,
      warnings: parsed.warnings,
      errors: [],
      status: pub.publishable ? 'ok' : 'incomplete',
      reasons: pub.reasons,
    });
  }
});

function eventOf(id: string): NormalizedEvent {
  const p = all.get(id);
  if (!p?.event) throw new Error(`${id}: ${p?.errors.join('; ') ?? 'no descubierto'}`);
  return p.event;
}

function warningsOf(id: string): string[] {
  return all.get(id)?.warnings ?? [];
}

const local = (iso: string) =>
  DateTime.fromISO(iso).setZone(NOW.zone).toFormat("yyyy-MM-dd'T'HH:mm");

describe('museo-moderno · discover (fixtures 2026-10-18)', () => {
  it('11 muestras en cartel + 15 ítems de agenda con fechas desde hoy, en 5 peticiones', () => {
    expect(raws.map((r) => r.externalId)).toEqual([
      'exposiciones/56869',
      'exposiciones/56889',
      'exposiciones/56895',
      'exposiciones/56877',
      'exposiciones/56883',
      'exposiciones/56902',
      'exposiciones/56908',
      'exposiciones/56914',
      'exposiciones/57050',
      'exposiciones/56947',
      'exposiciones/56921',
      'agenda/62873',
      'agenda/62820',
      'agenda/62239',
      'agenda/62232',
      'agenda/62189',
      'agenda/62182',
      'agenda/62170',
      'agenda/62163',
      'agenda/62140',
      'agenda/62087',
      'agenda/61281',
      'agenda/60650',
      'agenda/58065',
      'agenda/51414',
      'agenda/50528',
    ]);
    // /exposiciones/, REST exposiciones?include=, /planea-tu-visita/, agenda páginas 1 y 2.
    expect(requests).toBe(5);
  });

  it('la pestaña "Pasadas" no se ingiere (Joanna Pawlik: Spinalonga, El borde de sí mismo)', () => {
    const ids = raws.map((r) => r.externalId);
    expect(ids).not.toContain('exposiciones/62375');
    expect(ids).not.toContain('exposiciones/58207');
  });

  it('la agenda descarta lo pasado y los patrones semanales sin fechas', () => {
    const ids = raws.map((r) => r.externalId);
    // "Sábado 10 de octubre / 16.30 h – Performance" (pasado) y "Todos los Miércoles de 16 a 18 h".
    expect(ids).not.toContain('agenda/62357');
    expect(ids).not.toContain('agenda/57273');
    // "Caja de sorpresas" se publicó en 2025 pero anuncia el domingo 25 de octubre de 2026.
    expect(ids).toContain('agenda/50528');
  });

  it('--limit corta los registros (las muestras van primero: son las que necesitan enrich)', async () => {
    const http = new FixtureHttpClient(FIXTURES);
    const limited = await connector.discover({
      http,
      logger: silentLogger,
      now: () => NOW,
      limit: 3,
    });
    expect(limited.map((r) => r.externalId)).toEqual([
      'exposiciones/56869',
      'exposiciones/56889',
      'exposiciones/56895',
    ]);
  });
});

describe('museo-moderno · resultado por ítem', () => {
  it('22 publicables y 4 candidatos con su motivo exacto', () => {
    const invalid = [...all.entries()].filter(([, p]) => p.status === 'invalid');
    expect(invalid).toEqual([]);
    const candidates = Object.fromEntries(
      [...all.entries()]
        .filter(([, p]) => p.status === 'incomplete')
        .map(([id, p]) => [id, p.reasons]),
    );
    expect(candidates).toEqual({
      // Programa paraguas sin "Ubicación:".
      'exposiciones/56869': ['missing:venue'],
      // "Ubicación: Spazio Punch – Fondamenta S. Biagio, 800/o, Venecia, Italia".
      'exposiciones/57050': ['missing:venue'],
      // "Ubicación: Café Moderno": el sitio no publica dónde está el café.
      'exposiciones/56921': ['missing:venue'],
      // El módulo que viene es virtual ("Plataforma Google Meet"): no hay función presencial.
      'agenda/58065': ['missing:future_occurrence'],
    });
    expect([...all.values()].filter((p) => p.status === 'ok')).toHaveLength(22);
  });

  it('ocurrencias: 11 rangos (una por muestra) y 44 funciones de agenda', () => {
    const occurrences = [...all.values()].flatMap((p) => p.event?.occurrences ?? []);
    expect(occurrences.filter((o) => o.kind === 'range')).toHaveLength(11);
    expect(occurrences.filter((o) => o.kind === 'timed')).toHaveLength(44);
    expect(occurrences.filter((o) => o.kind === 'all_day')).toHaveLength(0); // sin hora → range de un día
  });

  it('institución y atribución comunes a todos los ítems', () => {
    for (const p of all.values()) {
      expect(p.event?.institutionSlug).toBe('museo-moderno');
      expect(p.event?.attribution).toBe('Texto: Museo de Arte Moderno de Buenos Aires');
      expect(p.event?.source).toBe('museo-moderno');
    }
  });
});

describe('museo-moderno · agenda (fechas literales)', () => {
  it('"Miércoles 28 de octubre, a las 17 h" — charla en el Auditorio, gratis con inscripción', () => {
    const e = eventOf('agenda/62873');
    expect(e.title).toBe('El agua en la naturaleza y el arte');
    expect(e.subtitle).toBe('Presentación de la publicación');
    expect(e.disciplines).toEqual(['literatura_charlas']);
    expect(e.officialUrl).toBe(
      'https://museomoderno.org/agenda/el-agua-en-la-naturaleza-y-el-arte/',
    );
    expect(e.priceText).toBe('Actividad gratuita con inscripción previa');
    expect(e.isFree).toBe(true);
    expect(e.priceVerified).toBe(true);
    // Botón "¡INSCRIBITE!" (Google Forms), sin el parámetro de campaña `usp`.
    expect(e.ticketsUrl).toBe(
      'https://docs.google.com/forms/d/e/1FAIpQLSepdl9eHIIaKXUbvUkCTjJQjbn8wCRCppaujY8imGrz7xuXzw/viewform',
    );
    expect(e.imageUrl).toBe(
      'https://museomoderno.org/wp-content/uploads/2026/10/GarciaUriburu-.jpg',
    );
    expect(e.occurrences).toHaveLength(1);
    const [o] = e.occurrences;
    expect(o).toMatchObject({
      externalId: 'agenda/62873|2026-10-28|17:00',
      kind: 'timed',
      startsAt: '2026-10-28T17:00:00-03:00',
      endsAt: null,
      startDate: '2026-10-28',
      sourceDateText: 'Miércoles 28 de octubre, a las 17 h',
      venue: { slug: 'museo-moderno', name: 'Museo Moderno', room: 'Auditorio' },
      status: 'scheduled',
      price: { text: 'Actividad gratuita con inscripción previa', isFree: true, verified: true },
    });
  });

  it('"Sábado 31 de octubre, de 16.30 a 18.30 h" — franja con inicio y fin publicados', () => {
    const [o] = eventOf('agenda/62239').occurrences;
    expect(o?.startsAt).toBe('2026-10-31T16:30:00-03:00');
    expect(o?.endsAt).toBe('2026-10-31T18:30:00-03:00');
    expect(eventOf('agenda/62239').disciplines).toEqual(['otros']);
  });

  it('"Sábado 3, 17 y 24 y domingo 4, 11, 18 y 25 de octubre, de 15 a 17 h" → 7 funciones', () => {
    const e = eventOf('agenda/62189');
    expect(e.occurrences.map((o) => local(o.startsAt))).toEqual([
      '2026-10-03T15:00',
      '2026-10-04T15:00',
      '2026-10-11T15:00',
      '2026-10-17T15:00',
      '2026-10-18T15:00',
      '2026-10-24T15:00',
      '2026-10-25T15:00',
    ]);
    expect(new Set(e.occurrences.map((o) => o.endsAt?.slice(11, 16)))).toEqual(new Set(['17:00']));
    expect(e.occurrences[0]?.venue).toEqual({ ...MUSEUM_VENUE, room: 'Sala Yapeyú' });
    expect(e.priceText).toBe('Actividad gratuita sin inscripción previa');
  });

  it('ciclo de cine: resumen + funciones por día → 3 funciones, entradas en EntradasBA, sin precio', () => {
    const e = eventOf('agenda/62820');
    expect(e.disciplines).toEqual(['cine']);
    expect(e.subtitle).toBe('Ciclo de cine y video experimental');
    expect(e.occurrences.map((o) => [local(o.startsAt), o.sourceDateText])).toEqual([
      ['2026-10-23T19:00', 'Viernes 23 y sábado 24 de octubre, 19 h'],
      ['2026-10-24T19:00', 'Viernes 23 y sábado 24 de octubre, 19 h'],
      ['2026-10-25T18:00', 'Domingo 25 de octubre, 18 h'],
    ]);
    expect(e.ticketsUrl).toBe(
      'https://entradasba.buenosaires.gob.ar/evento/4bc7a911-cb06-4293-86ab-936310aa6e94',
    );
    // "Entradas a la venta en boletería y EntradasBA" no publica importe: no hay precio.
    expect(e.priceText).toBeUndefined();
    expect(e.isFree).toBeUndefined();
    expect(e.occurrences.every((o) => o.venue?.room === 'Auditorio')).toBe(true);
  });

  it('Solaroid: cada encuentro con su lugar (sede y CeSAC Nº 15 con la dirección publicada)', () => {
    const e = eventOf('agenda/62140');
    expect(e.occurrences.map((o) => [local(o.startsAt), o.venue])).toEqual([
      [
        '2026-10-19T11:00',
        { slug: 'museo-moderno', name: 'Museo Moderno', room: 'Sala Supervielle' },
      ],
      [
        '2026-10-26T11:00',
        {
          name: 'CeSAC Nº 15',
          address: 'Balcarce 1170 (CABA)',
          addressSourceUrl: 'https://museomoderno.org/agenda/las-tres-ecologias-solaroid/',
        },
      ],
    ]);
  });

  it('SPAA 2026: módulos virtuales fuera; el del Parque de la Memoria con su lugar', () => {
    const e = eventOf('agenda/58065');
    expect(e.disciplines).toEqual(['literatura_charlas']);
    expect(e.occurrences.map((o) => [local(o.startsAt), o.venue?.name, o.price?.text])).toEqual([
      [
        '2026-04-25T17:00',
        'Museo Moderno',
        'Actividad presencial arancelada con inscripción previa',
      ],
      [
        '2026-10-10T11:30',
        'Sala PAyS, Parque de la Memoria – Monumento a las Víctimas del Terrorismo de Estado',
        'Actividad gratuita con inscripción previa',
      ],
    ]);
    expect(e.occurrences[1]?.venue?.address).toBe('Av. Costanera Rafael Obligado 6745 (CABA)');
    expect(warningsOf('agenda/58065')).toContain(
      'actividad virtual ("Sábados 24 y 31 de octubre y 7 de noviembre, de 11.30 a 13 h"): no se emite como función en un lugar',
    );
    // Precios distintos según el módulo: el evento no afirma uno solo.
    expect(e.priceText).toBeUndefined();
  });

  it('"Actividad arancelada con inscripción previa" → isFree false, sin importe inventado', () => {
    const e = eventOf('agenda/60650');
    expect(e.priceText).toBe('Actividad arancelada con inscripción previa');
    expect(e.isFree).toBe(false);
    expect(e.occurrences[0]?.price).toEqual({
      text: 'Actividad arancelada con inscripción previa',
      isFree: false,
      verified: true,
    });
    expect(e.occurrences).toHaveLength(6);
  });

  it('lugares fuera de la sede publicados en la actividad', () => {
    expect(eventOf('agenda/62170').occurrences[0]?.venue).toEqual({
      name: 'Acceso Sur – Camino de los Plumerillos (CABA)',
      address: 'Acceso Sur – Camino de los Plumerillos (CABA)',
      addressSourceUrl:
        'https://museomoderno.org/agenda/las-tres-ecologias-laboratorio-de-futuro-restaurar-el-deseo-por-nuestros-rios-y-costas/',
    });
    expect(eventOf('agenda/62163').occurrences[0]?.venue?.name).toBe(
      'CeSAC Nº 35, Osvaldo Cruz y Zavaleta, CABA',
    );
  });

  it('"Caja de sorpresas": entrada de 2025 reutilizada, función del domingo 25 de octubre de 2026', () => {
    const e = eventOf('agenda/50528');
    expect(e.occurrences.map((o) => [o.startsAt, o.endsAt])).toEqual([
      ['2026-10-25T11:30:00-03:00', '2026-10-25T12:30:00-03:00'],
    ]);
    expect(e.tags).toEqual(['infantil']);
    expect(e.disciplines).toEqual(['otros']);
    expect(warningsOf('agenda/50528')).toContain(
      'tipo de actividad sin mapeo ("Espacio para la primera infancia") → otros',
    );
  });

  it('recorridos → museos_exposiciones; concierto y charla → música + charlas', () => {
    expect(eventOf('agenda/62182').disciplines).toEqual(['museos_exposiciones']);
    expect(eventOf('agenda/61281').disciplines).toEqual(['museos_exposiciones']);
    expect(eventOf('agenda/62232').disciplines).toEqual(['musica_vivo_jazz', 'literatura_charlas']);
    // "Actividad presencial sin inscripción previa": no dice precio.
    expect(eventOf('agenda/62232').priceText).toBeUndefined();
  });
});

describe('museo-moderno · exposiciones', () => {
  it('Bosques Umbral: "Inicio: 20 de Agosto de 2026" / "Fin: 30 de Abril de 2027", horario de la sede', () => {
    const e = eventOf('exposiciones/56902');
    expect(e.disciplines).toEqual(['museos_exposiciones']);
    expect(e.occurrences).toEqual([
      {
        externalId: 'exposiciones/56902|range',
        kind: 'range',
        startsAt: '2026-08-20T00:00:00-03:00',
        endsAt: '2027-04-30T23:59:59-03:00',
        startDate: '2026-08-20',
        endDate: '2027-04-30',
        timezone: 'America/Argentina/Buenos_Aires',
        scheduleText: HOURS,
        recurrenceRule: null,
        sourceDateText:
          'Inicio: 20 de Agosto de 2026 · Fin: 30 de Abril de 2027 · Hasta el 30 de Abril de 2027',
        venue: { slug: 'museo-moderno', name: 'Museo Moderno', room: 'Segundo piso (Sala G)' },
        status: 'scheduled',
        ticketsUrl: null,
        price: null,
      },
    ]);
    expect(e.sameAsUrls).toEqual([
      'https://museomoderno.org/exposiciones/bosques-umbral/',
      'https://museomoderno.org/en/exhibitions/bosques-umbral/',
    ]);
    expect(e.imageUrl).toBe(
      'https://museomoderno.org/wp-content/uploads/2026/01/Bosques-Umbral.jpg',
    );
    expect(e.priceText).toBeUndefined();
    expect(
      e.description?.startsWith('Bosques Umbral investiga las relaciones entre la tecnología'),
    ).toBe(true);
  });

  it('"Inicio: Abril de 2026" (sin día) en cartel → el rango empieza hoy; fin del listado', () => {
    const e = eventOf('exposiciones/56889');
    expect(e.title).toBe('Océano interior');
    expect(e.occurrences[0]).toMatchObject({
      startDate: '2026-10-18',
      endDate: '2027-02-28',
      sourceDateText:
        'Inicio: Abril de 2026 · Fin: Febrero de 2027 · Hasta el 28 de Febrero de 2027',
      venue: { slug: 'museo-moderno', name: 'Museo Moderno', room: 'Segundo subsuelo (Sala I)' },
    });
    expect(warningsOf('exposiciones/56889')).toContain(
      'inicio sin día publicado ("Inicio: Abril de 2026"): la muestra está en cartel, el rango empieza hoy',
    );
  });

  it('La memoria de la colección: fuera de la sede, dirección publicada, sin horario de la sede', () => {
    const [o] = eventOf('exposiciones/56947').occurrences;
    expect(o).toMatchObject({
      startDate: '2026-06-13',
      endDate: '2026-10-18',
      scheduleText: null,
      venue: {
        name: 'Parque de la Memoria – Monumento a las Víctimas del Terrorismo de Estado',
        address: 'Av. Costanera Rafael Obligado 6745, CABA',
        addressSourceUrl:
          'https://museomoderno.org/exposiciones/la-memoria-de-la-coleccion-el-moderno-en-el-parque/',
      },
    });
  });

  it('muestra en Venecia: venue sin dirección (candidata), nunca con la dirección del museo', () => {
    const [o] = eventOf('exposiciones/57050').occurrences;
    expect(o?.venue).toEqual({
      name: 'Spazio Punch – Fondamenta S. Biagio, 800/o, Venecia, Italia',
    });
    expect(o?.scheduleText).toBeNull();
    expect(o?.endDate).toBe('2026-11-22');
  });
});

describe('museo-moderno · deduplicación con Linda (agenda-ba)', () => {
  it('misma institución: el slug derivado de "Museo Moderno" en Linda', () => {
    expect(derivedInstitution('Museo Moderno', 'museo moderno', []).slug).toBe('museo-moderno');
    expect(connector.meta.institutionSlug).toBe('museo-moderno');
  });

  it('mismo venue: Linda nombra el espacio "Museo Moderno", igual que el venue seed', () => {
    const place = resolvePlace({
      title: 'Museo Moderno',
      address: 'Av. San Juan 350',
      barrio: 'san_telmo',
      links: [],
      officialUrl: 'https://linda.buenosaires.gob.ar/eventos/caja-de-sorpresas',
    });
    expect(place.institution.slug).toBe('museo-moderno');
    expect(place.venue?.name).toBe(MUSEUM_VENUE.name);
  });

  it('"Caja de sorpresas": el botón de Linda apunta a la URL canónica del museo', () => {
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
      .find((r) => r.success && r.data.slug === 'caja-de-sorpresas');
    if (!item?.success) throw new Error('caja-de-sorpresas no está en el fixture de Linda');
    const lindaTickets = pickTicketsUrl(item.data.botonesSidebar);
    expect(lindaTickets).toBe('https://museomoderno.org/agenda/caja-de-sorpresas/');
    const museum = eventOf('agenda/50528');
    expect(museum.sameAsUrls).toEqual(['https://museomoderno.org/agenda/caja-de-sorpresas/']);
    expect(sameAsKeys(museum)).toContain(canonicalUrl(lindaTickets ?? ''));
    expect(dedupKey(museum.title, museum.institutionSlug)).toBe(
      dedupKey(item.data.title, 'museo-moderno'),
    );
  });
});

describe('museo-moderno · WPML', () => {
  it('descarta traducciones /en/ y duplicados por slug (ids de la ficha real: 62886 es, 62994 en)', () => {
    const items = [
      {
        id: 62886,
        slug: 'historia-de-dos-mundos-2',
        link: 'https://museomoderno.org/exposiciones/historia-de-dos-mundos-2/',
      },
      {
        id: 62994,
        slug: 'historia-de-dos-mundos-2',
        link: 'https://museomoderno.org/en/exhibitions/historia-de-dos-mundos-2/',
      },
      {
        id: 62873,
        slug: 'el-agua-en-la-naturaleza-y-el-arte',
        link: 'https://museomoderno.org/en/agenda/el-agua-en-la-naturaleza-y-el-arte/',
      },
      { id: 62886, slug: 'otro', link: 'https://museomoderno.org/exposiciones/otro/' },
    ];
    expect(spanishOnly(items).map((i) => i.id)).toEqual([62886]);
    expect(isEnglishUrl('https://museomoderno.org/en/exhibitions/bosques-umbral/')).toBe(true);
    expect(isEnglishUrl('https://museomoderno.org/exposiciones/bosques-umbral/')).toBe(false);
    expect(isEnglishUrl('https://museomoderno.org/entradas/')).toBe(false);
  });

  it('las URLs de la agenda y las muestras ingeridas son todas en español', () => {
    for (const raw of raws) expect(isEnglishUrl(raw.url)).toBe(false);
  });
});

describe('museo-moderno · páginas', () => {
  const read = (file: string) => readFileSync(join(FIXTURES, file), 'utf8');

  it('listado /exposiciones/: pestañas Pasadas / Presentes / Futuras', () => {
    const cards = parseExhibitionListing(read('001-exposiciones.html')) ?? [];
    expect(cards.filter((c) => c.tab === 'presentes')).toHaveLength(11);
    expect(cards.filter((c) => c.tab === 'futuras')).toHaveLength(0);
    expect(cards.find((c) => c.postId === 56902)).toEqual({
      postId: 56902,
      url: 'https://museomoderno.org/exposiciones/bosques-umbral/',
      title: 'Bosques Umbral',
      tab: 'presentes',
      dateText: 'Hasta el 30 de Abril de 2027',
    });
    expect(cards.find((c) => c.postId === 62375)?.tab).toBe('pasadas');
    expect(parseExhibitionListing('<html><body><p>otra cosa</p></body></html>')).toBeNull();
  });

  it('ficha: bloque "Fecha" de JetEngine, canonical y hreflang', () => {
    expect(parseExhibitionDetail(read('011-exposiciones-bosques-umbral.html'))).toEqual({
      postId: 56902,
      startText: 'Inicio: 20 de Agosto de 2026',
      endText: 'Fin: 30 de Abril de 2027',
      canonicalUrl: 'https://museomoderno.org/exposiciones/bosques-umbral/',
      translations: ['https://museomoderno.org/en/exhibitions/bosques-umbral/'],
      title: 'Bosques Umbral',
      imageUrl: 'https://museomoderno.org/wp-content/uploads/2026/01/Bosques-Umbral-1024x434.jpg',
    });
  });

  it('/planea-tu-visita/: horario sin la línea de recorridos públicos', () => {
    expect(parseVisitHours(read('003-planea-tu-visita.html'))).toBe(HOURS);
  });
});

describe('museo-moderno · lugares, precios y disciplinas (tabla explícita)', () => {
  const URL = 'https://museomoderno.org/agenda/x/';

  it('líneas de lugar', () => {
    expect(placeFromLine('Auditorio – Av. San Juan 350 (CABA)', URL)?.venue).toEqual({
      ...MUSEUM_VENUE,
      room: 'Auditorio',
    });
    expect(placeFromLine('Auditorio. Av. San Juan 350. (CABA)', URL)?.venue.room).toBe('Auditorio');
    expect(placeFromLine('Museo de Arte Moderno -Av. San Juan 350 (CABA)', URL)?.venue).toEqual(
      MUSEUM_VENUE,
    );
    expect(placeFromLine('Av San Juan 350, CABA', URL)?.kind).toBe('museum');
    expect(
      placeFromLine('Punto de encuentro: Av. Dorrego 4019 (Servicio Meteorológico Nacional)', URL)
        ?.venue,
    ).toEqual({ name: 'Av. Dorrego 4019 (Servicio Meteorológico Nacional)' });
    expect(
      placeFromLine(
        'Punto de encuentro: Esquina de Av. Caseros y Defensa, Parque Lezama (CABA)',
        URL,
      )?.venue,
    ).toEqual({
      name: 'Esquina de Av. Caseros y Defensa, Parque Lezama (CABA)',
      address: 'Esquina de Av. Caseros y Defensa, Parque Lezama (CABA)',
      addressSourceUrl: URL,
    });
    expect(placeFromLine('Orientado al público general', URL)).toBeNull();
    expect(placeFromLine('Actividad gratuita con inscripción previa (CABA)', URL)).toBeNull();
  });

  it('"Ubicación:" de las muestras', () => {
    expect(placeFromLocation('Primer piso (Salas C, E y F)', URL)?.venue).toEqual({
      ...MUSEUM_VENUE,
      room: 'Primer piso (Salas C, E y F)',
    });
    expect(placeFromLocation('Espacios de circulación común en planta baja', URL)?.kind).toBe(
      'museum',
    );
    expect(placeFromLocation('Café Moderno', URL)?.venue).toEqual({ name: 'Café Moderno' });
    expect(placeFromLocation(null, URL)).toBeNull();
  });

  it('precio solo si se publica', () => {
    const line = (text: string) => [{ text, links: [] }];
    expect(priceOf(line('Entrada libre y gratuita'))).toEqual({
      text: 'Entrada libre y gratuita',
      isFree: true,
    });
    expect(
      priceOf(line('Actividad gratuita, sin inscripción previa, sujeta a la capacidad de la sala')),
    ).toEqual({
      text: 'Actividad gratuita, sin inscripción previa, sujeta a la capacidad de la sala',
      isFree: true,
    });
    expect(priceOf(line('Entrada general: $5.000'))).toEqual({
      text: 'Entrada general: $5.000',
      isFree: false,
      min: 5000,
      max: 5000,
    });
    expect(priceOf(line('Actividad presencial sin inscripción previa'))).toBeNull();
    expect(priceOf(line('Entradas a la venta en boletería y EntradasBA'))).toBeNull();
  });

  it('tabla de disciplinas de la agenda', () => {
    const map = (title: string, excerpt: string, description = '') =>
      mapAgendaDisciplines({ title, excerpt, description }).disciplines;
    expect(map('El cine es otra cosa 2026', 'Ciclo de cine y video experimental')).toEqual([
      'cine',
    ]);
    expect(map('El agua en la naturaleza y el arte', 'Presentación de la publicación')).toEqual([
      'literatura_charlas',
    ]);
    expect(map('Pentagrama', 'Concierto y charla sobre música y braille')).toEqual([
      'musica_vivo_jazz',
      'literatura_charlas',
    ]);
    expect(
      map('Recorrido accesible', 'Una visita sensorial por la exhibición Moderno y MetaModerno'),
    ).toEqual(['museos_exposiciones']);
    // Performance → teatro, salvo que el texto hable de danza o coreografía.
    expect(map('Joanna Pawlik: Spinalonga', 'la performance Spinalonga')).toEqual([
      'teatro_escenicas',
    ]);
    expect(
      map(
        'Joanna Pawlik: Spinalonga',
        'la performance Spinalonga',
        'una coreografía site-specific',
      ),
    ).toEqual(['danza']);
    // "Esto es Teatro" es una exposición: "teatro" a secas no cuenta.
    expect(map('Recorrido accesible', 'Esto es Teatro. Una experiencia sensorial')).toEqual([
      'museos_exposiciones',
    ]);
    expect(map('Miradas cruzadas', 'Taller de dibujo en salas de exposición')).toEqual(['otros']);
    expect(mapAgendaDisciplines({ title: 'Yoga en silla', excerpt: '', description: '' })).toEqual({
      disciplines: ['otros'],
      matched: [],
      warnings: ['tipo de actividad sin mapeo ("Yoga en silla") → otros'],
    });
    expect(
      mapExhibitionDisciplines({
        title: 'Fototrama',
        excerpt: '',
        lead: 'Una muestra de fotografías',
      }),
    ).toEqual(['museos_exposiciones', 'fotografia_artes_visuales']);
  });
});
