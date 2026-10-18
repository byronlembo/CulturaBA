import { BA_TZ } from '@culturaba/shared';
import { DateTime } from 'luxon';
import {
  type CalendarFunction,
  expandWeekly,
  formatTime,
  MAX_EXPANSION_DAYS,
  type OccurrenceSpec,
  parseDmy,
  parseScheduleText,
  planOccurrences,
  type Season,
  scanWeekdays,
  splitSentences,
} from './dates';

/**
 * Textos LITERALES del bloque lateral (`.sidebar-block > b`) de www.teatrocervantes.gob.ar,
 * relevados el 18-oct-2026 (ver docs/research/teatro-cervantes.md §5).
 */
const NOW = DateTime.fromISO('2026-10-18T12:00:00', { zone: BA_TZ });

function at(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: BA_TZ });
}

function timedKeys(specs: OccurrenceSpec[]): string[] {
  return specs.map((s) =>
    s.kind === 'timed' ? `${s.date} ${formatTime(s.time)}` : `range ${s.start}…${s.end}`,
  );
}

function cal(date: string, hhmm: string): CalendarFunction {
  const [hour, minute] = hhmm.split(':').map(Number);
  return {
    date,
    time: { hour: hour ?? 0, minute: minute ?? 0 },
    sourceText: `Calendario ${date} · ${hhmm}hs.`,
  };
}

describe('parseDmy (fecha_estreno / ultima_funcion del REST)', () => {
  it('lee dd/mm/aaaa con y sin ceros', () => {
    expect(parseDmy('29/10/2026')).toBe('2026-10-29');
    expect(parseDmy('5/2/2026')).toBe('2026-02-05');
    expect(parseDmy(' 13/12/2026 ')).toBe('2026-12-13');
  });
  it('no adivina: año mal tipeado, fecha inexistente o vacío → null', () => {
    expect(parseDmy('12/12/20225')).toBeNull(); // "la-revista-del-cervantes-2" en el REST
    expect(parseDmy('31/02/2026')).toBeNull();
    expect(parseDmy('')).toBeNull();
    expect(parseDmy(null)).toBeNull();
  });
});

describe('scanWeekdays', () => {
  it('rangos y listas de días', () => {
    expect(scanWeekdays('de jueves a domingo a las 21 h')).toEqual([4, 5, 6, 7]);
    expect(scanWeekdays('de jueves a domingos a las 18 h')).toEqual([4, 5, 6, 7]);
    expect(scanWeekdays('funciones viernes y sabados a las 21 h')).toEqual([5, 6]);
    expect(scanWeekdays('de viernes a domingo')).toEqual([5, 6, 7]);
    expect(scanWeekdays('publico general: lunes 11 h')).toEqual([1]);
    expect(scanWeekdays('viernes a lunes')).toEqual([1, 5, 6, 7]);
  });
});

describe('splitSentences', () => {
  it('corta en líneas y en ". " + letra, nunca en "20.30"', () => {
    expect(
      splitSentences(
        'Entradas gratuitas. Para los conciertos en el TNC, a partir de las 10 h. Capacidad limitada.\n\nViernes 20.30 h',
      ),
    ).toEqual([
      'Entradas gratuitas.',
      'Para los conciertos en el TNC, a partir de las 10 h.',
      'Capacidad limitada.',
      'Viernes 20.30 h',
    ]);
  });
});

