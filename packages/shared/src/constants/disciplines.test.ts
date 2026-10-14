import {
  DISCIPLINE_SLUGS,
  DISCIPLINES,
  disciplineLabel,
  isDisciplineSlug,
  SELECTABLE_DISCIPLINES,
} from './disciplines';

describe('disciplines', () => {
  it('exposes the 9 user-selectable categories from the brief plus an internal "otros"', () => {
    expect(SELECTABLE_DISCIPLINES).toHaveLength(9);
    expect(DISCIPLINES).toHaveLength(10);
    expect(isDisciplineSlug('otros')).toBe(true);
    expect(SELECTABLE_DISCIPLINES.map((d) => d.slug)).not.toContain('otros');
  });

  it('has unique slugs', () => {
    expect(new Set(DISCIPLINE_SLUGS).size).toBe(DISCIPLINE_SLUGS.length);
  });

  it('type-guards unknown values', () => {
    expect(isDisciplineSlug('cine')).toBe(true);
    expect(isDisciplineSlug('rock')).toBe(false);
    expect(isDisciplineSlug(42)).toBe(false);
  });

  it('resolves labels', () => {
    expect(disciplineLabel('opera_clasica')).toBe('Ópera y música clásica');
  });
});
