import {
  assessPublishability,
  type NormalizedEvent,
  NormalizedEventSchema,
} from '@culturaba/shared';
import { DateTime } from 'luxon';
import type { FetchContext, RawRecord } from '../../core/connector';
import type { HttpClient, HttpRequestOptions, HttpResponse } from '../../http/client';
import { FixtureHttpClient } from '../../http/fixtureClient';
import { fixtureSetDir } from '../../http/fixtures';
import { silentLogger } from '../../logger';
import { usinaDelArteConnector as connector, RECENT_DAYS } from './connector';
import { buildSchedule, parseDateCell, parseTimeCell } from './dates';
import { disciplinesFor } from './disciplines';
import { buildEvent, type ListingItem, priceFromLines } from './parse';
import { USINA_VENUE, venueFor } from './venues';

const FIXTURES = fixtureSetDir('usina-del-arte', '2026-10-18');
const BA = 'America/Argentina/Buenos_Aires';
/** Domingo 18-oct-2026 13:00: las funciones de la mañana ya pasaron. */
const NOW = DateTime.fromISO('2026-10-18T13:00:00', { zone: BA });
const DETAIL = (slug: string) => `https://usinadelarte.ar/actividad/${slug}/`;
const KNOWN_VENUES = new Set(['usina-del-arte']);

function enrich(raw: RawRecord, ctx: FetchContext): Promise<RawRecord> {
  if (!connector.enrich) throw new Error('el conector no implementa enrich');
  return connector.enrich(raw, ctx);
}

interface Parsed {
  raw: RawRecord;
  event: NormalizedEvent | null;
  warnings: string[];
  errors: string[];
  status: 'ok' | 'incomplete' | 'invalid';
  reasons: string[];
}

function assess(raw: RawRecord, knownVenueSlugs = KNOWN_VENUES): Parsed {
  const parsed = connector.parse(raw, { now: () => NOW, logger: silentLogger });
  if (!parsed.ok) {
    return {
      raw,
      event: null,
      warnings: [],
      errors: parsed.errors,
      status: 'invalid',
      reasons: [],
    };
  }
  const validated = NormalizedEventSchema.safeParse(parsed.event);
  if (!validated.success) {
    return {
      raw,
      event: null,
      warnings: parsed.warnings,
      errors: validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      status: 'invalid',
      reasons: [],
    };
  }
  const pub = assessPublishability(validated.data, { now: NOW.toMillis(), knownVenueSlugs });
  return {
    raw,
    event: validated.data,
    warnings: parsed.warnings,
    errors: [],
    status: pub.publishable ? 'ok' : 'incomplete',
    reasons: pub.reasons,
  };
}

/** discover + enrich sobre los fixtures; devuelve los RawRecord enriquecidos por id. */
async function enrichedRaws(): Promise<Map<string, RawRecord>> {
  const http = new FixtureHttpClient(FIXTURES);
  const ctx = { http, logger: silentLogger, now: () => NOW };
  const out = new Map<string, RawRecord>();
  for (const raw0 of await connector.discover(ctx)) {
    out.set(raw0.externalId, await enrich(raw0, ctx));
  }
  return out;
}

let raws: Map<string, RawRecord>;
let all: Map<string, Parsed>;
beforeAll(async () => {
  raws = await enrichedRaws();
  all = new Map([...raws].map(([id, raw]) => [id, assess(raw)]));
});

function rawOf(id: string): RawRecord {
  const raw = raws.get(id);
  if (!raw) throw new Error(`${id}: no descubierto`);
  return raw;
}

function eventOf(id: string): NormalizedEvent {
  const p = all.get(id);
  if (!p?.event) throw new Error(`${id}: ${p?.errors.join('; ') ?? 'no descubierto'}`);
  return p.event;
}

function listingOf(raw: RawRecord): ListingItem {
  return raw.listing as ListingItem;
}