describe('parseScheduleText · textos literales del sitio', () => {
  const season = (start: string | null, end: string | null): Season => ({ start, end });

  it('"De jueves a domingo a las 21 h" (El movimiento) → patrón semanal', () => {
    const r = parseScheduleText('De jueves a domingo a las 21 h', {
      season: season('2026-10-29', '2026-12-13'),
      now: NOW,
    });
    expect(r.unsupported).toEqual([]);
    expect(r.enumerated).toEqual([]);
    expect(r.weekly).toEqual([
      {
        weekdays: [4, 5, 6, 7],
        times: [{ hour: 21, minute: 0 }],
        range: null,
        months: [],
        sourceText: 'De jueves a domingo a las 21 h',
      },
    ]);
  });

  it('"Viernes 20:30 h y sábados 20 h" bajo "Funciones en octubre" → una hora por día y mes', () => {
    const text =
      'Funciones en octubre\nViernes 20:30 h y sábados 20 h\nFunciones en noviembre\nJueves a las 20:30 h\nCasa de la Cultura (9 de julio 1043, General Roca)';
    const r = parseScheduleText(text, { season: season('2026-10-02', '2026-11-26'), now: NOW });
    expect(r.unsupported).toEqual([]);
    expect(r.untimedDates).toEqual([]); // "9 de julio" es una calle, fuera de temporada
    expect(r.weekly.map((w) => [w.weekdays, w.times.map(formatTime), w.months])).toEqual([
      [[5], ['20:30'], [10]],
      [[6], ['20:00'], [10]],
      [[4], ['20:30'], [11]],
    ]);
  });

  it('"Miércoles 17 y 24 de junio a las 20 h" (Borges, el eco infinito) → fechas enumeradas', () => {
    const r = parseScheduleText('Miércoles 17 y 24 de junio a las 20 h', {
      season: season('2026-06-17', '2026-06-24'),
      now: at('2026-06-01T12:00'),
    });
    expect(r.unsupported).toEqual([]);
    expect(r.weekly).toEqual([]);
    expect(r.enumerated.map((f) => `${f.date} ${formatTime(f.time)}`)).toEqual([
      '2026-06-17 20:00',
      '2026-06-24 20:00',
    ]);
  });

  it('"Sábado 25 y domingo 26 de abril y sábado 2 y domingo 3 de mayo a las 15 h" (Sanctum Quixote)', () => {
    const r = parseScheduleText(
      'Sábado 25 y domingo 26 de abril y sábado 2 y domingo 3 de mayo a las 15 h',
      { season: season('2026-04-25', '2026-05-03'), now: at('2026-04-20T12:00') },
    );
    expect(r.unsupported).toEqual([]);
    expect(r.enumerated.map((f) => `${f.date} ${formatTime(f.time)}`)).toEqual([
      '2026-04-25 15:00',
      '2026-04-26 15:00',
      '2026-05-02 15:00',
      '2026-05-03 15:00',
    ]);
  });

  it('"(Excepto viernes 25/9, 2 y 9/10 a las 20 h)" → no legible con certeza', () => {
    const text =
      'Funciones viernes y sábados a las 21 h\n(Excepto viernes 25/9, 2 y 9/10 a las 20 h)\nCasa de la Cultura Municipalidad de Lago Puelo\nEntradas en la boletería de la sala, de 9 a 14 h de lunes a viernes.';
    const r = parseScheduleText(text, { season: season('2026-09-04', '2026-10-24'), now: NOW });
    expect(r.unsupported).toEqual(['(Excepto viernes 25/9, 2 y 9/10 a las 20 h)']);
    expect(r.weekly).toHaveLength(1); // la regla existe, pero el plan no la usa
  });

  it('"Vacaciones de invierno del … al … de miércoles a domingo" + "luego de vacaciones" (El Mago de Oz)', () => {
    const text =
      'Vacaciones de invierno del jueves 16 de julio al 2 de agosto de miércoles a domingo a las 14:30 h.\nPara público general luego de vacaciones de invierno: sábados y domingos a las 14:30 h.';
    const r = parseScheduleText(text, {
      season: season('2026-07-16', '2026-09-27'),
      now: at('2026-07-10T12:00'),
    });
    expect(r.weekly).toEqual([
      {
        weekdays: [3, 4, 5, 6, 7],
        times: [{ hour: 14, minute: 30 }],
        range: { start: '2026-07-16', end: '2026-08-02' },
        months: [],
        sourceText:
          'Vacaciones de invierno del jueves 16 de julio al 2 de agosto de miércoles a domingo a las 14:30 h.',
      },
    ]);
    expect(r.unsupported).toEqual([
      'Para público general luego de vacaciones de invierno: sábados y domingos a las 14:30 h.',
    ]);
  });

  it('"28, 29 y 30 de agosto de 2026" sin hora (Cervantes Electroacústico) → fechas sin función', () => {
    const text =
      '28, 29 y 30 de agosto de 2026\nTeatro Nacional Cervantes\nBuenos Aires – Argentina\nLa entrada a los conciertos es gratuita, retirando la entrada en la boletería del TNC y/o reservando en la web, el mismo día del concierto a partir de las 10 h.';
    const r = parseScheduleText(text, { season: season('2026-08-28', '2026-08-30'), now: NOW });
    expect(r.untimedDates).toEqual(['2026-08-28', '2026-08-29', '2026-08-30']);
    expect(r.enumerated).toEqual([]);
    expect(r.weekly).toEqual([]);
    expect(r.unsupported).toEqual([]);
  });

  it('visitas guiadas: lunes 11 h al público; los grupos con inscripción y la boletería no son funciones', () => {
    const text =
      'Público general: lunes 11 h\nEntradas por Alternativa Teatral o en boletería de miércoles a domingo de 10 a 22 h\nGrupos de instituciones educativas de niveles medio y superior y comunidades, a partir de los 16 años: lunes 14 h\nEntradas con inscripción previa.';
    const r = parseScheduleText(text, { season: season('2026-05-04', null), now: NOW });
    expect(r.unsupported).toEqual([]);
    expect(r.weekly.map((w) => [w.weekdays, w.times.map(formatTime)])).toEqual([[[1], ['11:00']]]);
    expect(r.warnings.some((w) => w.includes('grupos con inscripción'))).toBe(true);
  });

  it('frases de entradas con horas ("a partir de las 10 h") no son funciones', () => {
    const text =
      'Entradas gratuitas. Para los conciertos en el TNC, se pueden retirar en la boletería o reservar en Alternativa Teatral, el mismo día de la función a partir de las 10 h. Capacidad limitada.\n\nLos conciertos en otras sedes son con entrada libre y gratuita.';
    const r = parseScheduleText(text, { season: season('2026-03-25', null), now: NOW });
    expect(r).toMatchObject({ enumerated: [], weekly: [], unsupported: [], untimedDates: [] });
  });

  it('horario de apertura, día sin mes y día de semana incoherente → no legibles', () => {
    const ctx = { season: season('2026-10-01', '2026-10-31'), now: NOW };
    expect(parseScheduleText('Martes a domingos de 14 a 20 h', ctx).unsupported).toHaveLength(1);
    expect(parseScheduleText('Jueves 22 a las 20 h', ctx).unsupported).toHaveLength(1);
    // El 24/10/2026 es sábado.
    const wrong = parseScheduleText('Viernes 24 de octubre a las 20 h', ctx);
    expect(wrong.unsupported).toHaveLength(1);
    expect(wrong.enumerated).toEqual([]);
  });

  it('avisos de estado: con fecha, sin fecha y "agotado"', () => {
    const r = parseScheduleText(
      'De jueves a domingo a las 20 h\nFunción del sábado 24 de octubre suspendida\nFunciones agotadas',
      { season: season('2026-10-01', '2026-10-31'), now: NOW },
    );
    expect(r.statusNotes).toEqual([
      {
        status: 'cancelled',
        dates: ['2026-10-24'],
        text: 'Función del sábado 24 de octubre suspendida',
      },
      { status: 'sold_out', dates: [], text: 'Funciones agotadas' },
    ]);
    expect(r.unsupported).toEqual([]);
    expect(r.weekly).toHaveLength(1);
  });
});

