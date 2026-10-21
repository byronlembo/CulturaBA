import { DateTime } from 'luxon';
import {
  extractDates,
  formatTime,
  normalizeText,
  parseSchedule,
  parseTimes,
  resolveDay,
  type ScheduleSpec,
  uploadMonthOf,
  windowOf,
} from './dates';

const TZ = 'America/Argentina/Buenos_Aires';
/** Día de la captura de los fixtures (miércoles 21-oct-2026). */
const NOW = DateTime.fromISO('2026-10-21T12:00:00', { zone: TZ });
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ });

function schedule(lines: string[], uploadMonth: string | null = null, now = NOW) {
  return parseSchedule({ lines, now, uploadMonth });
}

function show(spec: ScheduleSpec): string {
  if (spec.kind === 'timed') {
    return `${spec.date} ${formatTime(spec.start)}${spec.end ? `-${formatTime(spec.end)}` : ''}`;
  }
  if (spec.kind === 'day') return `${spec.date} (día)`;
  return `${spec.start}..${spec.end}`;
}

const specs = (lines: string[], uploadMonth: string | null = null, now = NOW) =>
  schedule(lines, uploadMonth, now).specs.map(show);

const times = (text: string) =>
  parseTimes(normalizeText(text)).map(
    (s) => `${formatTime(s.start)}${s.end ? `-${formatTime(s.end)}` : ''}`,
  );

describe('planetario · ventana de fechas', () => {
  it('desde hoy − 7 días hasta hoy + 12 meses', () => {
    expect(windowOf(NOW)).toEqual({ cutoff: '2026-10-14', horizon: '2027-10-21' });
  });

  it('mes de carga de la imagen (Drupal guarda los archivos en AAAA-MM)', () => {
    expect(
      uploadMonthOf(
        'https://planetario.buenosaires.gob.ar/sites/default/files/2026-10/Sin%20t%C3%ADtulo%20%2822%29.png',
      ),
    ).toBe('2026-10');
    expect(
      uploadMonthOf(
        '/sites/default/files/styles/responsive_slideshow_style/public/2026-09/x.png?itok=EG',
      ),
    ).toBe('2026-09');
    expect(uploadMonthOf('/sites/default/files/inline-images/auricularesss.png')).toBeNull();
    expect(uploadMonthOf(null)).toBeNull();
  });
});

describe('planetario · horas (texto literal del "¿Cuándo?")', () => {
  it('una hora, con todas las grafías del sitio', () => {
    expect(times('18 h')).toEqual(['18:00']);
    expect(times('19h.')).toEqual(['19:00']);
    expect(times('19:30h')).toEqual(['19:30']);
    expect(times('19.30 h')).toEqual(['19:30']);
    expect(times('18.30 hs.')).toEqual(['18:30']);
    expect(times(', inicio 19 h')).toEqual(['19:00']);
    expect(times('a las 19 hs')).toEqual(['19:00']);
    expect(times('10:00 h')).toEqual(['10:00']);
    expect(times('⋅19:00')).toEqual(['19:00']);
    expect(times('a las 19.30')).toEqual(['19:30']);
    expect(times('desde las 15 h')).toEqual(['15:00']);
  });

  it('franjas y listas', () => {
    expect(times(', de 19 a 20.30 h.')).toEqual(['19:00-20:30']);
    expect(times('Horario: de 10 a 11:30 h')).toEqual(['10:00-11:30']);
    expect(times('17 a 21h')).toEqual(['17:00-21:00']);
    expect(times('Horario: miércoles 19 h a 21.45 h.')).toEqual(['19:00-21:45']);
    expect(times('a las 13 y 14 h')).toEqual(['13:00', '14:00']);
  });

  it('una franja que cruza la medianoche conserva solo el inicio (con aviso)', () => {
    const warnings: string[] = [];
    const slots = parseTimes(normalizeText('23.00 a 01.00 h'), (m) => warnings.push(m));
    expect(slots).toEqual([{ start: { hour: 23, minute: 0 }, end: null }]);
    expect(warnings).toEqual([
      'franja horaria que no termina el mismo día ("23.00 a 01.00 h"): se omite el fin',
    ]);
  });
});