/** Copia del registro con cambios en el ítem del REST y/o reemplazos en el HTML. */
function variant(
  id: string,
  patch: Partial<ListingItem> = {},
  replacements: [string, string][] = [],
): RawRecord {
  const raw = rawOf(id);
  let body = raw.body;
  for (const [from, to] of replacements) {
    if (!body.includes(from)) throw new Error(`'${from}' no está en el detalle de ${id}`);
    body = body.split(from).join(to);
  }
  return { ...raw, body, listing: { ...listingOf(raw), ...patch } };
}

function parsedEvent(raw: RawRecord): { event: NormalizedEvent; warnings: string[] } {
  const r = buildEvent(raw, { now: () => NOW, logger: silentLogger });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return { event: r.event, warnings: r.warnings };
}

const term = (id: number, name: string, slug: string) => ({ id, name, slug });
/** Saca las filas `.function-item` del detalle (deja el contenedor vacío). */
const NO_ROWS: [string, string][] = [['class="function-item"', 'class="x-item"']];

// ── discover ───────────────────────────────────────────────────────────────

describe('usina-del-arte · discover (fixtures 2026-10-18)', () => {
  it('lee 356 actividades del REST y deja las 19 vigentes, lo próximo primero', async () => {
    const http = new FixtureHttpClient(FIXTURES);
    const records = await connector.discover({ http, logger: silentLogger, now: () => NOW });
    // 4 páginas de actividades + funcion-fecha (2) + funcion-hora + sala + estado + tipo.
    expect(http.stats.requests).toBe(10);
    expect(http.stats.failures).toBe(0);
    expect(records.map((r) => r.externalId)).toEqual([
      // Con fecha desde hoy (18/10), la más próxima primero…
      '1482',
      '1488',
      '2296',
      '2366',
      '2676',
      '2716',
      '2718',
      '2720',
      '2677',
      '2721',
      // …y después las de la última semana (11/10 a 17/10).
      '2673',
      '2674',
      '2700',
      '2701',
      '2702',
      '2703',
      '2704',
      '2692',
      '2675',
    ]);
    const juri = records.find((r) => r.externalId === '2677');
    expect(juri?.url).toBe(DETAIL('jose-luis-jurirecital-de-piano'));
    expect(juri?.contentType).toBe('html');
    expect(juri?.body).toBe('');
    expect(juri?.listing).toEqual({
      id: 2677,
      slug: 'jose-luis-jurirecital-de-piano',
      link: DETAIL('jose-luis-jurirecital-de-piano'),
      titleHtml: 'José Luis Juri<br>Recital de piano',
      modified: '2026-10-16T12:12:34',
      featuredMedia: 2689,
      fechas: [term(472, '25/10/2026', '25-10-2026')],
      horas: [],
      salas: [term(39, 'Sala de Cámara', 'sala-de-camara')],
      estados: [term(91, 'Programadas', 'programadas')],
      tipos: [term(128, 'Ciclo Musica de Cámara', 'ciclo-musica-de-camara')],
      unresolvedTerms: [],
    });
  });

  it(`vigente = fecha desde hace ${RECENT_DAYS} días o estado "Programadas"`, async () => {
    // Marzo de 2027: ninguna fecha de la taxonomía entra en la ventana; quedan solo las 12
    // "Programadas" (el estado lo cambia el sitio a mano y puede ir atrasado).
    const later = DateTime.fromISO('2027-03-01T12:00:00', { zone: BA });
    const http = new FixtureHttpClient(FIXTURES);
    const records = await connector.discover({ http, logger: silentLogger, now: () => later });
    expect(records).toHaveLength(12);
    expect(records.every((r) => listingOf(r).estados.some((e) => e.slug === 'programadas'))).toBe(
      true,
    );
  });

  it('--limit recorta después de ordenar', async () => {
    const http = new FixtureHttpClient(FIXTURES);
    const records = await connector.discover({
      http,
      logger: silentLogger,
      now: () => NOW,
      limit: 3,
    });
    expect(records.map((r) => r.externalId)).toEqual(['1482', '1488', '2296']);
  });

  /** Cliente que altera las respuestas de los fixtures (fallas, cabeceras del REST en vivo). */
  class AlteredClient implements HttpClient {
    readonly inner = new FixtureHttpClient(FIXTURES);
    constructor(private readonly alter: (url: string, res: HttpResponse) => HttpResponse) {}
    get stats() {
      return this.inner.stats;
    }
    async get(url: string, options?: HttpRequestOptions): Promise<HttpResponse> {
      return this.alter(url, await this.inner.get(url, options));
    }
  }

  it('una página del REST que no es JSON hace fallar todo el descubrimiento', async () => {
    const http = new AlteredClient((url, res) =>
      url.includes('/v2/actividad?') && url.endsWith('page=3')
        ? { ...res, body: '<html>Error</html>' }
        : res,
    );
    await expect(
      connector.discover({ http, logger: silentLogger, now: () => NOW }),
    ).rejects.toThrow(/actividad: la página 3 no es JSON/);
  });

  it('con cabeceras X-WP-* (en vivo) pide esas páginas y exige que el total cierre', async () => {
    const withHeaders = (total: number) =>
      new AlteredClient((url, res) =>
        url.includes('/v2/actividad?')
          ? {
              ...res,
              headers: { ...res.headers, 'x-wp-total': String(total), 'x-wp-totalpages': '4' },
            }
          : res,
      );
    const ok = withHeaders(356);
    await expect(
      connector.discover({ http: ok, logger: silentLogger, now: () => NOW }),
    ).resolves.toHaveLength(19);
    await expect(
      connector.discover({ http: withHeaders(360), logger: silentLogger, now: () => NOW }),
    ).rejects.toThrow('actividad: el REST anuncia 360 y se obtuvieron 356');
  });
});

