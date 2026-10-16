import { DateTime } from 'luxon';
import { parseSchedule, type ScheduleInput } from './dates';

/**
 * Casos de la verificación adversarial (defectos fidelidad/robustez): texto literal o
 * sintético con la forma del sitio, y varios `now` donde el año importa.
 */

const at = (iso: string) => DateTime.fromISO(iso, { zone: 'America/Argentina/Buenos_Aires' });
const NOW = at('2026-10-14T12:00:00');
const NOWS = [at('2026-10-14T12:00:00'), at('2026-12-28T12:00:00'), at('2027-02-15T12:00:00')];

const run = (functionsText: string, extra: Partial<ScheduleInput> = {}) =>
  parseSchedule({ functionsText, now: NOW, ...extra });
const starts = (r: ReturnType<typeof parseSchedule>) =>
  r.specs.map((s) =>
    s.kind === 'timed'
      ? `${s.date} ${String(s.time.hour).padStart(2, '0')}:${String(s.time.minute).padStart(2, '0')}${s.status === 'scheduled' ? '' : ` ${s.status}`}`
      : `${s.start}..${s.end}`,
  );
const days = (from: string, to: string, weekdays: number[]) => {
  const out: string[] = [];
  for (let d = at(from); d <= at(to); d = d.plus({ days: 1 })) {
    if (weekdays.includes(d.weekday)) out.push(d.toISODate() ?? '');
  }
  return out;
};
const THU_SUN = days('2026-10-14', '2026-11-10', [4, 5, 6, 7]);

describe('horas: un número de día nunca se lee como hora', () => {
  it('"Jueves 15, 17.30 horas" (sin mes) no inventa las 15:00 ni otros jueves', () => {
    const r = run('Jueves 15, 17.30 horas', {
      agendaDays: ['2026-10-15', '2026-10-22', '2026-10-29'],
    });
    expect(r.specs).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/sin mes/);
  });

  it('"Sábado 24, 18 horas" sin mes no se expande a los sábados de la agenda', () => {
    const r = run('Jueves 22 y viernes 23 de octubre, 20 horas. Sábado 24, 18 horas', {
      agendaDays: ['2026-10-17', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-31'],
    });
    expect(starts(r)).toEqual(['2026-10-22 20:00', '2026-10-23 20:00']);
  });

  it('"Sábado 24/10, 20 horas": el mes 10 no es una hora', () => {
    expect(starts(run('Sábado 24/10, 20 horas', { agendaDays: ['2026-10-24'] }))).toEqual([
      '2026-10-24 20:00',
    ]);
    expect(
      starts(
        run('Sábado 24/10, 20 horas', {
          agendaDays: ['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07'],
        }),
      ),
    ).toEqual(['2026-10-24 20:00']);
  });

  it('"Sábado 31 de octubre y domingo 1, 18 horas": el "1" no es la 01:00', () => {
    const r = run('Sábado 31 de octubre y domingo 1, 18 horas');
    expect(starts(r)).toEqual(['2026-10-31 18:00']);
  });

  it('cada fecha recibe la hora que la sigue en el texto', () => {
    expect(
      starts(run('Sábado 17 de octubre, 18 horas, y domingo 18 de octubre, 20 horas')),
    ).toEqual(['2026-10-17 18:00', '2026-10-18 20:00']);
    expect(
      starts(run('Sábado 17 de octubre a las 18 horas y domingo 18 de octubre a las 20 horas')),
    ).toEqual(['2026-10-17 18:00', '2026-10-18 20:00']);
  });

  it('"a las 20" sin "horas" es una hora', () => {
    expect(starts(run('Martes 20 de octubre a las 20'))).toEqual(['2026-10-20 20:00']);
  });

  it('dos listas de horas para días de semana distintos no se mezclan', () => {
    const r = run(
      'Desde el 15 de octubre hasta el 1 de noviembre, miércoles a sábados 20.30 horas y domingos 19.30 horas',
      { agendaDays: ['2026-10-17', '2026-10-18'] },
    );
    expect(starts(r)).toEqual(['2026-10-17 20:30', '2026-10-18 19:30']);
  });
});