describe('planetario · expresiones de fecha', () => {
  it('el día de semana se arrastra a los días siguientes; cada día puede traer el suyo', () => {
    const [sabados] = extractDates(normalizeText('Sábados 17, 24 y 31 de octubre de 2026')).exprs;
    expect(sabados?.items).toEqual([
      { day: 17, month: 10, year: 2026, weekday: 6 },
      { day: 24, month: 10, year: 2026, weekday: 6 },
      { day: 31, month: 10, year: 2026, weekday: 6 },
    ]);
    const [madre] = extractDates(
      normalizeText(
        'Las funciones serán el viernes 2, sábado 3, viernes 16 y sábado 17 de octubre, de 19 a 20.30 h.',
      ),
    ).exprs;
    expect(madre?.items.map((i) => `${i.weekday}:${i.day}/${i.month}`)).toEqual([
      '5:2/10',
      '6:3/10',
      '5:16/10',
      '6:17/10',
    ]);
  });

  it('"a las 13 y 14 h" son horas, no un rango de días', () => {
    const { exprs } = extractDates(normalizeText('Sábados 16 y 23 de agosto a las 13 y 14 h'));
    expect(exprs).toHaveLength(1);
    expect(exprs[0]?.rangeAt).toBeNull();
    expect(exprs[0]?.items.map((i) => i.day)).toEqual([16, 23]);
  });

  it('rangos: "Desde el sábado 18 de julio al domingo 2 de agosto"', () => {
    const [r] = extractDates(
      normalizeText('Desde el sábado 18 de julio al domingo 2 de agosto'),
    ).exprs;
    expect(r?.rangeAt).toBe(1);
    expect(r?.items).toEqual([
      { day: 18, month: 7, year: null, weekday: 6 },
      { day: 2, month: 8, year: null, weekday: 7 },
    ]);
  });

  it('patrón semanal: días de semana sin número antes de la fecha del feriado', () => {
    const line = extractDates(
      normalizeText('Funciones inmersivas en el domo sábados, domingos y lunes 12 de octubre'),
    );
    expect(line.weekly).toBe(true);
    expect(line.exprs[0]?.pattern).toBe(true);
    expect(extractDates(normalizeText('De martes a viernes 12.30 h'))).toEqual({
      exprs: [],
      weekly: true,
    });
  });
});

describe('planetario · año por el día de semana', () => {
  it('"Domingo 18 de octubre 18 h": 2026 (domingo), dentro de los 7 días de gracia', () => {
    expect(specs(['Domingo 18 de octubre 18 h'])).toEqual(['2026-10-18 18:00']);
  });

  it('"Viernes 9 de octubre 19 h": cayó viernes el 9-oct-2026, antes de hoy − 7 días → no se emite', () => {
    const s = schedule(['Viernes 9 de octubre 19 h']);
    expect([s.specs, s.past, s.unresolved, s.warnings]).toEqual([[], 1, 0, []]);
  });

  it('un día de semana que no coincide con ningún año de la ventana → se omite con aviso', () => {
    // "Ciencia desde tu celular" (2024): el 18 de octubre es domingo en 2026 y lunes en 2027.
    const s = schedule(['Viernes 18 de octubre 19 h']);
    expect([s.specs, s.past, s.unresolved]).toEqual([[], 0, 1]);
    expect(s.warnings).toEqual([
      '"Viernes 18 de octubre 19 h": ningún año entre 2026-10-14 y 2027-10-21 hace coincidir 18/10 con el día de semana publicado, se omite',
    ]);
    // Con el mes de carga de su imagen (2024-10) se sabe que es una charla archivada: sin aviso.
    expect(schedule(['Viernes 18 de octubre 19 h'], '2024-10').past).toBe(1);
  });

  it('el día de semana se repite cada 5-6 años: el mes de carga de la imagen lo desambigua', () => {
    // "La ciencia de la misión Perseverance" (2021): el 18 de marzo vuelve a ser jueves en 2027.
    expect(specs(['Jueves 18 de marzo 19 hs'])).toEqual(['2027-03-18 19:00']);
    const archived = schedule(['Jueves 18 de marzo 19 hs'], '2021-03');
    expect([archived.specs, archived.past, archived.warnings]).toEqual([[], 1, []]);
    // "Último encuentro de ciencia 2020": el 10 de diciembre es jueves en 2020 y en 2026.
    expect(specs(['Jueves 10 de diciembre 19 hs'], '2020-12')).toEqual([]);
    // Una tarjeta cargada este mes sí puede anunciar el jueves 18 de marzo de 2027.
    expect(specs(['Jueves 18 de marzo 19 hs'], '2026-10')).toEqual(['2027-03-18 19:00']);
  });

  it('fecha lejos de la publicación del ítem → ambigua, con aviso', () => {
    const r = resolveDay(
      { day: 30, month: 10, year: null, weekday: 5 },
      { now: NOW, uploadMonth: '2023-07' },
    );
    expect(r).toEqual({
      kind: 'unresolved',
      reason:
        'el día de semana ubica 30/10 el 2026-10-30, lejos de la publicación del ítem (imagen de 2023-07): ambigua',
    });
  });

  it('sin año ni día de semana → ambigua (aviso por fecha); con la imagen vieja, archivada', () => {
    const s = schedule([
      '12; 13 ; 14 ; 19 ; 20 y 21 de julio en la Sala de Espectáculos del Planetario.',
    ]);
    expect([s.specs, s.unresolved]).toEqual([[], 6]);
    expect(s.warnings[0]).toBe(
      '"12; 13 ; 14 ; 19 ; 20 y 21 de julio en la Sala de Espectáculos del Planetario.": fecha sin año ni día de semana (12/7): ambigua, se omite',
    );
    const archived = schedule(
      ['12; 13 ; 14 ; 19 ; 20 y 21 de julio en la Sala de Espectáculos del Planetario.'],
      '2024-07',
    );
    expect([archived.specs, archived.past, archived.unresolved]).toEqual([[], 6, 0]);
    // MUTEK 2026: "11 de octubre" podría ser 2026 (pasado) o 2027: ambigua aunque sea reciente.
    expect(schedule(['11 de octubre 17 a 21h'], '2026-10').unresolved).toBe(1);
  });

  it('con año explícito: ese año, y el día de semana tiene que coincidir', () => {
    expect(specs(['Sábados 17, 24 y 31 de octubre de 2026', 'Horario: de 10 a 11:30 h'])).toEqual([
      '2026-10-17 10:00-11:30',
      '2026-10-24 10:00-11:30',
      '2026-10-31 10:00-11:30',
    ]);
    expect(schedule(['Viernes 22 de noviembre de 2019 18.30 hs.']).past).toBe(1);
    // El 17-oct-2026 es sábado, no viernes.
    expect(schedule(['Viernes 17 de octubre de 2026 19 h']).warnings).toEqual([
      '"Viernes 17 de octubre de 2026 19 h": el día de semana publicado no coincide con 2026-10-17, se omite',
    ]);
  });
});