// ── parse sobre los fixtures ───────────────────────────────────────────────

describe('usina-del-arte · parse (fixtures 2026-10-18)', () => {
  it('las 19 actividades parsean y validan; 9 publicables y 10 candidatas por pasadas', () => {
    expect([...all.values()].filter((p) => p.status === 'invalid')).toEqual([]);
    const ok = [...all].filter(([, p]) => p.status === 'ok').map(([id]) => id);
    expect(ok).toEqual(['1482', '1488', '2296', '2366', '2716', '2718', '2720', '2677', '2721']);
    const incomplete = [...all].filter(([, p]) => p.status === 'incomplete');
    expect(incomplete.map(([id]) => id)).toEqual([
      '2676',
      '2673',
      '2674',
      '2700',
      '2701',
      '2702',
      '2703',
      '2704',
      '2692',
      '2675',
    ]);
    for (const [, p] of incomplete) expect(p.reasons).toEqual(['missing:future_occurrence']);
  });

  it('fecha y hora salen emparejadas del detalle, no del producto de las taxonomías', () => {
    // Misma taxonomía (16, 17 y 18/10, sin horas) y funciones distintas en cada versión.
    const es = eventOf('1482');
    expect(es.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-16T14:00:00-03:00',
      '2026-10-16T15:00:00-03:00',
      '2026-10-16T16:00:00-03:00',
      '2026-10-16T18:00:00-03:00',
      '2026-10-16T19:00:00-03:00',
      '2026-10-17T14:00:00-03:00',
      '2026-10-17T15:00:00-03:00',
      '2026-10-17T16:00:00-03:00',
      '2026-10-17T18:00:00-03:00',
      '2026-10-17T19:00:00-03:00',
      '2026-10-18T12:45:00-03:00',
      '2026-10-18T17:30:00-03:00',
    ]);
    expect(es.occurrences.every((o) => o.kind === 'timed' && o.endsAt === null)).toBe(true);
    expect(es.occurrences[10]).toMatchObject({
      externalId: '1482|2026-10-18|12:45',
      startDate: '2026-10-18',
      endDate: '2026-10-18',
      sourceDateText: '18/10/2026 12:45 h',
      scheduleText: null,
      status: 'scheduled',
    });

    const en = eventOf('2296');
    expect(en.title).toBe('Entre el Sonido y el Tiempo / Between Time and Sound');
    expect(en.occurrences.map((o) => [o.startsAt, o.sourceDateText])).toEqual([
      ['2026-10-16T17:00:00-03:00', '16/10/2026 17 h'],
      ['2026-10-17T17:00:00-03:00', '17/10/2026 17 h'],
      ['2026-10-18T16:30:00-03:00', '18/10/2026 16.30 h'],
    ]);
  });

  it('una franja "de 16 a 20 h" es una función con inicio y fin', () => {
    const ludo = eventOf('1488');
    expect(
      ludo.occurrences.map((o) => ({
        id: o.externalId,
        kind: o.kind,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        scheduleText: o.scheduleText,
      })),
    ).toEqual([
      {
        id: '1488|2026-10-16|16:00',
        kind: 'timed',
        startsAt: '2026-10-16T16:00:00-03:00',
        endsAt: '2026-10-16T20:00:00-03:00',
        scheduleText: 'de 16 a 20 h',
      },
      {
        id: '1488|2026-10-17|14:00',
        kind: 'timed',
        startsAt: '2026-10-17T14:00:00-03:00',
        endsAt: '2026-10-17T19:00:00-03:00',
        scheduleText: 'de 14 a 19 h',
      },
      {
        id: '1488|2026-10-18|14:00',
        kind: 'timed',
        startsAt: '2026-10-18T14:00:00-03:00',
        endsAt: '2026-10-18T19:00:00-03:00',
        scheduleText: 'de 14 a 19 h',
      },
    ]);
    const pena = eventOf('2701').occurrences[0];
    expect([pena?.startsAt, pena?.endsAt, pena?.scheduleText]).toEqual([
      '2026-10-12T14:30:00-03:00',
      '2026-10-12T19:00:00-03:00',
      '14:30 a 19 h',
    ]);
  });

  it('venue: la Usina (seed) con la sala del término `sala`; sin sala, sin room', () => {
    expect(eventOf('2677').occurrences[0]?.venue).toEqual({
      slug: 'usina-del-arte',
      name: 'Usina del Arte',
      room: 'Sala de Cámara',
    });
    expect(eventOf('2721').occurrences[0]?.venue).toEqual({ ...USINA_VENUE, room: 'Auditorio' });
    expect(eventOf('1488').occurrences[0]?.venue?.room).toBe('Salón Mayor');
    expect(eventOf('2716').occurrences[0]?.venue?.room).toBe('Salón Mayor');
    // "Las canciones más lindas de Charly": sin término sala ni bloque "Espacio", pero el
    // detalle publica la dirección de la Usina.
    expect(eventOf('2718').occurrences[0]?.venue).toEqual(USINA_VENUE);
    // Sin el venue en la base (seed sin aplicar) el evento no se publica a ciegas.
    expect(assess(rawOf('2721'), new Set()).reasons).toEqual(['missing:venue']);
  });

  it('precio: solo el renglón literal del sitio; "Con reserva" no dice nada', () => {
    const juri = eventOf('2677');
    const free =
      'Entrada libre y gratuita, hasta agotar capacidad. Se retiran desde las 11 h en la Usina.';
    expect([juri.priceText, juri.isFree, juri.priceVerified]).toEqual([free, true, true]);
    expect(juri.occurrences[0]?.price).toEqual({ text: free, isFree: true, verified: true });
    expect(eventOf('1488').priceText).toBe('Entrada libre y gratuita. Capacidad limitada');

    const misty = eventOf('2675');
    expect(misty.priceText).toBeUndefined();
    expect(misty.isFree).toBeUndefined();
    expect(misty.priceVerified).toBe(false);
    expect(misty.occurrences[0]?.price).toBeNull();
    // La reserva (formulario de la Ciudad) va como entradas.
    const form = 'https://www.formulariosgcba.gob.ar/ErVDqZj7DWMM15akpzGl/canal/web';
    expect(misty.ticketsUrl).toBe(form);
    expect(misty.occurrences[0]?.ticketsUrl).toBe(form);
  });

  it('disciplinas por la tabla explícita de tipo-de-actividad', () => {
    const d = (id: string) => [eventOf(id).disciplines, eventOf(id).tags];
    expect(d('2677')).toEqual([['opera_clasica'], ['Ciclo Musica de Cámara']]);
    expect(d('2675')).toEqual([['musica_vivo_jazz'], ['Concierto']]);
    expect(d('2701')).toEqual([['musica_vivo_jazz'], ['Peña']]);
    expect(d('2721')).toEqual([['teatro_escenicas'], ['Show para toda la familia', 'infantil']]);
    expect(d('1482')).toEqual([['historia_patrimonio'], ['Visita Guiada para adultos']]);
    expect(d('2366')).toEqual([['historia_patrimonio'], ['Visita Guiada para niños', 'infantil']]);
    expect(d('2716')).toEqual([
      ['fotografia_artes_visuales'],
      ['Talleres de Artes Visuales', 'taller'],
    ]);
    expect(d('1488')).toEqual([['otros'], ['Espacio lúdico', 'infantil']]);
  });

  it('título, URL oficial y sameAsUrls para cruzar con Linda (agenda-ba)', () => {
    const juri = eventOf('2677');
    expect(juri.title).toBe('José Luis Juri · Recital de piano');
    expect(juri.externalId).toBe('2677');
    expect(juri.institutionSlug).toBe('usina-del-arte');
    expect(juri.attribution).toBe('Texto: Usina del Arte');
    expect(juri.officialUrl).toBe(DETAIL('jose-luis-jurirecital-de-piano'));
    expect(juri.sameAsUrls).toEqual([DETAIL('jose-luis-jurirecital-de-piano')]);
    // Linda enlaza esta misma ficha en botonesSidebar (fixture agenda-ba 2026-10-14).
    expect(eventOf('2675').sameAsUrls).toEqual([
      'https://usinadelarte.ar/actividad/misty-soul-choir-por-primera-vez-en-buenos-aires-presenta-respect/',
    ]);
    for (const p of all.values()) expect(p.event?.sameAsUrls).toEqual([p.event?.officialUrl]);
    expect(eventOf('2366').title).toBe(
      'Historias de Circo · Visita guiada lúdica para toda la familia.',
    );
  });

  it('edad, descripción e imagen tal como las publica el sitio', () => {
    expect(eventOf('1482').ageRating).toBe('Mayores de 18');
    expect(eventOf('2366').ageRating).toBe('a partir de 6 años');
    expect(eventOf('2677').ageRating).toBe('ATP');
    expect(eventOf('2716').ageRating).toBeUndefined();
    expect(eventOf('2677').description).toBe(
      'Obras de Claude Debussy\nATP\nEntrada libre y gratuita, hasta agotar capacidad. Se retiran desde las 11 h en la Usina.',
    );
    expect(eventOf('2677').imageUrl).toBe(
      'https://usinadelarte.ar/wp-content/uploads/2026/09/MG_1896-scaled-e1790700507746-1024x643.jpg',
    );
    // Media 258 = captura de un documento de Google usada de relleno: no se publica.
    expect(eventOf('2721').imageUrl).toBeUndefined();
    expect(all.get('2721')?.warnings).toContain('imagen de relleno (media 258): se omite');
  });

  it('estado: "Pasadas"/"Programadas" no son estados de función', () => {
    for (const p of all.values()) {
      expect(p.event?.occurrences.every((o) => o.status === 'scheduled')).toBe(true);
    }
  });
});

