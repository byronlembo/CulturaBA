import {
  assessPublishability,
  type NormalizedEvent,
  NormalizedEventSchema,
} from '@culturaba/shared';
import { DateTime } from 'luxon';
import type { FetchContext, RawRecord } from '../../core/connector';
import { FixtureHttpClient } from '../../http/fixtureClient';
import { fixtureSetDir } from '../../http/fixtures';
import { silentLogger } from '../../logger';
import { AGENDA_DAYS, complejoTeatralConnector as connector } from './connector';
import { parseSchedule } from './dates';
import { mapCategories } from './disciplines';
import { buildVenueRef, canonicalTheatreName, splitPlace } from './venues';

const FIXTURES = fixtureSetDir('complejo-teatral', '2026-10-14');
const NOW = DateTime.fromISO('2026-10-14T12:00:00', { zone: 'America/Argentina/Buenos_Aires' });
const DETAIL = (slug: string) => `https://complejoteatral.gob.ar/produccion/${slug}/`;

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

/** Corre discover + enrich + parse + validación zod + publicabilidad sobre los fixtures. */
async function runAll(): Promise<Map<string, Parsed>> {
  const http = new FixtureHttpClient(FIXTURES);
  const ctx = { http, logger: silentLogger, now: () => NOW };
  const raws = await connector.discover(ctx);
  const out = new Map<string, Parsed>();
  for (const raw0 of raws) {
    const raw = await enrich(raw0, ctx);
    const parsed = connector.parse(raw, ctx);
    if (!parsed.ok) {
      out.set(raw.externalId, {
        raw,
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
      out.set(raw.externalId, {
        raw,
        event: null,
        warnings: parsed.warnings,
        errors: validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        status: 'invalid',
        reasons: [],
      });
      continue;
    }
    // Sin base: ningún slug conocido; un venue resuelve solo por nombre + dirección publicada.
    const pub = assessPublishability(validated.data, {
      now: NOW.toMillis(),
      knownVenueSlugs: new Set(),
    });
    out.set(raw.externalId, {
      raw,
      event: validated.data,
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

describe('complejo-teatral · discover (fixtures 2026-10-14)', () => {
  it('lista las 33 producciones de la home con una petición por día de agenda', async () => {
    const http = new FixtureHttpClient(FIXTURES);
    const raws = await connector.discover({ http, logger: silentLogger, now: () => NOW });
    expect(raws).toHaveLength(33);
    expect(http.stats.requests).toBe(1 + AGENDA_DAYS);
    expect(http.stats.failures).toBe(0);
    expect(raws.map((r) => r.externalId)).toContain('oxitocina');
    const oxitocina = raws.find((r) => r.externalId === 'oxitocina');
    expect(oxitocina?.url).toBe(DETAIL('oxitocina'));
    const listing = oxitocina?.listing as { agendaDays: string[]; agendaWindow: unknown };
    // Jueves a domingos listados por /agenda/?fecha= dentro de la ventana (14-10 → 10-11).
    expect(listing.agendaDays).toEqual([
      '2026-10-17',
      '2026-10-18',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(listing.agendaWindow).toEqual({
      from: '2026-10-14',
      to: '2026-11-10',
      fetchedDays: 28,
      failedDays: 0,
    });
  });

  it('respeta --limit', async () => {
    const http = new FixtureHttpClient(FIXTURES);
    const raws = await connector.discover({ http, logger: silentLogger, now: () => NOW, limit: 3 });
    expect(raws).toHaveLength(3);
  });

  it('enrich falla con claridad si la producción redirige a la home (archivada)', async () => {
    const http = new FixtureHttpClient(FIXTURES);
    const raw: RawRecord = {
      externalId: 'parias',
      url: DETAIL('parias'),
      fetchedAt: NOW.toISO() ?? '',
      contentType: 'html',
      body: '',
    };
    await expect(enrich(raw, { http, logger: silentLogger, now: () => NOW })).rejects.toThrow(
      /archivada|markup/,
    );
  });
});

describe('complejo-teatral · parse de TODOS los ítems', () => {
  it('ninguno inválido; 22 publicables y 11 candidatos con motivo', () => {
    const counts = { ok: 0, incomplete: 0, invalid: 0 };
    for (const p of all.values()) counts[p.status] += 1;
    expect(counts).toEqual({ ok: 22, incomplete: 11, invalid: 0 });

    const candidates = Object.fromEntries(
      [...all.entries()]
        .filter(([, p]) => p.status === 'incomplete')
        .map(([k, p]) => [k, p.reasons]),
    );
    expect(candidates).toEqual({
      // "Desde el 12 hasta el 29 de noviembre" (aviso en rojo) → ningún día de la ventana.
      'todos-los-angeles-alzaron-el-vuelo': ['missing:occurrences'],
      // Patrón semanal; la agenda no lo lista hasta el 15-11 ("Desde el 12 de noviembre").
      'la-verdadera-historia-de-ricardo-iii': ['missing:occurrences'],
      // Patrones semanales sin temporada publicada (inicio y fin): la agenda sola no alcanza
      // (lista días fuera de temporada; Invasiones I anuncia "temporada 2027").
      'invasiones-1': ['missing:occurrences'],
      la_lluvia_de_fuego: ['missing:occurrences'],
      'a-cielo-abierto': ['missing:occurrences'],
      remigio_verdiales_un_carpincho: ['missing:occurrences'],
      // "Desde el 24 de octubre": sin fin publicado.
      esperando_a_godot: ['missing:occurrences'],
      // "Marzo a noviembre": ciclo sin fechas concretas.
      jazz_buenos_aires: ['missing:occurrences'],
      // Sin "Funciones:" en el detalle y sin fecha en el listado.
      'las-alas-de-los-ausentes': ['missing:occurrences'],
      // FotoGalería: solo horario de apertura, sin rango de fechas.
      'los-espiritus-del-museo': ['missing:occurrences'],
      // Casa de la Cultura: "Dirección:" vacío → venue sin dirección.
      'la-isla-el-teatro-san-martin-en-dictaduras': ['missing:venue'],
    });
  });

  it('nunca inventa: sin hora no hay función timed, sin dirección no hay address', () => {
    for (const p of all.values()) {
      const e = p.event;
      if (!e) continue;
      for (const o of e.occurrences) {
        expect(o.timezone).toBe('America/Argentina/Buenos_Aires');
        expect(o.startsAt).toMatch(/-03:00$/);
        if (o.kind === 'range') expect(o.endsAt).toMatch(/T23:59:59-03:00$/);
        if (o.venue?.address) expect(o.venue.addressSourceUrl).toBe(e.url);
        if (o.price) expect(o.price.verified).toBe(true);
      }
      if (e.isFree) expect(e.priceText?.toLowerCase()).toMatch(/gratuit/);
      expect(e.attribution).toBe('Texto: Complejo Teatral de Buenos Aires');
      if (e.imageUrl) expect(e.imageUrl).toMatch(/^https:\/\/complejoteatral\.gob\.ar\//);
    }
  });
});

describe('complejo-teatral · eventos verificados a mano contra el HTML', () => {
  it('OXITOCINA: patrón semanal acotado por "Desde el 17/10 hasta el 1°/11" + agenda', () => {
    const e = eventOf('oxitocina');
    expect(e.externalId).toBe('oxitocina');
    expect(e.url).toBe(DETAIL('oxitocina'));
    expect(e.title).toBe('OXITOCINA');
    expect(e.subtitle).toBe('(INÉS Y LOS PERROS)');
    expect(e.disciplines).toEqual(['teatro_escenicas']);
    expect(e.durationMinutes).toBe(55);
    expect(e.priceText).toBe('Platea $26.000 Jueves $15.000');
    expect(e.priceVerified).toBe(true);
    expect(e.isFree).toBeUndefined();
    expect(e.ticketsUrl).toBe(
      'https://entradasba.buenosaires.gob.ar/evento/d76b3de0-492d-48d3-b051-c811d098be6f',
    );
    expect(e.imageUrl).toBe(
      'https://complejoteatral.gob.ar/wp-content/uploads/2026/09/OO0tN1AVg6mVIqFLsMoJ.png',
    );
    expect(e.description).toContain('Cuando su hija de tres años desaparece');
    // 10 funciones: jue–dom del 17/10 al 1/11 (los días 5-8/11 de la agenda quedan fuera del rango).
    expect(e.occurrences).toHaveLength(10);
    expect(e.occurrences[0]).toMatchObject({
      externalId: 'oxitocina|2026-10-17|19:30',
      kind: 'timed',
      startsAt: '2026-10-17T19:30:00-03:00',
      endsAt: null,
      startDate: '2026-10-17',
      endDate: '2026-10-17',
      status: 'scheduled',
      venue: {
        name: 'Teatro San Martín',
        room: 'Sala Cunill Cabanellas',
        address: 'Av. Corrientes 1530',
        addressSourceUrl: DETAIL('oxitocina'),
      },
      price: { text: 'Platea $26.000 Jueves $15.000', verified: true },
    });
    expect(e.occurrences.at(-1)?.startsAt).toBe('2026-11-01T19:30:00-03:00');
    expect(e.occurrences.map((o) => o.startDate)).toEqual([
      '2026-10-17',
      '2026-10-18',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(all.get('oxitocina')?.warnings.join('\n')).toMatch(/fuera del rango publicado/);
  });

  it('PAISAJES COREOGRÁFICOS: fechas enumeradas con dos horarios, gratis, crédito de foto', () => {
    const e = eventOf('paisajes-coreograficos');
    expect(e.disciplines).toEqual(['danza']);
    expect(e.imageCredit).toBe('Foto: Foto Carlos Furman');
    expect(e.durationMinutes).toBe(60);
    expect(e.ticketsUrl).toBeUndefined();
    expect(e.isFree).toBe(true);
    expect(e.priceText).toBe('Entrada gratuita');
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-16T18:00:00-03:00',
      '2026-10-17T18:00:00-03:00',
      '2026-10-18T16:30:00-03:00',
      '2026-10-23T18:00:00-03:00',
      '2026-10-24T18:00:00-03:00',
      '2026-10-25T16:30:00-03:00',
    ]);
    expect(e.occurrences[2]).toMatchObject({
      startDate: '2026-10-18',
      sourceDateText: 'Domingos 18 y 25 de octubre, 16.30 horas.',
      venue: {
        name: 'Teatro San Martín',
        room: 'Hall Alfredo Alcón',
        address: 'Av. Corrientes 1530',
      },
      price: { text: 'Entrada gratuita', verified: true, isFree: true },
      status: 'scheduled',
    });
  });

  it('LOS QUE HABLAN: Teatro Sarmiento sin sala, dirección publicada, precio literal', () => {
    const e = eventOf('los_que_hablan');
    expect(e.disciplines).toEqual(['teatro_escenicas']);
    expect(e.durationMinutes).toBe(70);
    expect(e.priceText).toBe('Platea $ 32.000');
    expect(e.ticketsUrl).toBe('https://www.ticketek.com.ar/los-que-hablan/teatro-sarmiento');
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-16T20:00:00-03:00',
      '2026-10-17T20:00:00-03:00',
      '2026-10-18T20:00:00-03:00',
    ]);
    expect(e.occurrences[0]?.venue).toEqual({
      name: 'Teatro Sarmiento',
      address: 'Av. Sarmiento 2715',
      addressSourceUrl: DETAIL('los_que_hablan'),
    });
    expect(e.occurrences[0]?.price).toEqual({ text: 'Platea $ 32.000', verified: true });
  });

  it('A CIELO ABIERTO / INVASIONES I: patrón semanal sin temporada publicada → candidatos', () => {
    // "Jueves a domingos, 20 horas" sin inicio ni fin: la agenda lo lista del 15-10 al 08-11,
    // pero la agenda también lista obras fuera de temporada. Sin funciones, sin inventar.
    for (const slug of ['a-cielo-abierto', 'invasiones-1', 'la_lluvia_de_fuego']) {
      const p = all.get(slug);
      expect(p?.event?.occurrences).toEqual([]);
      expect(p?.warnings.join('\n')).toMatch(/sin temporada publicada/);
    }
    expect(eventOf('a-cielo-abierto').title).toBe('A CIELO ABIERTO');
  });

  it('Shohei Imamura bis: "16.30 y 20.30 horas" → dos funciones el mismo día', () => {
    const e = eventOf('shohei-imamura-bis');
    expect(e.disciplines).toEqual(['cine']);
    expect(e.imageCredit).toBe('Foto: ©Imamura Productions・TOEI COMPANY, LTD');
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-29T16:30:00-03:00',
      '2026-10-29T20:30:00-03:00',
    ]);
    expect(e.occurrences[0]?.externalId).toBe('shohei-imamura-bis|2026-10-29|16:30');
    expect(e.occurrences[0]?.venue?.room).toBe('Sala Leopoldo Lugones');
    expect(e.occurrences[0]?.price).toEqual({
      text: 'Entrada general $ 12.000 Estudiantes y jubilados $7.000.-',
      verified: true,
    });
  });

  it('LA ISLA: muestra con rango literal y venue externo sin dirección (candidato)', () => {
    const e = eventOf('la-isla-el-teatro-san-martin-en-dictaduras');
    expect(e.title).toBe('LA ISLA. EL TEATRO SAN MARTÍN EN DICTADURAS');
    expect(e.isFree).toBe(true);
    expect(e.description).toContain('es una muestra sobre el Teatro San Martín');
    expect(e.occurrences).toEqual([
      expect.objectContaining({
        externalId: 'la-isla-el-teatro-san-martin-en-dictaduras|2026-09-15|2026-11-28',
        kind: 'range',
        startsAt: '2026-09-15T00:00:00-03:00',
        endsAt: '2026-11-28T23:59:59-03:00',
        startDate: '2026-09-15',
        endDate: '2026-11-28',
        scheduleText:
          'Del 15 de septiembre al 28 de noviembre, de lunes a sábados de 11 a 20 horas',
        venue: { name: 'Casa de la Cultura', room: 'Espacio Las Rotativas' },
      }),
    ]);
    expect(all.get('la-isla-el-teatro-san-martin-en-dictaduras')?.reasons).toEqual([
      'missing:venue',
    ]);
  });

  it('LAS FURIAS: "Miércoles 28" + "A las 18 horas" / "A las 21 horas" de la grilla en <p>', () => {
    // Funciones: "Miércoles 28 de octubre" (sin hora); .details: <p><strong>Miércoles 28</strong></p>
    // <p>A las 18 horas</p> … <p>A las 21 horas</p>.
    const e = eventOf('las-furias-y-lo-que-le-paso-a-reynoso');
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-28T18:00:00-03:00',
      '2026-10-28T21:00:00-03:00',
    ]);
    expect(e.occurrences[0]).toMatchObject({
      kind: 'timed',
      sourceDateText: 'Miércoles 28 · A las 18 horas',
      venue: {
        name: 'Teatro San Martín',
        room: 'Sala Leopoldo Lugones',
        address: 'Av. Corrientes 1530',
      },
    });
  });

  it('SEIS TARDES CON MAE WEST: la grilla completa reemplaza al rango "Del 15 al 22 de octubre"', () => {
    const e = eventOf('seis-tardes-con-mae-west');
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-15T15:00:00-03:00',
      '2026-10-16T15:00:00-03:00',
      '2026-10-18T15:00:00-03:00',
      '2026-10-20T15:00:00-03:00',
      '2026-10-21T15:00:00-03:00',
      '2026-10-22T15:00:00-03:00',
    ]);
    // "Viernes 16" … película … "A las 15 horas (66’; DM).": la hora sigue al día en la grilla.
    expect(e.occurrences[1]?.sourceDateText).toBe('Viernes 16 · A las 15 horas (66’; DM).');
  });

  it('EL TREN FLUVIAL: líneas "Jueves 15, 17.30 horas" con el mes de "A partir del 8 de octubre"', () => {
    const e = eventOf('el-tren-fluvial');
    expect(e.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-08T21:00:00-03:00',
      '2026-10-09T21:00:00-03:00',
      '2026-10-10T18:00:00-03:00',
      '2026-10-11T21:00:00-03:00',
      '2026-10-13T21:00:00-03:00',
      '2026-10-14T18:00:00-03:00',
      '2026-10-15T17:30:00-03:00',
    ]);
    // La agenda también lo lista el 16-10, que la grilla no publica: no se emite.
    expect(e.occurrences.map((o) => o.startDate)).not.toContain('2026-10-16');
  });

  it('MELISSA ALDANA: entradas sin tracking, Cinema Kabuki gratis, Frankenstein desde la grilla', () => {
    const aldana = eventOf('melissa-aldana');
    expect(aldana.ticketsUrl).toBe(
      'https://comprar.tuentrada.com/tuentradaab/select/2720146?viewCode=Vista_Principal',
    );
    expect(aldana.disciplines).toEqual(['musica_vivo_jazz']);
    expect(aldana.occurrences.map((o) => o.startsAt)).toEqual(['2026-10-20T20:00:00-03:00']);

    const kabuki = eventOf('cinema-kabuki');
    expect(kabuki.isFree).toBe(true);
    expect(kabuki.priceText).toBe('ENTRADA GRATUITA');
    expect(kabuki.occurrences.map((o) => o.startsAt)).toEqual(['2026-10-18T18:00:00-03:00']);

    const frankenstein = eventOf('el-joven-frankenstein');
    expect(frankenstein.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-31T21:00:00-03:00',
      '2026-11-01T18:00:00-03:00',
      '2026-11-07T18:00:00-03:00',
      '2026-11-08T21:00:00-03:00',
    ]);

    const milonga = eventOf('milonga_en_el_plata');
    expect(milonga.disciplines).toEqual(['musica_vivo_jazz']);
    expect(milonga.tags).toEqual(['actividades especiales', 'musica']);
    expect(milonga.occurrences.map((o) => o.startsAt)).toEqual([
      '2026-10-23T19:00:00-03:00',
      '2026-10-30T19:00:00-03:00',
    ]);
  });

  it('snapshot del normalizado de dos eventos', async () => {
    const strip = (e: NormalizedEvent) => {
      const { rawFragment: _raw, ...rest } = e;
      return rest;
    };
    const snapshot = JSON.stringify(
      [strip(eventOf('oxitocina')), strip(eventOf('paisajes-coreograficos'))],
      null,
      2,
    );
    await expect(snapshot).toMatchFileSnapshot(
      './__snapshots__/oxitocina-paisajes.normalized.snap',
    );
  });
});