describe('planetario · "¿Cuándo?" completos del sitio', () => {
  it('formatos de hora de las charlas (con un "hoy" en que eran próximas)', () => {
    expect(specs(['Viernes 28 de noviembre 19:30h'], '2025-11', at('2025-11-10T12:00'))).toEqual([
      '2025-11-28 19:30',
    ]);
    expect(specs(['Viernes 9 de mayo , inicio 19 h'], '2025-04', at('2025-05-01T12:00'))).toEqual([
      '2025-05-09 19:00',
    ]);
    expect(specs(['Viernes 4 de julio 19.30 h'], '2025-06', at('2025-06-20T12:00'))).toEqual([
      '2025-07-04 19:30',
    ]);
    expect(specs(['Viernes 7 junio 19h.'], '2024-05', at('2024-05-20T12:00'))).toEqual([
      '2024-06-07 19:00',
    ]);
  });

  it('/agenda: "Sábados 24 y 31 de octubre 10:00 h"', () => {
    expect(specs(['Sábados 24 y 31 de octubre 10:00 h'])).toEqual([
      '2026-10-24 10:00',
      '2026-10-31 10:00',
    ]);
  });

  it('Madre Noche: las funciones del 2 y 3 ya pasaron; quedan 16 y 17 (dentro de la gracia)', () => {
    const s = schedule(
      [
        'Las funciones serán el viernes 2, sábado 3, viernes 16 y sábado 17 de octubre, de 19 a 20.30 h.',
      ],
      '2026-09',
    );
    expect([s.specs.map(show), s.past, s.warnings]).toEqual([
      ['2026-10-16 19:00-20:30', '2026-10-17 19:00-20:30'],
      2,
      [],
    ]);
  });

  it('curso con temporada publicada → un range con el horario literal (Cupo completo = sold_out)', () => {
    const s = schedule([
      'Cupo completo',
      'Inicio del curso: miércoles 2 de septiembre de 2026',
      'Horario: miércoles 19 h a 21.45 h.',
      'Última clase: miércoles 18 de noviembre de 2026',
      'ACTIVIDAD ARANCELADA',
      'Residentes $48.000.-',
    ]);
    expect(s.specs).toEqual([
      {
        kind: 'range',
        start: '2026-09-02',
        end: '2026-11-18',
        scheduleText: 'Horario: miércoles 19 h a 21.45 h.',
        sourceText:
          'Inicio del curso: miércoles 2 de septiembre de 2026 · Última clase: miércoles 18 de noviembre de 2026',
        status: 'sold_out',
      },
    ]);
  });

  it('rango "Desde el … al …" → range con el texto literal', () => {
    const s = schedule(
      ['Desde el sábado 18 de julio al domingo 2 de agosto'],
      '2026-06',
      at('2026-07-01T12:00'),
    );
    expect(s.specs).toEqual([
      {
        kind: 'range',
        start: '2026-07-18',
        end: '2026-08-02',
        scheduleText: 'Desde el sábado 18 de julio al domingo 2 de agosto',
        sourceText: 'Desde el sábado 18 de julio al domingo 2 de agosto',
        status: 'scheduled',
      },
    ]);
    // Hoy (21-oct) ya terminó: no se emite.
    expect(schedule(['Desde el sábado 18 de julio al domingo 2 de agosto']).specs).toEqual([]);
  });

  it('noche de observación: "La noche del jueves 27 al viernes 28 de agosto" → range', () => {
    expect(
      specs(
        ['La noche del jueves 27 al viernes 28 de agosto', '23.00 h – Bienvenida'],
        '2026-08',
        at('2026-08-01T12:00'),
      ),
    ).toEqual(['2026-08-27..2026-08-28']);
  });

  it('fecha sin hora → día suelto (se publica como range de un día, nunca all_day)', () => {
    expect(specs(['Sábado 24 de octubre'])).toEqual(['2026-10-24 (día)']);
  });

  it('estado: "ACTIVIDAD SUSPENDIDA" cancela; "Se suspende por lluvia" es solo una condición', () => {
    expect(
      schedule(['Viernes 30 de octubre 19 h', 'ACTIVIDAD SUSPENDIDA']).specs.map((s) => s.status),
    ).toEqual(['cancelled']);
    const rain = schedule(
      ['Sábado 19 de septiembre 19 a 21 h Se suspende por lluvia o cielo nublado.'],
      '2026-09',
      at('2026-09-01T12:00'),
    );
    expect(rain.specs.map((s) => [show(s), s.status])).toEqual([
      ['2026-09-19 19:00-21:00', 'scheduled'],
    ]);
  });

  it('"Reprogramado: Sábado 8 de agosto 15 h" publica la nueva fecha, con aviso', () => {
    const s = schedule(
      ['Reprogramado: Sábado 8 de agosto 15 h'],
      '2026-07',
      at('2026-08-01T12:00'),
    );
    expect([s.specs.map(show), s.warnings]).toEqual([
      ['2026-08-08 15:00'],
      [
        '"Reprogramado: Sábado 8 de agosto 15 h": aviso de reprogramación: se publica la fecha indicada',
      ],
    ]);
  });

  it('patrones semanales del domo y del museo: nunca funciones', () => {
    const vuelta = schedule(['De martes a viernes 12.30 h']);
    expect([vuelta.specs, vuelta.weekly, vuelta.warnings]).toEqual([
      [],
      ['De martes a viernes 12.30 h'],
      [
        'patrón semanal sin temporada publicada ("De martes a viernes 12.30 h"): no se emiten funciones',
      ],
    ]);
    expect(
      specs(['Funciones inmersivas en el domo sábados, domingos y lunes 12 de octubre']),
    ).toEqual([]);
    expect(specs(['Viernes 11.00 h Odisea espacial'])).toEqual([]);
    expect(specs(['Horarios y localidades disponibles en web de compra LINK'])).toEqual([]);
  });

  it('virtual ("por @PlanetarioBA Youtube") y fechas de inscripción no son funciones', () => {
    const yt = schedule(['Estreno viernes 12/8 a las 19 hs. por @PlanetarioBA Youtube']);
    expect([yt.specs, yt.warnings]).toEqual([
      [],
      [
        '"Estreno viernes 12/8 a las 19 hs. por @PlanetarioBA Youtube": actividad virtual: no se emite como función en un lugar',
      ],
    ]);
    const signup = schedule([
      'Actividad gratuita con inscripción previa. Reservá tu vacante a partir del miércoles 7 de octubre.',
    ]);
    expect([signup.specs, signup.past, signup.unresolved]).toEqual([[], 0, 0]);
  });
});