// ── variantes sintéticas sobre los fixtures ───────────────────────────────

describe('usina-del-arte · estado de funciones', () => {
  it('un término de estado claro ("Suspendido") anula todas las funciones', () => {
    const { event } = parsedEvent(
      variant('1488', { estados: [term(999, 'Suspendido', 'suspendido')] }),
    );
    expect(event.occurrences.map((o) => [o.status, o.statusReason])).toEqual([
      ['cancelled', "estado 'Suspendido' en el sitio"],
      ['cancelled', "estado 'Suspendido' en el sitio"],
      ['cancelled', "estado 'Suspendido' en el sitio"],
    ]);
  });

  it('una nota "Agotado" en la fila marca solo esa función', () => {
    const { event } = parsedEvent(
      variant('2675', {}, [['<div class="notes"></div>', '<div class="notes">Agotado</div>']]),
    );
    expect(event.occurrences[0]).toMatchObject({
      status: 'sold_out',
      statusReason: "nota de la función: 'Agotado'",
      sourceDateText: '17/10/2026 20 h · Agotado',
    });
  });

  it('"Con reserva" en la nota no es un estado', () => {
    const { event } = parsedEvent(
      variant('2675', {}, [['<div class="notes"></div>', '<div class="notes">Con reserva</div>']]),
    );
    expect(event.occurrences[0]?.status).toBe('scheduled');
    expect(event.occurrences[0]?.statusReason).toBeUndefined();
  });
});