describe('expandWeekly', () => {
  it('días de la regla dentro de los límites, el subrango y los meses del encabezado', () => {
    const rule = {
      weekdays: [5, 6],
      times: [{ hour: 20, minute: 0 }],
      range: null,
      months: [10],
      sourceText: 'x',
    };
    expect(
      expandWeekly(rule, { start: '2026-10-18', end: '2026-11-08' }).map((f) => f.date),
    ).toEqual(['2026-10-23', '2026-10-24', '2026-10-30', '2026-10-31']);
  });
});

describe('planOccurrences', () => {
  const movimiento = {
    calendar: [],
    calendarWindow: { start: '2026-10-18', end: '2026-12-31' },
    scheduleText: 'De jueves a domingo a las 21 h',
    season: { start: '2026-10-29', end: '2026-12-13' },
    seasonText: 'Fecha estreno 29/10/2026 · Última función 13/12/2026',
    now: NOW,
  };

  it('sin calendario: patrón semanal × temporada publicada (El movimiento) → 28 funciones', () => {
    const plan = planOccurrences(movimiento);
    expect(plan.form).toBe('text');
    const keys = timedKeys(plan.specs);
    expect(keys).toHaveLength(28);
    expect(keys.slice(0, 5)).toEqual([
      '2026-10-29 21:00',
      '2026-10-30 21:00',
      '2026-10-31 21:00',
      '2026-11-01 21:00',
      '2026-11-05 21:00',
    ]);
    expect(keys.at(-1)).toBe('2026-12-13 21:00');
    expect(plan.warnings).toEqual([
      'el calendario del sitio (2026-10-18 – 2026-12-31) no lista la obra: se usa el texto publicado',
    ]);
  });

  it('el calendario manda: sus días y horas, desde hoy y dentro de la temporada', () => {
    const plan = planOccurrences({
      ...movimiento,
      scheduleText: 'De jueves a domingo a las 20 h',
      season: { start: '2026-09-03', end: '2026-10-25' },
      calendar: [
        cal('2026-10-17', '20:00'), // pasado
        cal('2026-10-18', '20:00'),
        cal('2026-10-22', '20:30'), // hora distinta a la del texto: se publica, con aviso
        cal('2026-10-29', '20:00'), // después de la última función
      ],
    });
    expect(plan.form).toBe('calendar');
    expect(timedKeys(plan.specs)).toEqual(['2026-10-18 20:00', '2026-10-22 20:30']);
    expect(plan.specs[0]).toMatchObject({ sourceText: 'Calendario 2026-10-18 · 20:00hs.' });
    expect(plan.warnings).toEqual([
      'el calendario lista 2026-10-29 20:00 fuera de la temporada publicada (2026-09-03 – 2026-10-25): no se emite',
      'el calendario publica 2026-10-22 20:30 y el texto otra hora para ese día',
    ]);
  });

  it('el calendario sirve sin última función (visitas guiadas: lunes, sin el feriado del 12/10)', () => {
    const plan = planOccurrences({
      calendar: [
        cal('2026-10-05', '11:00'),
        cal('2026-10-19', '11:00'),
        cal('2026-10-26', '11:00'),
      ],
      calendarWindow: { start: '2026-10-18', end: '2026-12-31' },
      scheduleText: 'Público general: lunes 11 h',
      season: { start: '2026-05-04', end: null },
      now: NOW,
    });
    expect(timedKeys(plan.specs)).toEqual(['2026-10-19 11:00', '2026-10-26 11:00']);
  });

  it('patrón semanal sin última función publicada → nada (candidato)', () => {
    const plan = planOccurrences({
      ...movimiento,
      calendarWindow: null,
      scheduleText: 'Público general: lunes 11 h',
      season: { start: '2026-05-04', end: null },
      seasonText: 'Fecha estreno 04/05/2026',
    });
    expect(plan.specs).toEqual([]);
    expect(plan.form).toBe('none');
    expect(plan.warnings).toContain(
      'patrón semanal sin temporada publicada ("Público general: lunes 11 h"; estreno 2026-05-04, última función …): no se emiten funciones',
    );
  });

  it('texto no legible con temporada → rango honesto con el texto literal', () => {
    const plan = planOccurrences({
      calendar: [],
      calendarWindow: null,
      scheduleText:
        'Funciones viernes y sábados a las 21 h\n(Excepto viernes 25/9, 2 y 9/10 a las 20 h)',
      season: { start: '2026-09-04', end: '2026-10-24' },
      seasonText: 'Fecha estreno 04/09/2026 · Última función 24/10/2026',
      now: NOW,
    });
    expect(plan.form).toBe('range');
    expect(plan.specs).toEqual([
      {
        kind: 'range',
        start: '2026-09-04',
        end: '2026-10-24',
        scheduleText:
          'Funciones viernes y sábados a las 21 h · (Excepto viernes 25/9, 2 y 9/10 a las 20 h)',
        sourceText: 'Fecha estreno 04/09/2026 · Última función 24/10/2026',
      },
    ]);
  });

  it('fechas sin hora con temporada → rango (Cervantes Electroacústico)', () => {
    const plan = planOccurrences({
      calendar: [],
      calendarWindow: null,
      scheduleText: '28, 29 y 30 de agosto de 2026',
      season: { start: '2026-08-28', end: '2026-08-30' },
      seasonText: 'Fecha estreno 28/08/2026 · Última función 30/08/2026',
      now: at('2026-08-20T12:00'),
    });
    expect(timedKeys(plan.specs)).toEqual(['range 2026-08-28…2026-08-30']);
  });

  it('estados explícitos: suspendida con fecha, reprogramada se retira, sin fecha anula todo', () => {
    const base = {
      ...movimiento,
      season: { start: '2026-10-01', end: '2026-10-31' },
      calendar: [
        cal('2026-10-22', '20:00'),
        cal('2026-10-23', '20:00'),
        cal('2026-10-24', '20:00'),
      ],
    };
    const plan = planOccurrences({
      ...base,
      scheduleText:
        'De jueves a domingo a las 20 h\nFunción del sábado 24 de octubre suspendida\nLa función del jueves 22 de octubre fue reprogramada\nFunciones agotadas',
    });
    expect(timedKeys(plan.specs)).toEqual(['2026-10-23 20:00', '2026-10-24 20:00']);
    expect(plan.specs[1]).toMatchObject({
      status: 'cancelled',
      statusReason: 'Función del sábado 24 de octubre suspendida',
    });
    expect(plan.specs[0]).toMatchObject({ status: 'scheduled' });
    expect(plan.warnings).toContain(
      '"agotado" sin fecha atribuible ("Funciones agotadas"): se ignora',
    );

    const sinFecha = planOccurrences({ ...base, scheduleText: 'Funciones suspendidas' });
    expect(sinFecha.specs).toEqual([]);
    expect(sinFecha.form).toBe('none');

    const agotado = planOccurrences({
      ...base,
      scheduleText: 'Viernes 23 de octubre a las 20 h (agotado)',
    });
    expect(agotado.specs[1]).toMatchObject({ date: '2026-10-23', status: 'sold_out' });
  });

  it(`una temporada larga se expande como mucho ${MAX_EXPANSION_DAYS} días`, () => {
    const plan = planOccurrences({
      ...movimiento,
      season: { start: '2026-10-29', end: '2028-12-31' },
    });
    const last = plan.specs.at(-1);
    expect(last?.kind === 'timed' && last.date <= '2027-10-19').toBe(true);
    expect(plan.warnings.some((w) => w.includes('se expande solo hasta 2027-10-19'))).toBe(true);
  });

  it('sin funciones ni temporada → nada', () => {
    const plan = planOccurrences({
      calendar: [],
      calendarWindow: null,
      scheduleText: '',
      season: { start: '2026-03-25', end: null },
      now: NOW,
    });
    expect(plan).toEqual({
      specs: [],
      form: 'none',
      warnings: ['sin funciones ni temporada completa publicada: el evento queda candidato'],
    });
  });
});