describe('complejo-teatral · parseSchedule (puro)', () => {
  const run = (functionsText: string, extra: Partial<Parameters<typeof parseSchedule>[0]> = {}) =>
    parseSchedule({ functionsText, now: NOW, ...extra });
  const starts = (r: ReturnType<typeof parseSchedule>) =>
    r.specs.map((s) =>
      s.kind === 'timed'
        ? `${s.date} ${s.time.hour}:${String(s.time.minute).padStart(2, '0')}`
        : `${s.start}..${s.end}`,
    );

  it('fechas enumeradas con variantes tipográficas', () => {
    expect(starts(run('Sábado 31 octubre y domingo 1º de noviembre, 18 horas'))).toEqual([
      '2026-10-31 18:00',
      '2026-11-01 18:00',
    ]);
    expect(starts(run('Jueves 29 de octubre, 16.30 y 20.30 horas'))).toEqual([
      '2026-10-29 16:30',
      '2026-10-29 20:30',
    ]);
    expect(starts(run('Domingo 18 de octubre. 18 horas'))).toEqual(['2026-10-18 18:00']);
    expect(
      starts(
        run(
          'Sábados 10 y 17, y domingos 11 y 18 de octubre, 18 horas\nSábado 24 y domingo 25 de octubre, 17 horas',
        ),
      ),
    ).toEqual([
      '2026-10-10 18:00',
      '2026-10-11 18:00',
      '2026-10-17 18:00',
      '2026-10-18 18:00',
      '2026-10-24 17:00',
      '2026-10-25 17:00',
    ]);
    expect(starts(run('Viernes 23 y 30 de octubre, 19 horas'))).toEqual([
      '2026-10-23 19:00',
      '2026-10-30 19:00',
    ]);
  });

  it('sin hora no hay función; día de semana incoherente se descarta', () => {
    const noHour = run('Miércoles 28 de octubre');
    expect(noHour.specs).toEqual([]);
    expect(noHour.warnings.join('\n')).toMatch(/fecha sin hora/);
    const wrongWeekday = run('Lunes 17 de octubre, 20 horas'); // el 17/10/2026 es sábado
    expect(wrongWeekday.specs).toEqual([]);
    expect(wrongWeekday.warnings.join('\n')).toMatch(/día de semana no coincide/);
    expect(
      run('2 funciones: sábado 17 de octubre, 20 horas').specs.map((s) =>
        s.kind === 'timed' ? s.date : '',
      ),
    ).toEqual(['2026-10-17']);
  });

  it('patrón semanal: solo los días confirmados por la agenda, con la hora de ese día', () => {
    const r = run(
      'Del 14 de octubre al 1 de noviembre\nMiércoles a sábados, 20.30 horas. Domingos, 19.30 horas',
      { agendaDays: ['2026-10-17', '2026-10-18', '2026-10-19'] },
    );
    expect(r.form).toBe('weekly');
    expect(starts(r)).toEqual(['2026-10-17 20:30', '2026-10-18 19:30']);
    expect(r.warnings.join('\n')).toMatch(/2026-10-19 pero el patrón no publica hora/);
    expect(run('Jueves a domingos, 20 horas').specs).toEqual([]);
    const weekend = { agendaDays: ['2026-10-24', '2026-10-25'] };
    expect(run('Sábados y domingos, 15 horas', weekend).specs).toEqual([]);
    expect(
      starts(
        run('Sábados y domingos, 15 horas', { ...weekend, notes: ['Del 24 al 25 de octubre'] }),
      ),
    ).toEqual(['2026-10-24 15:00', '2026-10-25 15:00']);
  });

  it('patrón semanal acotado por rango numérico y por avisos en rojo', () => {
    const bounded = run('Desde el 17/10 hasta el 1°/11\n\nJueves a domingos, 19.30 horas', {
      agendaDays: ['2026-10-16', '2026-10-17', '2026-11-05'],
    });
    expect(starts(bounded)).toEqual(['2026-10-17 19:30']);
    const excluded = run('Jueves a domingos, 20 horas', {
      agendaDays: ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-22'],
      notes: [
        'Desde el jueves 15 de octubre hasta el domingo 1° de noviembre',
        'Viernes 16, sábado 17 y domingo 18 de octubre no habrá funciones',
      ],
    });
    expect(starts(excluded)).toEqual(['2026-10-22 20:00']);
    const fromNote = run('Miércoles a sábados, 20 horas. Domingos, 19 horas', {
      agendaDays: ['2026-10-22', '2026-10-24', '2026-10-25', '2026-11-04'],
      notes: ['Desde el 24 de octubre', 'Hasta el 1 de noviembre'],
    });
    expect(starts(fromNote)).toEqual(['2026-10-24 20:00', '2026-10-25 19:00']);
  });

  it('rangos: ambos extremos publicados → range; sin fin o sin fechas → nada', () => {
    expect(starts(run('Del 1° al 14 de octubre'))).toEqual(['2026-10-01..2026-10-14']);
    expect(starts(run('Del 23 de octubre al 6 de noviembre'))).toEqual(['2026-10-23..2026-11-06']);
    expect(starts(run('Desde el martes 6 de octubre hasta el domingo 1° de noviembre'))).toEqual([
      '2026-10-06..2026-11-01',
    ]);
    const isla = run(
      'Del 15 de septiembre al 28 de noviembre, de lunes a sábados de 11 a 20 horas',
    );
    expect(isla.form).toBe('range');
    expect(isla.specs[0]).toMatchObject({ kind: 'range', start: '2026-09-15', end: '2026-11-28' });
    expect(run('A partir del 8 de octubre').specs).toEqual([]);
    expect(run('Marzo a noviembre').specs).toEqual([]);
    expect(run('Martes a viernes, 14 a 21 horas\nSábados y domingos, 13 a 20 horas').specs).toEqual(
      [],
    );
    expect(run('').warnings).toContain('sin texto de funciones');
  });

  it('estado por aviso: agotada/cancelada/postergada sobre fechas puntuales o todo el evento', () => {
    const soldOut = run('Sábado 17 y domingo 18 de octubre, 20 horas', {
      notes: ['Función del sábado 17 de octubre agotada'],
    });
    expect(soldOut.specs.map((s) => (s.kind === 'timed' ? s.status : ''))).toEqual([
      'sold_out',
      'scheduled',
    ]);
    const cancelled = run('Sábado 17 y domingo 18 de octubre, 20 horas', {
      notes: ['Funciones canceladas'],
    });
    expect(cancelled.specs.map((s) => (s.kind === 'timed' ? s.status : ''))).toEqual([
      'cancelled',
      'cancelled',
    ]);
    expect(cancelled.specs[0]).toMatchObject({ statusReason: 'Funciones canceladas' });
  });

  it('grilla de ciclos de cine solo cuando no hay otra fecha y todas las líneas parsean', () => {
    const grid = run('A partir del sábado 31 de octubre', {
      gridLines: ['Sábado 31 de octubre, 21 horas', 'Domingo 1° de noviembre, 18 horas'],
    });
    expect(grid.form).toBe('grid');
    expect(starts(grid)).toEqual(['2026-10-31 21:00', '2026-11-01 18:00']);
    const partial = run('A partir del sábado 31 de octubre', {
      gridLines: [
        'Sábado 31 de octubre, 21 horas',
        'Noche tras noche (1932)',
        'Trasnoche: 23 horas',
      ],
    });
    expect(partial.specs).toEqual([]);
  });
});