describe('usina-del-arte · respaldo por taxonomías (detalle sin filas)', () => {
  it('varias fechas y ninguna hora → días sin hora (range de un día), nunca all_day', () => {
    const { event, warnings } = parsedEvent(variant('1482', {}, NO_ROWS));
    expect(event.occurrences.map((o) => [o.externalId, o.kind, o.startsAt, o.endsAt])).toEqual([
      [
        '1482|2026-10-16|sin-hora',
        'range',
        '2026-10-16T00:00:00-03:00',
        '2026-10-16T23:59:59-03:00',
      ],
      [
        '1482|2026-10-17|sin-hora',
        'range',
        '2026-10-17T00:00:00-03:00',
        '2026-10-17T23:59:59-03:00',
      ],
      [
        '1482|2026-10-18|sin-hora',
        'range',
        '2026-10-18T00:00:00-03:00',
        '2026-10-18T23:59:59-03:00',
      ],
    ]);
    expect(event.occurrences.map((o) => o.scheduleText)).toEqual([null, null, null]);
    expect(warnings).toContain(
      'detalle sin filas .function-item: funciones tomadas de la taxonomía',
    );
  });

  it('una sola hora → vale para todas las fechas', () => {
    const { event } = parsedEvent(variant('1482', { horas: [term(262, '17 h', '17-h')] }, NO_ROWS));
    expect(event.occurrences.map((o) => [o.kind, o.startsAt, o.sourceDateText])).toEqual([
      ['timed', '2026-10-16T17:00:00-03:00', '16/10/2026 17 h'],
      ['timed', '2026-10-17T17:00:00-03:00', '17/10/2026 17 h'],
      ['timed', '2026-10-18T17:00:00-03:00', '18/10/2026 17 h'],
    ]);
  });

  it('una sola fecha → una función por hora', () => {
    const { event } = parsedEvent(
      variant('2677', { horas: [term(149, '11:30', '1130'), term(261, '18', '18')] }, NO_ROWS),
    );
    expect(event.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-25T11:30:00-03:00',
      '2026-10-25T18:00:00-03:00',
    ]);
  });

  it('varias fechas y varias horas → no se emparejan (solo fechas, con aviso)', () => {
    const { event, warnings } = parsedEvent(
      variant('1482', { horas: [term(262, '17 h', '17-h'), term(263, '16 h', '16-h')] }, NO_ROWS),
    );
    expect(event.occurrences.map((o) => o.kind)).toEqual(['range', 'range', 'range']);
    expect(warnings).toContain(
      '3 fechas y 2 horas en la taxonomía sin emparejar: se publican solo las fechas',
    );
  });

  it('con filas en el detalle, la taxonomía no agrega funciones (solo avisa)', () => {
    const { event, warnings } = parsedEvent(
      variant('2677', {
        fechas: [term(472, '25/10/2026', '25-10-2026'), term(1, '01/11/2026', '01-11-2026')],
      }),
    );
    expect(event.occurrences.map((o) => o.startsAt)).toEqual(['2026-10-25T11:30:00-03:00']);
    expect(warnings).toContain(
      'fechas de la taxonomía que el detalle no lista (no se emiten): 2026-11-01',
    );
  });

  it('una fila con texto de hora que no es una hora conserva el texto literal', () => {
    const { event } = parsedEvent(
      variant('2675', {}, [
        ['<div class="time">20 h</div>', '<div class="time">a confirmar</div>'],
      ]),
    );
    expect(event.occurrences[0]).toMatchObject({
      externalId: '2675|2026-10-17|sin-hora',
      kind: 'range',
      startsAt: '2026-10-17T00:00:00-03:00',
      endsAt: '2026-10-17T23:59:59-03:00',
      scheduleText: 'a confirmar',
      sourceDateText: '17/10/2026 a confirmar',
    });
  });
});