describe('fechas descartadas no caen a patrón semanal', () => {
  it('día de semana incoherente → nada (no "todos los viernes de la agenda")', () => {
    const r = run('Viernes 17 de octubre, 20 horas', {
      agendaDays: ['2026-10-16', '2026-10-23', '2026-10-30'],
    });
    expect(r.specs).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/día de semana no coincide/);
  });

  it('año explícito: se respeta y se verifica', () => {
    const saturdays = ['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07'];
    expect(
      starts(run('Sábado 16 de octubre de 2027, 20 horas', { agendaDays: saturdays })),
    ).toEqual(['2027-10-16 20:00']);
    expect(run('Sábado 17 de octubre de 2027, 20 horas', { agendaDays: saturdays }).specs).toEqual(
      [],
    );
  });

  it('mes antes del día o fecha inexistente → nada', () => {
    expect(
      run('Octubre: sábado 24 y domingo 25, 18 horas', {
        agendaDays: ['2026-10-17', '2026-10-18', '2026-10-24', '2026-10-25'],
      }).specs,
    ).toEqual([]);
    expect(
      run('Sábado 31 de noviembre, 20 horas', {
        agendaDays: ['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07'],
      }).specs,
    ).toEqual([]);
  });
});

describe('año de los rangos: sale del fin, nunca salta un año entero', () => {
  const ISLA = 'Del 15 de septiembre al 28 de noviembre, de lunes a sábados de 11 a 20 horas';
  const LAVELLI = 'Desde el martes 6 de octubre hasta el domingo 1° de noviembre';

  it('muestra en curso hace más de 60 días (LA ISLA, 20-11) sigue en 2026', () => {
    expect(starts(run(ISLA, { now: at('2026-11-20T12:00:00') }))).toEqual([
      '2026-09-15..2026-11-28',
    ]);
  });

  it('Lavelli el 06-12 (sigue listada después del fin) → 2026, no 2027', () => {
    expect(starts(run(LAVELLI, { now: at('2026-12-06T12:00:00') }))).toEqual([
      '2026-10-06..2026-11-01',
    ]);
  });

  it('"Del 1 de agosto al 30 de diciembre" el 01-10 → año en curso', () => {
    expect(
      starts(run('Del 1 de agosto al 30 de diciembre', { now: at('2026-10-01T12:00:00') })),
    ).toEqual(['2026-08-01..2026-12-30']);
  });

  it('rango de diciembre leído en enero → diciembre pasado', () => {
    expect(starts(run('Del 1 al 20 de diciembre', { now: at('2027-01-10T12:00:00') }))).toEqual([
      '2026-12-01..2026-12-20',
    ]);
  });

  it('página vieja leída meses después: sin día de semana que confirme el año, nada', () => {
    const later = at('2027-02-15T12:00:00');
    expect(run(ISLA, { now: later }).specs).toEqual([]);
    expect(run(LAVELLI, { now: later }).specs).toEqual([]); // 06-10-2027 es miércoles
    expect(run('Del 15 al 22 de octubre', { now: at('2026-12-28T12:00:00') }).specs).toEqual([]);
  });

  it('con varios now, las fechas enumeradas nunca cambian de año', () => {
    for (const now of NOWS) {
      const r = parseSchedule({
        functionsText:
          'Viernes 16 y 23, y sábado 17 y 24 de octubre, 18 horas. \nDomingos 18 y 25 de octubre, 16.30 horas.',
        now,
      });
      for (const s of r.specs) if (s.kind === 'timed') expect(s.date).toMatch(/^2026-10-/);
    }
  });

  it('"Hasta el X" sin inicio no inventa un rango que empieza hoy', () => {
    for (const now of [at('2026-10-14T12:00:00'), at('2026-10-15T12:00:00')]) {
      const r = parseSchedule({ functionsText: 'Hasta el 29 de noviembre', now });
      expect(r.specs).toEqual([]);
    }
  });
});