describe('complejo-teatral · mapeos', () => {
  it('categorías → disciplinas', () => {
    expect(mapCategories('teatro').disciplines).toEqual(['teatro_escenicas']);
    expect(mapCategories('danza').disciplines).toEqual(['danza']);
    expect(mapCategories('cine').disciplines).toEqual(['cine']);
    expect(mapCategories('música').disciplines).toEqual(['musica_vivo_jazz']);
    expect(mapCategories('fotogalería').disciplines).toEqual(['fotografia_artes_visuales']);
    expect(mapCategories('opera rock').disciplines).toEqual(['teatro_escenicas']);
    expect(mapCategories('para grandes y chicos')).toMatchObject({
      disciplines: ['teatro_escenicas'],
      tags: ['para grandes y chicos', 'infantil'],
    });
    expect(mapCategories('actividades especiales').disciplines).toEqual(['otros']);
    expect(mapCategories('actividades especiales | música').disciplines).toEqual([
      'musica_vivo_jazz',
    ]);
    expect(mapCategories('categoría nueva')).toMatchObject({ disciplines: ['otros'] });
    expect(mapCategories('').disciplines).toEqual([]);
    expect(mapCategories(null).disciplines).toEqual([]);
  });

  it('salas y teatros → VenueRef sin inventar direcciones', () => {
    expect(splitPlace('Sala Cunill Cabanellas / Teatro San Martín')).toEqual({
      room: 'Sala Cunill Cabanellas',
      theatre: 'Teatro San Martín',
    });
    expect(splitPlace('/ Teatro Regio')).toEqual({ room: null, theatre: 'Teatro Regio' });
    expect(splitPlace('')).toEqual({ room: null, theatre: null });
    expect(canonicalTheatreName('TEATRO SAN MARTIN')).toBe('Teatro San Martín');
    expect(canonicalTheatreName('Teatro Coliseo')).toBe('Teatro Coliseo');
    expect(
      buildVenueRef({ theatre: 'Teatro Regio', room: null, address: null, addressSourceUrl: null }),
    ).toEqual({ name: 'Teatro Regio' });
    expect(
      buildVenueRef({
        theatre: 'Teatro Regio',
        room: 'Sala Principal',
        address: 'Av. Córdoba 6056',
        addressSourceUrl: DETAIL('a-cielo-abierto'),
      }),
    ).toEqual({
      name: 'Teatro Regio',
      room: 'Sala Principal',
      address: 'Av. Córdoba 6056',
      addressSourceUrl: DETAIL('a-cielo-abierto'),
    });
    expect(
      buildVenueRef({ theatre: null, room: 'Sala', address: null, addressSourceUrl: null }),
    ).toBeNull();
  });
});