describe('usina-del-arte · fallas de parse', () => {
  it('sin HTML de detalle o con otra plantilla no se interpreta nada', () => {
    const empty = buildEvent(
      { ...rawOf('2677'), body: '' },
      { now: () => NOW, logger: silentLogger },
    );
    expect(empty.ok).toBe(false);
    const other = buildEvent(
      { ...rawOf('2677'), body: '<html><body><h1>Just a moment...</h1></body></html>' },
      { now: () => NOW, logger: silentLogger },
    );
    expect(other).toMatchObject({
      ok: false,
      errors: ['el detalle no trae la plantilla de actividad (single-post de Elementor)'],
    });
  });

  it('sin funciones en ningún lado: válido pero candidato por missing:occurrences', () => {
    const raw = variant('2718', { fechas: [] }, NO_ROWS);
    const p = assess(raw);
    expect(p.status).toBe('incomplete');
    expect(p.reasons).toEqual(['missing:occurrences']);
  });
});

// ── unidades ───────────────────────────────────────────────────────────────

describe('usina-del-arte · dates', () => {
  it.each([
    ['18 h', { start: { hour: 18, minute: 0 }, end: null }],
    ['11.30 h', { start: { hour: 11, minute: 30 }, end: null }],
    ['12:45 h', { start: { hour: 12, minute: 45 }, end: null }],
    ['18', { start: { hour: 18, minute: 0 }, end: null }],
    ['18.30', { start: { hour: 18, minute: 30 }, end: null }],
    ['de 16 a 20 h', { start: { hour: 16, minute: 0 }, end: { hour: 20, minute: 0 } }],
    ['14 a 18:30 h', { start: { hour: 14, minute: 0 }, end: { hour: 18, minute: 30 } }],
    ['14:30 a 19 h', { start: { hour: 14, minute: 30 }, end: { hour: 19, minute: 0 } }],
  ])('parseTimeCell(%j)', (text, expected) => {
    expect(parseTimeCell(text)).toEqual(expected);
  });

  it.each(['', 'undefined', '14:00:30', 'a confirmar', 'de 22 a 2 h', '25 h'])(
    'parseTimeCell(%j) → null',
    (text) => {
      expect(parseTimeCell(text)).toBeNull();
    },
  );

  it('parseDateCell: dd/mm/aaaa, mes de una cifra, año de dos cifras; sin año → null', () => {
    expect(parseDateCell('25/10/2026')).toEqual({ year: 2026, month: 10, day: 25 });
    expect(parseDateCell('05/4/2026')).toEqual({ year: 2026, month: 4, day: 5 });
    expect(parseDateCell('25/10/26')).toEqual({ year: 2026, month: 10, day: 25 });
    expect(parseDateCell('19/06')).toBeNull();
    expect(parseDateCell('31/02/2026')).toBeNull();
  });

  it('buildSchedule avisa términos ilegibles y no los usa', () => {
    const r = buildSchedule({
      rows: [],
      fechaTerms: ['19/06', '21/07/2026'],
      horaTerms: ['undefined'],
    });
    expect(r.basis).toBe('taxonomy');
    expect(r.specs.map((s) => [s.date, s.time])).toEqual([['2026-07-21', null]]);
    expect(r.warnings).toEqual([
      "término funcion-fecha ilegible (sin año o inválido): '19/06'",
      "término funcion-hora ilegible: 'undefined'",
      'detalle sin filas .function-item: funciones tomadas de la taxonomía',
    ]);
  });
});

