import { plusDaysLocalDate, todayLocalDate } from '@/lib/dates';

export type DatePreset = 'all' | 'today' | 'weekend' | 'week' | 'month';

export interface ExploreFilters {
  q: string;
  disciplines: string[];
  datePreset: DatePreset;
  freeOnly: boolean;
}

export const initialFilters: ExploreFilters = {
  q: '',
  disciplines: [],
  datePreset: 'all',
  freeOnly: false,
};

export type FiltersAction =
  | { type: 'query'; q: string }
  | { type: 'toggleDiscipline'; slug: string }
  | { type: 'datePreset'; preset: DatePreset }
  | { type: 'freeOnly'; value: boolean }
  | { type: 'reset' };

export function filtersReducer(state: ExploreFilters, action: FiltersAction): ExploreFilters {
  switch (action.type) {
    case 'query':
      return { ...state, q: action.q };
    case 'toggleDiscipline':
      return {
        ...state,
        disciplines: state.disciplines.includes(action.slug)
          ? state.disciplines.filter((s) => s !== action.slug)
          : [...state.disciplines, action.slug],
      };
    case 'datePreset':
      return { ...state, datePreset: state.datePreset === action.preset ? 'all' : action.preset };
    case 'freeOnly':
      return { ...state, freeOnly: action.value };
    case 'reset':
      return initialFilters;
    default:
      return state;
  }
}

export function hasActiveFilters(f: ExploreFilters): boolean {
  return f.q.trim() !== '' || f.disciplines.length > 0 || f.datePreset !== 'all' || f.freeOnly;
}

/** Convierte el preset en un rango de fechas locales [from, to]. Lunes=1 … domingo=7. */
export function presetRange(
  preset: DatePreset,
  today = todayLocalDate(),
  weekday = new Date(`${today}T12:00:00-03:00`).getUTCDay() || 7,
): { from: string; to: string } | null {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'weekend': {
      const toSaturday = (6 - weekday + 7) % 7;
      const sat = addDays(today, weekday === 7 ? -1 : toSaturday);
      const sun = addDays(sat, 1);
      return { from: weekday >= 6 ? today : sat, to: sun };
    }
    case 'week':
      return { from: today, to: addDays(today, 7) };
    case 'month':
      return { from: today, to: addDays(today, 30) };
    default:
      return null;
  }
}

function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'weekend', label: 'Fin de semana' },
  { key: 'week', label: '7 días' },
  { key: 'month', label: '30 días' },
];

export { plusDaysLocalDate };
