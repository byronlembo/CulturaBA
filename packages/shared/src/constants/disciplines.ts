/**
 * Taxonomía de disciplinas: las 9 categorías elegibles del encargo más "Ciencia y
 * divulgación" (sumada el 21-oct con las fuentes científicas), y `otros`, interna, para
 * registros que no encajan en ninguna.
 * Es una tabla lookup en la base (`disciplines`), no un enum, para poder renombrar
 * etiquetas sin migración de tipos. Mantener en sincronía con supabase/seed.sql.
 */
export const DISCIPLINES = [
  {
    slug: 'opera_clasica',
    label: 'Ópera y música clásica',
    shortLabel: 'Ópera y clásica',
    selectable: true,
    sortOrder: 10,
  },
  {
    slug: 'teatro_escenicas',
    label: 'Teatro y artes escénicas',
    shortLabel: 'Teatro',
    selectable: true,
    sortOrder: 20,
  },
  {
    slug: 'museos_exposiciones',
    label: 'Museos y exposiciones',
    shortLabel: 'Museos',
    selectable: true,
    sortOrder: 30,
  },
  {
    slug: 'musica_vivo_jazz',
    label: 'Música en vivo y jazz',
    shortLabel: 'Música en vivo',
    selectable: true,
    sortOrder: 40,
  },
  { slug: 'cine', label: 'Cine', shortLabel: 'Cine', selectable: true, sortOrder: 50 },
  { slug: 'danza', label: 'Danza', shortLabel: 'Danza', selectable: true, sortOrder: 60 },
  {
    slug: 'literatura_charlas',
    label: 'Literatura y charlas',
    shortLabel: 'Literatura',
    selectable: true,
    sortOrder: 70,
  },
  {
    slug: 'fotografia_artes_visuales',
    label: 'Fotografía y artes visuales',
    shortLabel: 'Artes visuales',
    selectable: true,
    sortOrder: 80,
  },
  {
    slug: 'historia_patrimonio',
    label: 'Historia y patrimonio',
    shortLabel: 'Patrimonio',
    selectable: true,
    sortOrder: 90,
  },
  {
    slug: 'ciencia',
    label: 'Ciencia y divulgación',
    shortLabel: 'Ciencia',
    selectable: true,
    sortOrder: 100,
  },
  { slug: 'otros', label: 'Otros', shortLabel: 'Otros', selectable: false, sortOrder: 999 },
] as const;

export type DisciplineSlug = (typeof DISCIPLINES)[number]['slug'];

export const DISCIPLINE_SLUGS = DISCIPLINES.map((d) => d.slug) as readonly DisciplineSlug[];

export const SELECTABLE_DISCIPLINES = DISCIPLINES.filter((d) => d.selectable);

export function isDisciplineSlug(value: unknown): value is DisciplineSlug {
  return typeof value === 'string' && (DISCIPLINE_SLUGS as readonly string[]).includes(value);
}

export function disciplineLabel(slug: DisciplineSlug): string {
  const found = DISCIPLINES.find((d) => d.slug === slug);
  return found ? found.label : slug;
}

/** Reglas de onboarding: entre 2 y 3 intereses al inicio; después al menos 1. */
export const ONBOARDING_MIN_INTERESTS = 2;
export const ONBOARDING_MAX_INTERESTS = 3;