describe('usina-del-arte · venues', () => {
  const sala = (slug: string, name: string) => ({ slug, name });
  const url = DETAIL('x');

  it('otra dirección publicada → espacio con esa dirección y su fuente', () => {
    expect(
      venueFor({
        salas: [],
        espacioText: 'Parque Lezama',
        addressText: 'Defensa 1600',
        detailUrl: url,
      }).venue,
    ).toEqual({ name: 'Parque Lezama', address: 'Defensa 1600', addressSourceUrl: url });
  });

  it('sin bloque "Dirección": la sala del sitio respalda la sede; sin nada, sin venue', () => {
    const r = venueFor({
      salas: [sala('salon-mayor', 'Salón Mayor')],
      espacioText: null,
      addressText: null,
      detailUrl: url,
    });
    expect(r.venue).toEqual({ ...USINA_VENUE, room: 'Salón Mayor' });
    expect(r.warnings).toEqual([
      'detalle sin bloque "Dirección": sede Usina del Arte por la sala publicada',
    ]);
    expect(
      venueFor({ salas: [], espacioText: null, addressText: null, detailUrl: url }).venue,
    ).toBeNull();
  });

  it('"Todos los espacios" no es una sala; una sala nueva se usa con su nombre literal', () => {
    const address = 'Agustín R. Caffarena 1, C1157 Cdad. Autónoma de Buenos Aires';
    expect(
      venueFor({
        salas: [sala('todos-los-espacios', 'Todos los espacios')],
        espacioText: null,
        addressText: address,
        detailUrl: url,
      }).venue,
    ).toEqual(USINA_VENUE);
    const r = venueFor({
      salas: [sala('terraza', 'Terraza')],
      espacioText: null,
      addressText: address,
      detailUrl: url,
    });
    expect(r.venue).toEqual({ ...USINA_VENUE, room: 'Terraza' });
    expect(r.warnings).toEqual(["sala 'Terraza' (terraza) sin mapeo: se usa el nombre publicado"]);
  });
});