describe('patrón semanal: solo con temporada publicada (inicio y fin) + agenda', () => {
  const INVASIONES = 'Miércoles a sábados, 20.30 horas. Domingos, 19.30 horas';

  it('sin temporada publicada no se emite nada aunque la agenda lo liste', () => {
    const r = run(INVASIONES, {
      agendaDays: ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'],
    });
    expect(r.specs).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/sin temporada publicada/);
    expect(
      run('Miércoles a sábados, 20 horas. Domingos, 19 horas', {
        agendaDays: THU_SUN,
        notes: ['Desde el 24 de octubre'],
      }).specs,
    ).toEqual([]);
  });

  it('"Hasta el …" en un aviso es el fin de la temporada', () => {
    const r = run('Desde el 15 de octubre\nJueves a domingos, 20 horas', {
      agendaDays: ['2026-10-15', '2026-10-18', '2026-11-26'],
      notes: ['Hasta el 1 de noviembre'],
    });
    expect(starts(r)).toEqual(['2026-10-15 20:00', '2026-10-18 20:00']);
  });

  it('el estado de un segmento semanal vale solo para sus días', () => {
    const r = run(`Del 14 al 18 de octubre\n${INVASIONES} (agotado)`, {
      agendaDays: ['2026-10-14', '2026-10-17', '2026-10-18'],
    });
    expect(starts(r)).toEqual([
      '2026-10-14 20:30',
      '2026-10-17 20:30',
      '2026-10-18 19:30 sold_out',
    ]);
  });

  it('un estado con una fecha que no se puede atribuir no se extiende a todo el patrón', () => {
    const r = run(
      'Del 15 al 31 de octubre\nJueves a domingos, 20 horas (función del domingo 18 suspendida)',
      { agendaDays: ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'] },
    );
    expect(r.specs.filter((s) => s.kind === 'timed' && s.status === 'cancelled')).toEqual([]);
    expect(starts(r)).not.toContain('2026-10-18 20:00');
  });
});

describe('avisos en rojo', () => {
  const BOUNDED = 'Del 15 al 31 de octubre\nJueves a domingos, 20 horas';
  const AGENDA = ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-22'];

  it('exclusión en forma de rango: "Del 16 al 18 de octubre no habrá funciones"', () => {
    const r = run(BOUNDED, {
      agendaDays: AGENDA,
      notes: ['Del 16 al 18 de octubre no habrá funciones'],
    });
    expect(starts(r)).toEqual(['2026-10-15 20:00', '2026-10-22 20:00']);
  });

  it('"se suspenden" excluye', () => {
    const r = run(BOUNDED, {
      agendaDays: AGENDA,
      notes: ['Las funciones del 16 y 17 de octubre se suspenden'],
    });
    expect(starts(r)).toEqual(['2026-10-15 20:00', '2026-10-18 20:00', '2026-10-22 20:00']);
  });

  it('día sin mes: se resuelve contra las funciones, verificando el día de semana', () => {
    const text = 'Sábado 17 y domingo 18 de octubre, 20 horas';
    expect(starts(run(text, { notes: ['La función del domingo 18 queda suspendida'] }))).toEqual([
      '2026-10-17 20:00',
      '2026-10-18 20:00 cancelled',
    ]);
    expect(starts(run(text, { notes: ['Agotadas las localidades del sábado 17'] }))).toEqual([
      '2026-10-17 20:00 sold_out',
      '2026-10-18 20:00',
    ]);
    expect(
      starts(
        run('Jueves 15 y sábado 17 de octubre, 20 horas', {
          notes: ['No habrá función el sábado 17'],
        }),
      ),
    ).toEqual(['2026-10-15 20:00']);
  });

  it('aviso de suspensión sin fechas legibles → no se publica ninguna función', () => {
    const r = run('Sábado 17 y domingo 18 de octubre, 20 horas', {
      notes: ['No habrá función por razones de fuerza mayor'],
    });
    expect(r.specs).toEqual([]);
  });

  it('"reprogramada" no se ignora: esa fecha no se publica', () => {
    const r = run('Sábado 17 y domingo 18 de octubre, 20 horas', {
      notes: ['La función del sábado 17 de octubre fue reprogramada'],
    });
    expect(starts(r)).toEqual(['2026-10-18 20:00']);
    expect(r.warnings.join('\n')).toMatch(/reprogramad/);
  });

  it('varios rangos: avisa que solo se publica el primero', () => {
    const r = run('Del 1 al 15 de octubre y del 1 al 15 de noviembre');
    expect(starts(r)).toEqual(['2026-10-01..2026-10-15']);
    expect(r.warnings.join('\n')).toMatch(/varios rangos/);
  });
});
