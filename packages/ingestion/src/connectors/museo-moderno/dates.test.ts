import { DateTime } from 'luxon';
import {
  type AgendaSpec,
  exhibitionRange,
  leadingTimes,
  parseAgendaSchedule,
  parseDateLine,
  parsePublishedDate,
  parseTimes,
  publishedDay,
} from './dates';

const TZ = 'America/Argentina/Buenos_Aires';
const NOW = DateTime.fromISO('2026-10-18T13:00:00', { zone: TZ });
/** Publicación del ítem (ancla del año para fechas sin año ni día de semana). */
const PUBLISHED = DateTime.fromISO('2026-09-25T10:00:00', { zone: TZ });

function schedule(lines: string[], anchor: DateTime = PUBLISHED) {
  return parseAgendaSchedule({ lines, now: NOW, anchor });
}

function show(spec: AgendaSpec): string {
  if (spec.kind === 'timed') {
    const t = (p: { hour: number; minute: number }) =>
      `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
    return `${spec.date} ${t(spec.start)}${spec.end ? `-${t(spec.end)}` : ''}`;
  }
  if (spec.kind === 'all_day') return `${spec.date} día`;
  return `${spec.start}..${spec.end}`;
}

describe('museo-moderno · líneas de fecha de la agenda', () => {
  it('fecha + hora en la misma línea', () => {
    expect(schedule(['Miércoles 28 de octubre, a las 17 h']).specs.map(show)).toEqual([
      '2026-10-28 17:00',
    ]);
    expect(schedule(['Lunes 21 de septiembre, 18 h']).specs.map(show)).toEqual([
      '2026-09-21 18:00',
    ]);
    expect(schedule(['Miércoles 12 de agosto, 17.00 h']).specs.map(show)).toEqual([
      '2026-08-12 17:00',
    ]);
    expect(schedule(['Sábado 19 de septiembre, de 11:30 a 13:30 h']).specs.map(show)).toEqual([
      '2026-09-19 11:30-13:30',
    ]);
    expect(schedule(['Sábado 17 de octubre. de 17.30 a 19.30 h']).specs.map(show)).toEqual([
      '2026-10-17 17:30-19:30',
    ]);
  });

  it('fechas enumeradas con varios días de semana → una función por fecha', () => {
    expect(
      schedule(['Sábado 3, 17 y 24  y domingo 4, 11, 18 y 25  de octubre, de 15 a 17 h']).specs.map(
        show,
      ),
    ).toEqual([
      '2026-10-03 15:00-17:00',
      '2026-10-04 15:00-17:00',
      '2026-10-11 15:00-17:00',
      '2026-10-17 15:00-17:00',
      '2026-10-18 15:00-17:00',
      '2026-10-24 15:00-17:00',
      '2026-10-25 15:00-17:00',
    ]);
    expect(schedule(['Domingos 04 y 18 de octubre, de 16 a 18 h']).specs.map(show)).toEqual([
      '2026-10-04 16:00-18:00',
      '2026-10-18 16:00-18:00',
    ]);
    expect(
      schedule(['Sábados 24 y 31 de octubre y 7 de noviembre, de 11.30 a 13 h']).specs.map(show),
    ).toEqual(['2026-10-24 11:30-13:00', '2026-10-31 11:30-13:00', '2026-11-07 11:30-13:00']);
  });

  it('varias horas en la misma línea → varias funciones el mismo día', () => {
    // "Piel de Gambas" (2025): el 27/9 fue sábado en 2025, no en 2026.
    expect(schedule(['Sábado 27 de septiembre, a las 17 y 19 h']).specs.map(show)).toEqual([
      '2025-09-27 17:00',
      '2025-09-27 19:00',
    ]);
    expect(schedule(['Sábado 6 de diciembre, 17 y 19 h']).specs.map(show)).toEqual([
      '2025-12-06 17:00',
      '2025-12-06 19:00',
    ]);
  });

  it('cabecera de día + hora en la línea siguiente: solo la PRIMERA hora', () => {
    const s = schedule([
      'Sábado 10 de octubre',
      '16.30 h – Performance',
      '18 h – Entrevista pública. Esta actividad contará con traducción simultánea al español.',
      'Av. San Juan 350, CABA',
    ]);
    expect(s.specs.map(show)).toEqual(['2026-10-10 16:30']);
    expect(s.specs[0]?.sourceText).toBe('Sábado 10 de octubre · 16.30 h – Performance');
  });

  it('fecha sin hora → all_day (no se inventa la hora)', () => {
    expect(schedule(['Sábado 10 de octubre', 'Av. San Juan 350, CABA']).specs.map(show)).toEqual([
      '2026-10-10 día',
    ]);
  });

  it('resumen del ciclo + funciones por día: no se duplican', () => {
    const s = schedule([
      'Viernes 23 y sábado 24 de octubre, 19 h',
      'Domingo 25 de octubre, 18 h',
      'Auditorio – Av. San Juan 350, CABA',
      'Viernes 23 de octubre de 2026',
      '19 h',
      'Sábado 24 de octubre de 2026',
      '19 h',
      'Domingo 25 de octubre de 2026',
      '18 h',
    ]);
    expect(s.specs.map(show)).toEqual(['2026-10-23 19:00', '2026-10-24 19:00', '2026-10-25 18:00']);
  });

  it('cabeceras de un programa no agregan funciones a un día que ya tiene hora propia', () => {
    const s = schedule([
      'Sábado 3 y domingo 4 de octubre, 12 a 19 h',
      'DOMINGO 4 DE OCTUBRE',
      '15 a 17 h – Movimiento invención: tiempo de jugar',
    ]);
    expect(s.specs.map(show)).toEqual(['2026-10-03 12:00-19:00', '2026-10-04 12:00-19:00']);
  });

  it('patrón semanal sin fechas → ninguna función', () => {
    const s = schedule([
      'Todos los Miércoles  de 16 a 18 h',
      'Orientado a personas mayores',
      'Sala Supervielle – Av. San Juan 350 (CABA)',
    ]);
    expect(s.specs).toEqual([]);
    expect(s.weekly).toEqual(['Todos los Miércoles  de 16 a 18 h']);
    expect(s.warnings).toEqual([
      'patrón semanal sin fechas publicadas ("Todos los Miércoles  de 16 a 18 h"): no se emiten funciones',
    ]);
    expect(schedule(['Dos sábados o domingos por mes, de 11.30 a 13.30 h']).specs).toEqual([]);
  });

  it('rango de días solo si no hay funciones concretas', () => {
    const anchor = DateTime.fromISO('2026-03-13T10:00:00', { zone: TZ });
    expect(schedule(['16 a 19 de abril'], anchor).specs.map(show)).toEqual([
      '2026-04-16..2026-04-19',
    ]);
    const mixed = schedule(
      ['16 a 19 de abril', '17 de abril', '19 h | Noche de Colección'],
      anchor,
    );
    expect(mixed.specs.map(show)).toEqual(['2026-04-17 19:00']);
  });

  it('el día de semana decide el año: "Sábados 16 y 23 de mayo" es 2026 (pasado), no 2027', () => {
    expect(schedule(['Sábados 16 y 23 de mayo, de 16 a 18 h']).specs.map(show)).toEqual([
      '2026-05-16 16:00-18:00',
      '2026-05-23 16:00-18:00',
    ]);
    // Contenido de 2025 en una entrada reutilizada: 10/5/2025 fue sábado.
    expect(schedule(['Sábado 10 de mayo, 16 h']).specs.map(show)).toEqual(['2025-05-10 16:00']);
  });

  it('día de semana incoherente → se descarta con aviso', () => {
    const s = schedule(['Lunes 28 de octubre, 17 h']);
    expect(s.specs).toEqual([]);
    expect(s.warnings).toEqual([
      '"Lunes 28 de octubre, 17 h": ningún año cercano hace coincidir 28/10 con el día de semana publicado, se ignora',
    ]);
  });

  it('sin año ni día de semana: año según la publicación y a no más de ~6 meses', () => {
    // Publicado el 13-mar-2026: "17 de abril" es 2026, no 2027.
    const march = DateTime.fromISO('2026-03-13T10:00:00', { zone: TZ });
    expect(schedule(['17 de abril', '19 h | Noche de Colección'], march).specs.map(show)).toEqual([
      '2026-04-17 19:00',
    ]);
    // Publicado hace días: "10 de mayo" sería mayo de 2027, a más de 6 meses → no se afirma.
    const s = schedule(['10 de mayo, 18 h'], DateTime.fromISO('2026-10-13', { zone: TZ }));
    expect(s.specs).toEqual([]);
    expect(s.warnings).toEqual([
      '"10 de mayo, 18 h": año ambiguo para 10/5 (sin año ni día de semana), se ignora',
    ]);
  });

  it('año explícito y reprogramación', () => {
    expect(schedule(['Jueves 20 de febrero de 2025 19 h']).specs.map(show)).toEqual([
      '2025-02-20 19:00',
    ]);
    const s = schedule(['Sábado 24 de octubre, 19 h (reprogramado)']);
    expect(s.specs).toEqual([]);
    expect(s.warnings[0]).toContain('aviso de reprogramación');
  });

  it('estado en la línea de fecha', () => {
    const [spec] = schedule(['Sábado 24 de octubre, 19 h – SUSPENDIDO']).specs;
    expect(spec?.kind === 'timed' && spec.status).toBe('cancelled');
  });

  it('no son líneas de fecha', () => {
    expect(
      parseDateLine('5 Ana Gallardo en diálogo con Victoria Noorthoorn, 4 de abril de 2026'),
    ).toBeNull();
    expect(parseDateLine('Inicio del curso: martes 15 de septiembre')).toBeNull();
    expect(parseDateLine('2008')).toBeNull();
    expect(parseDateLine('64 min')).toBeNull();
    expect(parseDateLine('Lunes, miércoles, jueves y viernes: 11:00 a 19:00 h')).toBeNull();
    expect(parseDateLine('Fecha: Sábado 10 de octubre')?.days).toEqual([
      { day: 10, month: 10, year: null, weekday: 6 },
    ]);
  });
});

describe('museo-moderno · horas', () => {
  it('franjas, listas y "a las"', () => {
    expect(parseTimes(', de 15 a 17 h')).toEqual([
      { start: { hour: 15, minute: 0 }, end: { hour: 17, minute: 0 } },
    ]);
    expect(parseTimes(', 12 a 19 h')).toEqual([
      { start: { hour: 12, minute: 0 }, end: { hour: 19, minute: 0 } },
    ]);
    expect(parseTimes('a las 11.30.')).toEqual([{ start: { hour: 11, minute: 30 }, end: null }]);
    expect(parseTimes('orientado a adolescentes de 11 a 17 anos')).toEqual([]);
    expect(leadingTimes('19 a 20.30 h Tammy B (DJ set)')).toEqual([
      { start: { hour: 19, minute: 0 }, end: { hour: 20, minute: 30 } },
    ]);
    expect(leadingTimes('Orientado al público general')).toEqual([]);
  });
});

describe('museo-moderno · rango de una muestra', () => {
  it('"Inicio: 20 de Agosto de 2026" / "Fin: 30 de Abril de 2027"', () => {
    expect(
      exhibitionRange({
        startText: 'Inicio: 20 de Agosto de 2026',
        endText: 'Fin: 30 de Abril de 2027',
        untilText: 'Hasta el 30 de Abril de 2027',
        current: true,
        now: NOW,
      }),
    ).toEqual({
      range: { start: '2026-08-20', end: '2027-04-30' },
      startsToday: false,
      sourceText:
        'Inicio: 20 de Agosto de 2026 · Fin: 30 de Abril de 2027 · Hasta el 30 de Abril de 2027',
      warnings: [],
    });
  });

  it('inicio solo con mes: en cartel empieza hoy; próxima → nada', () => {
    const base = {
      startText: 'Inicio: Abril de 2026',
      endText: 'Fin: Febrero de 2027',
      untilText: 'Hasta el 28 de Febrero de 2027',
      now: NOW,
    };
    expect(exhibitionRange({ ...base, current: true }).range).toEqual({
      start: '2026-10-18',
      end: '2027-02-28',
    });
    expect(exhibitionRange({ ...base, current: false })).toMatchObject({
      range: null,
      warnings: ['muestra próxima sin día de inicio publicado ("Inicio: Abril de 2026")'],
    });
  });

  it('cierre sin día exacto, contradictorio o ya pasado → nada', () => {
    expect(
      exhibitionRange({
        startText: 'Inicio: Abril de 2026',
        endText: 'Fin: Febrero de 2027',
        untilText: null,
        current: true,
        now: NOW,
      }).range,
    ).toBeNull();
    expect(
      exhibitionRange({
        startText: null,
        endText: 'Fin: 30 de Abril de 2027',
        untilText: 'Hasta el 28 de Febrero de 2027',
        current: true,
        now: NOW,
      }).warnings,
    ).toEqual(['cierre contradictorio: ficha 2027-04-30, listado 2027-02-28']);
    expect(
      exhibitionRange({
        startText: 'Inicio: Agosto de 2025',
        endText: 'Fin: Julio de 2026',
        untilText: 'Hasta el 31 de Julio de 2026',
        current: true,
        now: NOW,
      }).warnings.at(-1),
    ).toBe('la muestra cerró el 2026-07-31 aunque el sitio la lista en cartel');
  });

  it('textos de fecha publicados', () => {
    expect(parsePublishedDate('Inicio: Enero de 2026')).toEqual({
      day: null,
      month: 1,
      year: 2026,
    });
    expect(parsePublishedDate('Hasta el 1 de Febrero de 2027')).toEqual({
      day: 1,
      month: 2,
      year: 2027,
    });
    expect(publishedDay('Hasta el 22 de Noviembre de 2026')).toBe('2026-11-22');
    expect(publishedDay('Octubre 2026')).toBeNull();
  });
});