describe('usina-del-arte · disciplinas', () => {
  const t = (slug: string, name: string) => ({ slug, name });

  it('tipo desconocido → otros con aviso', () => {
    expect(disciplinesFor([t('performance', 'Performance')])).toEqual({
      disciplines: ['otros'],
      tags: ['Performance'],
      warnings: ["tipo de actividad sin mapeo: 'Performance' (performance) → otros"],
    });
  });

  it('las etiquetas de temporada no aportan disciplina', () => {
    expect(
      disciplinesFor([
        t('espectaculo', 'Espectáculo'),
        t('vacaciones-de-invierno', 'Vacaciones de invierno'),
      ]).disciplines,
    ).toEqual(['teatro_escenicas']);
    expect(
      disciplinesFor([t('vacaciones-de-invierno', 'Vacaciones de invierno')]).disciplines,
    ).toEqual(['otros']);
  });

  it('solo gastronomía o sin tipo → sin disciplina (candidato)', () => {
    expect(disciplinesFor([t('feria-gastronomica', 'Feria Gastronomica')]).disciplines).toEqual([]);
    expect(disciplinesFor([])).toEqual({
      disciplines: [],
      tags: [],
      warnings: ['sin tipo de actividad: el evento queda candidato'],
    });
  });

  it('una disciplina real gana sobre otros', () => {
    expect(
      disciplinesFor([t('concierto', 'Concierto'), t('tango', 'Tango'), t('show', 'Show')])
        .disciplines,
    ).toEqual(['musica_vivo_jazz']);
  });
});

describe('usina-del-arte · precio', () => {
  it('importes explícitos sin afirmar gratuidad; frase gratuita dentro de un párrafo largo', () => {
    expect(priceFromLines(['ATP', 'Platea $8.000. Jubilados $4.000'])).toEqual({
      text: 'Platea $8.000. Jubilados $4.000',
    });
    const long = `El jueves 11 de septiembre a las 20 h se inaugura el ciclo con la presentación de Luis Salinas. Con entrada libre y gratuita, el reconocido guitarrista ofrecerá un concierto único en el que desplegará su estilo.`;
    expect(priceFromLines([long])).toEqual({ text: 'Entrada libre y gratuita', isFree: true });
    expect(priceFromLines(['Con reserva', 'ATP'])).toBeNull();
  });
});
