import { type DisciplineSlug, stripDiacriticsLower } from '@culturaba/shared';

/**
 * Disciplinas del Teatro Nacional Cervantes. El sitio NO publica un género: sus 28
 * categorías (`/wp-json/wp/v2/categories`) describen el CONTEXTO de la programación
 * ("En el teatro", "En el país", "Visita Guiada", "Cervantes Online"…). La tabla explícita:
 *
 *  · Señales que nombran una actividad no teatral, por categoría, por la etiqueta del detalle
 *    (`p.is-sala-single`) o por el comienzo literal del título, mandan y son exclusivas:
 *    visita guiada → historia_patrimonio; ciclo de música / concierto → musica_vivo_jazz
 *    (genérico, como "música" en complejo-teatral; nunca opera_clasica sin una categoría que
 *    lo diga); ciclo de cine → cine.
 *  · Contextos de programación escénica del teatro nacional ("En el teatro", "En otros
 *    espacios", "Internacional", "Verano"…) → teatro_escenicas (mismo criterio que
 *    teatro-colon para sus categorías de contexto: la naturaleza de la institución).
 *  · Actividades sin disciplina clara (Escuelas, Laboratorios, Extensión Cultural, Sindicatos)
 *    → otros.
 *  · Sin ninguna señal → [] (el evento queda candidato por `missing:discipline`).
 *
 * Las categorías de fuera de la Ciudad u online no llegan acá: discover las excluye
 * (ver `EXCLUDED_CATEGORY_SLUGS` en parse.ts).
 */

type Rule = { disciplines: DisciplineSlug[]; exclusive?: true } | { theatre: true };

const THEATRE: Rule = { theatre: true };

/** Slug de categoría del sitio → regla. Los no listados no aportan disciplina. */
export const CATEGORY_RULES: Readonly<Record<string, Rule>> = {
  'en-el-teatro': THEATRE,
  'en-otros-espacios': THEATRE,
  'en-la-ribera': THEATRE,
  'en-el-centro-cultural-borges': THEATRE,
  'en-el-centro-cultural-de-la-ciencia': THEATRE,
  internacional: THEATRE,
  verano: THEATRE,
  'visita-guiada': { disciplines: ['historia_patrimonio'], exclusive: true },
  'ciclos-de-musica': { disciplines: ['musica_vivo_jazz'], exclusive: true },
  'ciclo-de-cine': { disciplines: ['cine'], exclusive: true },
  escuelas: { disciplines: ['otros'] },
  laboratorios: { disciplines: ['otros'] },
  'extension-cultural': { disciplines: ['otros'] },
  sindicatos: { disciplines: ['otros'] },
};

/** Etiqueta del detalle (`p.is-sala-single`, sin acentos ni mayúsculas) → regla. */
export const LABEL_RULES: Readonly<Record<string, Rule>> = {
  'en el teatro': THEATRE,
  'visita guiada': { disciplines: ['historia_patrimonio'], exclusive: true },
};

/** Comienzo literal del título (sin acentos ni mayúsculas) → disciplina exclusiva. */
export const TITLE_RULES: ReadonlyArray<{ pattern: RegExp; disciplines: DisciplineSlug[] }> = [
  { pattern: /^visitas? guiadas?\b/, disciplines: ['historia_patrimonio'] },
  { pattern: /^ciclos? de musica\b/, disciplines: ['musica_vivo_jazz'] },
  { pattern: /^conciertos?\b/, disciplines: ['musica_vivo_jazz'] },
  { pattern: /^ciclos? de cine\b/, disciplines: ['cine'] },
];

export interface DisciplineInput {
  categorySlugs: readonly string[];
  /** Texto de `p.is-sala-single` ("EN EL TEATRO", "VISITA GUIADA"). */
  label: string | null;
  title: string;
}

export interface DisciplineMapping {
  disciplines: DisciplineSlug[];
  tags: string[];
  warnings: string[];
}

function norm(text: string): string {
  return stripDiacriticsLower(text).replace(/\s+/g, ' ').trim();
}

export function mapDisciplines(input: DisciplineInput): DisciplineMapping {
  const rules: Rule[] = [];
  for (const slug of input.categorySlugs) {
    const rule = CATEGORY_RULES[slug];
    if (rule) rules.push(rule);
  }
  const label = input.label ? norm(input.label) : '';
  const labelRule = label ? LABEL_RULES[label] : undefined;
  if (labelRule) rules.push(labelRule);
  const title = norm(input.title);
  for (const r of TITLE_RULES) {
    if (r.pattern.test(title)) rules.push({ disciplines: r.disciplines, exclusive: true });
  }

  const tags = label ? [label] : [];
  const exclusive = rules.flatMap((r) => ('exclusive' in r && r.exclusive ? r.disciplines : []));
  if (exclusive.length > 0) return { disciplines: [...new Set(exclusive)], tags, warnings: [] };
  if (rules.some((r) => 'theatre' in r)) {
    return { disciplines: ['teatro_escenicas'], tags, warnings: [] };
  }
  const others = rules.flatMap((r) => ('disciplines' in r ? r.disciplines : []));
  if (others.length > 0) return { disciplines: [...new Set(others)], tags, warnings: [] };
  return {
    disciplines: [],
    tags,
    warnings: [
      `sin categoría ni etiqueta que indique disciplina (categorías: ${input.categorySlugs.join(', ') || '—'}; etiqueta: ${input.label ?? '—'}): candidato por disciplina`,
    ],
  };
}
