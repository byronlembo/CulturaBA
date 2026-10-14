import { filtersReducer, hasActiveFilters, initialFilters, presetRange } from './filters';

describe('filtersReducer', () => {
  it('toggles disciplines', () => {
    let s = filtersReducer(initialFilters, { type: 'toggleDiscipline', slug: 'cine' });
    expect(s.disciplines).toEqual(['cine']);
    s = filtersReducer(s, { type: 'toggleDiscipline', slug: 'danza' });
    expect(s.disciplines).toEqual(['cine', 'danza']);
    s = filtersReducer(s, { type: 'toggleDiscipline', slug: 'cine' });
    expect(s.disciplines).toEqual(['danza']);
  });

  it('toggles the date preset off when selected twice', () => {
    let s = filtersReducer(initialFilters, { type: 'datePreset', preset: 'week' });
    expect(s.datePreset).toBe('week');
    s = filtersReducer(s, { type: 'datePreset', preset: 'week' });
    expect(s.datePreset).toBe('all');
  });

  it('tracks active filters and resets', () => {
    expect(hasActiveFilters(initialFilters)).toBe(false);
    const s = filtersReducer(initialFilters, { type: 'query', q: 'ópera' });
    expect(hasActiveFilters(s)).toBe(true);
    expect(filtersReducer(s, { type: 'reset' })).toEqual(initialFilters);
  });
});

describe('presetRange', () => {
  // 2026-10-14 es miércoles (weekday 3).
  const today = '2026-10-14';
  it('today / week / month', () => {
    expect(presetRange('today', today, 3)).toEqual({ from: today, to: today });
    expect(presetRange('week', today, 3)).toEqual({ from: today, to: '2026-10-21' });
    expect(presetRange('month', today, 3)).toEqual({ from: today, to: '2026-11-13' });
    expect(presetRange('all', today, 3)).toBeNull();
  });

  it('weekend from a weekday goes to next sat-sun', () => {
    expect(presetRange('weekend', today, 3)).toEqual({ from: '2026-10-17', to: '2026-10-18' });
  });

  it('weekend during the weekend starts today', () => {
    expect(presetRange('weekend', '2026-10-17', 6)).toEqual({
      from: '2026-10-17',
      to: '2026-10-18',
    });
    expect(presetRange('weekend', '2026-10-18', 7)).toEqual({
      from: '2026-10-18',
      to: '2026-10-18',
    });
  });
});
