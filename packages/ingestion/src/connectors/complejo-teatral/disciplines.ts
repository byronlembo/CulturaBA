import { type DisciplineSlug, stripDiacriticsLower } from '@culturaba/shared';

/**
 * Mapeo explícito de la taxonomía `genero` del sitio (span.category en el listado,
 * ul.breadcrumbs li.category en el detalle) a las disciplinas de CulturaBA.
 *
 *  · Una categoría cultural que no encaja en ninguna disciplina elegible → `otros`.
 *  · Sin categoría → [] (el evento queda candidato por `missing:discipline`).
 *  · "actividades especiales | música" trae varias categorías separadas por "|".
 */
interface CategoryRule {
  /** Categoría tal como la publica el sitio (comparación sin acentos ni mayúsculas). */
  category: string;
  disciplines: DisciplineSlug[];
  tags?: string[];
}

export const CATEGORY_RULES: readonly CategoryRule[] = [
  { category: 'teatro', disciplines: ['teatro_escenicas'] },
  { category: 'teatro musical', disciplines: ['teatro_escenicas'] },
  { category: 'opera rock', disciplines: ['teatro_escenicas'] },
  { category: 'performance', disciplines: ['teatro_escenicas'] },
  { category: 'temporada internacional', disciplines: ['teatro_escenicas'] },
  { category: 'fiba', disciplines: ['teatro_escenicas'], tags: ['fiba'] },
  { category: 'danza', disciplines: ['danza'] },
  { category: 'musica', disciplines: ['musica_vivo_jazz'] },
  { category: 'cine', disciplines: ['cine'] },
  { category: 'fotogaleria', disciplines: ['fotografia_artes_visuales'] },
  { category: 'para grandes y chicos', disciplines: ['teatro_escenicas'], tags: ['infantil'] },
  { category: 'titeres', disciplines: ['teatro_escenicas'], tags: ['infantil'] },
  { category: 'actividades especiales', disciplines: ['otros'] },
  { category: 'actividades pedagogicas', disciplines: ['otros'] },
  { category: 'ciclo hall abierto', disciplines: ['otros'] },
];

export interface DisciplineMapping {
  disciplines: DisciplineSlug[];
  tags: string[];
  warnings: string[];
}

function normalizeCategory(raw: string): string {
  return stripDiacriticsLower(raw).replace(/\s+/g, ' ').trim();
}

/**
 * "actividades especiales | música" → { disciplines: ['musica_vivo_jazz'], tags: [...] }.
 * `otros` solo queda cuando ninguna de las categorías mapea a una disciplina real.
 */
export function mapCategories(rawCategory: string | null | undefined): DisciplineMapping {
  const parts = (rawCategory ?? '')
    .split('|')
    .map(normalizeCategory)
    .filter((p) => p.length > 0);
  const unique = [...new Set(parts)];
  const disciplines: DisciplineSlug[] = [];
  const tags: string[] = [];
  const warnings: string[] = [];

  for (const part of unique) {
    tags.push(part);
    const rule = CATEGORY_RULES.find((r) => r.category === part);
    if (!rule) {
      warnings.push(`categoría sin mapeo: "${part}" → otros`);
      disciplines.push('otros');
      continue;
    }
    disciplines.push(...rule.disciplines);
    if (rule.tags) tags.push(...rule.tags);
  }

  const real = disciplines.filter((d) => d !== 'otros');
  const result = real.length > 0 ? real : disciplines.length > 0 ? ['otros' as const] : [];
  return {
    disciplines: [...new Set(result)],
    tags: [...new Set(tags)],
    warnings,
  };
}
